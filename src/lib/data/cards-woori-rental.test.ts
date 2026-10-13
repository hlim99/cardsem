import { describe, expect, it } from "vitest";
import { calcCard, emptyLedger } from "../engine";
import { WOORI_RENTAL_CARDS } from "./cards-woori-rental";
import type { CardProduct, Transaction } from "../types";

const card = (id: string) => WOORI_RENTAL_CARDS.find((c) => c.id === id)!;
const tx = (c: CardProduct, p: Partial<Transaction>): Transaction => ({
  id: "x", type: "expense", amount: 10000, currency: "KRW", date: "2026-10-05",
  merchant: "테스트", categoryId: "etc", payType: "credit", cardId: c.id, ...p,
});
const run = (c: CardProduct, t: Partial<Transaction>, prev: number, L = emptyLedger(), commit = false) =>
  calcCard(tx(c, t), c, { cardId: c.id, addedAt: "2026-09-01" }, prev, L, "2026-10", [], commit).total;

describe("렌탈 카드 카탈로그", () => {
  it("규칙 id가 전부 다르고 cardId가 카드 id와 같다", () => {
    const ids = WOORI_RENTAL_CARDS.flatMap((c) => c.rules.map((r) => r.id));
    expect(new Set(ids).size).toBe(ids.length);
    for (const c of WOORI_RENTAL_CARDS) for (const r of c.rules) expect(r.cardId).toBe(c.id);
  });
});

describe("우리 쿠쿠 렌탈프리멤버십", () => {
  const c = card("woori_rentalfree");
  it("쿠쿠 렌탈 자동이체: 구간 한도까지, 월 1건만", () => {
    const L = emptyLedger();
    expect(run(c, { merchant: "쿠쿠홈시스 렌탈", amount: 35000, isAutoPay: true }, 800000, L, true)).toBe(15000);
    expect(run(c, { merchant: "쿠쿠홈시스 렌탈", amount: 20000, isAutoPay: true }, 800000, L, true)).toBe(0); // 우선 매입 1건만
    expect(run(c, { merchant: "쿠쿠홈시스 렌탈", amount: 8000, isAutoPay: true }, 300000)).toBe(8000); // 한도보다 적으면 승인금액만큼
    expect(run(c, { merchant: "쿠쿠홈시스 렌탈", amount: 35000, isAutoPay: false }, 800000)).toBe(0); // 일반결제 제외
    expect(run(c, { merchant: "쿠쿠홈시스 렌탈", amount: 35000, isAutoPay: true }, 290000)).toBe(0); // 30만원 미만
  });
  it("커피 5% (월 3천원), CGV 인터넷 1.2만원 이상 6천원", () => {
    expect(run(c, { merchant: "스타벅스 강남점", merchantIndustry: "cafe", amount: 20000 }, 300000)).toBe(1000);
    expect(run(c, { merchant: "CGV", merchantIndustry: "movie", amount: 14000, payChannel: "web" }, 300000)).toBe(6000);
  });
});

describe("쿠쿠 롯데카드", () => {
  const c = card("lotte_cuckoo");
  it("렌탈료 결제일 할인: 여러 건 합산해 월 한도까지", () => {
    const L = emptyLedger();
    expect(run(c, { merchant: "쿠쿠 렌탈", amount: 20000, isAutoPay: true }, 900000, L, true)).toBe(12000);
    expect(run(c, { merchant: "쿠쿠 렌탈", amount: 20000, isAutoPay: true }, 900000, L, true)).toBe(0);
    expect(run(c, { merchant: "쿠쿠 렌탈", amount: 30000, isAutoPay: true }, 1600000)).toBe(24000);
    expect(run(c, { merchant: "쿠쿠 렌탈", amount: 30000, isAutoPay: true }, 390000)).toBe(0);
  });
});

describe("코웨이 IBK카드", () => {
  const c = card("ibk_coway");
  it("코웨이·웅진 통합 한도", () => {
    const L = emptyLedger();
    expect(run(c, { merchant: "코웨이", amount: 10000, isAutoPay: true }, 700000, L, true)).toBe(10000);
    expect(run(c, { merchant: "웅진렌탈", amount: 10000, isAutoPay: true }, 700000, L, true)).toBe(7000); // 17,000 - 10,000
  });
});

describe("NH올원 Rental&코웨이카드", () => {
  const c = card("nh_rental_coway");
  it("렌탈료 1만원 2건, 100만원 이상 구간: 1만원 + 5천원", () => {
    const L = emptyLedger();
    expect(run(c, { merchant: "코웨이", amount: 10000, isAutoPay: true }, 1000000, L, true)).toBe(10000);
    expect(run(c, { merchant: "코웨이", amount: 10000, isAutoPay: true }, 1000000, L, true)).toBe(5000);
  });
});
