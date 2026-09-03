import { NextResponse } from "next/server";
import { db } from "@/db";
import {
  getHouseAccount,
  registerPayment,
} from "@/features/registrar-pagos-de-tarifa/data";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const houseId = searchParams.get("houseId");

  if (!houseId) {
    return NextResponse.json(
      { error: "Bad Request", detail: "El parámetro houseId es obligatorio." },
      { status: 400 },
    );
  }

  const account = getHouseAccount(db, houseId);
  if (!account) {
    return NextResponse.json(
      { error: "Not Found", detail: "La vivienda seleccionada no existe en el padrón comunitario." },
      { status: 404 },
    );
  }

  return NextResponse.json({ data: account }, { status: 200 });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Bad Request", detail: "La solicitud debe incluir un cuerpo JSON válido." },
      { status: 400 },
    );
  }

  const payload = body as { houseId?: unknown; periodId?: unknown; amount?: unknown };
  if (typeof payload.houseId !== "string" || payload.houseId === "") {
    return NextResponse.json(
      { error: "Bad Request", detail: "Debe seleccionar una vivienda del padrón para registrar el pago." },
      { status: 400 },
    );
  }
  if (typeof payload.periodId !== "string" || payload.periodId === "") {
    return NextResponse.json(
      { error: "Bad Request", detail: "Debe seleccionar un periodo de cobro para registrar el pago." },
      { status: 400 },
    );
  }

  const amount = typeof payload.amount === "number" ? payload.amount : Number(payload.amount);
  const outcome = registerPayment(db, {
    houseId: payload.houseId,
    periodId: payload.periodId,
    amount,
  });

  if (!outcome.ok) {
    const isClientError =
      outcome.reason === "invalid_amount" || outcome.reason === "house_not_found";
    return NextResponse.json(
      { error: outcome.reason, detail: outcome.message },
      { status: isClientError ? 400 : 409 },
    );
  }

  return NextResponse.json({ data: outcome.account }, { status: 200 });
}
