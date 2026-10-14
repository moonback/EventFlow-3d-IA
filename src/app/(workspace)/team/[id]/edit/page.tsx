import { PageHeader } from "@/components/feedback/page-header";
import { StaffForm } from "@/features/staff/components/staff-form";
import { can } from "@/server/auth/context";
import { loadOr404, pageContext } from "@/server/auth/page";
import { memberUserOptions } from "@/server/services/settings-service";
import { getStaffMember, listSkills } from "@/server/services/staff-service";

export const metadata = { title: "Modifier le collaborateur" };

export default async function EditStaffPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await pageContext("staff:write");
  const { id } = await params;
  const [s, skills, users] = await Promise.all([loadOr404(() => getStaffMember(ctx, id)), listSkills(ctx), memberUserOptions(ctx)]);
  return (
    <>
      <PageHeader title={`Modifier ${s.firstName} ${s.lastName}`} breadcrumbs={[{ label: "Équipe", href: "/team" }, { label: `${s.firstName} ${s.lastName}`, href: `/team/${id}` }, { label: "Modifier" }]} />
      <StaffForm
        staffId={id}
        skills={skills}
        users={users}
        canCosts={can(ctx, "staff:costs")}
        initial={{
          firstName: s.firstName, lastName: s.lastName, email: s.email ?? "", phone: s.phone ?? "", jobTitle: s.jobTitle ?? "", employmentType: s.employmentType,
          hourlyCost: s.hourlyCost ?? "", dailyCost: s.dailyCost ?? "", drivingLicenses: s.drivingLicenses ?? "", isActive: s.isActive, userId: s.userId ?? "", notes: s.notes ?? "",
          skillIds: s.skills.map((k) => k.skill.id),
        }}
      />
    </>
  );
}
