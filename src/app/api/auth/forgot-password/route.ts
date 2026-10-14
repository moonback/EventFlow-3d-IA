import { NextResponse, type NextRequest } from "next/server";
import { forgotPasswordSchema } from "@/features/auth/schemas";
import { db } from "@/lib/db";
import { RateLimitError } from "@/lib/errors";
import { errorResponse } from "@/server/api/handler";
import { requestPasswordReset } from "@/server/services/auth-service";

export async function POST(req: NextRequest) {
  try {
    const { email } = forgotPasswordSchema.parse(await req.json().catch(() => ({})));
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
    // Limitation des demandes (réutilise le journal des tentatives)
    const recent = await db.loginAttempt.count({ where: { email: `reset:${email}`, createdAt: { gte: new Date(Date.now() - 15 * 60_000) } } });
    if (recent >= 3) throw new RateLimitError();
    await db.loginAttempt.create({ data: { email: `reset:${email}`, ipAddress: ip, success: true } });
    await requestPasswordReset(email);
    // Réponse identique que le compte existe ou non
    return NextResponse.json({ data: { ok: true } });
  } catch (error) {
    return errorResponse(error);
  }
}
