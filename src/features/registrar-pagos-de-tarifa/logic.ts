export type PaymentRejection =
  | "period_not_active"
  | "duplicate_payment"
  | "amount_below_fee"
  | "invalid_amount"
  | "house_not_found";

export const PAYMENT_ERROR_MESSAGES: Record<PaymentRejection, string> = {
  period_not_active: "El periodo de cobro no está vigente",
  duplicate_payment: "Esta vivienda ya registró un pago para el periodo seleccionado",
  amount_below_fee: "El monto debe ser igual o superior a la tarifa de la vivienda",
  invalid_amount: "Ingrese un monto válido para registrar el pago.",
  house_not_found: "La vivienda seleccionada no existe en el padrón comunitario.",
};

export const SELECTION_HINTS = {
  noHouse: "Seleccione una vivienda del padrón para registrar el pago.",
  noPeriod: "Seleccione un periodo de cobro vigente para registrar el pago.",
} as const;

export interface HouseOption {
  id: string;
  code: string;
  name: string;
  fee: number;
}

export interface BillingPeriodOption {
  id: string;
  name: string;
  month: number;
  year: number;
  isOpen: boolean;
}

export interface PaymentRow {
  id: string;
  periodId: string;
  periodName: string;
  periodIsOpen: boolean;
  amount: number;
  fee: number;
  excess: number;
  paidAt: string;
}

export interface HouseAccount {
  rows: PaymentRow[];
  credit: number;
}

export interface EvaluatePaymentInput {
  amount: number;
  fee: number;
  periodIsOpen: boolean;
  alreadyPaid: boolean;
}

export type PaymentEvaluation =
  | { ok: true; amount: number; fee: number; excess: number }
  | { ok: false; reason: PaymentRejection; message: string };

export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function parseAmount(raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "number") {
    return Number.isFinite(raw) && raw >= 0 ? raw : null;
  }
  const normalized = String(raw).trim().replace(/[$,\s]/g, "");
  if (normalized === "") return null;
  const value = Number(normalized);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

export function formatMoney(value: number): string {
  return value.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export function canConfirm(houseId: string | null, periodId: string | null): boolean {
  return Boolean(houseId && periodId);
}

export function evaluatePayment(input: EvaluatePaymentInput): PaymentEvaluation {
  const amount = round2(input.amount);
  const fee = round2(input.fee);

  if (!input.periodIsOpen) {
    return { ok: false, reason: "period_not_active", message: PAYMENT_ERROR_MESSAGES.period_not_active };
  }
  if (input.alreadyPaid) {
    return { ok: false, reason: "duplicate_payment", message: PAYMENT_ERROR_MESSAGES.duplicate_payment };
  }
  if (amount < fee) {
    return { ok: false, reason: "amount_below_fee", message: PAYMENT_ERROR_MESSAGES.amount_below_fee };
  }

  return { ok: true, amount, fee, excess: round2(amount - fee) };
}
