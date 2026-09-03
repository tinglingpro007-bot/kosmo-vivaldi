import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { billingPeriods, houses, payments } from "@/db/schema";
import type { AppDb } from "@/db";
import {
  evaluatePayment,
  parseAmount,
  PAYMENT_ERROR_MESSAGES,
  round2,
  type BillingPeriodOption,
  type HouseAccount,
  type HouseOption,
  type PaymentRow,
} from "./logic";

export function listHouses(db: AppDb): HouseOption[] {
  return db
    .select({ id: houses.id, code: houses.code, name: houses.name, fee: houses.monthlyFee })
    .from(houses)
    .orderBy(houses.code)
    .all();
}

export function listBillingPeriods(db: AppDb): BillingPeriodOption[] {
  return db
    .select({ id: billingPeriods.id, name: billingPeriods.name, month: billingPeriods.month, year: billingPeriods.year, status: billingPeriods.status })
    .from(billingPeriods)
    .orderBy(desc(billingPeriods.year), desc(billingPeriods.month))
    .all()
    .map((row) => ({ id: row.id, name: row.name, month: row.month, year: row.year, isOpen: row.status === "open" }));
}

export function findHouse(db: AppDb, houseId: string): HouseOption | null {
  const rows = db
    .select({ id: houses.id, code: houses.code, name: houses.name, fee: houses.monthlyFee })
    .from(houses)
    .where(eq(houses.id, houseId))
    .all();
  return rows[0] ?? null;
}

export function getHouseAccount(db: AppDb, houseId: string): HouseAccount | null {
  const house = findHouse(db, houseId);
  if (!house) return null;

  const rows = db
    .select({
      id: payments.id,
      periodId: payments.billingPeriodId,
      periodName: billingPeriods.name,
      periodStatus: billingPeriods.status,
      amount: payments.amount,
      fee: payments.fee,
      excess: payments.excess,
      paidAt: payments.paidAt,
    })
    .from(payments)
    .innerJoin(billingPeriods, eq(payments.billingPeriodId, billingPeriods.id))
    .where(eq(payments.houseId, houseId))
    .orderBy(desc(payments.paidAt))
    .all();

  const rowsDto: PaymentRow[] = rows.map((row) => ({
    id: row.id,
    periodId: row.periodId,
    periodName: row.periodName,
    periodIsOpen: row.periodStatus === "open",
    amount: row.amount,
    fee: row.fee,
    excess: row.excess,
    paidAt: row.paidAt.toISOString(),
  }));

  const credit = round2(rowsDto.reduce((sum, row) => sum + row.excess, 0));
  return { rows: rowsDto, credit };
}

export interface RegisterPaymentParams {
  houseId: string;
  periodId: string;
  amount: number;
}

export type RegisterPaymentResult =
  | { ok: true; account: HouseAccount }
  | { ok: false; reason: string; message: string };

export function registerPayment(db: AppDb, params: RegisterPaymentParams): RegisterPaymentResult {
  const house = findHouse(db, params.houseId);
  if (!house) {
    return { ok: false, reason: "house_not_found", message: PAYMENT_ERROR_MESSAGES.house_not_found };
  }

  const parsedAmount = parseAmount(params.amount);
  if (parsedAmount === null) {
    return { ok: false, reason: "invalid_amount", message: PAYMENT_ERROR_MESSAGES.invalid_amount };
  }

  const periodRows = db.select().from(billingPeriods).where(eq(billingPeriods.id, params.periodId)).all();
  const period = periodRows[0] ?? null;
  const periodIsOpen = period !== null && period.status === "open";

  const paidRows = db
    .select({ id: payments.id })
    .from(payments)
    .where(and(eq(payments.houseId, params.houseId), eq(payments.billingPeriodId, params.periodId)))
    .all();
  const alreadyPaid = paidRows.length > 0;

  const evaluation = evaluatePayment({
    amount: parsedAmount,
    fee: house.fee,
    periodIsOpen,
    alreadyPaid,
  });

  if (!evaluation.ok) {
    return { ok: false, reason: evaluation.reason, message: evaluation.message };
  }

  try {
    db.insert(payments)
      .values({
        id: randomUUID(),
        houseId: params.houseId,
        billingPeriodId: params.periodId,
        amount: evaluation.amount,
        fee: evaluation.fee,
        excess: evaluation.excess,
      })
      .run();
  } catch (err) {
    if (err instanceof Error && err.message.includes("UNIQUE")) {
      return { ok: false, reason: "duplicate_payment", message: PAYMENT_ERROR_MESSAGES.duplicate_payment };
    }
    throw err;
  }

  const account = getHouseAccount(db, params.houseId);
  if (!account) {
    return { ok: false, reason: "house_not_found", message: PAYMENT_ERROR_MESSAGES.house_not_found };
  }

  return { ok: true, account };
}
