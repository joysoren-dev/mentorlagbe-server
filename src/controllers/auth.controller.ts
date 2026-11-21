import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { collections } from "../config/db";
import { UserRole } from "../middlewares/auth.middleware";

const getJwtSecret = (): string => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET is missing in .env file");
  }
  return secret;
};

const getJwtExpiresIn = (): string => {
  return process.env.JWT_EXPIRES_IN || "7d";
};

const buildAuthResponse = (
  userDoc: Record<string, unknown> & { _id?: { toString(): string } },
  normalizedEmail: string,
) => {
  const rawRole = userDoc.role;
  const activeRole: UserRole =
    rawRole === "admin" || rawRole === "tutor" || rawRole === "student"
      ? rawRole
      : "student";

  const tokenPayload = {
    id: userDoc._id?.toString() || "",
    email: normalizedEmail,
    role: activeRole,
    name: typeof userDoc.name === "string" ? userDoc.name : "",
  };

  const token = jwt.sign(tokenPayload, getJwtSecret(), {
    expiresIn: getJwtExpiresIn() as jwt.SignOptions["expiresIn"],
  });

  return {
    token,
    user: {
      id: userDoc._id?.toString(),
      name: typeof userDoc.name === "string" ? userDoc.name : "",
      email: normalizedEmail,
      image: typeof userDoc.image === "string" ? userDoc.image : "",
      role: activeRole,
      phone: typeof userDoc.phone === "string" ? userDoc.phone : "",
      bio: typeof userDoc.bio === "string" ? userDoc.bio : "",
      plan: typeof userDoc.plan === "string" ? userDoc.plan : "free",
      createdAt: userDoc.createdAt,
    },
  };
};

export const registerUser = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { name, email, password, role } = req.body as {
      name?: string;
      email?: string;
      password?: string;
      role?: string;
    };

    if (!name || !name.trim()) {
      res.status(400).json({
        success: false,
        message: "Full name is required",
      });
      return;
    }

    if (!email || typeof email !== "string" || !email.includes("@")) {
      res.status(400).json({
        success: false,
        message: "Valid email is required",
      });
      return;
    }

    if (!password || typeof password !== "string" || password.length < 6) {
      res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters",
      });
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    const existingUser = await collections.users.findOne({
      email: normalizedEmail,
    });

    if (existingUser) {
      res.status(409).json({
        success: false,
        message: "An account with this email already exists",
      });
      return;
    }

    const requestedRole: UserRole =
      role === "tutor" || role === "student" ? role : "student";

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = {
      name: name.trim(),
      email: normalizedEmail,
      password: hashedPassword,
      image: "",
      role: requestedRole,
      phone: "",
      bio: "",
      plan: "free" as const,
      createdAt: new Date().toISOString(),
    };

    const insertResult = await collections.users.insertOne(newUser);
    const createdDoc = { _id: insertResult.insertedId, ...newUser };
    const authData = buildAuthResponse(createdDoc, normalizedEmail);

    res.status(201).json({
      success: true,
      message: "Account registered successfully",
      ...authData,
    });
  } catch (error) {
    console.error("Auth register error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to register user",
    });
  }
};

export const loginUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body as {
      email?: string;
      password?: string;
    };

    if (!email || typeof email !== "string") {
      res.status(400).json({
        success: false,
        message: "Valid email is required",
      });
      return;
    }

    if (!password || typeof password !== "string") {
      res.status(400).json({
        success: false,
        message: "Password is required",
      });
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    const user = await collections.users.findOne({ email: normalizedEmail });

    if (!user || typeof user.password !== "string" || !user.password) {
      res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
      return;
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
      return;
    }

    const authData = buildAuthResponse(user, normalizedEmail);

    res.status(200).json({
      success: true,
      message: "Signed in successfully",
      ...authData,
    });
  } catch (error) {
    console.error("Auth login error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to sign in",
    });
  }
};

