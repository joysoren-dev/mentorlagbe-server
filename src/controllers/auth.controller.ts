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
