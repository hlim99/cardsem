/* 카드셈 혜택 계산 엔진 — [구현 계획서] 6장. 순수 함수, 부수효과 없음 (BNF-07) */
import type { BenefitRule, CardProduct, CondField, Industry, SpendTier, Transaction, UserCard } from "../types";
import { classifyMerchant, INDUSTRY } from "../data/merchants";
import { DOW, dowOf } from "../format";

/* ── 날짜 유틸 ── */
export const ymOf = (date: string) => date.slice(0, 7);
export const prevYm = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
};
export const nextYm = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
};
export { dowOf as dow } from "../format";
export const daysInMonth = (ym: string) => { const [y, m] = ym.split("-").map(Number); return new Date(y, m, 0).getDate(); };
export const fmtYm = (ym: string) => { const [y, m] = ym.split("-"); return `${y}년 ${Number(m)}월`; };

// ponytail: 2026·2027년 공휴일(대체공휴일·선거일 포함)만. 2028년 전에 추가하거나 서버에서 공휴일 API로 갱신
const HOLIDAYS = new Set([
  "2026-01-01", "2026-02-16", "2026-02-17", "2026-02-18", "2026-03-01", "2026-03-02", "2026-05-05", "2026-05-24", "2026-05-25", "2026-06-03", "2026-06-06", "2026-08-15", "2026-08-17", "2026-09-24", "2026-09-25", "2026-09-26", "2026-10-03", "2026-10-05", "2026-10-09", "2026-12-25",
  "2027-01-01", "2027-02-06", "2027-02-07", "2027-02-08", "2027-02-09", "2027-03-01", "2027-05-05", "2027-05-13", "2027-06-06", "2027-08-15", "2027-08-16", "2027-09-14", "2027-09-15", "2027-09-16", "2027-10-03", "2027-10-04", "2027-10-09", "2027-10-11", "2027-12-25", "2027-12-27",
]);
export const isHoliday = (date: string) => HOLIDAYS.has(date);

/* ── 실적 구간 ── */
export const resolveTier = (spend: number, tiers: SpendTier[]): SpendTier =>
  tiers.find((t) => spend >= t.min && (t.max === null || spend < t.max)) ?? tiers[0];
export const tierLabel = (t: SpendTier) => t.min === 0 && t.max === null ? "실적 조건 없음" : t.max === null ? `${t.min / 10000}만원 이상` : t.min === 0 ? `${t.max / 10000}만원 미만` : `${t.min / 10000}~${t.max / 10000}만원`;
const sameTier = (a: SpendTier, b: SpendTier) => a.min === b.min && a.max === b.max;
const limitsFor = (rule: BenefitRule, tier: SpendTier) =>
  rule.limitsByTier.find((l) => sameTier(l.tier, tier)) ??
  // 규칙이 구간을 더 거칠게 나눈 경우: 실적이 규칙 구간 안에 들어가면 그 구간
  rule.limitsByTier.find((l) => tier.min >= l.tier.min && (l.tier.max === null || tier.min < l.tier.max));

/* ── 거래 보조 ── */
export const industryOf = (t: Transaction): Industry | undefined => t.merchantIndustry ?? classifyMerchant(t.merchant);
/* 외화 환산. 결제일 환율 API를 쓰지 않으므로, 원화 환산액(amountKrw)을 입력받지 못한 외화 거래는 대략 환율로 채운다 (참고값).
 * ponytail: 고정 환율. 정확도가 필요해지면 결제일 환율 API로 amountKrw를 저장할 때 채운다 */
export const FX_APPROX: Record<Transaction["currency"], number> = { KRW: 1, USD: 1380, JPY: 9.2 };
export const approxKrw = (amount: number, currency: Transaction["currency"]) => Math.round(amount * (FX_APPROX[currency] ?? 1));
export const krw = (t: Transaction) => (t.currency === "KRW" ? t.amount : (t.amountKrw ?? approxKrw(t.amount, t.currency)));
/** 사용자가 고친 전월 실적. spendTierOverrideYm이 있으면 그 달(ym) 계산에만, 없으면(예전 데이터) 모든 달에 적용 (하위 호환) */
export const spendOverrideOf = (uc: UserCard, ym: string) =>
  uc.spendTierOverride !== undefined && (!uc.spendTierOverrideYm || uc.spendTierOverrideYm === ym) ? uc.spendTierOverride : undefined;
export const isCardExpense = (t: Transaction) => t.type === "expense" && !t.originalTxnId && (t.payType === "credit" || t.payType === "check") && !!t.cardId;

/* 원거래 id → 환불 합계. 거래 배열마다 한 번만 만든다 (결제마다 전체 이력을 훑지 않도록)
 * ponytail: 배열 참조로 캐시 — 거래 배열을 제자리에서 고치지 않고 새 배열로 바꾸는 전제 (store가 그렇게 함) */
