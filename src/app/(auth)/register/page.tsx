import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ROLE_VALUES } from "@/features/auth/schemas";
import { roleLabels } from "@/lib/labels";
import { getAuthContext } from "@/server/auth/session";
import { RegisterForm } from "./register-form";

export const metadata: Metadata = { title: "Créer un compte" };

export default async function RegisterPage() {
  if (await getAuthContext()) redirect("/dashboard");
  const roles = ROLE_VALUES.map((value) => ({ value, label: roleLabels[value] }));
  return <RegisterForm roles={roles} />;
}
