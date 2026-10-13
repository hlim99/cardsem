/* 서버 전용 AI 호출 (OCR·가맹점 분류·인사이트·약관 정규화) — OpenAI Responses API. Route Handler에서만 import.
 * 인증: OPENAI_API_KEY (.env.local). 모델은 OPENAI_MODEL로 바꿀 수 있음. 금액 계산은 절대 LLM에 맡기지 않는다 (기획안 2장) */
import "server-only";
import OpenAI from "openai";
import { z } from "zod";
import { zodTextFormat } from "openai/helpers/zod";
import type { BenefitRule, Industry } from "../types";
import { INDUSTRY } from "../data/merchants";

const MODEL = process.env.OPENAI_MODEL ?? "gpt-5.5";
// 키가 없으면 생성자가 던지므로 호출 시점에 만든다 (빌드 시 페이지 수집에서 죽지 않게)
const client = () => new OpenAI();
/* 구조화 출력 공통 호출 */
export async function parse<T extends z.ZodType>(schema: T, name: string, instructions: string, content: OpenAI.Responses.ResponseInputContent[]): Promise<z.infer<T> | null> {
  const res = await client().responses.parse({ model: MODEL, instructions, input: [{ role: "user", content }], text: { format: zodTextFormat(schema, name) } });
  if (res.incomplete_details?.reason === "content_filter") throw new Error("문서를 읽을 수 없어요");
  return res.output_parsed as z.infer<T> | null;
}
/** 한국 날짜 YYYY-MM-DD. 서버 시계는 UTC라 toISOString만 쓰면 한국 0~9시에 하루 전 날짜가 된다 */
export const kstToday = () => new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10);
const industries = Object.keys(INDUSTRY) as [Industry, ...Industry[]];
const industryList = industries.map((k) => `${k}=${INDUSTRY[k].label}`).join(", ");

/* ── RCP-02~05: 영수증·결제 문자 캡처·카드 명세서 → 거래 목록 구조화 ── */
const TxnItem = z.object({
  merchant: z.string().describe("가맹점명. 지점명 포함"),
  industry: z.enum(industries).nullable().describe("가맹점 업종 (업종 후보 중 하나). 가맹점명·품목으로 판단할 수 없으면 null"),
  date: z.string().nullable().describe("결제일 YYYY-MM-DD. 문자에 연도가 없으면 최근 날짜로 추론하고 inferred에 date"),
  paidAt: z.string().nullable().describe("결제 시각 HH:MM (24시간)"),
  items: z.array(z.object({ name: z.string(), qty: z.number(), price: z.number().describe("단가") })).describe("영수증 품목. 문자·명세서는 빈 배열"),
  total: z.number().describe("결제 금액 (숫자만, 양수)"),
  tax: z.number().nullable(),
  currency: z.enum(["KRW", "USD", "JPY"]),
  payMethodText: z.string().nullable().describe("결제수단 줄의 문구 원문 (카드번호·승인번호 숫자는 뺀 것). 예: '신한카드 Mr.Life 일시불', '삼성카드', '카카오페이'"),
  cardIssuer: z.enum(["신한", "삼성", "현대", "KB국민", "롯데", "우리", "하나", "NH농협", "BC", "IBK기업", "씨티", "카카오뱅크", "토스뱅크", "케이뱅크", "기타"]).nullable().describe("영수증·문자·명세서에 적힌 카드 발급사를 정규화. '카드종류/카드명/발급사/매입사' 줄, 문자 앞머리([신한카드] 등), 명세서 헤더를 보고 판단. 매입사와 발급사가 다르면 발급사. 없으면 null"),
  cardName: z.string().nullable().describe("카드 상품명이 보이면 그대로 (예: Mr.Life, Point Plan, taptap O, ZERO Edition3). 없으면 null"),
  cardNumberPrefix: z.string().nullable().describe("카드번호에서 가려지지 않고 보이는 앞자리 숫자만, 최대 6자리 (예: '5432-****-****-1234' → '5432', '543210******1234' → '543210'). 뒷 4자리·승인번호는 절대 넣지 않음. 없으면 null"),
  approvalNo: z.string().nullable().describe("카드 승인번호 숫자만 ('승인번호'·'승인No' 줄). 환불 영수증에는 원결제와 같은 번호가 찍혀 원결제를 찾는 데 쓴다. 없으면 null"),
  installmentMonths: z.number().nullable().describe("할부 개월. 일시불이면 null"),
  fuelLiters: z.number().nullable().describe("주유 영수증이면 리터"),
  isCancel: z.boolean().describe("취소·환불 건이면 true"),
  lowConfidence: z.array(z.string()).describe("판독이 불확실한 필드명 (merchant, date, paidAt, total …)"),
  inferred: z.array(z.string()).describe("이미지에 없어 문맥으로 추론한 필드명"),
});
export const DocSchema = z.object({
  kind: z.enum(["receipt", "sms", "statement", "unknown"]).describe("receipt=영수증 1장, sms=결제 승인 문자·앱 알림 캡처, statement=카드 명세서·이용내역 목록, unknown=거래 정보 없음"),
  transactions: z.array(TxnItem).describe("이미지에 있는 거래 전부. 영수증은 1건, 문자·명세서는 보이는 건수만큼"),
});
export type ReceiptResult = z.infer<typeof TxnItem>;
export type DocResult = z.infer<typeof DocSchema>;
export type DocMedia = "image/jpeg" | "image/png" | "image/webp" | "image/gif" | "application/pdf";

