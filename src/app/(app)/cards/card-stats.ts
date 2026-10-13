/* 카드 화면 계산 — 카드별 월 요약, 직접 추가 카드. React 의존 없는 순수 함수 (실적 진행 창 spendProgress는 홈·알림도 쓰도록 lib/data/cards.ts에)
 * 테스트(vitest)가 경로 별칭을 모르므로 상대 경로로 가져온다 */
import type { CardProduct, Transaction, UserCard } from "../../../lib/types";
import { industryOf, krw, ymOf, type MonthCalc } from "../../../lib/engine";
import { INDUSTRY } from "../../../lib/data/merchants";

/** 이 카드로 받은 혜택·놓친 혜택 (엔진이 결제마다 계산한 값의 합) */
export function cardBenefit(calc: MonthCalc, cardId: string) {
  let received = 0, missed = 0, count = 0;
  for (const r of Object.values(calc.byTxn)) if (r.mine?.cardId === cardId) { received += r.mine.total; missed += r.diff; count++; }
  return { received, missed, count };
}

export type IndustryRow = { key: string; label: string; icon: string; amount: number; count: number; benefit: number; missed: number };
/** 이 카드의 그 달 결제를 업종별로 묶는다. 금액 = 결제 − 환불 (환불은 환불한 달에, 원거래의 업종으로 뺀다).
 *  혜택·놓친 혜택은 calc.byTxn 그대로라 거래 상세·월간 요약과 같은 숫자 */
export function cardIndustryRows(txns: Transaction[], calc: MonthCalc, cardId: string): IndustryRow[] {
  const byId = new Map(txns.map((t) => [t.id, t]));
  const m = new Map<string, IndustryRow>();
  for (const t of txns) {
    if (t.type !== "expense" || t.cardId !== cardId || ymOf(t.date) !== calc.ym) continue;
    const ind = industryOf(t.originalTxnId ? byId.get(t.originalTxnId) ?? t : t);
    const key = ind ?? "none";
    const row = m.get(key) ?? { key, label: ind ? INDUSTRY[ind].label : "업종 미분류", icon: ind ? INDUSTRY[ind].icon : "help", amount: 0, count: 0, benefit: 0, missed: 0 };
    if (t.originalTxnId) row.amount -= krw(t);
    else { row.amount += krw(t); row.count++; row.benefit += calc.byTxn[t.id]?.mine?.total ?? 0; row.missed += calc.byTxn[t.id]?.diff ?? 0; }
    m.set(key, row);
  }
  return [...m.values()].sort((a, b) => b.amount - a.amount);
}

/* 직접 추가 카드 (CARD-02): 입력한 기본 혜택 하나로 CardProduct를 만든다. 전 가맹점 정률, 검수 없이 계산 (reviewStatus none)
 *  - 전월 실적 조건이 있으면 구간 2개 [0~조건) [조건~), 혜택은 위 구간에만 → 조건 미달 달은 엔진이 "이 구간에는 혜택 없음"으로 막는다
 *  - 월 한도가 없으면 monthlyCap 없이 (한도 없음) */
export type CustomCardInput = { issuer: string; name: string; type: CardProduct["type"]; color: string; kind: "discount" | "point"; ratePct: number; cap?: number; minSpend?: number; desc?: string };
export function customCardProduct(f: CustomCardInput, id: string, today: string): CardProduct {
  const tiers = f.minSpend ? [{ min: 0, max: f.minSpend }, { min: f.minSpend, max: null }] : [{ min: 0, max: null }];
  const kind = f.kind === "discount" ? "할인" : "적립";
  const summary = `전 가맹점 ${f.ratePct}% ${kind}${f.cap ? ` · 월 ${f.cap.toLocaleString("ko-KR")}원 한도` : " · 한도 없음"}${f.minSpend ? ` · 전월 실적 ${f.minSpend.toLocaleString("ko-KR")}원 이상일 때만` : ""}`;
  return {
    id, issuer: f.issuer, name: f.name.trim(), type: f.type, color: f.color, grade: f.cap || f.minSpend ? "B" : "A",
    tiers, spendExcludes: [], sourceUrl: "", checkedAt: today, reviewStatus: "none",
    rules: [{
      id: `${id}_base`, cardId: id, name: `기본 ${f.ratePct}% ${kind}`, kind: f.kind, rate: f.ratePct / 100, target: {},
      limitsByTier: [{ tier: tiers[tiers.length - 1], ...(f.cap ? { monthlyCap: f.cap } : {}) }],
      rawText: f.desc?.trim() || summary, supported: true, confidence: 1,
    }],
  };
}

/** 카드 해제·삭제 확인 문구 (등록 화면·카드 상세 공용).
 *  해제한 카드의 지난 결제는 엔진이 카탈로그 기본값(uc = {cardId}: 패키지·청구 사이클·실적 보정 없음)으로 다시 계산하고 비교·추천 후보에서만 뺀다.
 *  그래서 셋 중 하나라도 설정돼 있으면 받은 혜택이 달라질 수 있다 (패키지 규칙은 아예 빠짐). 카드번호 앞자리는 계산과 무관.
 *  직접 추가 카드는 store가 그 카드로 기록한 거래·반복 거래의 카드를 비운다 → 카드 필터·카드 통계에서 빠지고, 같은 카드를 다시 추가해도 이어지지 않는다 */
export const removeCardMessage = (label: string, custom: boolean, uc?: UserCard) => {
  if (custom) return `직접 추가한 '${label}'를 삭제할까요? 입력한 혜택도 지워져요. 이 카드로 기록한 거래는 남지만 카드가 비워져 혜택은 더 이상 계산하지 않고, 같은 카드를 다시 추가해도 이어지지 않아요.`;
  const changes = !!uc && (!!uc.variantId || !!uc.statementCycleDay || uc.spendTierOverride !== undefined);
  return `'${label}' 등록을 해제할까요? 이 카드로 기록한 거래는 남고, 카드 비교·추천에서 빠져요. 패키지·청구 사이클·카드번호 앞자리·실적 보정 설정은 지워져요. `
    + (changes ? "그래서 지난 결제 혜택은 기본 설정으로 다시 계산돼 달라질 수 있어요." : "지난 결제의 받은 혜택은 그대로예요.");
};
