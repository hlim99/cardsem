/* 정성 혜택 판단의 순수 부분: state 조립, 답 해석. 네트워크 없음 → 테스트 대상 */
import type { CardProduct, Perk, PerkForm, PerkJudgment, Transaction } from "../types";
import { INDUSTRY } from "../data/merchants";
import { dowLabel } from "../format";
import { krw } from "../engine";

export const FORM_CRITERIA = {
  money: "결제액 할인·캐시백·포인트·수수료 면제·연회비 면제처럼 원화 금액으로 정확히 표현되는 혜택",
  goods: "상품권·바우처·쿠폰·무료 음료·기념품처럼 물건이나 이용권을 받는 혜택",
  service: "공항 라운지·발렛파킹·보험·우대금리·회원 등급·무이자 할부처럼 금액이 아닌 서비스나 자격",
  none: "이 결제와는 무관해서 이번에 받을 수 없는 혜택",
} as const;

/* 모델에 넘길 state: 결제 1건 + 카드 + 판단할 혜택 목록. 사람이 읽는 라벨로 풀어서 넣는다 */
export function buildState(t: Transaction, card: CardProduct, perks: Perk[], today: string) {
  return {
    today,
    transaction: {
      merchant: t.merchant, industry: t.merchantIndustry ? INDUSTRY[t.merchantIndustry].label : "미분류", amountKrw: krw(t), // 외화 결제는 원화 환산액
      date: t.date, dayOfWeek: dowLabel(t.date), time: t.paidAt ?? "모름", installmentMonths: t.installmentMonths ?? 0, interestFree: !!t.isInterestFree,
      autoPay: !!t.isAutoPay, payMethod: t.payMethod ?? "card", items: t.items ?? [],
    },
    card: { issuer: card.issuer, name: card.name, annualFeeKrw: card.annualFee ?? 0 },
    perks: perks.map((p) => ({ id: p.id, name: p.name, kind: p.kind, detail: p.detail, terms: p.rawText, valueKrw: p.value ?? null })),
  };
}

/* 모델이 혜택마다 내는 답 */
export type PerkAnswer = { perkId: string; eligible: number; form: PerkForm; confidence: number };

/* 답 → 화면용 판단. amount는 돈 형태이고 카드 데이터에 가치가 있을 때만 */
export function toJudgments(perks: Perk[], answers: PerkAnswer[], model: string): PerkJudgment[] {
  return perks.map((p) => {
    const a = answers.find((x) => x.perkId === p.id);
    const eligible = a?.eligible ?? 0;
    const form = (eligible >= 0.5 ? a?.form : "none") ?? "none";
    return { perkId: p.id, name: p.name, kind: p.kind, eligible, form, confidence: a?.confidence ?? 0, amount: form === "money" ? p.value : undefined, summary: p.detail, engine: "openai", model };
  });
}
