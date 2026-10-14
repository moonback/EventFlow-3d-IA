import { NextResponse } from "next/server";
import { errorResponse } from "@/server/api/handler";
import { clearSessionCookie, getAuthContext, revokeSession } from "@/server/auth/session";

export async function POST() {
  try {
    const ctx = await getAuthContext();
    if (ctx?.sessionId) await revokeSession(ctx.sessionId);
    await clearSessionCookie();
    return NextResponse.json({ data: { ok: true } });
  } catch (error) {
    return errorResponse(error);
  }
}
