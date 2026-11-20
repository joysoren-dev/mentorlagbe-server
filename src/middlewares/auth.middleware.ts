import { Request, Response, NextFunction } from "express";
import jwt, { JwtPayload } from "jsonwebtoken";

export type UserRole = "student" | "tutor" | "admin";

export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
  name?: string;
}

export interface AuthRequest extends Request {
  user?: AuthUser;
}

const getJwtSecret = (): string => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET is missing in .env file");
  }
  return secret;
};

export const verifyToken = (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): void => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.status(401).json({
        success: false,
        message: "Unauthorized: Missing or invalid authorization token",
      });
      return;
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, getJwtSecret()) as JwtPayload & AuthUser;

    if (!decoded || !decoded.email || !decoded.role) {
      res.status(401).json({
        success: false,
        message: "Unauthorized: Invalid token payload",
      });
      return;
    }

    req.user = {
      id: decoded.id || decoded.sub || "",
      email: decoded.email,
      role: decoded.role,
      name: decoded.name,
    };

    next();
  } catch (error) {
    res.status(401).json({
      success: false,
      message: "Unauthorized: Token expired or invalid",
    });
  }
};

export const verifyStudent = (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): void => {
  if (!req.user) {
    res.status(401).json({
      success: false,
      message: "Unauthorized: User not authenticated",
    });
    return;
  }

  if (req.user.role !== "student") {
    res.status(403).json({
      success: false,
      message: "Forbidden: Student access required",
    });
    return;
  }

  next();
};

export const verifyTutor = (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): void => {
  if (!req.user) {
    res.status(401).json({
      success: false,
      message: "Unauthorized: User not authenticated",
    });
    return;
  }

  if (req.user.role !== "tutor") {
    res.status(403).json({
      success: false,
      message: "Forbidden: Tutor access required",
    });
    return;
  }

  next();
};

export const verifyAdmin = (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): void => {
  if (!req.user) {
    res.status(401).json({
      success: false,
      message: "Unauthorized: User not authenticated",
    });
    return;
  }

  if (req.user.role !== "admin") {
    res.status(403).json({
      success: false,
      message: "Forbidden: Admin access required",
    });
    return;
  }

  next();
};
