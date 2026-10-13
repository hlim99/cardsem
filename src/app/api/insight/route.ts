import { NextResponse } from "next/server";
import { aiErrorMessage, monthlyInsight } from "@/lib/ai/server";

export const runtime = "nodejs";

/* RPT-03: 집계값만 받아 자연어 요약 */
export async function POST(req: Request) {
  try {
    const aggregates = await req.json();
    return NextResponse.json(await monthlyInsight(aggregates));
  } catch (e) {
    return NextResponse.json({ error: aiErrorMessage(e) }, { status: 502 });
  }
}
