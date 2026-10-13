import { NextResponse } from "next/server";
import { aiErrorMessage, classifyMerchantAI } from "@/lib/ai/server";
import { classifyMerchant } from "@/lib/data/merchants";

export const runtime = "nodejs";

/* TRX-03: 사전 먼저, 없으면 LLM. 결과는 서버 캐시 */
export async function POST(req: Request) {
  const { merchant } = (await req.json()) as { merchant?: string };
  if (!merchant || merchant.trim().length < 2) return NextResponse.json({ error: "가맹점명이 필요해요" }, { status: 400 });
  const dict = classifyMerchant(merchant);
  if (dict) return NextResponse.json({ industry: dict, confidence: 1, source: "dict" });
  try {
    const r = await classifyMerchantAI(merchant);
    return NextResponse.json({ ...r, source: "llm" });
  } catch (e) {
    return NextResponse.json({ error: aiErrorMessage(e) }, { status: 502 });
  }
}
