import { NextResponse, type NextRequest } from "next/server";
import { publicQuoteRequestSchema } from "@/features/opportunities/schemas";
import { assertSameOrigin, errorResponse } from "@/server/api/handler";
import { submitPublicQuoteRequest } from "@/server/services/opportunity-service";

/** Demande de devis publique : aucune session, protégée par limitation de débit et piège à robots. */
export async function POST(req: NextRequest, context: { params: Promise<{ slug: string }> }) {
  try {
    assertSameOrigin(req);
    const { slug } = await context.params;
    const body = publicQuoteRequestSchema.parse(await req.json().catch(() => ({})));
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
    const result = await submitPublicQuoteRequest(slug, body, ip);
    const res = NextResponse.json({ data: result });
    res.headers.set("Cache-Control", "no-store");
    return res;
  } catch (error) {
    return errorResponse(error);
  }
}