export const syncAndIssueToken = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { name, email, image, role } = req.body as {
      name?: string;
      email?: string;
      image?: string;
      role?: string;
    };

    if (!email || typeof email !== "string") {
      res.status(400).json({
        success: false,
        message: "Valid email is required",
      });
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    const existingUser = await collections.users.findOne({
      email: normalizedEmail,
    });

    const requestedRole: UserRole =
      role === "tutor" || role === "student" ? role : "student";

    let userDoc = existingUser;

    if (!existingUser) {
      const newUser = {
        name: name?.trim() || normalizedEmail.split("@")[0],
        email: normalizedEmail,
        image: image || "",
        role: requestedRole,
        phone: "",
        bio: "",
        plan: "free" as const,
        createdAt: new Date().toISOString(),
      };

      const insertResult = await collections.users.insertOne(newUser);
      userDoc = { _id: insertResult.insertedId, ...newUser };
    } else if (name || image) {
      const updateFields: Record<string, string> = {};
      if (name && !existingUser.name) {
        updateFields.name = name.trim();
      }
      if (image && !existingUser.image) {
        updateFields.image = image;
      }

      if (Object.keys(updateFields).length > 0) {
        await collections.users.updateOne(
          { _id: existingUser._id },
          { $set: updateFields },
        );
        userDoc = { ...existingUser, ...updateFields };
      }
    }

    const authData = buildAuthResponse(userDoc || {}, normalizedEmail);

    res.status(200).json({
      success: true,
      message: "Authentication successful",
      ...authData,
    });
  } catch (error) {
    console.error("Auth sync error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to authenticate user",
    });
  }
};
export const googleAuthRedirect = (req: Request, res: Response): void => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const serverBase =
    process.env.SERVER_URL || `${req.protocol}://${req.get("host")}`;
  const redirectUri = `${serverBase}/api/auth/google/callback`;

  if (!clientId) {
    res.status(500).json({
      success: false,
      message: "GOOGLE_CLIENT_ID is missing in server .env",
    });
    return;
  }

  const requestedRole =
    req.query.role === "tutor" || req.query.role === "student"
      ? req.query.role
      : "student";

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    access_type: "offline",
    prompt: "select_account",
    state: requestedRole,
  });

  res.redirect(
    `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
  );
};

export const googleAuthCallback = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const clientUrl = process.env.CLIENT_URL || "http://localhost:3000";

  try {
    const code = typeof req.query.code === "string" ? req.query.code : "";
    const stateRole =
      req.query.state === "tutor" || req.query.state === "student"
        ? req.query.state
        : "student";

    if (!code) {
      res.redirect(`${clientUrl}/sign-in?error=google_auth_cancelled`);
      return;
    }

    const clientId = process.env.GOOGLE_CLIENT_ID || "";
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET || "";
    const serverBase =
      process.env.SERVER_URL || `${req.protocol}://${req.get("host")}`;
    const redirectUri = `${serverBase}/api/auth/google/callback`;

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    const tokenJson = (await tokenRes.json()) as { access_token?: string };
    if (!tokenJson.access_token) {
      res.redirect(`${clientUrl}/sign-in?error=google_token_failed`);
      return;
    }

    const profileRes = await fetch(
      "https://www.googleapis.com/oauth2/v3/userinfo",
      {
        headers: { Authorization: `Bearer ${tokenJson.access_token}` },
      },
    );

    const profile = (await profileRes.json()) as {
      email?: string;
      name?: string;
      picture?: string;
    };

    if (!profile.email) {
      res.redirect(`${clientUrl}/sign-in?error=google_email_missing`);
      return;
    }

    const normalizedEmail = profile.email.trim().toLowerCase();
    const existingUser = await collections.users.findOne({
      email: normalizedEmail,
    });

    let userDoc = existingUser;
    if (!existingUser) {
      const newUser = {
        name: profile.name?.trim() || normalizedEmail.split("@")[0],
        email: normalizedEmail,
        image: profile.picture || "",
        role: stateRole,
        phone: "",
        bio: "",
        plan: "free" as const,
        createdAt: new Date().toISOString(),
      };
      const insertResult = await collections.users.insertOne(newUser);
      userDoc = { _id: insertResult.insertedId, ...newUser };
    } else if (profile.picture && !existingUser.image) {
      await collections.users.updateOne(
        { _id: existingUser._id },
        { $set: { image: profile.picture } },
      );
      userDoc = { ...existingUser, image: profile.picture };
    }

    const authData = buildAuthResponse(userDoc || {}, normalizedEmail);
    const payload = encodeURIComponent(
      JSON.stringify({
        success: true,
        message: "Signed in with Google",
        ...authData,
      }),
    );

    res.redirect(`${clientUrl}/auth/callback?data=${payload}`);
  } catch (error) {
    console.error("Google OAuth callback error:", error);
    res.redirect(`${clientUrl}/sign-in?error=google_server_error`);
  }
};
