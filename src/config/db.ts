import { MongoClient, Db, Collection } from "mongodb";
import dotenv from "dotenv";

dotenv.config();

const uri = process.env.MONGODB_URI;
const dbName = process.env.DB_NAME || "mentorlagbe_db";

if (!uri) {
  throw new Error("Please define MONGODB_URI in your .env file");
}

const client = new MongoClient(uri);
let db: Db;

export const collections: {
  users: Collection<any>;
  tuitions: Collection<any>;
  applications: Collection<any>;
  payments: Collection<any>;
} = {} as any;

export const connectDB = async (): Promise<Db> => {
  if (db) {
    return db;
  }

  await client.connect();
  db = client.db(dbName);

  collections.users = db.collection("users");
  collections.tuitions = db.collection("tuitions");
  collections.applications = db.collection("applications");
  collections.payments = db.collection("payments");

  console.log(`Connected to MongoDB database: ${dbName}`);
  return db;
};
