/* 영수증·문자·명세서에서 읽은 값을 보유 카드·기존 거래에 맞춰 보는 함수들 (TRX-02·TRX-11). 화면 없이 테스트한다 */
import { cardById } from "./cards";
import { effectiveAmount, krw } from "../engine";
import type { PayMethod, Transaction, UserCard } from "../types";

const ISSUER_ALIAS: Record<string, string[]> = {
  신한카드: ["신한", "shinhan"], 삼성카드: ["삼성", "samsung"], 현대카드: ["현대", "hyundai"], 롯데카드: ["롯데", "lotte"], 우리카드: ["우리", "woori"],
  KB국민카드: ["kb", "국민", "kookmin"], 하나카드: ["하나", "hana"], NH농협카드: ["nh", "농협", "nonghyup"], BC카드: ["bc", "비씨"],
};
const norm = (s: string) => s.toLowerCase().replace(/[\s.\-_·]/g, "");
/* 매입(승인 대행)사. 같은 물리 카드인데 결제 영수증엔 발급사('우리카드'), 환불·재결제 영수증엔
 * 매입사('비씨카드')가 찍히는 일이 있다. 카드사명이 다르다고 다른 카드로 보면 안 되므로 카드번호로 가린다 */
const ACQUIRER_ALIAS = ["bc", "비씨"];
/* 카드사와 상관없는 간편결제 브랜드. '삼성페이 신한카드'의 '삼성'을 삼성카드로 읽지 않게 카드사 판별 전에 지운다 */
const PAY_BRAND = /(삼성|samsung|카카오|kakao|네이버|naver|페이코|payco|토스|toss|애플|apple|ssg|스마일|smile)\s*(페이|pay)/gi;
const aliases = (cardId: string) => { const issuer = cardById(cardId)?.issuer ?? ""; return ISSUER_ALIAS[issuer] ?? [issuer.replace(/카드$/, "")].filter(Boolean); };

/** candidates: 화면의 후보 순서 (추천 → 카드사 일치 → 나머지 보유 카드) */
/** byBin: 카드번호 앞자리가 등록 카드 여러 장과 맞아서 issuer_ambiguous가 된 경우 (카드사 추론이 아님) */
export type CardMatch = { cardId?: string; level: "bin" | "card" | "issuer" | "issuer_ambiguous" | "acquirer" | "unknown" | "none"; prefix?: string; byBin?: boolean; candidates: string[] };
type CardDoc = { cardIssuer?: string | null; cardName?: string | null; payMethodText?: string | null; cardNumberPrefix?: string | null };

/* 1순위: 영수증의 카드번호 앞자리(4~6)가 등록된 BIN 한 장과만 맞으면 확정 (자릿수가 달라도 짧은 쪽이 긴 쪽의 앞이면 맞음).
 * 여러 장과 맞으면 확정하지 않고 그 카드들을 후보 맨 앞에 둔다. 2순위: 카드사·카드명으로 추론.
 * 카드사는 모델이 정규화한 cardIssuer를 믿고, 없을 때만 결제수단 문구(간편결제 브랜드를 뺀 것)에서 찾는다 */
export function matchCard(userCards: UserCard[], doc: CardDoc): CardMatch {
  const prefix = (doc.cardNumberPrefix ?? "").replace(/\D/g, "").slice(0, 6) || undefined;
  const order = (first?: string, issuer: UserCard[] = []) => [...new Set([first, ...issuer.map((u) => u.cardId), ...userCards.map((u) => u.cardId)])].filter((x): x is string => !!x);
  if (prefix && prefix.length >= 4) {
    const hits = userCards.filter((u) => u.bin && (u.bin.startsWith(prefix) || prefix.startsWith(u.bin)));
    if (hits.length === 1) return { cardId: hits[0].cardId, level: "bin", prefix, candidates: order(hits[0].cardId) };
    // ponytail: 여러 장이면 첫 장을 추천만 한다. 카드명으로 좁히는 건 실제로 헷갈리는 사례가 나오면
    if (hits.length > 1) return { cardId: hits[0].cardId, level: "issuer_ambiguous", prefix, byBin: true, candidates: order(hits[0].cardId, hits) };
  }
  // '신한은행 계좌이체'·'현금'처럼 카드가 아닌 결제면 은행 이름이 카드사와 겹쳐도 카드를 고르지 않는다 (C26)
  if (payTypeHint(doc.payMethodText) && !/카드|card/i.test(doc.payMethodText ?? "")) return { level: "none", prefix, candidates: order() };
  const issuerHint = doc.cardIssuer && doc.cardIssuer !== "기타" ? norm(doc.cardIssuer) : norm((doc.payMethodText ?? "").replace(PAY_BRAND, ""));
  const nameHint = [doc.cardName, doc.payMethodText].filter(Boolean).map((s) => norm(s as string)).join(" ");
  if (!issuerHint && !nameHint) return { level: "none", prefix, candidates: order() };
  const byIssuer = issuerHint ? userCards.filter((u) => aliases(u.cardId).some((a) => issuerHint.includes(norm(a)))) : [];
  const byName = byIssuer.length ? byIssuer : userCards; // 카드사 못 읽어도 카드명으로 시도
  const named = byName.find((u) => { const n = cardById(u.cardId)?.name; return !!n && nameHint.includes(norm(n.replace(/\(.*?\)/g, ""))); });
  if (named) return { cardId: named.cardId, level: "card", prefix, candidates: order(named.cardId, byIssuer) };
  if (byIssuer.length) return { cardId: byIssuer[0].cardId, level: byIssuer.length > 1 ? "issuer_ambiguous" : "issuer", prefix, candidates: order(byIssuer[0].cardId, byIssuer) };
  // 매입사만 찍힌 영수증(비씨카드 등): 그 발급사 카드를 안 가졌다면 '없는 카드'가 아니라 발급사를 모르는 것이다
  if (issuerHint && ACQUIRER_ALIAS.some((a) => issuerHint.includes(a))) return { level: "acquirer", prefix, candidates: order() };
  return { level: "unknown", prefix, candidates: order() };
}

