import { Request, Response } from "express";
import { ObjectId } from "mongodb";
import { collections } from "../config/db";
import { AuthRequest } from "../middlewares/auth.middleware";

const ALLOWED_MODES = ["Online", "Offline"] as const;

const getParamId = (rawId: string | string[] | undefined): string =>
  Array.isArray(rawId) ? rawId[0] : rawId || "";

export const createTuition = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const tutorEmail = req.user?.email?.toLowerCase();

    if (!tutorEmail) {
      res.status(401).json({
        success: false,
        message: "Unauthorized: Tutor email missing",
      });
      return;
    }

    const tutor = await collections.users.findOne({ email: tutorEmail });

    if (!tutor) {
      res.status(404).json({
        success: false,
        message: "Tutor profile not found",
      });
      return;
    }

    // Free plan tutors can create up to 2 tuition posts
    const currentPlan = tutor.plan || "free";
    if (currentPlan === "free") {
      const existingCount = await collections.tuitions.countDocuments({
        tutorEmail,
      });

      if (existingCount >= 2) {
        res.status(403).json({
          success: false,
          message:
            "Free plan limit reached (maximum 2 tuitions). Upgrade to Pro for unlimited posts.",
        });
        return;
      }
    }

    const {
      title,
      subject,
      classLevel,
      mode,
      location,
      monthlyFee,
      daysPerWeek,
      bannerImage,
      description,
    } = req.body as {
      title?: string;
      subject?: string;
      classLevel?: string;
      mode?: string;
      location?: string;
      monthlyFee?: number | string;
      daysPerWeek?: number | string;
      bannerImage?: string;
      description?: string;
    };

    if (
      !title?.trim() ||
      !subject?.trim() ||
      !classLevel?.trim() ||
      !mode ||
      !ALLOWED_MODES.includes(mode as (typeof ALLOWED_MODES)[number]) ||
      monthlyFee === undefined ||
      daysPerWeek === undefined ||
      !description?.trim()
    ) {
      res.status(400).json({
        success: false,
        message:
          "Required fields: title, subject, classLevel, mode (Online/Offline), monthlyFee, daysPerWeek, description",
      });
      return;
    }

    const parsedFee = Number(monthlyFee);
    const parsedDays = Number(daysPerWeek);

    if (Number.isNaN(parsedFee) || parsedFee <= 0) {
      res.status(400).json({
        success: false,
        message: "Monthly fee must be a positive number",
      });
      return;
    }

    if (Number.isNaN(parsedDays) || parsedDays < 1 || parsedDays > 7) {
      res.status(400).json({
        success: false,
        message: "Days per week must be between 1 and 7",
      });
      return;
    }

    const newTuition = {
      title: title.trim(),
      subject: subject.trim(),
      classLevel: classLevel.trim(),
      mode,
      location:
        mode === "Online"
          ? location?.trim() || "Online"
          : location?.trim() || "Not specified",
      monthlyFee: parsedFee,
      daysPerWeek: parsedDays,
      bannerImage: bannerImage?.trim() || "",
      description: description.trim(),
      tutorName: tutor.name || req.user?.name || "Tutor",
      tutorEmail,
      approvalStatus: "pending" as const,
      isActive: true,
      createdAt: new Date().toISOString(),
    };

    const result = await collections.tuitions.insertOne(newTuition);

    res.status(201).json({
      success: true,
      message: "Tuition created successfully and pending admin approval",
      tuition: {
        id: result.insertedId.toString(),
        ...newTuition,
      },
    });
  } catch (error) {
    console.error("Create tuition error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create tuition",
    });
  }
};

