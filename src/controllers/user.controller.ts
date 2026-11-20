import { Response } from "express";
import { ObjectId } from "mongodb";
import { collections } from "../config/db";
import { AuthRequest } from "../middlewares/auth.middleware";

export const getCurrentUserProfile = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const email = req.user?.email?.toLowerCase();

    if (!email) {
      res.status(401).json({
        success: false,
        message: "Unauthorized: User email missing",
      });
      return;
    }

    const user = await collections.users.findOne({ email });

    if (!user) {
      res.status(404).json({
        success: false,
        message: "User profile not found",
      });
      return;
    }

    res.status(200).json({
      success: true,
      user: {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        role: user.role,
        plan: user.plan || "free",
        bio: user.bio || "",
        image: user.image || "",
        phone: user.phone || "",
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    console.error("Get current user profile error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch user profile",
    });
  }
};

export const updateCurrentUserProfile = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const email = req.user?.email?.toLowerCase();

    if (!email) {
      res.status(401).json({
        success: false,
        message: "Unauthorized: User email missing",
      });
      return;
    }

    const { name, bio, image, phone } = req.body as {
      name?: string;
      bio?: string;
      image?: string;
      phone?: string;
    };

    const updateFields: Record<string, unknown> = {};

    if (typeof name === "string" && name.trim()) {
      updateFields.name = name.trim();
    }
    if (typeof bio === "string") {
      updateFields.bio = bio.trim();
    }
    if (typeof image === "string") {
      updateFields.image = image.trim();
    }
    if (typeof phone === "string") {
      updateFields.phone = phone.trim();
    }

    if (Object.keys(updateFields).length === 0) {
      res.status(400).json({
        success: false,
        message: "No valid profile fields provided for update",
      });
      return;
    }

    const result = await collections.users.findOneAndUpdate(
      { email },
      { $set: updateFields },
      { returnDocument: "after" },
    );

    if (!result) {
      res.status(404).json({
        success: false,
        message: "User profile not found",
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      user: {
        id: result._id.toString(),
        name: result.name,
        email: result.email,
        role: result.role,
        plan: result.plan || "free",
        bio: result.bio || "",
        image: result.image || "",
        phone: result.phone || "",
        createdAt: result.createdAt,
      },
    });
  } catch (error) {
    console.error("Update user profile error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update user profile",
    });
  }
};

export const getAllUsersForAdmin = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const { role, search } = req.query as {
      role?: string;
      search?: string;
    };

    const filter: Record<string, unknown> = {};

    if (role && role !== "all") {
      if (!["student", "tutor", "admin"].includes(role)) {
        res.status(400).json({
          success: false,
          message: "Invalid role filter",
        });
        return;
      }
      filter.role = role;
    }

    if (search && search.trim()) {
      const regex = new RegExp(search.trim(), "i");
      filter.$or = [{ name: regex }, { email: regex }];
    }

    const users = await collections.users
      .find(filter)
      .sort({ createdAt: -1 })
      .toArray();

    const formatted = users.map((user) => ({
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      role: user.role,
      plan: user.plan || "free",
      createdAt: user.createdAt,
    }));

    res.status(200).json({
      success: true,
      count: formatted.length,
      users: formatted,
    });
  } catch (error) {
    console.error("Get all users error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch users",
    });
  }
};

export const updateUserRoleByAdmin = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const { id } = req.params;
    const { role } = req.body as { role?: string };

    if (!ObjectId.isValid(id)) {
      res.status(400).json({
        success: false,
        message: "Invalid user ID",
      });
      return;
    }

    if (!role || !["student", "tutor", "admin"].includes(role)) {
      res.status(400).json({
        success: false,
        message: "Role must be student, tutor, or admin",
      });
      return;
    }

    const existing = await collections.users.findOne({
      _id: new ObjectId(id),
    });

    if (!existing) {
      res.status(404).json({
        success: false,
        message: "User not found",
      });
      return;
    }

    await collections.users.updateOne(
      { _id: existing._id },
      { $set: { role } },
    );

    res.status(200).json({
      success: true,
      message: `User role updated to ${role}`,
      role,
    });
  } catch (error) {
    console.error("Update user role error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update user role",
    });
  }
};

export const upgradeToPro = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const email = req.user?.email?.toLowerCase();

    if (!email) {
      res.status(401).json({
        success: false,
        message: "Unauthorized: User email missing",
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
      res.status(200).json({
        success: true,
        message: "You are already on the Pro plan",
        plan: "pro",
      });
      return;
    }

    await collections.users.updateOne(
      { _id: user._id },
      { $set: { plan: "pro", upgradedAt: new Date().toISOString() } },
    );

    res.status(200).json({
      success: true,
      message: "Successfully upgraded to Pro plan",
      plan: "pro",
    });
  } catch (error) {
    console.error("Upgrade to pro error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to upgrade to Pro plan",
    });
  }
};
