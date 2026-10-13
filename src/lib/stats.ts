/* 가계부 집계 (RPT-01, 02, 05~09). 순수 함수 — 화면·내보내기·테스트가 같은 숫자를 쓴다
 *
 * 금액 규칙 (모든 집계 공통)
 *  - 외화 거래는 원화 환산액(krw)으로 센다
 *  - 환불·부분 취소(originalTxnId가 있는 거래)는 "환불한 날의 달"에 음수로 들어간다 → 지출 = 결제 − 환불
 *  - 카테고리 집계는 상위 카테고리 기준(byCategory)과 실제 지정 카테고리 기준(bySubCategory) 두 벌 */
import type { Budget, Category, Transaction } from "./types";
import { daysInMonth, industryOf, krw, ymOf } from "./engine";

/** 하위 카테고리면 부모 id, 상위면 자기 id. 삭제된 id면 그대로 돌려준다 */
export const topCategory = (cats: Category[], id: string) => { const c = cats.find((x) => x.id === id); return c?.parentId ?? c?.id ?? id; };
export const categoryName = (cats: Category[], id: string) => cats.find((c) => c.id === id)?.name ?? (id === "etc" ? "기타" : id);

/** 업종 미분류: 업종을 모르거나 "기타"(etc)인 카드 결제 (환불·수입·현금·계좌이체 제외).
 *  AI 분류는 모르는 가맹점을 etc로 답하고 etc로는 어떤 업종 혜택도 맞지 않으므로 미분류로 센다.
 *  ponytail: 사용자가 일부러 "기타"를 고른 결제도 안내에 남는다. 구분이 필요해지면 업종 출처(user/ai)를 저장할 것.
 *  월간 요약의 "업종 미분류 N건"과 거래 목록 `?unclassified=1` 필터가 같은 기준을 쓴다 */
export const isUnclassified = (t: Transaction) => {
  const ind = industryOf(t);
  // 업종은 카드 혜택 매칭에만 쓰인다 → 카드 결제만 센다 (현금·계좌이체 월세 같은 건 업종이 없어도 문제없음)
  return t.type === "expense" && !t.originalTxnId && !!t.cardId && (t.payType === "credit" || t.payType === "check") && (!ind || ind === "etc");
};

/** 비중의 분모 = 양수 항목의 합. 지난달 결제의 환불이 이번 달에 들어오면 어떤 카테고리는 음수가 되는데,
 *  순지출을 분모로 쓰면 양수 항목들의 비중 합이 100%를 넘는다. 음수 항목은 비중 0 (표에만 "환불"로 보여준다) */
export const shareBase = (values: number[]) => values.reduce((s, v) => (v > 0 ? s + v : s), 0);
const shareOf = (v: number, base: number) => (v > 0 && base > 0 ? v / base : 0);

export type MonthSummary = ReturnType<typeof monthSummary>;

export function monthSummary(txns: Transaction[], ym: string, cats: Category[]) {
  const m = txns.filter((t) => ymOf(t.date) === ym);
  let income = 0, expense = 0, refunds = 0, expenseCount = 0, incomeCount = 0;
  const byCategory: Record<string, number> = {};
  const bySubCategory: Record<string, number> = {};
  const countByCategory: Record<string, number> = {};
  const countBySub: Record<string, number> = {};
  const incomeByCategory: Record<string, number> = {};
  const byCard: Record<string, number> = {};
  const byPayType: Record<string, number> = {};
  const byDay: Record<string, { income: number; expense: number; count: number }> = {};
  const byMerchant: Record<string, { count: number; sum: number; t: Transaction }> = {};
  for (const t of m) {
    const d = (byDay[t.date] ??= { income: 0, expense: 0, count: 0 });
    const v = krw(t);
    if (t.type === "income") {
      income += v; incomeCount++; d.income += v; d.count++;
      const top = topCategory(cats, t.categoryId);
      incomeByCategory[top] = (incomeByCategory[top] ?? 0) + v;
      continue;
    }
    const signed = t.originalTxnId ? -v : v;
    if (t.originalTxnId) refunds += v; else { expense += v; expenseCount++; d.count++; }
    d.expense += signed;
    const top = topCategory(cats, t.categoryId);
    byCategory[top] = (byCategory[top] ?? 0) + signed;
    bySubCategory[t.categoryId] = (bySubCategory[t.categoryId] ?? 0) + signed;
    if (!t.originalTxnId) {
      countByCategory[top] = (countByCategory[top] ?? 0) + 1;
      countBySub[t.categoryId] = (countBySub[t.categoryId] ?? 0) + 1;
      const mm = (byMerchant[t.merchant] ??= { count: 0, sum: 0, t });
      mm.count++; mm.sum += v;
    }
    const ck = t.cardId ?? t.payType;
    byCard[ck] = (byCard[ck] ?? 0) + signed;
    byPayType[t.payType] = (byPayType[t.payType] ?? 0) + signed;
  }
  expense -= refunds;
  return { ym, income, expense, refunds, net: income - expense, expenseCount, incomeCount, count: m.length, byCategory, bySubCategory, countByCategory, countBySub, incomeByCategory, byCard, byPayType, byDay, byMerchant };
}

