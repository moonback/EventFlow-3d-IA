import { NextResponse, type NextRequest } from "next/server";
import { resetPasswordSchema } from "@/features/auth/schemas";
import { errorResponse } from "@/server/api/handler";
import { resetPassword } from "@/server/services/auth-service";

export async function POST(req: NextRequest) {
  try {
    const body = resetPasswordSchema.parse(await req.json().catch(() => ({})));
    await resetPassword(body.token, body.password);
    return NextResponse.json({ data: { ok: true } });
  } catch (error) {
    return errorResponse(error);
  }
}
