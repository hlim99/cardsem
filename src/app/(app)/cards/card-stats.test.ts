/* 카드 화면 계산 — 시드(오늘 9/20, Mr.Life 사이클 10일)로 대조 */
import { describe, expect, it } from "vitest";
import { cardBenefit, cardIndustryRows, customCardProduct, removeCardMessage } from "./card-stats";
import { calcCard, computeMonth, emptyLedger, monthSpend } from "../../../lib/engine";
import { CARDS, cardById, spendProgress } from "../../../lib/data/cards";
import { SEED_TXNS, SEED_USER_CARDS, TODAY } from "../../../lib/data/fixtures";
import type { Transaction } from "../../../lib/types";

const ML = cardById("shinhan_mrlife")!, PP = cardById("shinhan_pointplan")!;
const ucOf = (id: string) => SEED_USER_CARDS.find((u) => u.cardId === id)!;

describe("실적 진행 창", () => {
  it("사이클 카드: 이번 달에 끝나는 창이 이미 마감됐으면 진행 중인 다음 창을 보여준다", () => {
    const p = spendProgress(SEED_TXNS, ML, ucOf(ML.id), "2026-09", TODAY);
    expect(p.label).toBe("9/10~10/9");
    expect(p.forYm).toBe("2026-11");
    expect(p.spend).toBe(monthSpend(SEED_TXNS, ML.id, "2026-10", ML, 10));
    expect(p.closed).toBe(false);
  });
  it("창이 아직 열려 있으면 그 창 (사이클 10일, 9/5)", () => {
    const p = spendProgress(SEED_TXNS, ML, ucOf(ML.id), "2026-09", "2026-09-05");
    expect(p.label).toBe("8/10~9/9");
    expect(p.forYm).toBe("2026-10");
  });
  it("달력 월 카드는 이번 달, 지난달을 보면 마감", () => {
    expect(spendProgress(SEED_TXNS, PP, ucOf(PP.id), "2026-09", TODAY)).toMatchObject({ label: "9월", forYm: "2026-10", closed: false });
    expect(spendProgress(SEED_TXNS, PP, ucOf(PP.id), "2026-08", TODAY).closed).toBe(true);
    expect(spendProgress(SEED_TXNS, ML, ucOf(ML.id), "2026-08", TODAY)).toMatchObject({ label: "7/10~8/9", closed: true });
  });
});

describe("카드별 월 요약", () => {
  const calc = computeMonth("2026-09", SEED_TXNS, SEED_USER_CARDS, CARDS);
  it("업종별 행의 혜택 합 = 카드의 받은 혜택, 카드들의 합 = 월 받은 혜택", () => {
    let sum = 0;
    for (const { cardId } of SEED_USER_CARDS) {
      const rows = cardIndustryRows(SEED_TXNS, calc, cardId);
      const b = cardBenefit(calc, cardId);
      expect(rows.reduce((s, r) => s + r.benefit, 0)).toBe(b.received);
      expect(rows.reduce((s, r) => s + r.missed, 0)).toBe(b.missed);
      expect(rows.reduce((s, r) => s + r.count, 0)).toBe(b.count);
      sum += b.received;
    }
    expect(sum).toBe(calc.received);
  });
  it("환불은 환불한 달에 원거래 업종에서 뺀다", () => {
    const base = { type: "expense" as const, currency: "KRW" as const, categoryId: "etc", payType: "credit" as const, cardId: PP.id };
    const txns = [
      { ...base, id: "a", amount: 50000, date: "2026-09-03", merchant: "무신사", merchantIndustry: "fashion" as const },
      { ...base, id: "r", amount: 20000, date: "2026-09-05", merchant: "환불", originalTxnId: "a" },
    ];
    const rows = cardIndustryRows(txns, computeMonth("2026-09", txns, [ucOf(PP.id)], CARDS), PP.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ key: "fashion", amount: 30000, count: 1 });
  });
});

