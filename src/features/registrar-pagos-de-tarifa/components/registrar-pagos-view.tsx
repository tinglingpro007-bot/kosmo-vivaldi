"use client";

import { useEffect, useMemo, useState } from "react";
import { Wallet } from "lucide-react";

import { Alert } from "@/components/ui/alert";
import { BadgeStatus } from "@/components/ui/badge-status";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { Stat } from "@/components/ui/stat";
import { Steps } from "@/components/ui/steps";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  canConfirm,
  formatMoney,
  parseAmount,
  SELECTION_HINTS,
  type BillingPeriodOption,
  type HouseAccount,
  type HouseOption,
} from "../logic";

export interface RegistrarPagosViewProps {
  houses: HouseOption[];
  periods: BillingPeriodOption[];
}

type Feedback = { variant: "success" | "danger"; title?: string; message: string };

const stepItems = [
  { id: 1, title: "Seleccionar vivienda y periodo", description: "Elige a quién y qué periodo cobrar" },
  { id: 2, title: "Registrar el monto", description: "Confirma el pago de la tarifa" },
  { id: 3, title: "Saldo actualizado", description: "Revisa el estado de la vivienda" },
];

export function RegistrarPagosView({ houses, periods }: RegistrarPagosViewProps) {
  const [houseId, setHouseId] = useState("");
  const [periodId, setPeriodId] = useState("");
  const [amount, setAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [loadingAccount, setLoadingAccount] = useState(false);
  const [account, setAccount] = useState<HouseAccount | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  const house = useMemo(() => houses.find((h) => h.id === houseId) ?? null, [houses, houseId]);
  const period = useMemo(() => periods.find((p) => p.id === periodId) ?? null, [periods, periodId]);

  const currentStep = !house || !period ? 1 : account?.rows.some((r) => r.periodId === periodId) ? 3 : 2;

  const hasPaymentForPeriod = Boolean(account?.rows.some((r) => r.periodId === periodId));
  const parsedAmount = parseAmount(amount);
  const confirmEnabled = canConfirm(houseId, periodId) && parsedAmount !== null && !submitting;

  useEffect(() => {
    if (!houseId) {
      setAccount(null);
      return;
    }
    let cancelled = false;
    setLoadingAccount(true);
    fetch(`/api/registrar-pagos-de-tarifa?houseId=${encodeURIComponent(houseId)}`)
      .then((res) => res.json())
      .then((body) => {
        if (!cancelled) setAccount(body.data ?? null);
      })
      .catch(() => {
        if (!cancelled) {
          setFeedback({ variant: "danger", message: "No se pudo consultar el historial de la vivienda. Intente nuevamente." });
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingAccount(false);
      });
    return () => {
      cancelled = true;
    };
  }, [houseId]);

  async function handleConfirm() {
    if (!house || !period || parsedAmount === null) return;

    setSubmitting(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/registrar-pagos-de-tarifa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ houseId: house.id, periodId: period.id, amount: parsedAmount }),
      });
      const body = await res.json();
      if (res.ok && body.data) {
        const updated: HouseAccount = body.data;
        setAccount(updated);
        setFeedback({
          variant: "success",
          title: "Pago registrado",
          message:
            updated.credit > 0
              ? `Pago de ${formatMoney(parsedAmount)} registrado. El excedente de ${formatMoney(updated.rows.find((r) => r.periodId === period.id)?.excess ?? 0)} quedó como saldo a favor de la vivienda.`
              : `Pago de ${formatMoney(parsedAmount)} registrado para el periodo "${period.name}". El saldo de la vivienda quedó al día.`,
        });
      } else {
        const detail =
          typeof body.detail === "string" && body.detail
            ? body.detail
            : "No se pudo registrar el pago. Intente nuevamente.";
        setFeedback({ variant: "danger", title: "No se registró el pago", message: detail });
      }
    } catch {
      setFeedback({ variant: "danger", message: "Error de conexión. No se pudo registrar el pago." });
    } finally {
      setSubmitting(false);
    }
  }

  function handleHouseChange(nextHouseId: string) {
    setHouseId(nextHouseId);
    setAccount(null);
    setFeedback(null);
  }

  function handlePeriodChange(nextPeriodId: string) {
    setPeriodId(nextPeriodId);
    setFeedback(null);
  }

  const missingSelectionHint = !house
    ? SELECTION_HINTS.noHouse
    : !period
      ? SELECTION_HINTS.noPeriod
      : null;

  return (
    <div className="d-flex flex-column gap-4">
      <PageHeader
        title="Registrar pago de tarifa"
        description="Asocia el pago mensual de agua a una vivienda y a su periodo de cobro. Al confirmar, el saldo se actualiza de inmediato."
      />

      <Card className="mb-1">
        <CardBody>
          <Steps steps={stepItems} currentStep={currentStep} />
        </CardBody>
      </Card>

      {feedback ? (
        <Alert variant={feedback.variant} title={feedback.title} onClose={() => setFeedback(null)}>
          {feedback.message}
        </Alert>
      ) : null}

      <div className="row g-4">
        <div className="col-lg-7 d-flex flex-column gap-4">
          <Card>
            <CardHeader>
              <CardTitle>1. Vivienda y periodo de cobro</CardTitle>
            </CardHeader>
            <CardBody>
              <div className="row g-3">
                <div className="col-12 col-md-6">
                  <Label htmlFor="house-select">Vivienda del padrón</Label>
                  <Select id="house-select" value={houseId} onChange={(e) => handleHouseChange(e.target.value)}>
                    <option value="">Seleccionar vivienda…</option>
                    {houses.map((h) => (
                      <option key={h.id} value={h.id}>
                        {h.code} · {h.name} — {formatMoney(h.fee)}/mes
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="col-12 col-md-6">
                  <Label htmlFor="period-select">Periodo de cobro</Label>
                  <Select
                    id="period-select"
                    value={periodId}
                    disabled={!house}
                    onChange={(e) => handlePeriodChange(e.target.value)}
                  >
                    <option value="">Seleccionar periodo…</option>
                    {periods.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} {p.isOpen ? "(vigente)" : "(cerrado)"}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>

              {missingSelectionHint ? (
                <Alert variant="info" className="mt-3 mb-0">
                  {missingSelectionHint}
                </Alert>
              ) : null}

              {house && period ? (
                <div className="d-flex flex-wrap align-items-center gap-2 mt-3">
                  <span className="small text-secondary">
                    Estado del pago de <strong>{period.name}</strong>:
                  </span>
                  {hasPaymentForPeriod ? (
                    <BadgeStatus status="completed" label="Pagado" />
                  ) : (
                    <BadgeStatus status="pending" label="Pendiente de pago" />
                  )}
                  {!period.isOpen ? (
                    <BadgeStatus status="inactive" label="Periodo cerrado" />
                  ) : null}
                </div>
              ) : null}
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>2. Importe del pago</CardTitle>
            </CardHeader>
            <CardBody>
              {!house ? (
                <EmptyState
                  icon={Wallet}
                  title="Seleccione una vivienda"
                  description="Elija una vivienda del padrón para registrar el pago de su tarifa mensual."
                />
              ) : (
                <div className="d-flex flex-column gap-3">
                  <Alert variant="info" className="mb-0">
                    La tarifa mensual de <strong>{house.name}</strong> es de{" "}
                    <strong>{formatMoney(house.fee)}</strong>. El pago debe ser igual o superior a este monto; el
                    excedente se aplica como saldo a favor de la vivienda.
                  </Alert>
                  <div className="row g-3">
                    <div className="col-12 col-md-6">
                      <Label htmlFor="amount-input">Monto a registrar (USD)</Label>
                      <Input
                        id="amount-input"
                        type="number"
                        inputMode="decimal"
                        min="0"
                        step="0.01"
                        value={amount}
                        placeholder="0.00"
                        disabled={!house}
                        onChange={(e) => setAmount(e.target.value)}
                      />
                    </div>
                    <div className="col-12 col-md-6 d-flex align-items-end">
                      <Button
                        className="w-100"
                        disabled={!confirmEnabled}
                        onClick={handleConfirm}
                      >
                        {submitting ? "Registrando…" : "Confirmar pago"}
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </CardBody>
          </Card>
        </div>

        <div className="col-lg-5">
          <Card className="h-100">
            <CardHeader>
              <CardTitle>Estado de la vivienda</CardTitle>
            </CardHeader>
            <CardBody className="d-flex flex-column gap-3">
              {!house ? (
                <EmptyState
                  icon={Wallet}
                  title="Sin vivienda seleccionada"
                  description="El detalle de tarifa, saldo e historial aparecerá aquí al elegir una vivienda."
                />
              ) : (
                <>
                  <div className="row g-3 row-cols-1 row-cols-sm-2">
                    <div className="col">
                      <Stat title="Tarifa mensual" value={formatMoney(house.fee)} />
                    </div>
                    <div className="col">
                      <Stat
                        title="Saldo a favor"
                        value={formatMoney(account?.credit ?? 0)}
                        description="Excedentes acumulados por la vivienda"
                      />
                    </div>
                  </div>
                  <div className="d-flex flex-column gap-2 border rounded p-3">
                    <span className="text-secondary small fw-semibold text-uppercase">Vivienda</span>
                    <div className="d-flex align-items-center justify-content-between">
                      <span className="fw-semibold">{house.name}</span>
                      <span className="text-secondary small">{house.code}</span>
                    </div>
                    {loadingAccount ? (
                      <span className="text-muted small">Consultando historial…</span>
                    ) : period ? (
                      <div className="d-flex align-items-center gap-2">
                        <BadgeStatus
                          status={hasPaymentForPeriod ? "completed" : "pending"}
                          label={hasPaymentForPeriod ? "Periodo al día" : "Pendiente"}
                        />
                        <span className="small text-muted">{period.name}</span>
                      </div>
                    ) : null}
                  </div>
                </>
              )}
            </CardBody>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Historial de pagos de la vivienda</CardTitle>
        </CardHeader>
        <CardBody>
          {!house ? (
            <EmptyState
              icon={Wallet}
              title="Historial vacío"
              description="Los pagos registrados de la vivienda seleccionada se mostrarán en esta tabla."
            />
          ) : !account || account.rows.length === 0 ? (
            <EmptyState
              icon={Wallet}
              title="Aún no hay pagos registrados"
              description={`${house.name} no tiene pagos registrados. Confirma el primer pago para verlo aquí.`}
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Periodo</TableHead>
                  <TableHead className="text-end">Monto pagado</TableHead>
                  <TableHead className="text-end">Tarifa del periodo</TableHead>
                  <TableHead className="text-end">Saldo a favor generado</TableHead>
                  <TableHead>Fecha de pago</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {account.rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      <span className="fw-semibold">{row.periodName}</span>
                    </TableCell>
                    <TableCell className="text-end">{formatMoney(row.amount)}</TableCell>
                    <TableCell className="text-end text-secondary">{formatMoney(row.fee)}</TableCell>
                    <TableCell className="text-end">
                      {row.excess > 0 ? (
                        <span className="text-success fw-semibold">{formatMoney(row.excess)}</span>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className="text-secondary small">
                        {new Date(row.paidAt).toLocaleDateString("es-ES", {
                          day: "2-digit",
                          month: "long",
                          year: "numeric",
                        })}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
