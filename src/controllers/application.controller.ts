import { Response } from "express";
import { ObjectId } from "mongodb";
import { collections } from "../config/db";
import { AuthRequest } from "../middlewares/auth.middleware";

export const applyForTuition = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const studentEmail = req.user?.email?.toLowerCase();

    if (!studentEmail) {
      res.status(401).json({
        success: false,
        message: "Unauthorized: Student email missing",
      });
      return;
    }

    const { tuitionId, message } = req.body as {
      tuitionId?: string;
      message?: string;
    };

    if (!tuitionId || !ObjectId.isValid(tuitionId)) {
      res.status(400).json({
        success: false,
        message: "Valid tuitionId is required",
      });
      return;
    }

    const tuition = await collections.tuitions.findOne({
      _id: new ObjectId(tuitionId),
    });

    if (!tuition) {
      res.status(404).json({
        success: false,
        message: "Tuition not found",
      });
      return;
    }

    if (tuition.approvalStatus !== "approved" || !tuition.isActive) {
      res.status(400).json({
        success: false,
        message: "This tuition is not currently open for applications",
      });
      return;
    }

    if (tuition.tutorEmail?.toLowerCase() === studentEmail) {
      res.status(400).json({
        success: false,
        message: "You cannot apply to your own tuition post",
      });
      return;
    }

    const existingApplication = await collections.applications.findOne({
      tuitionId,
      studentEmail,
    });

    if (existingApplication) {
      res.status(409).json({
        success: false,
        message: "You have already applied for this tuition",
      });
      return;
    }

    const student = await collections.users.findOne({ email: studentEmail });

    const newApplication = {
      tuitionId,
      tuitionTitle: tuition.title,
      tuitionSubject: tuition.subject,
      monthlyFee: tuition.monthlyFee,
      studentName: student?.name || req.user?.name || "Student",
      studentEmail,
      tutorEmail: tuition.tutorEmail.toLowerCase(),
      message: message?.trim() || "",
      status: "pending" as const,
      createdAt: new Date().toISOString(),
    };

    const result = await collections.applications.insertOne(newApplication);

    res.status(201).json({
      success: true,
      message: "Application submitted successfully",
      application: {
        id: result.insertedId.toString(),
        ...newApplication,
      },
    });
  } catch (error) {
    console.error("Apply for tuition error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to submit application",
    });
  }
};

export const getStudentMyApplications = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const studentEmail = req.user?.email?.toLowerCase();

    if (!studentEmail) {
      res.status(401).json({
        success: false,
        message: "Unauthorized: Student email missing",
      });
      return;
    }

    const applications = await collections.applications
      .find({ studentEmail })
      .sort({ createdAt: -1 })
      .toArray();

    const formatted = applications.map((item) => ({
      id: item._id.toString(),
      tuitionId: item.tuitionId,
      tuitionTitle: item.tuitionTitle,
      tuitionSubject: item.tuitionSubject || "",
      monthlyFee: item.monthlyFee || 0,
      studentName: item.studentName,
      studentEmail: item.studentEmail,
      tutorEmail: item.tutorEmail,
      message: item.message || "",
      status: item.status,
      createdAt: item.createdAt,
    }));

    res.status(200).json({
      success: true,
      count: formatted.length,
      applications: formatted,
    });
  } catch (error) {
    console.error("Get student applications error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch your applications",
    });
  }
};

export const getTutorReceivedApplications = async (
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

    const applications = await collections.applications
      .find({ tutorEmail })
      .sort({ createdAt: -1 })
      .toArray();

    const formatted = applications.map((item) => ({
      id: item._id.toString(),
      tuitionId: item.tuitionId,
      tuitionTitle: item.tuitionTitle,
      tuitionSubject: item.tuitionSubject || "",
      monthlyFee: item.monthlyFee || 0,
      studentName: item.studentName,
      studentEmail: item.studentEmail,
      tutorEmail: item.tutorEmail,
      message: item.message || "",
      status: item.status,
      createdAt: item.createdAt,
    }));

    res.status(200).json({
      success: true,
      count: formatted.length,
      applications: formatted,
    });
  } catch (error) {
    console.error("Get tutor applications error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch received applications",
    });
  }
};

export const updateApplicationStatusByTutor = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const { id } = req.params;
    const tutorEmail = req.user?.email?.toLowerCase();
    const { status } = req.body as { status?: string };

    if (!ObjectId.isValid(id)) {
      res.status(400).json({
        success: false,
        message: "Invalid application ID",
      });
      return;
    }

    if (!status || !["approved", "rejected"].includes(status)) {
      res.status(400).json({
        success: false,
        message: "Status must be either approved or rejected",
      });
      return;
    }

    const application = await collections.applications.findOne({
      _id: new ObjectId(id),
    });

    if (!application) {
      res.status(404).json({
        success: false,
        message: "Application not found",
      });
      return;
    }

    if (application.tutorEmail?.toLowerCase() !== tutorEmail) {
      res.status(403).json({
        success: false,
        message:
          "Forbidden: You can only manage applications for your own tuitions",
      });
      return;
    }

    await collections.applications.updateOne(
      { _id: application._id },
      { $set: { status } },
    );

    res.status(200).json({
      success: true,
      message: `Application ${status} successfully`,
      status,
    });
  } catch (error) {
    console.error("Update application status error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update application status",
    });
  }
};
