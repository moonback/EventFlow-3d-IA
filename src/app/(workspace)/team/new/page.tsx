import { PageHeader } from "@/components/feedback/page-header";
import { StaffForm } from "@/features/staff/components/staff-form";
import { can } from "@/server/auth/context";
import { pageContext } from "@/server/auth/page";
import { memberUserOptions } from "@/server/services/settings-service";
import { listSkills } from "@/server/services/staff-service";

export const metadata = { title: "Nouveau collaborateur" };

export default async function NewStaffPage() {
  const ctx = await pageContext("staff:write");
  const [skills, users] = await Promise.all([listSkills(ctx), memberUserOptions(ctx)]);
  return (
    <>
      <PageHeader title="Nouveau collaborateur" breadcrumbs={[{ label: "Équipe", href: "/team" }, { label: "Nouveau" }]} />
      <StaffForm skills={skills} users={users} canCosts={can(ctx, "staff:costs")} />
    </>
  );
}
