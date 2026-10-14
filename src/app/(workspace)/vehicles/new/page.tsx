import { PageHeader } from "@/components/feedback/page-header";
import { VehicleForm } from "@/features/vehicles/components/vehicle-form";
import { pageContext } from "@/server/auth/page";

export const metadata = { title: "Nouveau véhicule" };

export default async function NewVehiclePage() {
  await pageContext("vehicles:write");
  return (
    <>
      <PageHeader title="Nouveau véhicule" breadcrumbs={[{ label: "Véhicules", href: "/vehicles" }, { label: "Nouveau" }]} />
      <VehicleForm />
    </>
  );
}
