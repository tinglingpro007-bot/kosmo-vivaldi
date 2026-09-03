import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import * as schema from "./schema";
import { ensureDatabase } from "./ensure";

function openSqliteDatabase(): Database.Database {
  const rawPath =
    process.env.DATABASE_URL ||
    process.env.DATABASE_PATH ||
    path.join(process.cwd(), ".data", "sqlite.db");
  const cleanPath = rawPath.replace(/^file:\/\//, "").replace(/^file:/, "");

  try {
    const dir = path.dirname(cleanPath);
    if (dir && dir !== "." && !fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return new Database(cleanPath);
  } catch (err) {
    console.warn(`[db] No se pudo abrir base de datos en '${cleanPath}':`, err);
    return new Database(":memory:");
  }
}

export const sqlite = openSqliteDatabase();
sqlite.pragma("foreign_keys = ON");

export type AppDb = BetterSQLite3Database<typeof schema>;
export const db: AppDb = drizzle(sqlite, { schema });

ensureDatabase(sqlite, db);
