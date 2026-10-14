import { NextResponse, type NextRequest } from "next/server";
import { acceptInvitationSchema } from "@/features/auth/schemas";
import { errorResponse } from "@/server/api/handler";
import { createSession, setSessionCookie } from "@/server/auth/session";
import { acceptInvitation } from "@/server/services/auth-service";

export async function POST(req: NextRequest) {
  try {
    const body = acceptInvitationSchema.parse(await req.json().catch(() => ({})));
    const { userId, organizationId } = await acceptInvitation(body.token, body.name, body.password);
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
    const { token, expiresAt } = await createSession({ userId, organizationId, ipAddress: ip, userAgent: req.headers.get("user-agent") });
    await setSessionCookie(token, expiresAt);
    return NextResponse.json({ data: { ok: true } });
  } catch (error) {
    return errorResponse(error);
  }
}
