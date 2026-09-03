import type { FeatureManifest } from "@/features/types";
import { registrarPagosDeTarifa } from "@/features/registrar-pagos-de-tarifa/manifest";

export const features: FeatureManifest[] = [
  registrarPagosDeTarifa,
];
