import { db } from "@/db";
import { listBillingPeriods, listHouses } from "@/features/registrar-pagos-de-tarifa/data";
import { RegistrarPagosView } from "@/features/registrar-pagos-de-tarifa/components/registrar-pagos-view";

export const dynamic = "force-dynamic";

export default function RegistrarPagosPage() {
  const houses = listHouses(db);
  const periods = listBillingPeriods(db);

  return (
    <RegistrarPagosView
      houses={houses}
      periods={periods}
    />
  );
}
