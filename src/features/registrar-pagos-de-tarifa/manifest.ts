import { BanknoteCheck } from "lucide-react";
import type { FeatureManifest } from "@/features/types";

export const registrarPagosDeTarifa: FeatureManifest = {
  slug: "registrar-pagos-de-tarifa",
  title: "Registrar pagos de tarifa",
  description:
    "Registra la tarifa mensual de agua de una vivienda contra un periodo de cobro vigente y actualiza su saldo al instante.",
  route: "/registrar-pagos-de-tarifa",
  icon: BanknoteCheck,
};
