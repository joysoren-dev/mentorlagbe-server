import { Router, Request, Response } from "express";
import { getDB } from "../config/db";

const router = Router();

router.get("/health", (_req: Request, res: Response) => {
  try {
    const db = getDB();

    res.status(200).json({
      success: true,
      message: "MentorLagbe API is healthy",
      database: db.databaseName,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Database connection is not ready",
    });
  }
});

export default router;
