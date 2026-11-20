import { Request, Response } from "express";
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

    const activeRole: UserRole =
      userDoc?.role === "admin" ||
      userDoc?.role === "tutor" ||
      userDoc?.role === "student"
        ? userDoc.role
        : "student";

    const tokenPayload = {
      id: userDoc?._id?.toString() || "",
      email: normalizedEmail,
      role: activeRole,
      name: userDoc?.name || "",
    };

    const token = jwt.sign(tokenPayload, getJwtSecret(), {
      expiresIn: getJwtExpiresIn() as jwt.SignOptions["expiresIn"],
    });

    res.status(200).json({
      success: true,
      message: "Authentication successful",
      token,
      user: {
        id: userDoc?._id?.toString(),
        name: userDoc?.name,
        email: userDoc?.email,
        image: userDoc?.image || "",
        role: activeRole,
        phone: userDoc?.phone || "",
        bio: userDoc?.bio || "",
        plan: userDoc?.plan || "free",
        createdAt: userDoc?.createdAt,
      },
    });
  } catch (error) {
    console.error("Auth sync error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to authenticate user",
    });
  }
};
