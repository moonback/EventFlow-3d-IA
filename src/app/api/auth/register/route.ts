import { NextResponse, type NextRequest } from "next/server";
import { registerSchema } from "@/features/auth/schemas";
import { assertSameOrigin, errorResponse } from "@/server/api/handler";
import { createSession, setSessionCookie } from "@/server/auth/session";
import { registerUser } from "@/server/services/auth-service";

export async function POST(req: NextRequest) {
  try {
    assertSameOrigin(req);
    const body = registerSchema.parse(await req.json().catch(() => ({})));
    const { userId, organizationId } = await registerUser({
      name: body.name,
      email: body.email,
      organizationName: body.organizationName,
      role: body.role,
      password: body.password,
    });
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
    const { token, expiresAt } = await createSession({ userId, organizationId, ipAddress: ip, userAgent: req.headers.get("user-agent") });
    await setSessionCookie(token, expiresAt);
    return NextResponse.json({ data: { ok: true } });
  } catch (error) {
    return errorResponse(error);
  }
}