export async function ocrDocument(data: string, mediaType: DocMedia, filename = "document") {
  const out = await parse(DocSchema, "document_transactions",
    `한국어 결제 문서를 읽어 거래 목록으로 구조화한다. 먼저 종류를 판별한다: 영수증(receipt)이면 거래 1건에 품목까지, 결제 승인 문자·앱 알림 캡처(sms)면 화면에 보이는 승인 건마다 1건, 카드 명세서·이용내역(statement)이면 행마다 1건. 취소·환불 행은 isCancel=true. 결제수단 줄에 카드사·카드명이 있으면 반드시 cardIssuer·cardName에 옮긴다 — 카드번호가 가려져 있어도 카드사명은 읽는다. 합계는 품목 합과 세금 관계로 검산하고, 없는 값은 문맥으로 추론하되 inferred에 필드명을 적는다. 판독이 불확실하면 lowConfidence에 적는다. 카드번호는 보이는 앞자리(최대 6자리)만 cardNumberPrefix에 넣고, 승인번호는 approvalNo에 숫자만 넣는다. 카드번호 뒷자리·계좌번호는 어떤 필드에도 넣지 않는다. 오늘은 ${kstToday()}. 업종 후보: ${industryList}`,
    [mediaType === "application/pdf"
      ? { type: "input_file", filename: `${filename}.pdf`, file_data: `data:application/pdf;base64,${data}` }
      : { type: "input_image", image_url: `data:${mediaType};base64,${data}`, detail: "high" },
    { type: "input_text", text: "이 문서의 거래를 구조화해줘." }]);
  if (!out) throw new Error("구조화 결과를 해석하지 못했어요");
  return out;
}

/* ── TRX-03: 가맹점 분류 (사전에 없을 때 폴백) ── */
const ClassifySchema = z.object({ industry: z.enum(industries), confidence: z.number().describe("0~1") });
// ponytail: 프로세스 메모리 캐시. Supabase merchant_categories 테이블로 옮길 자리
const classifyCache = new Map<string, z.infer<typeof ClassifySchema>>();
export async function classifyMerchantAI(name: string) {
  const key = name.trim().toLowerCase();
  const hit = classifyCache.get(key);
  if (hit) return hit;
  const out = (await parse(ClassifySchema, "merchant_industry", `한국 가맹점명을 카드 혜택 매칭용 업종 하나로 분류한다. 후보: ${industryList}. 모르면 etc.`, [{ type: "input_text", text: name }])) ?? { industry: "etc" as Industry, confidence: 0 };
  classifyCache.set(key, out);
  return out;
}

/* ── RPT-03: 인사이트 (집계값만 전달, 영수증 원문·개인정보 없음) ── */
const InsightSchema = z.object({ text: z.string().describe("2~3문장, 해요체"), actions: z.array(z.string()).describe("짧은 다음 행동 제안, 최대 2개") });
export async function monthlyInsight(aggregates: unknown) {
  return (await parse(InsightSchema, "monthly_insight", "카드 혜택 가계부의 월간 집계값을 보고 사용자에게 2~3문장으로 인사이트를 준다. 말투는 친근한 해요체, 짧게. 금액은 원 단위 정수에 천 단위 콤마. 부정 상황은 비난 대신 다음 행동을 제시한다. 이모지 금지. 집계값에 없는 숫자는 만들지 않는다.", [{ type: "input_text", text: JSON.stringify(aggregates) }])) ?? { text: "이번 달 집계를 요약하지 못했어요.", actions: [] };
}

