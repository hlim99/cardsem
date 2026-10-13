/* 카드 데이터가 약관대로인지 — Point Plan 통합 한도·SOL페이 제외·자동납부 영역 */
import { describe, expect, it } from "vitest";
import { calcCard, emptyLedger } from "../engine";
import { cardById } from "./cards";
import type { Transaction, UserCard } from "../types";

const PP = cardById("shinhan_pointplan")!;
const uc: UserCard = { cardId: PP.id, addedAt: "2026-08-01" };
const tx = (p: Partial<Transaction>): Transaction => ({ id: "x", type: "expense", amount: 10000, currency: "KRW", date: "2026-09-21", merchant: "테스트", categoryId: "etc", payType: "credit", cardId: PP.id, ...p });
const rule = (id: string) => PP.rules.find((r) => r.id === id)!;

describe("Point Plan", () => {
  it("12월 통합 한도 특례는 그룹의 모든 규칙에 같이 걸린다 (국내 15,000 뒤 해외 5,000)", () => {
    const L = emptyLedger();
    const dom = calcCard(tx({ id: "a", merchant: "하이마트", amount: 750000, date: "2026-12-03" }), PP, uc, 500000, L, "2026-12", [], true);
    expect(dom.total).toBe(15000); // 75만 × 2%, 한도 1만 + 특례 1만
    const ovs = calcCard(tx({ id: "b", merchant: "AMAZON", merchantIndustry: "overseas", amount: 500000, date: "2026-12-10" }), PP, uc, 500000, L, "2026-12", [], true);
    expect(ovs.total).toBe(5000); // 그룹 잔여 5,000
    for (const id of ["pp_domestic", "pp_solpay", "pp_overseas"]) expect(rule(id).monthOverrides).toEqual(rule("pp_domestic").monthOverrides);
  });

  it("SOL페이 추가 적립은 일상 적립 제외 업종에 붙지 않고, 결제수단이 비어도 '입력 필요'가 아니다", () => {
    const paid = calcCard(tx({ merchant: "문화상품권", amount: 500000, payMethod: "issuer_pay" }), PP, uc, 500000, emptyLedger(), "2026-09", [], false);
    expect(paid.total).toBe(0);
    expect(paid.status).toBe("excluded");
    const blank = calcCard(tx({ merchant: "문화상품권", amount: 500000 }), PP, uc, 500000, emptyLedger(), "2026-09", [], false);
    expect(blank.status).toBe("excluded");
    expect(rule("pp_solpay").target.excludes).toEqual(rule("pp_domestic").target.excludes);
  });

  it("자동납부: 도시가스·전기는 통합 영역 월 1건, 이동통신은 따로", () => {
    const L = emptyLedger();
    const run = (p: Partial<Transaction>) => calcCard(tx({ isAutoPay: true, payMethod: "issuer_pay", ...p }), PP, uc, 500000, L, "2026-09", [], true);
    const elec = run({ id: "e", merchant: "한국전력", amount: 52000 });
    expect(elec.applied.map((a) => [a.ruleId, a.amount])).toEqual([["pp_autopay", 2000]]); // SOL페이여도 0.1% 추가 없음
    expect(run({ id: "g", merchant: "서울도시가스", merchantIndustry: "gas", amount: 40000 }).total).toBe(0);
    expect(run({ id: "t", merchant: "SKT 통신요금", amount: 60000 }).applied.map((a) => [a.ruleId, a.amount])).toEqual([["pp_autopay_telecom", 3000]]);
  });

  it("음식점과 배달앱은 횟수를 함께 센다 (countGroupId)", () => {
    expect(rule("pp_weekend").countGroupId).toBeDefined();
    expect(rule("pp_delivery").countGroupId).toBe(rule("pp_weekend").countGroupId);
  });
});
