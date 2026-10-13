/* 거래 기록 규칙 테스트 — 환불 가능액, 합계 부호, 검색, 카테고리 검증, 실적 창, 수정 미리보기 */
import { describe, expect, it } from "vitest";
import { matches, netExpense, refundedOf, refundLeft, searchTxns, signedSum, spendYmOf, splitMatch } from "./txn-rules";
import { CARDS } from "./cards";
import { SEED_TXNS, SEED_USER_CARDS } from "./fixtures";
import { computeMonth, isCardExpense, monthSpend, previewTxn, spendWindow } from "../engine";
import type { Transaction } from "../types";

const tx = (p: Partial<Transaction>): Transaction => ({ id: "x", type: "expense", amount: 10000, currency: "KRW", date: "2026-09-12", merchant: "테스트", categoryId: "etc", payType: "credit", cardId: "hyundai_zero3", ...p });
const orig = tx({ id: "o1", amount: 89000, merchant: "무신사" });
const r1 = tx({ id: "r1", amount: 29000, merchant: "무신사 · 부분 환불", originalTxnId: "o1", date: "2026-09-19" });

describe("환불 가능액", () => {
  it("원금 − 기존 환불 합", () => {
    expect(refundedOf("o1", [orig, r1])).toBe(29000);
    expect(refundLeft(orig, [orig, r1])).toBe(60000);
  });
  it("수정 중인 환불 자신은 빼고 센다", () => expect(refundLeft(orig, [orig, r1], "r1")).toBe(89000));
  it("이미 원금 이상 환불됐으면 0 (음수 아님)", () => expect(refundLeft(orig, [orig, r1, tx({ id: "r2", amount: 89000, originalTxnId: "o1" })])).toBe(0));
  it("외화 원거래는 원화 환산액 기준", () => {
    const usd = tx({ id: "u1", amount: 10, currency: "USD", amountKrw: 13500 });
    expect(refundLeft(usd, [usd, tx({ id: "ur", amount: 3500, originalTxnId: "u1" })])).toBe(10000);
  });
});

describe("합계 부호", () => {
  const list = [tx({ id: "i", type: "income", amount: 100000, payType: "transfer", cardId: undefined }), orig, r1];
  it("행 부호 합: 수입·환불 +, 지출 −", () => expect(signedSum(list)).toBe(100000 - 89000 + 29000));
  it("순지출: 환불은 빼고 수입은 넣지 않음", () => expect(netExpense(list)).toBe(60000));
});

describe("검색", () => {
  const all = [tx({ id: "a", merchant: "CU 역삼점" }), orig, r1, tx({ id: "m", merchant: "스타벅스", memo: "팀 회의 Coffee", items: ["아메리카노"] })];
  const f = { merchant: true, memo: true, items: true };
  it("대소문자·앞뒤 공백 무시", () => {
    expect(searchTxns(all, "cu", f).map((t) => t.id)).toEqual(["a"]);
    expect(searchTxns(all, "무신사 ", f)).toHaveLength(2);
    expect(searchTxns(all, "coffee", f).map((t) => t.id)).toEqual(["m"]);
  });
  it("필드를 끄면 그 필드는 안 찾는다", () => expect(searchTxns(all, "아메리카노", { ...f, items: false })).toHaveLength(0));
  it("검색 합계는 환불을 뺀 순지출", () => expect(netExpense(searchTxns(all, "무신사", f))).toBe(60000));
  it("강조 조각은 원래 대소문자 그대로, 특수문자는 글자로", () => {
    expect(splitMatch("CU 역삼점", "cu")).toEqual(["", "CU", " 역삼점"]);
    expect(splitMatch("(주)카드셈 (주)", "(주)")).toEqual(["", "(주)", "카드셈 ", "(주)", ""]);
    expect(matches(undefined, "a")).toBe(false);
    expect(matches("abc", "  ")).toBe(false);
  });
});

describe("결제가 속한 실적 창", () => {
  it("달력 월이면 그 달", () => expect(spendYmOf("2026-09-15")).toBe("2026-09"));
  it("10일 사이클: 10일 이후는 다음 달 창, 9일까지는 그 달 창", () => {
    expect(spendYmOf("2026-09-15", 10)).toBe("2026-10");
    expect(spendYmOf("2026-09-09", 10)).toBe("2026-09");
    expect(spendYmOf("2026-12-20", 10)).toBe("2027-01");
  });
  it("돌려준 달의 창에 결제일이 들어간다", () => {
    for (const [d, c] of [["2026-09-15", 10], ["2026-09-09", 10], ["2026-09-10", 10], ["2026-02-28", 25]] as const) {
      const w = spendWindow(spendYmOf(d, c), c);
      expect(d >= w.from && d <= w.to).toBe(true);
    }
  });
  // 환불 화면 미리보기는 spendYmOf(환불일)의 창을 보여준다 — 엔진이 환불을 환불한 날의 창에서 빼기 때문
  it("환불일이 다른 창이면 그 창의 monthSpend가 줄고 원결제 창은 그대로", () => {
    const card = CARDS.find((c) => c.id === "hyundai_zero3");
    const before = [orig, tx({ id: "p2", amount: 50000, date: "2026-10-05" })];
    const after = [...before, tx({ id: "r9", amount: 29000, originalTxnId: "o1", date: "2026-10-09" })];
    const spend = (l: Transaction[], ym: string, c?: number) => monthSpend(l, "hyundai_zero3", ym, card, c);
    for (const c of [undefined, 25]) {
      const ry = spendYmOf("2026-10-09", c), oy = spendYmOf(orig.date, c);
      expect(ry).not.toBe(oy);
      expect(spend(before, ry, c) - spend(after, ry, c)).toBe(29000);
      expect(spend(after, oy, c)).toBe(spend(before, oy, c));
    }
  });
});

describe("수정 화면 예상 혜택 (자기 자신이 쓴 한도·횟수는 빼고 계산)", () => {
  it("시드 9월 카드 결제마다 미리보기 = 저장된 계산값", () => {
    const calc = computeMonth("2026-09", SEED_TXNS, SEED_USER_CARDS, CARDS);
    const sept = SEED_TXNS.filter((t) => t.date.startsWith("2026-09") && isCardExpense(t));
    expect(sept.length).toBeGreaterThan(10);
    for (const t of sept) {
      const p = previewTxn(t, calc, SEED_USER_CARDS, CARDS, SEED_TXNS, { excludeId: t.id }).find((x) => x.cardId === t.cardId);
      expect([t.id, p?.calc.total]).toEqual([t.id, calc.byTxn[t.id].mine?.total]);
    }
  });
  // 원거래의 환불은 남기고 자기 자신만 빼야 환불 뒤 금액으로 계산된다 (t034 무신사: 저장값 = 미리보기 = 720원)
  it("부분 환불된 원거래도 미리보기 = 저장값", () => {
    const refunded = SEED_TXNS.filter((t) => isCardExpense(t) && SEED_TXNS.some((r) => r.originalTxnId === t.id));
    expect(refunded.length).toBeGreaterThan(0);
    for (const t of refunded) {
      const calc = computeMonth(t.date.slice(0, 7), SEED_TXNS, SEED_USER_CARDS, CARDS);
      const p = previewTxn(t, calc, SEED_USER_CARDS, CARDS, SEED_TXNS, { excludeId: t.id }).find((x) => x.cardId === t.cardId);
      expect([t.id, p?.calc.total]).toEqual([t.id, calc.byTxn[t.id].mine?.total]);
    }
  });
});
