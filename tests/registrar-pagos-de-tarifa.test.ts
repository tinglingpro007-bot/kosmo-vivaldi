import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { ensureDatabase } from "@/db/ensure";
import * as schema from "@/db/schema";
import {
  canConfirm,
  evaluatePayment,
  formatMoney,
  parseAmount,
  PAYMENT_ERROR_MESSAGES,
} from "@/features/registrar-pagos-de-tarifa/logic";
import { registerPayment } from "@/features/registrar-pagos-de-tarifa/data";

const FEE = 50;

function createPaymentContext() {
  const raw = new Database(":memory:");
  const db = drizzle(raw, { schema }) as BetterSQLite3Database<typeof schema>;
  ensureDatabase(raw, db);

  const houseId = randomUUID();
  db.insert(schema.houses)
    .values({ id: houseId, code: "TEST-001", name: "Vivienda de prueba", monthlyFee: FEE })
    .run();

  const openPeriodId = randomUUID();
  db.insert(schema.billingPeriods)
    .values({ id: openPeriodId, name: "Octubre 2026", month: 10, year: 2026, status: "open" })
    .run();

  const closedPeriodId = randomUUID();
  db.insert(schema.billingPeriods)
    .values({ id: closedPeriodId, name: "Julio 2026", month: 7, year: 2026, status: "closed" })
    .run();

  return { db, houseId, openPeriodId, closedPeriodId };
}

describe("evaluatePayment", () => {
  it("registra el pago cuando el monto es igual a la tarifa en periodo vigente", () => {
    // Arrange
    const input = { amount: FEE, fee: FEE, periodIsOpen: true, alreadyPaid: false };

    // Act
    const result = evaluatePayment(input);

    // Assert
    expect(result).toEqual({ ok: true, amount: FEE, fee: FEE, excess: 0 });
  });

  it("calcula el excedente como saldo a favor cuando el monto supera la tarifa", () => {
    // Arrange
    const input = { amount: 70, fee: FEE, periodIsOpen: true, alreadyPaid: false };

    // Act
    const result = evaluatePayment(input);

    // Assert
    expect(result).toEqual({ ok: true, amount: 70, fee: FEE, excess: 20 });
  });

  it.each([30, FEE - 0.01])(
    "rechaza el pago cuando el monto %s es inferior a la tarifa",
    (amount) => {
      // Arrange
      const input = { amount, fee: FEE, periodIsOpen: true, alreadyPaid: false };

      // Act
      const result = evaluatePayment(input);

      // Assert
      expect(result).toEqual({
        ok: false,
        reason: "amount_below_fee",
        message: "El monto debe ser igual o superior a la tarifa de la vivienda",
      });
    },
  );

  it("rechaza el pago cuando el periodo de cobro está cerrado", () => {
    // Arrange
    const input = { amount: FEE, fee: FEE, periodIsOpen: false, alreadyPaid: false };

    // Act
    const result = evaluatePayment(input);

    // Assert
    expect(result).toEqual({
      ok: false,
      reason: "period_not_active",
      message: PAYMENT_ERROR_MESSAGES.period_not_active,
    });
  });

  it("rechaza el pago cuando la vivienda ya registró un pago en el periodo", () => {
    // Arrange
    const input = { amount: FEE, fee: FEE, periodIsOpen: true, alreadyPaid: true };

    // Act
    const result = evaluatePayment(input);

    // Assert
    expect(result).toEqual({
      ok: false,
      reason: "duplicate_payment",
      message: PAYMENT_ERROR_MESSAGES.duplicate_payment,
    });
  });
});

describe("parseAmount", () => {
  it.each([
    ["70", 70],
    ["70.50", 70.5],
    [" $ 70.00 ", 70],
    [70, 70],
  ])("interpreta %s como monto válido", (raw, expected) => {
    // Arrange & Act
    const result = parseAmount(raw as string | number);

    // Assert
    expect(result).toBe(expected);
  });

  it.each([
    [""],
    ["abc"],
    [-5],
    [Number.NaN],
    [undefined],
  ])("devuelve null para entrada inválida %s", (raw) => {
    // Arrange & Act
    const result = parseAmount(raw as string | number | undefined);

    // Assert
    expect(result).toBeNull();
  });
});

describe("formatMoney y canConfirm", () => {
  it("formatea montos como dólares", () => {
    // Arrange & Act
    const result = formatMoney(70);

    // Assert
    expect(result).toBe("$70.00");
  });

  it.each([
    ["", "", false],
    ["h1", "", false],
    ["", "p1", false],
    ["h1", "p1", true],
  ])("canConfirm(%j, %j) => %s", (houseId, periodId, expected) => {
    // Arrange & Act
    const result = canConfirm(houseId, periodId);

    // Assert
    expect(result).toBe(expected);
  });
});

