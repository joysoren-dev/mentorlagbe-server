import { Request, Response } from "express";
import Stripe from "stripe";
import { collections } from "../config/db";
import { AuthRequest } from "../middlewares/auth.middleware";

const getStripeClient = (): Stripe | null => {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    return null;
  }
  return new Stripe(secretKey);
};

const getPlanDetailsByRole = (role: string) => {
  if (role === "tutor") {
    return {
      planName: "Pro Tutor Plan",
      amount: 15,
      amountInCents: 1500,
      description: "Unlimited tuition posts & verified tutor badge",
    };
  }
  return {
    planName: "Pro Student Plan",
    amount: 10,
    amountInCents: 1000,
    description: "Priority tuition booking & premium student access",
  };
};

export const createCheckoutSession = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const email = req.user?.email?.toLowerCase();
    const role = req.user?.role;

    if (!email || !role) {
      res.status(401).json({
        success: false,
        message: "Unauthorized: User session missing",
      });
      return;
    }

    if (role === "admin") {
      res.status(400).json({
        success: false,
        message: "Admin accounts do not require a Pro subscription",
      });
      return;
    }

    const user = await collections.users.findOne({ email });

    if (!user) {
      res.status(404).json({
        success: false,
        message: "User not found",
      });
      return;
    }

    if (user.plan === "pro") {
      res.status(400).json({
        success: false,
        message: "You are already subscribed to the Pro plan",
      });
      return;
    }

    const stripe = getStripeClient();
    if (!stripe) {
      res.status(500).json({
        success: false,
        message: "Stripe secret key is not configured on the server",
      });
      return;
    }

    const clientUrl = process.env.CLIENT_URL || "http://localhost:3000";
    const planDetails = getPlanDetailsByRole(role);

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: email,
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: planDetails.planName,
              description: planDetails.description,
            },
            unit_amount: planDetails.amountInCents,
          },
          quantity: 1,
        },
      ],
      metadata: {
        userEmail: email,
        userName: user.name || req.user?.name || "User",
        userRole: role,
        planName: planDetails.planName,
      },
      success_url: `${clientUrl}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${clientUrl}/payment/cancel`,
    });

    res.status(200).json({
      success: true,
      sessionId: session.id,
      url: session.url,
    });
  } catch (error) {
    console.error("Create checkout session error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create Stripe checkout session",
    });
  }
};

export const verifyCheckoutSession = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const { sessionId } = req.body as { sessionId?: string };

    if (!sessionId) {
      res.status(400).json({
        success: false,
        message: "Stripe sessionId is required",
      });
      return;
    }

    const existingPayment = await collections.payments.findOne({
      stripeSessionId: sessionId,
    });

    if (existingPayment) {
      res.status(200).json({
        success: true,
        message: "Payment already verified",
        payment: {
          id: existingPayment._id.toString(),
          ...existingPayment,
        },
      });
      return;
    }

    const stripe = getStripeClient();
    if (!stripe) {
      res.status(500).json({
        success: false,
        message: "Stripe secret key is not configured on the server",
      });
      return;
    }

    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.payment_status !== "paid") {
      res.status(400).json({
        success: false,
        message: "Payment has not been completed yet",
      });
      return;
    }

    const userEmail = (
      session.metadata?.userEmail ||
      session.customer_email ||
      req.user?.email ||
      ""
    ).toLowerCase();

    const userRole = session.metadata?.userRole || req.user?.role || "student";
    const planDetails = getPlanDetailsByRole(userRole);

    const paymentRecord = {
      userEmail,
      userName: session.metadata?.userName || req.user?.name || "User",
      userRole,
      planName: session.metadata?.planName || planDetails.planName,
      amount: (session.amount_total || planDetails.amountInCents) / 100,
      currency: (session.currency || "usd").toUpperCase(),
      transactionId:
        typeof session.payment_intent === "string"
          ? session.payment_intent
          : session.id,
      stripeSessionId: session.id,
      paymentStatus: "paid",
      paidAt: new Date().toISOString(),
    };

    const insertResult = await collections.payments.insertOne(paymentRecord);

    if (userEmail) {
      await collections.users.updateOne(
        { email: userEmail },
        { $set: { plan: "pro", upgradedAt: paymentRecord.paidAt } },
      );
    }

    res.status(200).json({
      success: true,
      message: "Payment verified and Pro plan activated",
      payment: {
        id: insertResult.insertedId.toString(),
        ...paymentRecord,
      },
    });
  } catch (error) {
    console.error("Verify checkout session error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to verify Stripe payment",
    });
  }
};

export const handleStripeWebhook = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const stripe = getStripeClient();
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!stripe || !webhookSecret) {
      res.status(400).json({
        success: false,
        message: "Stripe webhook is not configured",
      });
      return;
    }

    const signature = req.headers["stripe-signature"] as string;
    const event = stripe.webhooks.constructEvent(
      req.body,
      signature,
      webhookSecret,
    );

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;

      if (session.payment_status === "paid") {
        const alreadyRecorded = await collections.payments.findOne({
          stripeSessionId: session.id,
        });

        if (!alreadyRecorded) {
          const userEmail = (
            session.metadata?.userEmail ||
            session.customer_email ||
            ""
          ).toLowerCase();
          const userRole = session.metadata?.userRole || "student";
          const planDetails = getPlanDetailsByRole(userRole);
          const paidAt = new Date().toISOString();

          await collections.payments.insertOne({
            userEmail,
            userName: session.metadata?.userName || "User",
            userRole,
            planName: session.metadata?.planName || planDetails.planName,
            amount: (session.amount_total || planDetails.amountInCents) / 100,
            currency: (session.currency || "usd").toUpperCase(),
            transactionId:
              typeof session.payment_intent === "string"
                ? session.payment_intent
                : session.id,
            stripeSessionId: session.id,
            paymentStatus: "paid",
            paidAt,
          });

          if (userEmail) {
            await collections.users.updateOne(
              { email: userEmail },
              { $set: { plan: "pro", upgradedAt: paidAt } },
            );
          }
        }
      }
    }

    res.status(200).json({ received: true });
  } catch (error) {
    console.error("Stripe webhook error:", error);
    res.status(400).json({
      success: false,
      message: "Webhook signature verification failed",
    });
  }
};

export const getAllPaymentsForAdmin = async (
  _req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const payments = await collections.payments
      .find({})
      .sort({ paidAt: -1 })
      .toArray();

    const formatted = payments.map((p) => ({
      id: p._id.toString(),
      userEmail: p.userEmail,
      userName: p.userName,
      userRole: p.userRole,
      planName: p.planName,
      amount: p.amount,
      currency: p.currency,
      transactionId: p.transactionId,
      stripeSessionId: p.stripeSessionId,
      paymentStatus: p.paymentStatus,
      paidAt: p.paidAt,
    }));

    const totalRevenue = formatted.reduce(
      (sum, item) => sum + (Number(item.amount) || 0),
      0,
    );

    res.status(200).json({
      success: true,
      count: formatted.length,
      totalRevenue,
      payments: formatted,
    });
  } catch (error) {
    console.error("Get all payments error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch payment records",
    });
  }
};
