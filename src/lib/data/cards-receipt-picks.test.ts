import { describe, expect, it } from "vitest";
import { calcCard, emptyLedger } from "../engine";
import { CARDS } from "./cards";
import { RECEIPT_PICK_CARDS } from "./cards-receipt-picks";
import type { CardProduct, Transaction } from "../types";

const card = (id: string) => RECEIPT_PICK_CARDS.find((c) => c.id === id)!;
const tx = (c: CardProduct, p: Partial<Transaction>): Transaction => ({
  id: "x", type: "expense", amount: 10000, currency: "KRW", date: "2026-10-05",
  merchant: "테스트", categoryId: "etc", payType: "credit", cardId: c.id, ...p,
});
const run = (c: CardProduct, t: Partial<Transaction>, prev: number, L = emptyLedger(), commit = false) =>
  calcCard(tx(c, t), c, { cardId: c.id, addedAt: "2026-09-01" }, prev, L, "2026-10", [], commit).total;

/* 데모 영수증 */
const SWIM = { merchant: "OO구민스포츠센터", merchantIndustry: "sports", amount: 50000 } as const; // 월정기수영[성인]
const LESSON = { ...SWIM, amount: 10000 };                                                      // 주2회 강습수영
const SWIM_GYM = { ...SWIM, amount: 70000 };                                                    // 월정기수영+헬스[성인]
const PHARM = { merchant: "캐시닥약국", merchantIndustry: "pharmacy", amount: 11000 } as const;
const CAFE = { merchant: "카드셈 가게", merchantIndustry: "cafe", amount: 10700 } as const;
const DEPT = { merchant: "(주)현대백화점압구정본점", merchantIndustry: "department", amount: 10000 } as const;

describe("영수증 추천 카드 카탈로그", () => {
  it("규칙 id가 기존 카탈로그 전체와 겹치지 않고 cardId가 카드 id와 같다", () => {
    const all = [...new Set([...CARDS, ...RECEIPT_PICK_CARDS])]; // CARDS가 이미 이 카드들을 포함하므로 같은 객체는 한 번만 센다
    expect(new Set(all.map((c) => c.id)).size).toBe(all.length);
    const ids = all.flatMap((c) => c.rules.map((r) => r.id));
    expect(new Set(ids).size).toBe(ids.length);
    for (const c of RECEIPT_PICK_CARDS) for (const r of c.rules) expect(r.cardId).toBe(c.id);
  });
});

describe("KB YOU Wish up (40만원 구간)", () => {
  const c = card("kb_youwishup");
  it("수영장: 5%, 병원·약국·스포츠 통합 월 5천원", () => {
    const L = emptyLedger();
    expect(run(c, SWIM, 400000, L, true)).toBe(2500);
    expect(run(c, LESSON, 400000, L, true)).toBe(500);
    expect(run(c, SWIM_GYM, 400000, L, true)).toBe(2000); // 3,500 → 잔여 2,000
    expect(run(c, PHARM, 400000, L, true)).toBe(0);       // 같은 한도 소진
    expect(run(c, SWIM, 390000)).toBe(0);                 // 40만원 미만
  });
  it("약국 5%, 커피전문점 5%, 현대백화점은 KB Pay일 때만 10%", () => {
    expect(run(c, PHARM, 400000)).toBe(550);
    expect(run(c, CAFE, 400000)).toBe(535);
    expect(run(c, DEPT, 400000)).toBe(0);
    expect(run(c, { ...DEPT, payMethod: "issuer_pay" }, 400000)).toBe(1000);
    expect(run(c, { ...SWIM, payMethod: "issuer_pay" }, 400000)).toBe(5000); // 스포츠 2,500 + KB Pay 건당 2,500
  });
});

describe("신한 Discount Plan+ (40만원 구간)", () => {
  const c = card("shinhan_discountplan_plus");
  it("피트니스 5%: 일 1회, 정기결제 통합 월 5천원", () => {
    const L = emptyLedger();
    expect(run(c, SWIM, 400000, L, true)).toBe(2500);
    expect(run(c, LESSON, 400000, L, true)).toBe(0);                      // 같은 날 2번째
    expect(run(c, { ...LESSON, date: "2026-10-06" }, 400000, L, true)).toBe(500);
    expect(run(c, { ...SWIM_GYM, date: "2026-10-07" }, 400000, L, true)).toBe(2000); // 3,500 → 잔여 2,000
    expect(run(c, SWIM_GYM, 400000)).toBe(3500);
  });
  it("약국 5% (생활 영역), 카페·현대백화점은 대상 아님", () => {
    expect(run(c, PHARM, 400000)).toBe(550);
    expect(run(c, { ...CAFE, paidAt: "10:00" }, 400000)).toBe(0); // 지정 7개 브랜드만
    expect(run(c, DEPT, 400000)).toBe(0);
    expect(run(c, { merchant: "스타벅스 강남점", merchantIndustry: "cafe", amount: 6000, paidAt: "10:00" }, 400000)).toBe(600);
  });
});

describe("신세계 BC 바로 SEVEN FLEX (30만원 구간)", () => {
  const c = card("bc_sevenflex");
  it("운동·약국 7%, 월 통합 1만원", () => {
    const L = emptyLedger();
    expect(run(c, SWIM, 300000, L, true)).toBe(3500);
    expect(run(c, LESSON, 300000, L, true)).toBe(700);
    expect(run(c, SWIM_GYM, 300000, L, true)).toBe(4900);
    expect(run(c, PHARM, 300000, L, true)).toBe(770); // 잔여 900원 안
  });
  it("약국 7%, 카페 일반 매장·현대백화점 0원, 신세계백화점 7%", () => {
    expect(run(c, PHARM, 300000)).toBe(770);
    expect(run(c, CAFE, 300000)).toBe(0);
    expect(run(c, DEPT, 300000)).toBe(0);
    expect(run(c, { merchant: "신세계백화점 강남점", merchantIndustry: "department", amount: 10000 }, 300000)).toBe(700);
    expect(run(c, SWIM, 290000)).toBe(0);
  });
});
