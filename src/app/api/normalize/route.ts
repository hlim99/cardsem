import { NextResponse } from "next/server";
import { aiErrorMessage, normalizeRules, readCardPage } from "@/lib/ai/server";
import { SUPABASE_READY, supabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const maxDuration = 120;

/* DAT-02: 원문 → BenefitRule[]. 원문이 비고 sourceUrl만 오면 그 페이지를 읽어 page{name,issuer,text}도 함께 돌려준다.
 * 로그인 모드에서는 관리자(app_metadata.role = 'admin')만 — 서버 키로 LLM을 돌리니 아무나 부르지 못하게 (M66). 데모 모드는 열어 둔다 */
export async function POST(req: Request) {
  try {
    if (SUPABASE_READY) {
      const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
      const user = token ? (await supabase().auth.getUser(token)).data.user : null;
      if (user?.app_metadata?.role !== "admin") return NextResponse.json({ error: "관리자만 쓸 수 있어요" }, { status: 403 });
    }
    const { rawText, cardId, cardName, sourceUrl } = (await req.json()) as { rawText?: string; cardId?: string; cardName?: string; sourceUrl?: string };
    const u = URL.canParse(sourceUrl ?? "") ? new URL(sourceUrl!) : null;
    // 관리자 전용이지만 서버가 대신 여는 주소라 내부망은 막는다
    const safe = !!u && /^https?:$/.test(u.protocol) && !/^(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|\[|0\.)/.test(u.hostname);
    // 원문 없이 URL만 오면 페이지를 읽어 카드명·카드사·원문까지 채운다
    if (!rawText?.trim()) {
      if (!safe) return NextResponse.json({ error: "원문이나 카드사 페이지 주소(https://)를 넣어주세요" }, { status: 400 });
      const page = await readCardPage(u!.href);
      const rules = await normalizeRules(page.text, cardId || "custom", cardName || page.name);
      return NextResponse.json({ rules, page });
    }
    // ★원문 + URL을 같이 넣으면 둘 다 근거로 쓴다(전엔 원문이 있으면 URL을 열지도 않았다).
    // 페이지를 못 읽어도 막지 않는다 — 원문만으로 만들고 sourceRead=false로 알린다
    const page = safe ? await readCardPage(u!.href).catch(() => null) : null;
    const rules = await normalizeRules(rawText, cardId || "custom", cardName || "카드", page?.text);
    return NextResponse.json({ rules, sourceRead: !!page });
  } catch (e) {
    return NextResponse.json({ error: aiErrorMessage(e) }, { status: 502 });
  }
}