const refundIndex = new WeakMap<Transaction[], Map<string, number>>();
const refundsOf = (all: Transaction[]) => {
  let m = refundIndex.get(all);
  if (!m) {
    m = new Map();
    for (const r of all) if (r.originalTxnId) m.set(r.originalTxnId, (m.get(r.originalTxnId) ?? 0) + krw(r));
    refundIndex.set(all, m);
  }
  return m;
};

/* 취소·부분 환불을 반영한 유효 금액 (TRX-11) */
export const effectiveAmount = (t: Transaction, all: Transaction[]) => Math.max(0, krw(t) - (refundsOf(all).get(t.id) ?? 0));

/* ── 실적 산정 창 ── */
const pad2 = (n: number) => String(n).padStart(2, "0");
/** ym월에 끝나는 실적 창. 청구 사이클이 있으면 전월 N일~당월 (N-1)일, 없으면 달력 월 1일~말일.
 * ponytail: 사이클은 사용자 카드 단위. 카드×업종별 기준(교통 전전월·해외 매입일)은 후속 (구현 계획서 15장 4번) */
export function spendWindow(ym: string, cycleDay?: number): { from: string; to: string } {
  if (!cycleDay || cycleDay <= 1) return { from: `${ym}-01`, to: `${ym}-${pad2(daysInMonth(ym))}` };
  const p = prevYm(ym);
  return { from: `${p}-${pad2(Math.min(cycleDay, daysInMonth(p)))}`, to: `${ym}-${pad2(Math.min(cycleDay, daysInMonth(ym)) - 1)}` };
}
/* 화면에서 고를 수 있는 청구 사이클 시작일. ponytail: 실제 카드사 결제일에 흔한 값만 */
export const CYCLE_DAYS = [5, 10, 13, 15, 20, 25];
/** 화면 표기: 달력이면 "9월", 사이클이면 "8/10~9/9" */
export function spendWindowLabel(ym: string, cycleDay?: number) {
  if (!cycleDay || cycleDay <= 1) return `${Number(ym.slice(5))}월`;
  const { from, to } = spendWindow(ym, cycleDay);
  const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8))}`;
  return `${md(from)}~${md(to)}`;
}

/* 카드별 실적 (6.2절). 수입 제외, 할부는 총액, 제외 업종은 뺌.
 * 취소·환불은 카드사 관행대로 "환불한 날이 속한 실적 창"에서 차감한다 (원결제 달을 소급해 바꾸지 않음 — 월간 요약과 같은 기준).
 * 혜택 계산(calcCard)은 원결제 기준 유효 금액(effectiveAmount)을 그대로 쓴다 */
export function monthSpend(txns: Transaction[], cardId: string, ym: string, card?: CardProduct, cycleDay?: number) {
  const { from, to } = spendWindow(ym, cycleDay);
  const counted = (t?: Transaction) => {
    if (!t || !isCardExpense(t) || t.cardId !== cardId) return false;
    const ind = industryOf(t);
    return !ind || !card?.spendExcludes.includes(ind);
  };
  const inWin = (t: Transaction) => t.date >= from && t.date <= to;
  const byId = new Map(txns.map((t) => [t.id, t]));
  const paid = txns.filter((t) => inWin(t) && counted(t)).reduce((s, t) => s + krw(t), 0);
  const refunded = txns.filter((t) => t.originalTxnId && inWin(t) && counted(byId.get(t.originalTxnId))).reduce((s, t) => s + krw(t), 0);
  return Math.max(0, paid - refunded);
}

/* 카드가 요구하는 조건 필드 집합 (TRX-07) */
export function requiredFields(card: CardProduct, variantId?: string): CondField[] {
  const f = new Set<CondField>();
  for (const r of card.rules) {
    if (!r.supported || (r.variantId && r.variantId !== variantId)) continue;
    if (r.target.timeRange) f.add("paidAt");
    if (r.target.autoPayOnly) f.add("isAutoPay");
    if (r.target.payMethods) f.add("payMethod");
    if (r.target.payChannels) f.add("payChannel");
    if (r.perUnit) f.add("fuelLiters");
  }
  return [...f];
}
export const COND_LABEL: Record<CondField, string> = { paidAt: "결제 시각", isAutoPay: "자동납부", payMethod: "간편결제 수단", payChannel: "결제 경로", fuelLiters: "주유량" };

/* ── 원장 ── */
export type Ledger = {
  used: Record<string, number>; // `${cardId}:${capGroupId ?? ruleId}` → 이번 달 소진액
  counts: Record<string, { day: Record<string, number>; month: number; year: number }>; // `${cardId}:${countGroupId ?? ruleId}`
};
export const emptyLedger = (): Ledger => ({ used: {}, counts: {} });
const cloneLedger = (l: Ledger): Ledger => JSON.parse(JSON.stringify(l));
const groupKey = (cardId: string, r: BenefitRule) => `${cardId}:${r.capGroupId ?? r.id}`;
// 횟수는 countGroupId가 같은 규칙끼리 함께 센다 (약관의 "통합 일 1회" 등). 돈 한도 묶음(capGroupId)과는 별개
const countKey = (cardId: string, r: BenefitRule) => `${cardId}:${r.countGroupId ?? r.id}`;
const counts = (l: Ledger, k: string) => (l.counts[k] ??= { day: {}, month: 0, year: 0 });

/* 규칙의 이번 달 한도 (구간 + 월 특례) */
export function monthlyCapOf(rule: BenefitRule, tier: SpendTier, ym: string): number | undefined {
  const lim = limitsFor(rule, tier);
  if (!lim || lim.monthlyCap === undefined) return undefined;
  const m = Number(ym.slice(5));
  const extra = (rule.monthOverrides ?? []).filter((o) => o.months.includes(m)).reduce((s, o) => s + o.extraCap, 0);
  return lim.monthlyCap + extra;
}

/* ── 계산 결과 타입 ── */
export type Check = { ok: boolean; title: string; sub: string };
export type Applied = { ruleId: string; name: string; kind: BenefitRule["kind"]; amount: number; formula: string; checks: Check[]; capRemainingAfter?: number };
export type Skipped = { ruleId: string; name: string; field: CondField; maxExtra: number };
export type CardCalc = {
  cardId: string;
  total: number;
  applied: Applied[];
  skipped: Skipped[]; // 조건 필드 비어 계산 못함 (BNF-05)
  unsupported: { ruleId: string; name: string; reason: string }[];
  blocked: { ruleId: string; name: string; reason: string }[]; // 대상 아님·한도 소진·무이자 제외 등
  tier: SpendTier;
  prevSpend: number;
  status: "benefit" | "none" | "capped" | "excluded" | "missing";
};

// 시각은 분으로 바꿔 비교한다 ("9:30"처럼 앞자리 0이 없어도 오전으로). to가 from보다 이르면 자정을 넘긴 구간
const minOf = (hhmm: string) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + (m || 0); };
export const timeIn = (hhmm: string, from: string, to: string) => {
  const [x, a, b] = [minOf(hhmm), minOf(from), minOf(to)];
  return a <= b ? x >= a && x < b : x >= a || x < b;
};
const pct = (r: number) => `${Math.round(r * 1000) / 10}%`;
const fmt = (n: number) => Math.round(n).toLocaleString("ko-KR");

/* 한 규칙의 지급액 (한도 반영 전) */
function grossAmount(rule: BenefitRule, t: Transaction, eligible: number, amount: number): { amount: number; formula: string } | null {
  if (rule.fixedAmount !== undefined) return { amount: rule.fixedAmount, formula: `정액 ${fmt(rule.fixedAmount)}원` };
  if (rule.perUnit) {
    if (t.fuelLiters === undefined) return null;
    return { amount: t.fuelLiters * rule.perUnit.amount, formula: `${t.fuelLiters}L × ${rule.perUnit.amount}원` };
  }
  if (rule.step) {
    const n = Math.floor(eligible / rule.step.per);
    return { amount: n * rule.step.amount, formula: `${fmt(eligible)} ÷ ${fmt(rule.step.per)} = ${n}단위 × ${fmt(rule.step.amount)}원` };
  }
  if (rule.rateBands) {
    const band = [...rule.rateBands].sort((a, b) => b.minAmount - a.minAmount).find((b) => amount >= b.minAmount);
    if (!band) return { amount: 0, formula: "구간 없음" };
    return { amount: eligible * band.rate, formula: `${fmt(eligible)} × ${pct(band.rate)} (건당 ${fmt(band.minAmount)}원 이상 구간)` };
  }
  if (rule.rate !== undefined) return { amount: eligible * rule.rate, formula: `${fmt(eligible)} × ${pct(rule.rate)}` };
  return null;
}

/** 한 결제를 한 카드로 계산. commit=true면 원장을 갱신 */
export function calcCard(t: Transaction, card: CardProduct, uc: UserCard, prevSpend: number, ledger: Ledger, ym: string, all: Transaction[], commit: boolean): CardCalc {
  const tier = resolveTier(prevSpend, card.tiers);
  const res: CardCalc = { cardId: card.id, total: 0, applied: [], skipped: [], unsupported: [], blocked: [], tier, prevSpend, status: "none" };
  const amount = effectiveAmount(t, all);
  const ind = industryOf(t);
  const d = dowOf(t.date);
  const candidates: (Applied & { rule: BenefitRule })[] = [];

  for (const rule of card.rules) {
    if (rule.variantId && rule.variantId !== uc.variantId) continue;
    if (rule.validFrom && t.date < rule.validFrom) continue;
    if (rule.validTo && t.date > rule.validTo) continue;
    if (!rule.supported) { res.unsupported.push({ ruleId: rule.id, name: rule.name, reason: rule.unsupportedReason ?? "구조상 계산 불가" }); continue; }
    const tg = rule.target;
    const block = (reason: string) => res.blocked.push({ ruleId: rule.id, name: rule.name, reason });
    const checks: Check[] = [];

    // 대상 조건: 업종·가맹점·채널·요일·공휴일·최소금액·제외목록
    // 업종과 가맹점이 둘 다 있으면 AND (가맹점 목록이 그 업종 안을 좁힘: "주말 3대 마트"는 이마트24·코스트코 제외). 하나만 있으면 그것만
    const byMerchant = tg.merchants?.some((m) => t.merchant.toLowerCase().includes(m.toLowerCase()));
    // 업종을 모르면(사전·AI·사용자 모두 미분류) 가맹점 일치를 믿는다 — AI 정규화 규칙은 categories와 merchants를 함께 채우기 때문
    // 외화 결제는 가맹점 업종(예: 온라인쇼핑)과 별개로 "해외 가맹점"이기도 하다 → 해외 규칙에 맞고, 해외를 뺀 국내 규칙에서는 빠진다
    const ovs = ind === "overseas" || t.currency !== "KRW";
    const byCat = ind ? !!tg.categories?.includes(ind) || (ovs && !!tg.categories?.includes("overseas")) : (ovs && !!tg.categories?.includes("overseas")) || !!byMerchant;
    if ((tg.categories && !byCat) || (tg.merchants && !byMerchant)) continue; // 대상 아님은 조용히 넘김
    checks.push({ ok: true, title: `적용 규칙 · ${rule.name}`, sub: byMerchant ? `가맹점 ${t.merchant}` : `업종 ${ind ? INDUSTRY[ind]?.label ?? ind : "미분류"} 해당` });
    if (ind && tg.excludes?.includes(ind)) { block(`제외 업종 (${INDUSTRY[ind]?.label ?? ind})`); continue; }
    if (ovs && ind !== "overseas" && tg.excludes?.includes("overseas")) { block("해외 결제 제외"); continue; }
    // 무이자는 할부(2개월 이상)일 때만 의미가 있다. 예전 데이터의 "일시불 + 무이자 표시"가 혜택을 막지 않게
    if (t.isInterestFree && (t.installmentMonths ?? 0) > 1 && tg.excludes?.includes("무이자할부")) { block("무이자 할부 · 약관상 제외"); continue; }
    if (tg.channel && tg.channel !== "any") {
      const online = t.payChannel === "web" || t.payChannel === "in_app" || ind === "online_shop";
      if ((tg.channel === "online") !== online) { block(`${tg.channel === "online" ? "온라인" : "오프라인"} 결제만`); continue; }
    }
    if (tg.daysOfWeek) {
      if (!tg.daysOfWeek.includes(d)) { block("요일 조건 불일치"); continue; }
      if (tg.holidayPolicy === "exclude" && isHoliday(t.date)) { block("공휴일 제외"); continue; }
      checks.push({ ok: true, title: "요일 조건", sub: DOW[d] + "요일 · 충족" });
    }
    if (tg.minAmount) {
      if (amount < tg.minAmount) { block(`건당 최소 ${fmt(tg.minAmount)}원 미달`); continue; }
      checks.push({ ok: true, title: `건당 최소 ${fmt(tg.minAmount)}원`, sub: `${fmt(amount)}원 결제 · 충족` });
    }

    // 실적 구간과 한도·횟수
    const lim = limitsFor(rule, tier);
    if (!lim) { block(`전월 실적 ${tierLabel(tier)} 구간에는 혜택 없음`); continue; }
    checks.push({ ok: true, title: `전월 실적 ${tierLabel(tier)} 구간`, sub: `${spendWindowLabel(prevYm(ym), uc.statementCycleDay)} 실적 ${fmt(prevSpend)}원 · 충족 (근사치)` });
    const c = counts(ledger, countKey(card.id, rule));
    if (lim.dailyCount !== undefined && (c.day[t.date] ?? 0) >= lim.dailyCount) { block(`일 ${lim.dailyCount}회 소진`); continue; }
    if (lim.monthlyCount !== undefined && c.month >= lim.monthlyCount) { block(`월 ${lim.monthlyCount}회 소진`); continue; }
    if (lim.yearlyCount !== undefined && c.year >= lim.yearlyCount) { block(`연 ${lim.yearlyCount}회 소진`); continue; }

    // 조건 필드(시각·자동납부·간편결제·경로·주유량): 위의 확정 조건을 모두 통과한 규칙만 "입력하면 최대 N원"으로 안내 (BNF-05)
    const miss = (field: CondField) => {
      const cap = monthlyCapOf(rule, tier, ym);
      const remain = cap !== undefined ? Math.max(0, cap - (ledger.used[groupKey(card.id, rule)] ?? 0)) : Infinity;
      if (remain <= 0) { block(`월 한도 ${fmt(cap!)}원 소진`); return; }
      const g = rule.perUnit ? Infinity : (grossAmount(rule, t, Math.min(amount, rule.eligibleAmountCap ?? Infinity), amount)?.amount ?? 0);
      const maxExtra = Math.min(g, rule.perTxnCap ?? Infinity, remain);
      res.skipped.push({ ruleId: rule.id, name: rule.name, field, maxExtra: Number.isFinite(maxExtra) ? Math.max(0, Math.floor(maxExtra + 1e-9)) : 0 });
    };
    if (tg.timeRange) {
      if (!t.paidAt) { miss("paidAt"); continue; }
      if (!timeIn(t.paidAt, tg.timeRange.from, tg.timeRange.to)) { block(`시간대 ${tg.timeRange.from}~${tg.timeRange.to} 외`); continue; }
      checks.push({ ok: true, title: `시간대 ${tg.timeRange.from}~${tg.timeRange.to}`, sub: `${t.paidAt} 결제 · 충족` });
    }
    if (tg.autoPayOnly) {
      if (t.isAutoPay === undefined) { miss("isAutoPay"); continue; }
      if (!t.isAutoPay) { block("자동납부 건만 적용"); continue; }
      checks.push({ ok: true, title: "자동납부", sub: "충족" });
    }
    if (tg.payMethods) {
      if (!t.payMethod) { miss("payMethod"); continue; }
      if (!tg.payMethods.includes(t.payMethod)) { block("결제 수단 조건 불일치"); continue; }
      checks.push({ ok: true, title: "간편결제 수단", sub: `${t.payMethod} · 충족` });
    }
    if (tg.payChannels) {
      if (!t.payChannel) { miss("payChannel"); continue; }
      if (!tg.payChannels.includes(t.payChannel)) { block("결제 경로 조건 불일치"); continue; }
      checks.push({ ok: true, title: "결제 경로", sub: `${t.payChannel} · 충족` });
    }
    if (rule.perUnit && t.fuelLiters === undefined) { miss("fuelLiters"); continue; }

    const eligible = Math.min(amount, rule.eligibleAmountCap ?? Infinity);
    const g = grossAmount(rule, t, eligible, amount);
    if (!g) continue;
    let amt = Math.floor(g.amount + 1e-9); // 0.7% → 0.006999… 같은 부동소수 오차로 1원 모자라지 않게
    let formula = g.formula;
    if (rule.eligibleAmountCap && amount > rule.eligibleAmountCap) formula += ` (대상 금액 ${fmt(rule.eligibleAmountCap)}원까지)`;
    if (rule.perTxnCap !== undefined && amt > rule.perTxnCap) { amt = rule.perTxnCap; formula += ` → 건당 한도 ${fmt(rule.perTxnCap)}원`; }
    const cap = monthlyCapOf(rule, tier, ym);
    const used = ledger.used[groupKey(card.id, rule)] ?? 0;
    if (cap !== undefined) {
      const remain = Math.max(0, cap - used);
      if (remain <= 0) { block(`월 한도 ${fmt(cap)}원 소진`); continue; }
      if (amt > remain) { amt = remain; formula += ` → 잔여 한도 ${fmt(remain)}원`; }
      checks.push({ ok: true, title: `월 한도 ${fmt(cap)}원 · 잔여 ${fmt(remain)}원`, sub: `${amt > 0 ? `${fmt(amt)}원 차감 후 ${fmt(remain - amt)}원 남아요` : ""}${rule.capGroupId ? " · 통합 한도 그룹" : ""}` });
    } else checks.push({ ok: true, title: "월 한도 없음", sub: "" });
    if (lim.dailyCount !== undefined || lim.monthlyCount !== undefined || lim.yearlyCount !== undefined)
      checks.push({ ok: true, title: `횟수 · ${[lim.dailyCount && `일 ${lim.dailyCount}회`, lim.monthlyCount && `월 ${lim.monthlyCount}회`, lim.yearlyCount && `연 ${lim.yearlyCount}회`].filter(Boolean).join(" · ")}`, sub: `이번 달 ${c.month}회${lim.yearlyCount !== undefined ? ` · 올해 ${c.year}회` : ""} 사용${rule.countGroupId ? " · 통합 횟수" : ""}` });
    if (amt <= 0) { block("계산 금액 0원"); continue; }
    candidates.push({ rule, ruleId: rule.id, name: rule.name, kind: rule.kind, amount: amt, formula, checks });
  }

  // 중복·배타 (BNF-08): deny 쌍은 큰 쪽만
  const alive = new Set(candidates.map((c) => c.ruleId));
  for (const c of candidates) for (const s of c.rule.stacking ?? []) {
    if (s.mode !== "deny" || !alive.has(s.ruleId) || !alive.has(c.ruleId)) continue;
    const other = candidates.find((x) => x.ruleId === s.ruleId)!;
    const loser = other.amount > c.amount ? c : other;
    alive.delete(loser.ruleId);
    res.blocked.push({ ruleId: loser.ruleId, name: loser.name, reason: `${(loser === c ? other : c).name}와 중복 불가 · 큰 쪽만 적용` });
  }

  // 반영 (통합 한도는 그룹 단위로 차감). 같은 countGroupId 규칙이 이 결제에 함께 걸렸을 수 있어 횟수도 다시 본다
  const L = commit ? ledger : cloneLedger(ledger);
  for (const c of candidates.filter((x) => alive.has(x.ruleId))) {
    const lim = limitsFor(c.rule, tier), cc = counts(L, countKey(card.id, c.rule));
    if ((lim?.dailyCount !== undefined && (cc.day[t.date] ?? 0) >= lim.dailyCount) || (lim?.monthlyCount !== undefined && cc.month >= lim.monthlyCount) || (lim?.yearlyCount !== undefined && cc.year >= lim.yearlyCount)) {
      res.blocked.push({ ruleId: c.ruleId, name: c.name, reason: "통합 횟수 소진" }); continue;
    }
    const gk = groupKey(card.id, c.rule);
    const cap = monthlyCapOf(c.rule, tier, ym);
    let amt = c.amount;
    if (cap !== undefined) amt = Math.min(amt, Math.max(0, cap - (L.used[gk] ?? 0)));
    if (amt <= 0) { res.blocked.push({ ruleId: c.ruleId, name: c.name, reason: "통합 한도 소진" }); continue; }
    L.used[gk] = (L.used[gk] ?? 0) + amt;
    cc.day[t.date] = (cc.day[t.date] ?? 0) + 1; cc.month += 1; cc.year += 1;
    const { rule: _r, ...pub } = c; void _r;
    res.applied.push({ ...pub, amount: amt, capRemainingAfter: cap !== undefined ? cap - L.used[gk] : undefined });
    res.total += amt;
  }
  res.status = res.total > 0 ? "benefit" : res.skipped.length ? "missing" : res.blocked.some((b) => b.reason.includes("소진")) ? "capped" : res.blocked.some((b) => b.reason.includes("제외")) ? "excluded" : "none";
  return res;
}

/* ── 월 전체 계산 ── */
export type TxnResult = {
  mine?: CardCalc; // 현금·계좌이체·수입·환불이면 없음
  compare: { cardId: string; amount: number; note: string }[]; // 보유 카드 전체 (BNF-03)
  bestCardId?: string;
  bestAmount: number;
  diff: number; // 최적 − 실제
};
export type CardMonth = {
  cardId: string; tier: SpendTier; prevSpend: number; thisSpend: number;
  nextTier?: SpendTier; // 이번 달 실적으로 다음 달 진입할 구간 대비
  progressPct: number; // 다음 구간 목표 대비
  rules: { rule: BenefitRule; cap?: number; used: number; remain?: number; monthCount: number; limit: ReturnType<typeof limitsFor> }[];
};
export type MonthCalc = {
  ym: string;
  byTxn: Record<string, TxnResult>;
  cards: Record<string, CardMonth>;
  ledger: Ledger;
  received: number; // 받은 혜택 합계
  could: number; // 받을 수 있었던 합계 (그리디 근사)
  missed: number; // 놓친 차액 = could − received
  missedTop: { txnId: string; diff: number; bestCardId: string }[];
};

const hasYearly = (card: CardProduct) => card.rules.some((r) => r.limitsByTier.some((l) => l.yearlyCount !== undefined));
/* ym월 말까지의 연 횟수 (원장 counts의 year). 거래 배열 참조로 캐시 — refundIndex와 같은 전제(배열을 제자리에서 고치지 않음).
 * 카드 목록·카탈로그 참조가 바뀌면 다시 계산. 캐시 덕분에 달마다 1월부터 다시 계산하지 않는다 */
const yearCache = new WeakMap<Transaction[], Map<string, { userCards: UserCard[]; catalog: CardProduct[]; year: Record<string, number> }>>();
function yearCountsUntil(ym: string, txns: Transaction[], userCards: UserCard[], catalog: CardProduct[]) {
  let m = yearCache.get(txns);
  if (!m) yearCache.set(txns, (m = new Map()));
  const hit = m.get(ym);
  if (hit && hit.userCards === userCards && hit.catalog === catalog) return hit.year;
  const year = Object.fromEntries(Object.entries(computeMonth(ym, txns, userCards, catalog).ledger.counts).map(([k, c]) => [k, c.year]));
  m.set(ym, { userCards, catalog, year });
  return year;
}
/* ym월이 이어받는 연 횟수(1월~전월). 전월 원장의 year가 이미 1월~전월 누적이라 한 달씩만 거슬러 올라가고 1월에서 멈춘다.
 * ym이 "YYYY-MM"이 아니면(결제일을 비운 미리보기 등) 거슬러 올라가지 않는다 — 형식 검사 없이는 prevYm("")이 끝없이 이어짐.
 * 판단 기준(보유 카드 + 그 해 결제에 쓰인 카드)이 같은 해 모든 달에서 같아야 누적이 끊기지 않는다. 연 횟수 규칙이 있는 카드가 없으면 건너뜀
 * ponytail: 전월을 다시 계산(재귀, 최대 11달, 캐시). 더 빨라야 하면 store 캐시의 전월 결과를 인자로 받기 */
function priorYearCounts(ym: string, txns: Transaction[], userCards: UserCard[], catalog: CardProduct[]): Record<string, number> {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(ym) || ym.endsWith("-01")) return {};
  const yr = ym.slice(0, 4);
  const yearIds = new Set([...userCards.map((u) => u.cardId), ...txns.filter((t) => t.cardId && t.date.startsWith(yr)).map((t) => t.cardId!)]);
  return catalog.some((c) => yearIds.has(c.id) && hasYearly(c)) ? yearCountsUntil(prevYm(ym), txns, userCards, catalog) : {};
}

/** opts.prior: 이어받을 연 횟수를 이미 알 때(previewTxn의 excludeId) 넘기면 이전 달을 다시 계산하지 않는다 */
export function computeMonth(ym: string, txns: Transaction[], userCards: UserCard[], catalog: CardProduct[], opts?: { prior?: Record<string, number> }): MonthCalc {
  const cards = userCards.map((uc) => ({ uc, card: catalog.find((c) => c.id === uc.cardId)! })).filter((x) => x.card);
  const prev = prevYm(ym);
  const monthTxns = txns.filter((t) => ymOf(t.date) === ym).sort((a, b) => (a.date + (a.paidAt ?? "00:00")).localeCompare(b.date + (b.paidAt ?? "00:00")));
  // 해제한 카드로 결제한 거래: 카탈로그 기본값(variant·청구 사이클 없음)으로 '내 카드' 혜택만 계산한다.
  // 비교·최적 카드 후보에는 넣지 않는다 (그 결제 자신의 놓친 혜택 그리디에서만 후보 — 받은 혜택이 받을 수 있던 혜택을 넘지 않게)
  const removed = [...new Set(monthTxns.filter((t) => isCardExpense(t) && !cards.some((x) => x.card.id === t.cardId)).map((t) => t.cardId!))]
    .map((id) => ({ uc: { cardId: id, addedAt: "" } as UserCard, card: catalog.find((c) => c.id === id)! })).filter((x) => x.card);
  const ownRemoved = (t: Transaction) => removed.find((x) => x.card.id === t.cardId);
  const prevSpend: Record<string, number> = {};
  for (const { uc, card } of [...cards, ...removed]) prevSpend[card.id] = spendOverrideOf(uc, ym) ?? monthSpend(txns, card.id, prev, card, uc.statementCycleDay);

  // 연 횟수(yearlyCount)는 같은 해 이전 달의 적용 횟수를 이어받는다 (priorYearCounts)
  const prior = opts?.prior ?? priorYearCounts(ym, txns, userCards, catalog);
  // 놓친 혜택용 가상 원장도 실제 연 횟수로 시작한다 (이전 달의 가상 배분은 따로 남기지 않는 근사)
  const startLedger = (): Ledger => ({ used: {}, counts: Object.fromEntries(Object.entries(prior).map(([k, year]) => [k, { day: {}, month: 0, year }])) });

  const ledger = startLedger();
  const byTxn: Record<string, TxnResult> = {};
  let received = 0;

  for (const t of monthTxns) {
    if (!isCardExpense(t)) continue; // 현금·계좌이체·수입·환불은 계산 대상 아님 (TRX-02, TRX-08)
    const r: TxnResult = { compare: [], bestAmount: 0, diff: 0 };
    const own = ownRemoved(t);
    if (own) r.mine = calcCard(t, own.card, own.uc, prevSpend[own.card.id], ledger, ym, txns, true);
    for (const { uc, card } of cards) {
      const isMine = t.cardId === card.id;
      const c = calcCard(t, card, uc, prevSpend[card.id], ledger, ym, txns, isMine);
      if (isMine) r.mine = c;
      const note = c.total > 0 ? c.applied.map((a) => a.name).join(" + ") : c.skipped.length ? `${COND_LABEL[c.skipped[0].field]} 입력 시 최대 ${fmt(c.skipped[0].maxExtra)}원` : c.blocked[0]?.reason ?? ((industryOf(t) ?? "etc") !== "etc" ? "대상 아님" : "업종 미분류"); // etc도 미분류 (stats.isUnclassified와 같은 기준)
      r.compare.push({ cardId: card.id, amount: c.total, note });
    }
    received += r.mine?.total ?? 0;
    const best = [...r.compare].sort((a, b) => b.amount - a.amount)[0];
    // 카탈로그에도 없는 카드(지운 직접 추가 카드 등)면 받은 혜택을 알 수 없으니 놓친 혜택으로 치지 않는다
    if (best) { r.bestCardId = best.cardId; r.bestAmount = best.amount; r.diff = r.mine ? Math.max(0, best.amount - r.mine.total) : 0; }
    byTxn[t.id] = r;
  }

  // 월간 놓친 혜택: 차액 큰 순 그리디 배분 (BNF-03·04) — 가상 원장에 다시 태움
  const hyp = startLedger();
  let could = 0;
  const order = monthTxns.filter((t) => byTxn[t.id]?.mine).sort((a, b) => byTxn[b.id].diff - byTxn[a.id].diff);
  for (const t of order) {
    const r = byTxn[t.id];
    const own = ownRemoved(t);
    // 가상 원장 기준으로 보유 카드 전체(+ 해제한 카드로 낸 결제면 그 카드) 중 가장 큰 카드에 배분 (한도를 나눠 쓰는 결제끼리의 근사)
    const pick = (own ? [...cards, own] : cards).map((hit) => ({ hit, total: calcCard(t, hit.card, hit.uc, prevSpend[hit.card.id], hyp, ym, txns, false).total }))
      .sort((a, b) => b.total - a.total || (a.hit.card.id === r.mine?.cardId ? -1 : 1))[0];
    if (!pick) continue;
    could += calcCard(t, pick.hit.card, pick.hit.uc, prevSpend[pick.hit.card.id], hyp, ym, txns, true).total;
  }
  could = Math.max(could, received);

  const cardsOut: Record<string, CardMonth> = {};
  for (const { uc, card } of cards) {
    const tier = resolveTier(prevSpend[card.id], card.tiers);
    const thisSpend = monthSpend(txns, card.id, ym, card, uc.statementCycleDay);
    const nextTier = card.tiers.find((tt) => tt.min > 0 && thisSpend < tt.min);
    const goal = nextTier?.min ?? [...card.tiers].reverse()[0].min;
    cardsOut[card.id] = {
      cardId: card.id, tier, prevSpend: prevSpend[card.id], thisSpend, nextTier,
      progressPct: goal > 0 ? Math.min(100, (thisSpend / goal) * 100) : 100,
      rules: card.rules.filter((r) => r.supported && (!r.variantId || r.variantId === uc.variantId)).map((rule) => {
        const cap = monthlyCapOf(rule, tier, ym);
        const used = ledger.used[groupKey(card.id, rule)] ?? 0;
        return { rule, cap, used, remain: cap !== undefined ? Math.max(0, cap - used) : undefined, monthCount: ledger.counts[countKey(card.id, rule)]?.month ?? 0, limit: limitsFor(rule, tier) };
      }),
    };
  }
  const missedTop = Object.entries(byTxn).filter(([, r]) => r.diff > 0).sort((a, b) => b[1].diff - a[1].diff).map(([txnId, r]) => ({ txnId, diff: r.diff, bestCardId: r.bestCardId! }));
  return { ym, byTxn, cards: cardsOut, ledger, received, could, missed: could - received, missedTop };
}

/** 저장 전 미리보기: 이 결제를 각 보유 카드로 했다면 얼마인지. 원장(남은 한도)은 그 달 계산 결과를 쓴다.
 *  opts.excludeId: 이미 저장된 거래를 수정·재추천할 때 그 거래가 쓴 한도·횟수를 빼고 계산 (자기 자신에게 막히지 않게) */
export function previewTxn(draft: Transaction, calc: MonthCalc, userCards: UserCard[], catalog: CardProduct[], all: Transaction[], opts?: { excludeId?: string }) {
  if (opts?.excludeId && calc.byTxn[opts.excludeId]) {
    // 그 거래의 환불은 남긴다 — 같은 id로 다시 보는 draft가 환불 뺀 유효 금액으로 계산되게 (저장된 계산값과 같게).
    // 환불은 계산 대상이 아니고, 원거래가 빠지면 monthSpend도 그 환불을 차감하지 않아 남겨도 원장·실적에 영향 없음
    const rest = all.filter((t) => t.id !== opts.excludeId);
    // 뺀 거래는 calc.ym에만 있어 이전 달 연 횟수는 그대로다 → 원래 배열(all, 캐시됨)로 구한 값을 넘겨 1월부터 다시 계산하지 않는다
    calc = computeMonth(calc.ym, rest, userCards, catalog, { prior: priorYearCounts(calc.ym, all, userCards, catalog) });
    all = rest;
  }
  const out: { cardId: string; calc: CardCalc }[] = [];
  for (const uc of userCards) {
    const card = catalog.find((c) => c.id === uc.cardId);
    if (!card) continue;
    const prev = calc.cards[card.id]?.prevSpend ?? 0;
    out.push({ cardId: card.id, calc: calcCard(draft, card, uc, prev, calc.ledger, calc.ym, all, false) });
  }
  return out;
}
