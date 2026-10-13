/* 거래 기록 화면(목록·검색·일괄 편집·환불·등록)이 함께 쓰는 순수 규칙. 금액은 모두 원화(krw) 기준 */
import type { Transaction } from "../types";
import { effectiveAmount, krw, nextYm, ymOf } from "../engine";

/** 원거래에 이미 연결된 환불 합 */
export const refundedOf = (origId: string, all: Transaction[]) => all.reduce((s, t) => s + (t.originalTxnId === origId ? krw(t) : 0), 0);

/** 아직 환불할 수 있는 금액 = 원금 − 기존 환불 합 (0 아래로 안 내려감). exceptId: 수정 중인 환불 자신은 빼고 센다 */
export const refundLeft = (orig: Transaction, all: Transaction[], exceptId?: string) =>
  effectiveAmount(orig, exceptId ? all.filter((t) => t.id !== exceptId) : all);

/** 거래 행과 같은 부호의 합: 수입·환불 +, 지출 − */
export const signedSum = (list: Transaction[]) => list.reduce((s, t) => s + (t.type === "income" || t.originalTxnId ? krw(t) : -krw(t)), 0);

/** 순지출 = 지출 − 환불 (수입은 넣지 않음). 월간 요약·통계와 같은 기준 */
export const netExpense = (list: Transaction[]) => list.reduce((s, t) => (t.type !== "expense" ? s : s + (t.originalTxnId ? -krw(t) : krw(t))), 0);

/* ── 검색 (TRX-12): 앞뒤 공백·대소문자 무시 ── */
export type SearchFields = { merchant: boolean; memo: boolean; items: boolean };
export const matches = (s: string | undefined, q: string) => { const k = q.trim().toLowerCase(); return !!k && !!s && s.toLowerCase().includes(k); };
export const searchTxns = (txns: Transaction[], q: string, f: SearchFields) =>
  q.trim() ? txns.filter((t) => (f.merchant && matches(t.merchant, q)) || (f.memo && matches(t.memo, q)) || (f.items && !!t.items?.some((i) => matches(i, q)))).sort((a, b) => b.date.localeCompare(a.date)) : [];
/** 강조 표시용 조각. 홀수 번째가 일치 부분이고 원래 대소문자를 그대로 둔다 */
export const splitMatch = (s: string, q: string) => { const k = q.trim(); return k ? s.split(new RegExp(`(${k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "i")) : [s]; };

/** 결제일이 들어가는 실적 창의 달. 청구 사이클 시작일 이후 결제는 다음 달 창 (10일 사이클이면 9/15 → 10월 창 9/10~10/9) */
export const spendYmOf = (date: string, cycleDay?: number) => (cycleDay && cycleDay > 1 && Number(date.slice(8)) >= cycleDay ? nextYm(ymOf(date)) : ymOf(date));