export const getPublicTuitions = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const {
      search,
      subject,
      classLevel,
      mode,
      page = "1",
      limit = "9",
    } = req.query as {
      search?: string;
      subject?: string;
      classLevel?: string;
      mode?: string;
      page?: string;
      limit?: string;
    };

    const filter: Record<string, unknown> = {
      approvalStatus: "approved",
      isActive: true,
    };

    if (search && search.trim()) {
      const regex = new RegExp(search.trim(), "i");
      filter.$or = [{ title: regex }, { subject: regex }];
    }

    if (subject && subject.trim() && subject.toLowerCase() !== "all") {
      filter.subject = new RegExp(`^${subject.trim()}$`, "i");
    }

    if (classLevel && classLevel.trim() && classLevel.toLowerCase() !== "all") {
      filter.classLevel = new RegExp(`^${classLevel.trim()}$`, "i");
    }

    if (mode && mode.trim() && mode.toLowerCase() !== "all") {
      if (!ALLOWED_MODES.includes(mode as (typeof ALLOWED_MODES)[number])) {
        res.status(400).json({
          success: false,
          message: "Mode must be Online or Offline",
        });
        return;
      }
      filter.mode = mode;
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10) || 9));
    const skip = (pageNum - 1) * limitNum;

    const [total, tuitions] = await Promise.all([
      collections.tuitions.countDocuments(filter),
      collections.tuitions
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .toArray(),
    ]);

    const formatted = tuitions.map((item) => ({
      id: item._id.toString(),
      title: item.title,
      subject: item.subject,
      classLevel: item.classLevel,
      mode: item.mode,
      location: item.location,
      monthlyFee: item.monthlyFee,
      daysPerWeek: item.daysPerWeek,
      bannerImage: item.bannerImage || "",
      description: item.description,
      tutorName: item.tutorName,
      tutorEmail: item.tutorEmail,
      approvalStatus: item.approvalStatus,
      isActive: item.isActive,
      createdAt: item.createdAt,
    }));

    res.status(200).json({
      success: true,
      total,
      page: pageNum,
      totalPages: Math.ceil(total / limitNum),
      tuitions: formatted,
    });
  } catch (error) {
    console.error("Get public tuitions error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch tuitions",
    });
  }
};

export const getSingleTuition = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const id = getParamId(req.params.id);

    if (!ObjectId.isValid(id)) {
      res.status(400).json({
        success: false,
        message: "Invalid tuition ID",
      });
      return;
    }

    const tuition = await collections.tuitions.findOne({
      _id: new ObjectId(id),
    });

    if (!tuition) {
      res.status(404).json({
        success: false,
        message: "Tuition not found",
      });
      return;
    }

    const tutor = await collections.users.findOne({
      email: tuition.tutorEmail?.toLowerCase(),
    });

    res.status(200).json({
      success: true,
      tuition: {
        id: tuition._id.toString(),
        title: tuition.title,
        subject: tuition.subject,
        classLevel: tuition.classLevel,
        mode: tuition.mode,
        location: tuition.location,
        monthlyFee: tuition.monthlyFee,
        daysPerWeek: tuition.daysPerWeek,
        bannerImage: tuition.bannerImage || "",
        description: tuition.description,
        tutorName: tuition.tutorName,
        tutorEmail: tuition.tutorEmail,
        tutorBio: tutor?.bio || "",
        tutorImage: tutor?.image || "",
        tutorPlan: tutor?.plan || "free",
        approvalStatus: tuition.approvalStatus,
        isActive: tuition.isActive,
        createdAt: tuition.createdAt,
      },
    });
  } catch (error) {
    console.error("Get single tuition error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch tuition details",
    });
  }
};

export const getTutorMyTuitions = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const tutorEmail = req.user?.email?.toLowerCase();

    if (!tutorEmail) {
      res.status(401).json({
        success: false,
        message: "Unauthorized: Tutor email missing",
      });
      return;
    }

    const tuitions = await collections.tuitions
      .find({ tutorEmail })
      .sort({ createdAt: -1 })
      .toArray();

    const formatted = tuitions.map((item) => ({
      id: item._id.toString(),
      title: item.title,
      subject: item.subject,
      classLevel: item.classLevel,
      mode: item.mode,
      location: item.location,
      monthlyFee: item.monthlyFee,
      daysPerWeek: item.daysPerWeek,
      bannerImage: item.bannerImage || "",
      description: item.description,
      tutorName: item.tutorName,
      tutorEmail: item.tutorEmail,
      approvalStatus: item.approvalStatus,
      isActive: item.isActive,
      createdAt: item.createdAt,
    }));

    res.status(200).json({
      success: true,
      count: formatted.length,
      tuitions: formatted,
    });
  } catch (error) {
    console.error("Get tutor tuitions error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch your tuitions",
    });
  }
};

