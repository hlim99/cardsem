import { describe, expect, it } from "vitest";
import { calcCard, emptyLedger } from "../engine";
import { KB_NARASARANG_CARDS } from "./cards-kb-narasarang";
import type { CardProduct, Transaction, UserCard } from "../types";

const card = (id: string) => KB_NARASARANG_CARDS.find((c) => c.id === id)!;
const tx = (c: CardProduct, p: Partial<Transaction>): Transaction => ({
  id: "x", type: "expense", amount: 10000, currency: "KRW", date: "2026-10-12",
  merchant: "테스트", categoryId: "etc", payType: "check", cardId: c.id, ...p,
});
const run = (c: CardProduct, p: Partial<Transaction>, prev: number, uc: Partial<UserCard> = {}, L = emptyLedger(), commit = false) =>
  calcCard(tx(c, p), c, { cardId: c.id, addedAt: "2026-09-01", ...uc }, prev, L, "2026-10", [], commit).total;

describe("나라사랑카드 데이터", () => {
  it("규칙 id가 겹치지 않고 cardId가 맞음", () => {
    const ids = KB_NARASARANG_CARDS.flatMap((c) => c.rules.map((r) => r.id));
    expect(new Set(ids).size).toBe(ids.length);
    for (const c of KB_NARASARANG_CARDS) for (const r of c.rules) expect(r.cardId).toBe(c.id);
  });
});

describe("KB국민 나라사랑카드(체크)", () => {
  const c = card("kb_narasarang");
  it("PX: 3만원 미만 10% 건당 1천원, 3만원 이상 금액 구간별 5~20% (실적 무관)", () => {
    expect(run(c, { merchant: "국군복지단 PX", amount: 8000 }, 0)).toBe(800);
    expect(run(c, { merchant: "국군복지단 PX", amount: 20000 }, 0)).toBe(1000);
    expect(run(c, { merchant: "국군복지단 PX", amount: 50000 }, 0)).toBe(2500);
    expect(run(c, { merchant: "국군복지단 PX", amount: 100000 }, 0)).toBe(20000);
  });
  it("대중교통 20% (전월 10만원 미만이면 없음), 통합 한도 공유", () => {
    expect(run(c, { merchant: "후불교통", merchantIndustry: "transit", amount: 10000 }, 300000)).toBe(2000);
    expect(run(c, { merchant: "후불교통", merchantIndustry: "transit", amount: 10000 }, 50000)).toBe(0);
    const L = emptyLedger(); // 전월 15만원 → 통합 5천원: 스타벅스 4천원 뒤 CGV는 남은 1천원만
    expect(run(c, { merchant: "스타벅스 강남점", merchantIndustry: "cafe", amount: 30000 }, 150000, {}, L, true)).toBe(4000);
    expect(run(c, { merchant: "CGV 용산", merchantIndustry: "movie", amount: 20000 }, 150000, {}, L, true)).toBe(1000);
  });
});

describe("신한카드 나라사랑카드 체크", () => {
  const c = card("shinhan_narasarang");
  it("PX 20% (3만원 미만은 일 1회 1천원)", () => {
    expect(run(c, { merchant: "국군복지단 PX", amount: 30000 }, 0)).toBe(6000);
    expect(run(c, { merchant: "국군복지단 PX", amount: 8000 }, 0)).toBe(1000);
  });
  it("Life: 대중교통 20% 월 5천원, 편의점 20% 건당 1천원", () => {
    expect(run(c, { merchant: "후불교통", merchantIndustry: "transit", amount: 10000 }, 100000)).toBe(2000);
    expect(run(c, { merchant: "후불교통", merchantIndustry: "transit", amount: 50000 }, 300000)).toBe(5000);
    expect(run(c, { merchant: "GS25 역삼점", merchantIndustry: "convenience", amount: 4000 }, 100000)).toBe(800);
  });
});

describe("하나 나라사랑카드(체크)", () => {
  const c = card("hana_narasarang");
  it("PX: 3만원 미만 30%, 이상 20% (실적 무관)", () => {
    expect(run(c, { merchant: "국군복지단 PX", amount: 10000 }, 0)).toBe(3000);
    expect(run(c, { merchant: "국군복지단 PX", amount: 50000 }, 0)).toBe(10000);
  });
  it("택시 20%는 군 급여이체(variant salary)일 때만", () => {
    expect(run(c, { merchant: "카카오T", merchantIndustry: "taxi", amount: 10000 }, 0, { variantId: "salary" })).toBe(2000);
    expect(run(c, { merchant: "카카오T", merchantIndustry: "taxi", amount: 10000 }, 0)).toBe(0);
  });
});
