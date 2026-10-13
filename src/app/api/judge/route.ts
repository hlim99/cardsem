import { NextResponse } from "next/server";
import { judgePerks } from "@/lib/ai/judge";
import { aiErrorMessage, kstToday } from "@/lib/ai/server";
import { cardById } from "@/lib/data/cards";
import type { Transaction } from "@/lib/types";

export const runtime = "nodejs";

/* 결제 1건 × 카드의 정성 혜택 → OpenAI 구조화 출력 판단 (OPENAI_API_KEY 필요) */
export async function POST(req: Request) {
  try {
    const { txn, cardId, today } = (await req.json()) as { txn?: Transaction; cardId?: string; today?: string };
    const card = cardById(cardId);
    if (!txn || !card) return NextResponse.json({ error: "txn과 cardId가 필요해요" }, { status: 400 });
    return NextResponse.json(await judgePerks(txn, card, today ?? kstToday()));
  } catch (e) {
    return NextResponse.json({ error: aiErrorMessage(e) }, { status: 502 });
  }
}
