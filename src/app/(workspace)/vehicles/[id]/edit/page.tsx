import { PageHeader } from "@/components/feedback/page-header";
import { VehicleForm } from "@/features/vehicles/components/vehicle-form";
import { loadOr404, pageContext } from "@/server/auth/page";
import { getVehicle } from "@/server/services/vehicle-service";

export const metadata = { title: "Modifier le véhicule" };

export default async function EditVehiclePage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await pageContext("vehicles:write");
  const { id } = await params;
  const v = await loadOr404(() => getVehicle(ctx, id));
  const d = (s: string | null) => (s ? s.slice(0, 10) : "");
  return (
    <>
      <PageHeader title={`Modifier ${v.registration}`} breadcrumbs={[{ label: "Véhicules", href: "/vehicles" }, { label: v.registration, href: `/vehicles/${id}` }, { label: "Modifier" }]} />
      <VehicleForm
        vehicleId={id}
        initial={{
          registration: v.registration, brand: v.brand, model: v.model, type: v.type, status: v.status, payloadKg: v.payloadKg ?? "", volumeM3: v.volumeM3 ?? "", mileageKm: v.mileageKm,
          requiredLicense: v.requiredLicense ?? "", insuranceExpiresAt: d(v.insuranceExpiresAt), inspectionDueAt: d(v.inspectionDueAt), nextServiceAt: d(v.nextServiceAt), nextServiceKm: v.nextServiceKm ?? "",
          dailyCost: v.dailyCost ?? "", costPerKm: v.costPerKm ?? "", notes: v.notes ?? "",
        }}
      />
    </>
  );
}
