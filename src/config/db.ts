import { MongoClient, Db, Collection, ServerApiVersion } from "mongodb";
import dotenv from "dotenv";

dotenv.config();

const uri = process.env.MONGODB_URI;
const dbName = process.env.DB_NAME || "mentorlagbe_db";

if (!uri) {
  throw new Error("MONGODB_URI is missing in .env file");
}

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

let db: Db;

export interface Collections {
  users: Collection;
  tuitions: Collection;
  applications: Collection;
  payments: Collection;
}

export let collections: Collections;

export const connectDB = async (): Promise<Db> => {
  if (db) return db;

  try {
    await client.connect();
    db = client.db(dbName);

    collections = {
      users: db.collection("users"),
      tuitions: db.collection("tuitions"),
      applications: db.collection("applications"),
      payments: db.collection("payments"),
    };

    console.log(`Connected to MongoDB database: ${dbName}`);
    return db;
  } catch (error) {
    console.error("MongoDB connection failed:", error);
    process.exit(1);
  }
};

export const getDB = (): Db => {
  if (!db) {
    throw new Error("Database not initialized. Call connectDB first.");
  }
  return db;
};
