import { Response } from "express";
import { collections } from "../config/db";
import { AuthRequest } from "../middlewares/auth.middleware";

export const getDashboardOverview = async (
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

    const currentUser = await collections.users.findOne({ email });
    const plan = currentUser?.plan || "free";

    if (role === "admin") {
      const [
        totalUsers,
        totalTutors,
        totalStudents,
        totalTuitions,
        pendingTuitions,
        approvedTuitions,
        rejectedTuitions,
        totalApplications,
      ] = await Promise.all([
        collections.users.countDocuments(),
        collections.users.countDocuments({ role: "tutor" }),
        collections.users.countDocuments({ role: "student" }),
        collections.tuitions.countDocuments(),
        collections.tuitions.countDocuments({ approvalStatus: "pending" }),
        collections.tuitions.countDocuments({ approvalStatus: "approved" }),
        collections.tuitions.countDocuments({ approvalStatus: "rejected" }),
        collections.applications.countDocuments(),
      ]);

      res.status(200).json({
        success: true,
        role,
        plan,
        stats: {
          totalUsers,
          totalTutors,
          totalStudents,
          totalTuitions,
          pendingTuitions,
          approvedTuitions,
          rejectedTuitions,
          totalApplications,
        },
      });
      return;
    }

    if (role === "tutor") {
      const [
        totalTuitions,
        pendingTuitions,
        approvedTuitions,
        rejectedTuitions,
        receivedApplications,
        approvedApplications,
        pendingApplications,
      ] = await Promise.all([
        collections.tuitions.countDocuments({ tutorEmail: email }),
        collections.tuitions.countDocuments({
          tutorEmail: email,
          approvalStatus: "pending",
        }),
        collections.tuitions.countDocuments({
          tutorEmail: email,
          approvalStatus: "approved",
        }),
        collections.tuitions.countDocuments({
          tutorEmail: email,
          approvalStatus: "rejected",
        }),
        collections.applications.countDocuments({ tutorEmail: email }),
        collections.applications.countDocuments({
          tutorEmail: email,
          status: "approved",
        }),
        collections.applications.countDocuments({
          tutorEmail: email,
          status: "pending",
        }),
      ]);

      res.status(200).json({
        success: true,
        role,
        plan,
        stats: {
          totalTuitions,
          pendingTuitions,
          approvedTuitions,
          rejectedTuitions,
          receivedApplications,
          approvedApplications,
          pendingApplications,
          freePostLimit: plan === "pro" ? null : 2,
        },
      });
      return;
    }

    const [
      myApplications,
      pendingApplications,
      approvedApplications,
      rejectedApplications,
    ] = await Promise.all([
      collections.applications.countDocuments({ studentEmail: email }),
      collections.applications.countDocuments({
        studentEmail: email,
        status: "pending",
      }),
      collections.applications.countDocuments({
        studentEmail: email,
        status: "approved",
      }),
      collections.applications.countDocuments({
        studentEmail: email,
        status: "rejected",
      }),
    ]);

    res.status(200).json({
      success: true,
      role,
      plan,
      stats: {
        myApplications,
        pendingApplications,
        approvedApplications,
        rejectedApplications,
      },
    });
  } catch (error) {
    console.error("Get dashboard overview error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch dashboard overview",
    });
  }
};