describe("직접 추가 카드", () => {
  const base = { issuer: "우리카드", name: " 내 카드 ", type: "check" as const, color: "#1DA466", kind: "discount" as const, ratePct: 1.5 };
  const pay = (amount: number, date: string) => ({ id: `t${date}${amount}`, type: "expense" as const, amount, currency: "KRW" as const, date, merchant: "아무 가게", categoryId: "etc", payType: "check" as const, cardId: "custom_a" });
  it("조건 없음: 전 가맹점 정률, 한도 없음", () => {
    const c = customCardProduct(base, "custom_a", "2026-09-20");
    expect(c).toMatchObject({ name: "내 카드", grade: "A", reviewStatus: "none", tiers: [{ min: 0, max: null }] });
    expect(c.rules[0]).toMatchObject({ supported: true, confidence: 1, rate: 0.015, kind: "discount" });
    const txns = [pay(10000, "2026-09-03")];
    expect(computeMonth("2026-09", txns, [{ cardId: c.id, addedAt: "2026-09-20" }], [...CARDS, c]).byTxn[txns[0].id].mine?.total).toBe(150);
  });
  it("전월 실적 조건 이상인 달에만, 월 한도까지", () => {
    const c = customCardProduct({ ...base, cap: 1000, minSpend: 300000, desc: "약관 문구" }, "custom_a", "2026-09-20");
    expect(c.rules[0].rawText).toBe("약관 문구");
    const ucs = [{ cardId: c.id, addedAt: "2026-08-01" }];
    const low = [pay(200000, "2026-08-10"), pay(100000, "2026-09-03")];
    expect(computeMonth("2026-09", low, ucs, [c]).byTxn[low[1].id].mine?.total).toBe(0); // 8월 20만 < 30만
    const high = [pay(300000, "2026-08-10"), pay(100000, "2026-09-03")];
    expect(computeMonth("2026-09", high, ucs, [c]).byTxn[high[1].id].mine?.total).toBe(1000); // 1,500 → 한도 1,000
  });
});

/* 카드 데이터 — 엔진이 업종과 가맹점을 AND로 보므로 규칙의 가맹점·업종 목록이 맞물려야 한다 */
describe("카드 규칙 데이터", () => {
  const SAT = "2026-09-19";
  const tx = (p: Partial<Transaction>): Transaction => ({ id: "x", type: "expense", amount: 25000, currency: "KRW", date: SAT, merchant: "테스트", categoryId: "etc", payType: "credit", ...p });
  const applied = (t: Transaction, cardId: string, variantId?: string) =>
    calcCard(t, cardById(cardId)!, { cardId, variantId, addedAt: "2026-08-01" }, 600000, emptyLedger(), "2026-09", [], true).applied.map((a) => a.ruleId);
  it("Point Plan 주말 배달앱: '배민'으로 적힌 결제도 받는다", () => {
    expect(applied(tx({ merchant: "배민", cardId: PP.id, payChannel: "in_app", payMethod: "issuer_pay" }), PP.id)).toContain("pp_delivery");
  });
  it("taptap O 소셜커머스 1%: 쿠팡만, 쿠팡이츠·쿠팡플레이는 빠진다", () => {
    const tt = (merchant: string) => applied(tx({ merchant, cardId: "samsung_taptap_o" }), "samsung_taptap_o", "p1");
    expect(tt("쿠팡")).toContain("tt_p1_sc");
    expect(tt("쿠팡이츠")).not.toContain("tt_p1_sc");
    expect(tt("쿠팡플레이")).not.toContain("tt_p1_sc");
  });
});

/* 해제 확인 문구가 엔진 동작과 맞는지: 해제한 카드는 기본 설정(패키지·사이클·보정 없음)으로 다시 계산된다 */
describe("카드 해제 확인 문구", () => {
  const without = (id: string) => SEED_USER_CARDS.filter((u) => u.cardId !== id);
  it("설정이 없는 카드(Point Plan): 해제해도 지난 결제 혜택이 같아 '그대로'라고 한다", () => {
    expect(removeCardMessage("Point Plan", false, ucOf(PP.id))).toContain("그대로예요");
    const before = cardBenefit(computeMonth("2026-09", SEED_TXNS, SEED_USER_CARDS, CARDS), PP.id).received;
    expect(before).toBeGreaterThan(0);
    expect(cardBenefit(computeMonth("2026-09", SEED_TXNS, without(PP.id), CARDS), PP.id).received).toBe(before);
  });
  it("청구 사이클·패키지·실적 보정이 있으면 '달라질 수 있어요'", () => {
    expect(removeCardMessage("Mr.Life", false, ucOf(ML.id))).toContain("달라질 수 있어요");
    expect(removeCardMessage("taptap O", false, { cardId: "samsung_taptap_o", variantId: "p1", addedAt: "" })).toContain("달라질 수 있어요");
    expect(removeCardMessage("Point Plan", false, { ...ucOf(PP.id), spendTierOverride: 500000 })).toContain("달라질 수 있어요");
  });
  it("직접 추가 카드: 거래의 카드가 비워진다고 알린다", () => {
    expect(removeCardMessage("내 카드", true)).toContain("카드가 비워져");
  });
});
