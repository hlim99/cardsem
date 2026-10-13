/* state 조립과 답 해석 — 네트워크 없이 순수 함수만 */
import { describe, expect, it } from "vitest";
import { buildState, toJudgments } from "./judge.core";
import { cardById } from "../data/cards";
import type { Transaction } from "../types";

const card = cardById("shinhan_narasarang")!; // 경조사 지원 · 멤버십 · LG전자 적립 3개 (모두 value 없음)
const perks = card.perks!;
const tx: Transaction = { id: "x", type: "expense", amount: 480000, currency: "KRW", date: "2026-09-19", merchant: "대한항공", merchantIndustry: "overseas", categoryId: "travel", payType: "credit", cardId: card.id, paidAt: "14:20" };

describe("state", () => {
  it("결제·카드·혜택이 사람이 읽는 라벨로 들어감", () => {
    const s = buildState(tx, card, perks, "2026-09-20");
    expect(s.transaction.industry).toBe("해외 가맹점");
    expect(s.transaction.dayOfWeek).toBe("토");
    expect(s.perks.map((p) => p.id)).toEqual(perks.map((p) => p.id));
    expect(s.perks[0].terms).toBe(perks[0].rawText);
  });
  it("외화 결제는 원화 환산액으로", () => {
    expect(buildState({ ...tx, currency: "USD", amount: 25, amountKrw: 34500 }, card, perks, "2026-09-20").transaction.amountKrw).toBe(34500);
  });
});

describe("답 해석", () => {
  it("받을 수 있고 서비스면 detail을 설명으로, 돈이면 perk.value를 금액으로", () => {
    const withValue = [{ ...perks[0], value: 30000 }];
    const j = toJudgments(withValue, [{ perkId: perks[0].id, eligible: 0.91, form: "money", confidence: 0.8 }], "gpt-5.5");
    expect(j[0]).toMatchObject({ eligible: 0.91, form: "money", amount: 30000, engine: "openai", model: "gpt-5.5" });
    const s = toJudgments(perks, [{ perkId: perks[0].id, eligible: 0.7, form: "service", confidence: 0.9 }], "gpt-5.5");
    expect(s[0]).toMatchObject({ form: "service", amount: undefined, summary: perks[0].detail });
  });
  it("확률이 0.5 미만이면 형태는 none, 답이 없으면 0으로", () => {
    const j = toJudgments(perks, [{ perkId: perks[0].id, eligible: 0.2, form: "service", confidence: 0.9 }], "gpt-5.5");
    expect(j[0].form).toBe("none");
    expect(j[1]).toMatchObject({ eligible: 0, form: "none", confidence: 0 });
  });
  it("돈이어도 perk.value가 없으면 금액은 비운다", () => {
    const j = toJudgments(perks, [{ perkId: perks[0].id, eligible: 0.9, form: "money", confidence: 0.9 }], "gpt-5.5");
    expect(j[0]).toMatchObject({ form: "money", amount: undefined });
  });
});