export const updateTuitionByTutor = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const id = getParamId(req.params.id);
    const tutorEmail = req.user?.email?.toLowerCase();

    if (!ObjectId.isValid(id)) {
      res.status(400).json({
        success: false,
        message: "Invalid tuition ID",
      });
      return;
    }

    const existing = await collections.tuitions.findOne({
      _id: new ObjectId(id),
    });

    if (!existing) {
      res.status(404).json({
        success: false,
        message: "Tuition not found",
      });
      return;
    }

    if (existing.tutorEmail?.toLowerCase() !== tutorEmail) {
      res.status(403).json({
        success: false,
        message: "Forbidden: You can only edit your own tuitions",
      });
      return;
    }

    const {
      title,
      subject,
      classLevel,
      mode,
      location,
      monthlyFee,
      daysPerWeek,
      bannerImage,
      description,
    } = req.body as Record<string, unknown>;

    const updateFields: Record<string, unknown> = {};

    if (typeof title === "string" && title.trim()) {
      updateFields.title = title.trim();
    }
    if (typeof subject === "string" && subject.trim()) {
      updateFields.subject = subject.trim();
    }
    if (typeof classLevel === "string" && classLevel.trim()) {
      updateFields.classLevel = classLevel.trim();
    }
    if (typeof mode === "string") {
      if (!ALLOWED_MODES.includes(mode as (typeof ALLOWED_MODES)[number])) {
        res.status(400).json({
          success: false,
          message: "Mode must be Online or Offline",
        });
        return;
      }
      updateFields.mode = mode;
    }
    if (typeof location === "string") {
      updateFields.location = location.trim();
    }
    if (monthlyFee !== undefined) {
      const parsedFee = Number(monthlyFee);
      if (Number.isNaN(parsedFee) || parsedFee <= 0) {
        res.status(400).json({
          success: false,
          message: "Monthly fee must be a positive number",
        });
        return;
      }
      updateFields.monthlyFee = parsedFee;
    }
    if (daysPerWeek !== undefined) {
      const parsedDays = Number(daysPerWeek);
      if (Number.isNaN(parsedDays) || parsedDays < 1 || parsedDays > 7) {
        res.status(400).json({
          success: false,
          message: "Days per week must be between 1 and 7",
        });
        return;
      }
      updateFields.daysPerWeek = parsedDays;
    }
    if (typeof bannerImage === "string") {
      updateFields.bannerImage = bannerImage.trim();
    }
    if (typeof description === "string" && description.trim()) {
      updateFields.description = description.trim();
    }

    if (Object.keys(updateFields).length === 0) {
      res.status(400).json({
        success: false,
        message: "No valid fields provided for update",
      });
      return;
    }

    await collections.tuitions.updateOne(
      { _id: existing._id },
      { $set: updateFields },
    );

    const updated = await collections.tuitions.findOne({ _id: existing._id });

    res.status(200).json({
      success: true,
      message: "Tuition updated successfully",
      tuition: {
        id: updated?._id.toString(),
        ...updated,
        _id: undefined,
      },
    });
  } catch (error) {
    console.error("Update tuition error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update tuition",
    });
  }
};

export const toggleTuitionActiveStatus = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const id = getParamId(req.params.id);
    const tutorEmail = req.user?.email?.toLowerCase();

    if (!ObjectId.isValid(id)) {
      res.status(400).json({
        success: false,
        message: "Invalid tuition ID",
      });
      return;
    }

    const existing = await collections.tuitions.findOne({
      _id: new ObjectId(id),
    });

    if (!existing) {
      res.status(404).json({
        success: false,
        message: "Tuition not found",
      });
      return;
    }

    if (existing.tutorEmail?.toLowerCase() !== tutorEmail) {
      res.status(403).json({
        success: false,
        message: "Forbidden: You can only update your own tuitions",
      });
      return;
    }

    const nextActiveState = !existing.isActive;

    await collections.tuitions.updateOne(
      { _id: existing._id },
      { $set: { isActive: nextActiveState } },
    );

    res.status(200).json({
      success: true,
      message: `Tuition status set to ${nextActiveState ? "Active" : "Closed"}`,
      isActive: nextActiveState,
    });
  } catch (error) {
    console.error("Toggle tuition status error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to toggle tuition active status",
    });
  }
};

