import { integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const houses = sqliteTable("houses", {
  id: text("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  monthlyFee: real("monthly_fee").notNull(),
  status: text("status").notNull().default("active"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const billingPeriods = sqliteTable("billing_periods", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  month: integer("month").notNull(),
  year: integer("year").notNull(),
  status: text("status").notNull().default("open"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const payments = sqliteTable(
  "payments",
  {
    id: text("id").primaryKey(),
    houseId: text("house_id")
      .notNull()
      .references(() => houses.id),
    billingPeriodId: text("billing_period_id")
      .notNull()
      .references(() => billingPeriods.id),
    amount: real("amount").notNull(),
    fee: real("fee").notNull(),
    excess: real("excess").notNull(),
    paidAt: integer("paid_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    uniqueIndex("payments_house_period_unique").on(table.houseId, table.billingPeriodId),
  ],
);

export type House = typeof houses.$inferSelect;
export type NewHouse = typeof houses.$inferInsert;
export type BillingPeriod = typeof billingPeriods.$inferSelect;
export type NewBillingPeriod = typeof billingPeriods.$inferInsert;
export type Payment = typeof payments.$inferSelect;
export type NewPayment = typeof payments.$inferInsert;
