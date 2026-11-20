import express, { Application, Request, Response } from "express";
import cors from "cors";
import dotenv from "dotenv";
import { connectDB } from "./config/db";
import healthRoutes from "./routes/health.route";
import authRoutes from "./routes/auth.route";
import userRoutes from "./routes/user.route";

dotenv.config();

const app: Application = express();
const port = process.env.PORT || 5000;

app.use(
  cors({
    origin: process.env.CLIENT_URL || "http://localhost:3000",
    credentials: true,
  }),
);
app.use(express.json());

app.get("/", (_req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    message: "MentorLagbe Server is running!",
  });
});

app.use("/api", healthRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);

const startServer = async () => {
  await connectDB();

  app.listen(port, () => {
    console.log(`Server is listening on port ${port}`);
  });
};

startServer();