/* ── DAT-02: 혜택 원문 → 규칙 JSON 정규화 ── */
const RuleDraft = z.object({
  name: z.string().describe("짧은 규칙 이름. 예: 카페 10% 할인"),
  kind: z.enum(["discount", "cashback", "point"]),
  categories: z.array(z.enum(industries)).describe("대상 업종"),
  merchants: z.array(z.string()).describe("대상 가맹점명 (있을 때만)"),
  rate: z.number().nullable().describe("정률이면 0~1 소수"),
  fixedAmount: z.number().nullable().describe("정액 금액"),
  stepPer: z.number().nullable().describe("계단식 단위 금액 (2만원당 → 20000)"),
  stepAmount: z.number().nullable(),
  perLiter: z.number().nullable().describe("리터당 금액"),
  minAmount: z.number().nullable().describe("건당 최소 금액"),
  eligibleAmountCap: z.number().nullable().describe("대상 금액 상한 (1회 승인금액 N원까지)"),
  perTxnCap: z.number().nullable(),
  tiers: z.array(z.object({ min: z.number(), max: z.number().nullable(), monthlyCap: z.number().nullable(), dailyCount: z.number().nullable(), monthlyCount: z.number().nullable(), yearlyCount: z.number().nullable() })).describe("전월 실적 구간별 한도. 실적 조건 없으면 [{min:0,max:null,...}]"),
  daysOfWeek: z.array(z.number()).describe("0=일…6=토. 제한 없으면 빈 배열"),
  holidayExclude: z.boolean(),
  timeFrom: z.string().nullable().describe("HH:MM"),
  timeTo: z.string().nullable(),
  autoPayOnly: z.boolean(),
  excludes: z.array(z.string()).describe("제외 업종 키 또는 '무이자할부'"),
  capGroup: z.string().nullable().describe("통합 한도를 공유하는 규칙끼리 같은 문자열"),
  denyWith: z.array(z.string()).describe("중복 불가한 다른 규칙 name"),
  rawText: z.string().describe("근거가 된 원문 문장 그대로"),
  supported: z.boolean().describe("스키마로 계산 가능하면 true"),
  unsupportedReason: z.string().nullable(),
  confidence: z.number().describe("0~1"),
});
const NormalizeSchema = z.object({ rules: z.array(RuleDraft) });

/** [pageText]는 출처 URL 페이지 본문 — 관리자가 원문도 붙였을 때 함께 근거로 쓴다(원문 우선, 페이지는 원문에 없는 조항만 보충) */
export async function normalizeRules(rawText: string, cardId: string, cardName: string, pageText?: string): Promise<BenefitRule[]> {
  const both = pageText ? " 원문과 출처 페이지 본문이 함께 오면 둘 다 근거다. 같은 조항이 두 곳에 있으면 원문 쪽으로 한 번만 만들고, 원문에 없는 조항은 페이지 본문에서 만든다." : "";
  const input = `카드: ${cardName}\n\n원문:\n${rawText}${pageText ? `\n\n출처 페이지 본문:\n${pageText}` : ""}`;
  const drafts = (await parse(NormalizeSchema, "benefit_rules", `카드사 혜택 약관 원문을 계산 가능한 규칙 목록으로 정규화한다. 문장을 요약하지 말고 조항 하나당 규칙 하나. 실적 구간별 한도가 표로 있으면 tiers에 구간마다 넣는다. 표현할 수 없는 조항은 supported=false로 남기고 이유를 적는다.${both} 업종 키: ${industryList}.`, [{ type: "input_text", text: input }]))?.rules ?? [];
  const idOf = (n: string, i: number) => `${cardId}_ai${i + 1}`;
  return drafts.map((d, i): BenefitRule => ({
    id: idOf(d.name, i), cardId, name: d.name, kind: d.kind,
    target: {
      ...(d.categories.length && { categories: d.categories }), ...(d.merchants.length && { merchants: d.merchants }),
      ...(d.daysOfWeek.length && { daysOfWeek: d.daysOfWeek, holidayPolicy: d.holidayExclude ? "exclude" as const : "include" as const }),
      ...(d.timeFrom && d.timeTo && { timeRange: { from: d.timeFrom, to: d.timeTo } }),
      ...(d.minAmount && { minAmount: d.minAmount }), ...(d.excludes.length && { excludes: d.excludes }), ...(d.autoPayOnly && { autoPayOnly: true }),
    },
    ...(d.rate !== null && { rate: d.rate }), ...(d.fixedAmount !== null && { fixedAmount: d.fixedAmount }),
    ...(d.stepPer && d.stepAmount && { step: { per: d.stepPer, amount: d.stepAmount } }), ...(d.perLiter && { perUnit: { unit: "liter" as const, amount: d.perLiter } }),
    ...(d.eligibleAmountCap && { eligibleAmountCap: d.eligibleAmountCap }), ...(d.perTxnCap && { perTxnCap: d.perTxnCap }),
    limitsByTier: (d.tiers.length ? d.tiers : [{ min: 0, max: null, monthlyCap: null, dailyCount: null, monthlyCount: null, yearlyCount: null }]).map((t) => ({
      tier: { min: t.min, max: t.max }, ...(t.monthlyCap !== null && { monthlyCap: t.monthlyCap }), ...(t.dailyCount !== null && { dailyCount: t.dailyCount }), ...(t.monthlyCount !== null && { monthlyCount: t.monthlyCount }), ...(t.yearlyCount !== null && { yearlyCount: t.yearlyCount }),
    })),
    ...(d.capGroup && { capGroupId: `${cardId}_${d.capGroup}` }),
    ...(d.denyWith.length && { stacking: d.denyWith.map((n) => ({ ruleId: idOf(n, drafts.findIndex((x) => x.name === n)), mode: "deny" as const })) }),
    rawText: d.rawText, supported: d.supported, ...(d.unsupportedReason && { unsupportedReason: d.unsupportedReason }), confidence: d.confidence,
  }));
}