/* 결제수단 문구가 현금·계좌이체를 말하면 그 결제 방식 (카드를 미리 고르지 않기 위해) */
export const payTypeHint = (text?: string | null): "cash" | "transfer" | undefined => !text ? undefined : /현금/.test(text) ? "cash" : /계좌|이체/.test(text) ? "transfer" : undefined;

/* 결제수단 문구 → 간편결제 수단 (Point Plan의 'SOL페이 결제 시' 같은 조건에 쓰임). 모르면 비워 둔다 */
export function payMethodOf(text?: string | null): PayMethod | undefined {
  if (!text) return undefined;
  if (/삼성\s*페이|samsung\s*pay/i.test(text)) return "samsung_pay";
  if (/네이버\s*페이|naver\s*pay/i.test(text)) return "naver_pay";
  if (/카카오\s*페이|kakao\s*pay/i.test(text)) return "kakao_pay";
  if (/sol\s*(페이|pay)|kb\s*pay|페이북|paybook|(현대|롯데|하나|우리|nh|신한|shinhan|hyundai|lotte|hana|woori)\s*(페이|pay)/i.test(text)) return "issuer_pay";
  return undefined;
}

/* 화면 문구. BIN이 맞으면 확정, 아니면 AI 추론임을 밝힌다 */
export function matchNote(m: CardMatch, doc: CardDoc) {
  const seen = [doc.cardIssuer && doc.cardIssuer !== "기타" && `${doc.cardIssuer}카드`, doc.cardName].filter(Boolean).join(" ") || (doc.payMethodText ?? "");
  if (m.level === "bin") return `영수증 카드번호 앞자리 ${m.prefix}가 등록한 카드와 일치해요`;
  if (m.byBin) return `카드번호 앞자리 ${m.prefix}와 맞는 등록 카드가 여러 장이라 확인해주세요`;
  const why = m.prefix ? `앞자리 ${m.prefix}와 맞는 등록 카드가 없어 ` : "";
  if (m.level === "card") return `${why}AI 추론 · 영수증의 ${seen}와 일치`;
  if (m.level === "issuer") return `${why}AI 추론 · 영수증의 ${seen}와 카드사 일치`;
  if (m.level === "issuer_ambiguous") return `${why}AI 추론 · ${(cardById(m.cardId)?.issuer ?? seen).replace(/카드$/, "")} 카드가 여러 장이라 확인해주세요`;
  if (m.level === "acquirer") return `${seen}는 승인을 대행한 매입사일 수 있어요. 실제로 결제한 카드를 골라주세요${m.prefix ? ` (앞자리 ${m.prefix})` : ""}`;
  const pay = payTypeHint(doc.payMethodText);
  if (pay) return pay === "cash" ? "현금 결제로 읽었어요" : "계좌이체로 읽었어요";
  if (m.level === "unknown") return seen ? `'${seen}'는 보유 카드에 없어요. 카드로 결제했다면 골라주세요` : "결제수단을 확인해주세요";
  return "영수증에 카드 정보가 없어요. 카드로 결제했다면 골라주세요";
}

/* ── 기존 거래와 맞춰 보기 ── */
const DAY = 86_400_000;
const mkey = (s: string) => norm(s.replace(/\(주\)|㈜|주식회사/g, ""));
/** 가맹점 이름이 비슷한가: 한쪽이 다른 쪽을 포함하거나 앞 3글자 이상이 같다 ('스타벅스코리아' ~ '스타벅스 강남점').
 * ponytail: 단순 비교. 명세서 표기('STARBUCKS')처럼 글자가 아예 다르면 못 잡는다 */
export function similarMerchant(a: string, b: string) {
  const x = mkey(a), y = mkey(b);
  if (x.length < 2 || y.length < 2) return false;
  if (x.includes(y) || y.includes(x)) return true;
  let i = 0;
  while (i < x.length && x[i] === y[i]) i++;
  return i >= 3;
}

