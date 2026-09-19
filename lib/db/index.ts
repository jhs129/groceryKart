import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

function createDb() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set. Pull env with `vercel env pull .env.local`.");
  }
  const sql = neon(url);
  return drizzle({ client: sql, schema });
}

export const db = createDb();
export { schema };
