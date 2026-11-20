import { Response } from "express";
import { ObjectId } from "mongodb";
import { collections } from "../config/db";
import { AuthRequest, UserRole } from "../middlewares/auth.middleware";

const ALLOWED_ROLES: UserRole[] = ["student", "tutor", "admin"];

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
        name: user.name || "",
        email: user.email,
        image: user.image || "",
        role: user.role || "student",
        phone: user.phone || "",
        bio: user.bio || "",
        plan: user.plan || "free",
        createdAt: user.createdAt || null,
      },
    });
  } catch (error) {
    console.error("Get profile error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch user profile",
    });
  }
};

export const updateProfile = async (
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

    const { name, phone, bio, image } = req.body as {
      name?: string;
      phone?: string;
      bio?: string;
      image?: string;
    };

    const updateFields: Record<string, string> = {};

    if (typeof name === "string") {
      const trimmedName = name.trim();
      if (!trimmedName) {
        res.status(400).json({
          success: false,
          message: "Name cannot be empty",
        });
        return;
      }
      updateFields.name = trimmedName;
    }

    if (typeof phone === "string") {
      updateFields.phone = phone.trim();
    }

    if (typeof bio === "string") {
      updateFields.bio = bio.trim();
    }

    if (typeof image === "string") {
      updateFields.image = image.trim();
    }

    if (Object.keys(updateFields).length === 0) {
      res.status(400).json({
        success: false,
        message: "No valid profile fields provided to update",
      });
      return;
    }

    const existingUser = await collections.users.findOne({ email });

    if (!existingUser) {
      res.status(404).json({
        success: false,
        message: "User not found",
      });
      return;
    }

    await collections.users.updateOne(
      { _id: existingUser._id },
      { $set: updateFields },
    );

    const updatedUser = await collections.users.findOne({
      _id: existingUser._id,
    });

    res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      user: {
        id: updatedUser?._id.toString(),
        name: updatedUser?.name || "",
        email: updatedUser?.email,
        image: updatedUser?.image || "",
        role: updatedUser?.role || "student",
        phone: updatedUser?.phone || "",
        bio: updatedUser?.bio || "",
        plan: updatedUser?.plan || "free",
        createdAt: updatedUser?.createdAt || null,
      },
    });
  } catch (error) {
    console.error("Update profile error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update profile",
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
      if (!ALLOWED_ROLES.includes(role as UserRole)) {
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
      filter.$or = [{ name: regex }, { email: regex }, { phone: regex }];
    }

    const users = await collections.users
      .find(filter)
      .sort({ createdAt: -1 })
      .toArray();

    const formattedUsers = users.map((user) => ({
      id: user._id.toString(),
      name: user.name || "",
      email: user.email,
      image: user.image || "",
      role: user.role || "student",
      phone: user.phone || "",
      bio: user.bio || "",
      plan: user.plan || "free",
      createdAt: user.createdAt || null,
    }));

    res.status(200).json({
      success: true,
      count: formattedUsers.length,
      users: formattedUsers,
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

    if (!role || !ALLOWED_ROLES.includes(role as UserRole)) {
      res.status(400).json({
        success: false,
        message: "Role must be one of: student, tutor, admin",
      });
      return;
    }

    const targetUser = await collections.users.findOne({
      _id: new ObjectId(id),
    });

    if (!targetUser) {
      res.status(404).json({
        success: false,
        message: "Target user not found",
      });
      return;
    }

    if (
      req.user?.email?.toLowerCase() === targetUser.email?.toLowerCase() &&
      role !== "admin"
    ) {
      res.status(400).json({
        success: false,
        message: "Admin cannot remove their own admin role",
      });
      return;
    }

    await collections.users.updateOne(
      { _id: targetUser._id },
      { $set: { role: role as UserRole } },
    );

    const updatedUser = await collections.users.findOne({
      _id: targetUser._id,
    });

    res.status(200).json({
      success: true,
      message: `User role updated to ${role}`,
      user: {
        id: updatedUser?._id.toString(),
        name: updatedUser?.name || "",
        email: updatedUser?.email,
        image: updatedUser?.image || "",
        role: updatedUser?.role || "student",
        phone: updatedUser?.phone || "",
        bio: updatedUser?.bio || "",
        plan: updatedUser?.plan || "free",
        createdAt: updatedUser?.createdAt || null,
      },
    });
  } catch (error) {
    console.error("Update user role error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update user role",
    });
  }
};