/** amount·currency: 문서의 원래 통화 금액. 외화면 원화(krw)는 환산 참고값일 뿐이다 */
type DocTxn = { merchant: string; krw: number; date: string; amount?: number; currency?: Transaction["currency"]; approvalNo?: string | null };
const sameFx = (t: Transaction, doc: DocTxn) => doc.amount !== undefined && !!doc.currency && doc.currency !== "KRW" && t.currency === doc.currency;
/** 원거래에서 아직 환불되지 않은 금액을 문서와 같은 단위로. 같은 외화면 원래 통화로 비교한다 —
 *  사용자가 원거래 원화를 명세서 청구액으로 고쳐 두면 환산 참고값과 달라 전액 취소가 후보에서 빠지기 때문 */
export const remainingFor = (t: Transaction, txns: Transaction[], doc: DocTxn) =>
  sameFx(t, doc) ? Math.round((t.amount * effectiveAmount(t, txns) / krw(t)) * 100) / 100 : effectiveAmount(t, txns);
const docAmount = (t: Transaction, doc: DocTxn) => (sameFx(t, doc) ? doc.amount! : doc.krw);
/** 취소·환불 영수증과 승인번호가 같은 결제. 환불 영수증에는 원결제의 승인번호가 그대로 찍히므로
 *  가맹점 표기('월정기수영' → '월정기수영 중도해약 반환금')나 금액이 달라도 이 결제가 원거래다.
 *  이미 전액 환불된 건은 뺀다 (두 번 환불되지 않게) */
export const approvalMatch = (txns: Transaction[], doc: DocTxn) => {
  const no = (doc.approvalNo ?? "").replace(/\D/g, "");
  if (!no) return undefined;
  return txns.find((t) => t.type === "expense" && !t.originalTxnId && t.approvalNo === no && effectiveAmount(t, txns) > 0);
};

/** 취소·환불 영수증의 원거래 후보: 승인번호가 같은 결제가 있으면 그것 하나로 확정.
 *  없으면 비슷한 가맹점 + 남은 금액(이전 환불 뺀 것) ≥ 취소액 + 취소일 이전 days일 이내.
 *  금액이 딱 맞는 것 먼저, 그다음 최근 순 */
export function refundCandidates(txns: Transaction[], doc: DocTxn, days = 90): Transaction[] {
  const exact = approvalMatch(txns, doc);
  if (exact) return [exact];
  const to = Date.parse(doc.date);
  return txns
    .filter((t) => t.type === "expense" && !t.originalTxnId && t.date <= doc.date && to - Date.parse(t.date) <= days * DAY && similarMerchant(t.merchant, doc.merchant) && remainingFor(t, txns, doc) >= docAmount(t, doc))
    .sort((a, b) => Number(remainingFor(b, txns, doc) === docAmount(b, doc)) - Number(remainingFor(a, txns, doc) === docAmount(a, doc)) || b.date.localeCompare(a.date));
}

/** 이미 저장한 같은 거래(같은 날짜·같은 금액·비슷한 가맹점). 같은 문자·명세서를 두 번 올렸을 때 경고용. 같은 외화끼리는 원래 통화 금액으로 비교.
 *  결제는 결제끼리, 취소 건은 저장된 환불·수입끼리만 비교한다 (같은 날 결제하고 취소한 건을 중복으로 보지 않게) */
export const duplicateOf = (txns: Transaction[], doc: DocTxn & { isCancel?: boolean }) => txns.find((t) =>
  (doc.isCancel ? !!t.originalTxnId || t.type === "income" : t.type === "expense" && !t.originalTxnId) && t.date === doc.date && (sameFx(t, doc) ? t.amount === doc.amount : krw(t) === doc.krw) && similarMerchant(t.merchant, doc.merchant));

/* ── 모델이 준 값 정리 ── */
/** '2026.9.5'·'2026-9-5'·'2026/09/05' → '2026-09-05'. 날짜가 아니면 undefined (그대로 저장하면 어느 달에도 안 보임) */
export function normDate(s?: string | null): string | undefined {
  const m = s?.match(/^(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);
  if (!m) return undefined;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return undefined; // 2월 30일 같은 날짜 거르기
  return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
}
/** '9:05' → '09:05'. 시각이 아니면 undefined */
export function normTime(s?: string | null): string | undefined {
  const m = s?.match(/^(\d{1,2}):(\d{2})/);
  return m && Number(m[1]) < 24 && Number(m[2]) < 60 ? `${m[1].padStart(2, "0")}:${m[2]}` : undefined;
}
/** 모델이 lowConfidence·inferred에 적은 필드 이름을 화면 키로 ('amount'·'합계' → total). 자유 문자열이라 이름이 흔들린다 */
const FIELD_KEYS: [RegExp, string][] = [[/paid|time|시각|시간/i, "paidAt"], [/date|날짜|일자|결제일/i, "date"], [/merchant|store|가맹점|상호/i, "merchant"], [/total|amount|금액|합계/i, "total"], [/card|issuer|pay|카드|결제수단/i, "card"], [/item|품목/i, "items"], [/industry|업종/i, "industry"]];
export const fieldKey = (s: string) => FIELD_KEYS.find(([re]) => re.test(s))?.[1] ?? s;
