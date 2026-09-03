import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { billingPeriods, houses, type NewBillingPeriod, type NewHouse } from "./schema";

type Schema = typeof import("./schema");
type AppDb = BetterSQLite3Database<Schema>;

const DDL = `
CREATE TABLE IF NOT EXISTS houses (
  id TEXT PRIMARY KEY NOT NULL,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  monthly_fee REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS billing_periods (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL UNIQUE,
  month INTEGER NOT NULL,
  year INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY NOT NULL,
  house_id TEXT NOT NULL REFERENCES houses(id),
  billing_period_id TEXT NOT NULL REFERENCES billing_periods(id),
  amount REAL NOT NULL,
  fee REAL NOT NULL,
  excess REAL NOT NULL,
  paid_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS payments_house_period_unique
  ON payments(house_id, billing_period_id);
`;

export function ensureDatabase(sqlite: Database.Database, db: AppDb): void {
  sqlite.exec(DDL);

  // ponytail: transacción exclusiva para serializar el seed entre workers de build
  sqlite.exec("BEGIN IMMEDIATE");
  try {
    const existing = db.select().from(houses).all();
    if (existing.length > 0) {
      sqlite.exec("COMMIT");
      return;
    }

    const seedHouses: NewHouse[] = [
      { id: randomUUID(), code: "VIV-001", name: "Vivienda 1", monthlyFee: 3.5 },
      { id: randomUUID(), code: "VIV-002", name: "Vivienda 2", monthlyFee: 3.5 },
      { id: randomUUID(), code: "VIV-003", name: "Vivienda 3", monthlyFee: 3.5 },
    ];
    db.insert(houses).values(seedHouses).run();

    const openPeriod: NewBillingPeriod = {
      id: randomUUID(),
      name: "Septiembre 2026",
      month: 9,
      year: 2026,
      status: "open",
    };
    const closedPeriod: NewBillingPeriod = {
      id: randomUUID(),
      name: "Agosto 2026",
      month: 8,
      year: 2026,
      status: "closed",
    };
    db.insert(billingPeriods).values([openPeriod, closedPeriod]).run();

    sqlite.exec("COMMIT");
  } catch (err) {
    sqlite.exec("ROLLBACK");
    throw err;
  }
}