/* URL만으로 카드 등록: 페이지를 읽어 카드명·카드사·혜택 원문을 뽑는다.
 * 서버 fetch로 본문이 나오면 그걸 쓰고, JS로 그리는 카드사 페이지라 본문이 비면 OpenAI web_search로 그 주소를 읽게 한다 */
const PageSchema = z.object({
  name: z.string().describe("카드명 (카드사 이름 제외)"),
  issuer: z.string().describe("카드사 짧은 이름: 신한·KB국민·현대·삼성·롯데·하나·우리·BC·NH농협·IBK기업 중 하나, 없으면 그대로"),
  text: z.string().describe("혜택·유의사항 원문 그대로. 요약 금지"),
});
const htmlText = (h: string) => h.replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
export async function readCardPage(url: string) {
  let page = "";
  try {
    const r = await fetch(url, { headers: { "user-agent": "Mozilla/5.0 (Macintosh) AppleWebKit/537.36 Chrome/130 Safari/537.36", "accept-language": "ko-KR,ko" }, signal: AbortSignal.timeout(15_000) });
    if (r.ok) page = htmlText(await r.text()).slice(0, 60_000);
  } catch { /* web_search로 넘어간다 */ }
  const instructions = "카드 상품 페이지에서 카드명, 카드사, 혜택·유의사항 원문을 뽑는다. 원문은 요약하지 말고 페이지 문장 그대로 옮긴다. 메뉴·광고·다른 카드 소개는 뺀다.";
  // ponytail: 한글 300자 미만이면 JS 렌더링 페이지로 보고 web_search. 그래도 못 읽는 사이트는 원문 붙여넣기로
  const res = (page.match(/[가-힣]/g)?.length ?? 0) >= 300
    ? await client().responses.parse({ model: MODEL, instructions, input: `주소: ${url}\n\n페이지 본문:\n${page}`, text: { format: zodTextFormat(PageSchema, "card_page") } })
    : await client().responses.parse({ model: MODEL, instructions: `${instructions} web_search로 이 주소의 페이지를 직접 열어 읽는다. 다른 사이트 내용으로 채우지 않는다.`, tools: [{ type: "web_search" }], input: `주소: ${url}`, text: { format: zodTextFormat(PageSchema, "card_page") } });
  const out = res.output_parsed;
  if (!out?.text.trim() || !out.name.trim()) throw new Error("페이지에서 카드 혜택을 찾지 못했어요. 원문을 직접 붙여 넣어주세요.");
  return out;
}

/* Route Handler 공통 에러 → 사용자 문구 */
export function aiErrorMessage(e: unknown) {
  if (e instanceof OpenAI.AuthenticationError) return "OpenAI API 키가 올바르지 않아요. .env.local의 OPENAI_API_KEY를 확인하고 서버를 다시 시작해주세요.";
  if (e instanceof Error && /api key|OPENAI_API_KEY/i.test(e.message)) return "OpenAI API 키가 없어요. .env.local에 OPENAI_API_KEY를 넣고 서버를 다시 시작해주세요.";
  if (e instanceof OpenAI.RateLimitError) return "요청이 많아요. 잠시 후 다시 시도해주세요.";
  if (e instanceof OpenAI.APIConnectionError) return "AI 서버에 연결하지 못했어요.";
  if (e instanceof OpenAI.APIError) return `AI 오류 (${e.status}): ${e.message}`;
  return e instanceof Error ? e.message : "알 수 없는 오류";
}