describe("registerPayment (integración con SQLite en memoria)", () => {
  it("almacena el pago y lo asocia a la vivienda y periodo cuando el monto es igual a la tarifa", () => {
    // Arrange
    const { db, houseId, openPeriodId } = createPaymentContext();

    // Act
    const result = registerPayment(db, { houseId, periodId: openPeriodId, amount: FEE });

    // Assert
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.account.rows).toHaveLength(1);
    expect(result.account.rows[0]).toMatchObject({
      periodId: openPeriodId,
      amount: FEE,
      fee: FEE,
      excess: 0,
    });
    expect(result.account.credit).toBe(0);
  });

  it("aplica el excedente como saldo a favor de la vivienda cuando el monto supera la tarifa", () => {
    // Arrange
    const { db, houseId, openPeriodId } = createPaymentContext();

    // Act
    const result = registerPayment(db, { houseId, periodId: openPeriodId, amount: 70 });

    // Assert
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.account.rows[0].excess).toBe(20);
    expect(result.account.credit).toBe(20);
  });

  it("rechaza un segundo pago para la misma vivienda y periodo", () => {
    // Arrange
    const { db, houseId, openPeriodId } = createPaymentContext();
    registerPayment(db, { houseId, periodId: openPeriodId, amount: FEE });

    // Act
    const result = registerPayment(db, { houseId, periodId: openPeriodId, amount: FEE });

    // Assert
    expect(result).toEqual({
      ok: false,
      reason: "duplicate_payment",
      message: PAYMENT_ERROR_MESSAGES.duplicate_payment,
    });
    expect(countPayments(db)).toBe(1);
  });

  it("permite registrar pagos en periodos distintos para la misma vivienda", () => {
    // Arrange
    const { db, houseId, openPeriodId } = createPaymentContext();
    const otherPeriodId = randomUUID();
    db.insert(schema.billingPeriods)
      .values({ id: otherPeriodId, name: "Noviembre 2026", month: 11, year: 2026, status: "open" })
      .run();
    registerPayment(db, { houseId, periodId: openPeriodId, amount: FEE });

    // Act
    const result = registerPayment(db, { houseId, periodId: otherPeriodId, amount: FEE });

    // Assert
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.account.rows).toHaveLength(2);
  });

  it("rechaza el pago en un periodo cerrado sin almacenarlo", () => {
    // Arrange
    const { db, houseId, closedPeriodId } = createPaymentContext();

    // Act
    const result = registerPayment(db, { houseId, periodId: closedPeriodId, amount: FEE });

    // Assert
    expect(result).toEqual({
      ok: false,
      reason: "period_not_active",
      message: PAYMENT_ERROR_MESSAGES.period_not_active,
    });
    expect(countPayments(db)).toBe(0);
  });

  it("rechaza el pago en un periodo inexistente", () => {
    // Arrange
    const { db, houseId } = createPaymentContext();

    // Act
    const result = registerPayment(db, { houseId, periodId: randomUUID(), amount: FEE });

    // Assert
    expect(result).toEqual({
      ok: false,
      reason: "period_not_active",
      message: PAYMENT_ERROR_MESSAGES.period_not_active,
    });
  });

  it("rechaza el pago cuando el monto es inferior a la tarifa", () => {
    // Arrange
    const { db, houseId, openPeriodId } = createPaymentContext();

    // Act
    const result = registerPayment(db, { houseId, periodId: openPeriodId, amount: 30 });

    // Assert
    expect(result).toEqual({
      ok: false,
      reason: "amount_below_fee",
      message: PAYMENT_ERROR_MESSAGES.amount_below_fee,
    });
  });

  it("rechaza el pago cuando la vivienda no existe", () => {
    // Arrange
    const { db, openPeriodId } = createPaymentContext();

    // Act
    const result = registerPayment(db, { houseId: randomUUID(), periodId: openPeriodId, amount: FEE });

    // Assert
    expect(result).toEqual({
      ok: false,
      reason: "house_not_found",
      message: PAYMENT_ERROR_MESSAGES.house_not_found,
    });
  });

  it("redondea a dos decimales el monto almacenado", () => {
    // Arrange
    const { db, houseId, openPeriodId } = createPaymentContext();

    // Act
    const result = registerPayment(db, { houseId, periodId: openPeriodId, amount: 70.004 });

    // Assert
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.account.rows[0].amount).toBe(70);
  });
});

function countPayments(db: BetterSQLite3Database<typeof schema>): number {
  return db.select().from(schema.payments).all().length;
}