/** 예산 대비 사용액. 상위 카테고리 예산은 하위 카테고리 지출까지 합친 값(byCategory),
 *  하위 카테고리 예산은 그 카테고리만(bySubCategory), 총예산은 전체 지출 */
export type CategoryRow = {
  key: string; id: string; name: string; icon: string; amount: number; share: number; prev: number; delta: number; count: number;
  budget?: number; children: Omit<CategoryRow, "children">[];
};
/** 월간 요약 표: 상위 카테고리별 이번 달·지난달·증감·건수·비중·예산, 하위 카테고리 펼침용 children.
 *  이번 달이나 지난달 중 한쪽이라도 금액이 있으면 행을 만든다 (줄어든 카테고리도 보이게).
 *  비중은 양수 항목 합 기준(shareBase) — 상위 행은 상위 카테고리 합, 하위 행은 하위 카테고리 합으로 나눈다.
 *  환불로 음수가 된 카테고리는 비중 0 */
export function categoryRows(cur: MonthSummary, prev: MonthSummary, cats: Category[], budgets: Budget[] = []): CategoryRow[] {
  const ids = new Set([...Object.keys(cur.byCategory), ...Object.keys(prev.byCategory)]);
  const total = shareBase(Object.values(cur.byCategory));
  // 하위 행 비중은 실제 지정 카테고리(leaf) 기준 — 엑셀 "카테고리별 지출" 시트 행과 같은 숫자가 되게
  const subBase = shareBase(Object.values(cur.bySubCategory));
  const budgetOf = (id: string) => budgets.find((b) => b.categoryId === id)?.amount;
  const rows: CategoryRow[] = [];
  for (const id of ids) {
    const amount = cur.byCategory[id] ?? 0, p = prev.byCategory[id] ?? 0;
    if (amount === 0 && p === 0) continue;
    const c = cats.find((x) => x.id === id);
    const subIds = new Set([...Object.keys(cur.bySubCategory), ...Object.keys(prev.bySubCategory)].filter((s) => s !== id && topCategory(cats, s) === id));
    const children = [...subIds].map((sid) => {
      const a = cur.bySubCategory[sid] ?? 0, pp = prev.bySubCategory[sid] ?? 0;
      const sc = cats.find((x) => x.id === sid);
      return { key: `${id}/${sid}`, id: sid, name: sc?.name ?? sid, icon: sc?.icon ?? "label", amount: a, share: shareOf(a, subBase), prev: pp, delta: a - pp, count: cur.countBySub[sid] ?? 0, budget: budgetOf(sid) };
    }).filter((r) => r.amount !== 0 || r.prev !== 0).sort((a, b) => b.amount - a.amount);
    // 상위 카테고리에 직접 지정된 거래가 있고 하위도 있으면 "직접" 행으로 보여준다
    const direct = cur.bySubCategory[id] ?? 0, directPrev = prev.bySubCategory[id] ?? 0;
    if (children.length && (direct !== 0 || directPrev !== 0)) children.push({ key: `${id}/_direct`, id, name: `${c?.name ?? id} (하위 미지정)`, icon: c?.icon ?? "label", amount: direct, share: shareOf(direct, subBase), prev: directPrev, delta: direct - directPrev, count: cur.countBySub[id] ?? 0, budget: undefined });
    rows.push({ key: id, id, name: categoryName(cats, id), icon: c?.icon ?? "receipt_long", amount, share: shareOf(amount, total), prev: p, delta: amount - p, count: cur.countByCategory[id] ?? 0, budget: budgetOf(id), children });
  }
  return rows.sort((a, b) => b.amount - a.amount || b.prev - a.prev);
}

/** 그 달 1일~말일 일별 지출·수입 (빈 날은 0) */
export function dailySeries(s: MonthSummary) {
  const n = daysInMonth(s.ym);
  return Array.from({ length: n }, (_, i) => {
    const date = `${s.ym}-${String(i + 1).padStart(2, "0")}`;
    const d = s.byDay[date];
    return { date, day: i + 1, expense: d?.expense ?? 0, income: d?.income ?? 0, count: d?.count ?? 0 };
  });
}

/** 증감 글자색. 좋아진 쪽 초록, 나빠진 쪽 빨강, 그대로면 회색. 지출은 upIsGood=false */
export const deltaTone = (diff: number, upIsGood: boolean) => (diff === 0 ? "text-muted" : (diff > 0) === upIsGood ? "text-green-700" : "text-red-700");

/** 증감률 %. 비교 대상이 0이면 계산할 수 없어 null */
export const pctChange = (cur: number, prev: number): number | null => (prev === 0 ? null : ((cur - prev) / Math.abs(prev)) * 100);
export const fmtPct = (p: number | null) => (p === null ? "비교 불가" : `${p > 0 ? "+" : ""}${Math.round(p * 10) / 10}%`);
