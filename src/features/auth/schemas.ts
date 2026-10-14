import { z } from "zod";
import { Role } from "@prisma/client";

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Adresse e-mail invalide").max(200),
  password: z.string().min(1, "Mot de passe requis").max(200),
});

export const passwordSchema = z
  .string()
  .min(10, "10 caractères minimum")
  .max(200)
  .regex(/[a-z]/, "Au moins une minuscule")
  .regex(/[A-Z]/, "Au moins une majuscule")
  .regex(/[0-9]/, "Au moins un chiffre");

/** Rôles sélectionnables à l'inscription (tous les rôles de l'énumération Prisma). */
export const ROLE_VALUES = Object.values(Role) as [Role, ...Role[]];

export const registerSchema = z
  .object({
    name: z.string().trim().min(2, "Nom trop court").max(120),
    email: z.string().trim().toLowerCase().email("Adresse e-mail invalide").max(200),
    organizationName: z.string().trim().min(2, "Nom de l'organisation trop court").max(160),
    role: z.enum(ROLE_VALUES),
    password: passwordSchema,
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { message: "Les mots de passe ne correspondent pas", path: ["confirm"] });

export const forgotPasswordSchema = z.object({
  email: z.string().trim().toLowerCase().email("Adresse e-mail invalide").max(200),
});

export const resetPasswordSchema = z
  .object({
    token: z.string().min(20).max(200),
    password: passwordSchema,
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { message: "Les mots de passe ne correspondent pas", path: ["confirm"] });

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1).max(200),
    password: passwordSchema,
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { message: "Les mots de passe ne correspondent pas", path: ["confirm"] });

export const acceptInvitationSchema = z
  .object({
    token: z.string().min(20).max(200),
    name: z.string().trim().min(2).max(120),
    password: passwordSchema,
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { message: "Les mots de passe ne correspondent pas", path: ["confirm"] });

export const switchOrganizationSchema = z.object({ organizationId: z.string().min(1).max(50) });