export const deleteTuitionByTutor = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const id = getParamId(req.params.id);
    const tutorEmail = req.user?.email?.toLowerCase();

    if (!ObjectId.isValid(id)) {
      res.status(400).json({
        success: false,
        message: "Invalid tuition ID",
      });
      return;
    }

    const existing = await collections.tuitions.findOne({
      _id: new ObjectId(id),
    });

    if (!existing) {
      res.status(404).json({
        success: false,
        message: "Tuition not found",
      });
      return;
    }

    if (existing.tutorEmail?.toLowerCase() !== tutorEmail) {
      res.status(403).json({
        success: false,
        message: "Forbidden: You can only delete your own tuitions",
      });
      return;
    }

    await collections.tuitions.deleteOne({ _id: existing._id });

    res.status(200).json({
      success: true,
      message: "Tuition deleted successfully",
    });
  } catch (error) {
    console.error("Delete tuition error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete tuition",
    });
  }
};

export const getAllTuitionsForAdmin = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const { status, search } = req.query as {
      status?: string;
      search?: string;
    };

    const filter: Record<string, unknown> = {};

    if (status && status !== "all") {
      if (!["pending", "approved", "rejected"].includes(status)) {
        res.status(400).json({
          success: false,
          message: "Status must be pending, approved, or rejected",
        });
        return;
      }
      filter.approvalStatus = status;
    }

    if (search && search.trim()) {
      const regex = new RegExp(search.trim(), "i");
      filter.$or = [
        { title: regex },
        { subject: regex },
        { tutorName: regex },
        { tutorEmail: regex },
      ];
    }

    const tuitions = await collections.tuitions
      .find(filter)
      .sort({ createdAt: -1 })
      .toArray();

    const formatted = tuitions.map((item) => ({
      id: item._id.toString(),
      title: item.title,
      subject: item.subject,
      classLevel: item.classLevel,
      mode: item.mode,
      location: item.location,
      monthlyFee: item.monthlyFee,
      daysPerWeek: item.daysPerWeek,
      bannerImage: item.bannerImage || "",
      description: item.description,
      tutorName: item.tutorName,
      tutorEmail: item.tutorEmail,
      approvalStatus: item.approvalStatus,
      isActive: item.isActive,
      createdAt: item.createdAt,
    }));

    res.status(200).json({
      success: true,
      count: formatted.length,
      tuitions: formatted,
    });
  } catch (error) {
    console.error("Get all tuitions for admin error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch tuitions for moderation",
    });
  }
};

export const updateTuitionApprovalByAdmin = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const id = getParamId(req.params.id);
    const { approvalStatus } = req.body as { approvalStatus?: string };

    if (!ObjectId.isValid(id)) {
      res.status(400).json({
        success: false,
        message: "Invalid tuition ID",
      });
      return;
    }

    if (
      !approvalStatus ||
      !["pending", "approved", "rejected"].includes(approvalStatus)
    ) {
      res.status(400).json({
        success: false,
        message: "approvalStatus must be one of: pending, approved, rejected",
      });
      return;
    }

    const existing = await collections.tuitions.findOne({
      _id: new ObjectId(id),
    });

    if (!existing) {
      res.status(404).json({
        success: false,
        message: "Tuition not found",
      });
      return;
    }

    await collections.tuitions.updateOne(
      { _id: existing._id },
      { $set: { approvalStatus } },
    );

    res.status(200).json({
      success: true,
      message: `Tuition approval status updated to ${approvalStatus}`,
      approvalStatus,
    });
  } catch (error) {
    console.error("Update tuition approval error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update tuition approval status",
    });
  }
};
