/* 알림 파생 테스트: 실적 구간 90%, 놓친 혜택 — 그리고 같은 상황이면 같은 id */
import { describe, expect, it } from "vitest";
import { deriveNotifications } from "./notify";
import { computeMonth, type MonthCalc } from "./engine";
import { CARDS } from "./data/cards";
import { SEED_TXNS, SEED_USER_CARDS, TODAY } from "./data/fixtures";
import type { Transaction } from "./types";

const tx = (p: Partial<Transaction>): Transaction => ({ id: "x", type: "expense", amount: 10000, currency: "KRW", date: "2026-09-10", merchant: "가게", categoryId: "food.cafe", payType: "cash", ...p });
// calc는 기본으로 실제 엔진 결과를 넘긴다 — 빈 calc를 넘기면 엔진 thisSpend(마감된 창)로 판단하던 예전 구현도 실적 검증을 통과해 버린다
const run = (o: { txns?: Transaction[]; calc?: MonthCalc; cardIds?: string[]; cycle?: number }) => {
  const txns = o.txns ?? [];
  const userCards = (o.cardIds ?? []).map((cardId) => ({ cardId, addedAt: "2026-08-01", statementCycleDay: o.cycle }));
  return deriveNotifications({
    calc: o.calc ?? computeMonth("2026-09", txns, userCards, CARDS),
    userCards, txns, month: "2026-09", today: "2026-09-20",
  });
};

describe("deriveNotifications", () => {
  it("실적: 다음 구간 목표(Mr.Life 30만)의 90% 이상일 때만, 카드 상세로 연결", () => {
    const pay = (amount: number, date = "2026-09-15") => [tx({ id: "p", amount, date, payType: "credit", cardId: "shinhan_mrlife" })];
    const hit = run({ txns: pay(270000), cardIds: ["shinhan_mrlife"] });
    expect(hit.map((x) => x.id)).toEqual(["tierSoon:shinhan_mrlife:300000:2026-10"]);
    expect([hit[0].title, hit[0].sub]).toEqual(["신한 Mr.Life 실적 구간까지 30,000원 남았어요", "10월 30~50만원 구간 · 9월 실적 270,000원"]);
    expect(hit[0].href).toBe("/cards/shinhan_mrlife");
    expect(run({ txns: pay(269999), cardIds: ["shinhan_mrlife"] })).toEqual([]);
    expect(run({ txns: pay(1000000), cardIds: ["shinhan_mrlife"] })).toEqual([]); // 최고 구간 달성
  });

  it("실적: 사이클 카드(10일)는 9/20에 이미 마감된 8/10~9/9 창이 아니라 지금 쌓는 9/10~10/9 창으로 판단 (카드 목록과 같은 숫자)", () => {
    // run이 실제 computeMonth를 넘기므로 엔진 thisSpend는 8/10~9/9 창의 280,000 (90% 넘음) — 그 값을 쓰면 여기서 알림이 생긴다
    const closed = run({ txns: [tx({ id: "p", amount: 280000, date: "2026-09-05", payType: "credit", cardId: "shinhan_mrlife" })], cardIds: ["shinhan_mrlife"], cycle: 10 });
    expect(closed).toEqual([]);
    const open = run({ txns: [tx({ id: "p", amount: 280000, date: "2026-09-15", payType: "credit", cardId: "shinhan_mrlife" })], cardIds: ["shinhan_mrlife"], cycle: 10 });
    expect(open.map((x) => [x.id, x.sub])).toEqual([["tierSoon:shinhan_mrlife:300000:2026-11", "11월 30~50만원 구간 · 9/10~10/9 실적 280,000원"]]);
  });

  it("놓친 혜택: 1,000원 이상만 상위 3건, 지워진 거래는 건너뜀", () => {
    const calc = { cards: {}, missedTop: [{ txnId: "gone", diff: 9000, bestCardId: "hyundai_zero3" }, { txnId: "a", diff: 5000, bestCardId: "hyundai_zero3" }, { txnId: "b", diff: 999, bestCardId: "hyundai_zero3" }] } as unknown as MonthCalc;
    const n = run({ txns: [tx({ id: "a", merchant: "스타벅스" }), tx({ id: "b" })], calc });
    expect(n.map((x) => x.id)).toEqual(["missed:a"]);
    expect(n[0].title).toBe("스타벅스 결제에서 혜택 5,000원을 놓쳤어요");
  });

  it("시드 9월: 두 번 만들어도 id가 같다", () => {
    const make = () => deriveNotifications({ calc: computeMonth("2026-09", SEED_TXNS, SEED_USER_CARDS, CARDS), userCards: SEED_USER_CARDS, txns: SEED_TXNS, month: "2026-09", today: TODAY });
    const a = make();
    expect(a.map((x) => x.id)).toEqual(make().map((x) => x.id));
    expect(new Set(a.map((x) => x.id)).size).toBe(a.length);
  });
});
