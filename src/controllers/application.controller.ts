import { Response } from "express";
import { ObjectId } from "mongodb";
import { collections } from "../config/db";
import { AuthRequest } from "../middlewares/auth.middleware";

const getParamId = (rawId: string | string[] | undefined): string =>
  Array.isArray(rawId) ? rawId[0] : rawId || "";

export const createApplication = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const studentEmail = req.user?.email?.toLowerCase();
    const studentName = req.user?.name || "Student";

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

    if (tuition.approvalStatus !== "approved" || tuition.isActive === false) {
      res.status(400).json({
        success: false,
        message: "You can only apply to approved and active tuitions",
      });
      return;
    }

    const existingApplication = await collections.applications.findOne({
      tuitionId: tuition._id.toString(),
      studentEmail,
    });

    if (existingApplication) {
      res.status(409).json({
        success: false,
        message: "You have already applied to this tuition",
      });
      return;
    }

    const newApplication = {
      tuitionId: tuition._id.toString(),
      tuitionTitle: tuition.title,
      tuitionSubject: tuition.subject,
      monthlyFee: tuition.monthlyFee,
      studentName,
      studentEmail,
      tutorEmail: tuition.tutorEmail,
      message: typeof message === "string" ? message.trim() : "",
      status: "pending",
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
    console.error("Create application error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to submit application",
    });
  }
};

export const getMyApplications = async (
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

    const formatted = applications.map((app) => ({
      id: app._id.toString(),
      tuitionId: app.tuitionId,
      tuitionTitle: app.tuitionTitle,
      tuitionSubject: app.tuitionSubject,
      monthlyFee: app.monthlyFee,
      studentName: app.studentName,
      studentEmail: app.studentEmail,
      tutorEmail: app.tutorEmail,
      message: app.message || "",
      status: app.status,
      createdAt: app.createdAt,
    }));

    res.status(200).json({
      success: true,
      count: formatted.length,
      applications: formatted,
    });
  } catch (error) {
    console.error("Get my applications error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch applications",
    });
  }
};

export const getTutorApplications = async (
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

    const formatted = applications.map((app) => ({
      id: app._id.toString(),
      tuitionId: app.tuitionId,
      tuitionTitle: app.tuitionTitle,
      tuitionSubject: app.tuitionSubject,
      monthlyFee: app.monthlyFee,
      studentName: app.studentName,
      studentEmail: app.studentEmail,
      tutorEmail: app.tutorEmail,
      message: app.message || "",
      status: app.status,
      createdAt: app.createdAt,
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
      message: "Failed to fetch tutor applications",
    });
  }
};

export const updateApplicationStatus = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const id = getParamId(req.params.id);
    const { status } = req.body as { status?: string };
    const tutorEmail = req.user?.email?.toLowerCase();

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
        message: "Status must be approved or rejected",
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

    if (
      req.user?.role !== "admin" &&
      application.tutorEmail?.toLowerCase() !== tutorEmail
    ) {
      res.status(403).json({
        success: false,
        message:
          "Forbidden: You can only manage applications for your own tuitions",
      });
      return;
    }

    await collections.applications.updateOne(
      { _id: application._id },
      { $set: { status, updatedAt: new Date().toISOString() } },
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

export const deleteApplication = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const id = getParamId(req.params.id);
    const studentEmail = req.user?.email?.toLowerCase();

    if (!ObjectId.isValid(id)) {
      res.status(400).json({
        success: false,
        message: "Invalid application ID",
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

    if (
      req.user?.role !== "admin" &&
      application.studentEmail?.toLowerCase() !== studentEmail
    ) {
      res.status(403).json({
        success: false,
        message: "Forbidden: You can only cancel your own application",
      });
      return;
    }

    if (req.user?.role !== "admin" && application.status !== "pending") {
      res.status(400).json({
        success: false,
        message: "Only pending applications can be cancelled",
      });
      return;
    }

    await collections.applications.deleteOne({ _id: application._id });

    res.status(200).json({
      success: true,
      message: "Application cancelled successfully",
    });
  } catch (error) {
    console.error("Delete application error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to cancel application",
    });
  }
};
