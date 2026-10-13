/* 어드민 공용 로직: 원문 대조(양방향 포함), 자동 검증 경고, 목록 행의 링크·집계, 승인 카드 만들기, JSON 수정 검증 */
import { describe, expect, it } from "vitest";
import { CARDS, cardById } from "../../lib/data/cards";
import { calcCard, emptyLedger } from "../../lib/engine";
import type { BenefitRule, CardProduct, Transaction } from "../../lib/types";
import { adminRows, approvedCard, countSt, parseDraft, parseRule, rawLines, sameClause, tiersOf, versionsOf, warn, withoutRule } from "./admin";

const ml = cardById("shinhan_mrlife")!;
const rule = (rawText: string, extra: Partial<BenefitRule> = {}): BenefitRule =>
  ({ ...ml.rules[0], id: `r_${rawText.length}`, rawText, confidence: 0.95, ...extra });

describe("원문 대조", () => {
  it("글머리표·띄어쓰기가 달라도 같은 조항으로 본다", () => {
    expect(sameClause("· 스타벅스  50% 할인 (월 1만원)", "스타벅스 50%할인(월 1만원)")).toBe(true);
    expect(sameClause("1. 영화 5천원 청구할인", "영화 5천원 청구할인")).toBe(true);
  });
  it("소수의 정수부는 번호 글머리표가 아니다 (0.5%와 1.5%는 다른 조항)", () => {
    expect(sameClause("· 0.5% 적립", "1.5% 적립")).toBe(false);
    expect(sameClause("국내 가맹점 0.7% 적립", "1.7% 적립")).toBe(false);
  });
  it("한 줄을 여러 규칙으로 나누거나, 여러 줄을 한 문장으로 합쳐도 맞춘다", () => {
    expect(sameClause("커피전문점 30% · 배달앱 10% 할인", "배달앱 10% 할인")).toBe(true); // 줄 ⊃ 근거
    expect(sameClause("주말 마트 10% 할인", "주말 마트 10% 할인 월 1만원 한도")).toBe(true); // 근거 ⊃ 줄
  });
  it("너무 짧은 줄은 아무 규칙에나 붙지 않는다", () => {
    expect(sameClause("혜택", "혜택 안내 스타벅스 50%")).toBe(false);
  });
  it("규칙으로 바뀌지 않은 줄을 찾는다", () => {
    const raw = "· 스타벅스 50% 할인\n\n· 무이자할부 이용 시 할인 제외\n· 영화 5천원 할인";
    const lines = rawLines(raw, [rule("스타벅스 50% 할인"), rule("영화 5천원 할인")]);
    expect(lines).toHaveLength(3); // 빈 줄은 뺀다
    expect(lines.filter((l) => !l.rules.length).map((l) => l.line)).toEqual(["· 무이자할부 이용 시 할인 제외"]);
  });
});

describe("자동 검증 경고", () => {
  it("원문을 주면 근거 문장이 원문에 없는 규칙(바꿔 쓰거나 지어낸 문장)을 경고한다", () => {
    const raw = "· 스타벅스 50% 할인 (월 1회)";
    const missing = "근거 문장을 원문에서 찾지 못했어요";
    expect(warn(rule("스타벅스 50% 할인"), raw).some((w) => w.includes(missing))).toBe(false);
    expect(warn(rule("스타벅스 60% 할인"), raw).some((w) => w.includes(missing))).toBe(true);
    expect(warn(rule("스타벅스 60% 할인")).some((w) => w.includes(missing))).toBe(false); // 원문이 없는 데모 카드는 대조 안 함
  });
  it("신뢰도가 낮으면 경고한다", () => {
    expect(warn(rule("스타벅스 50% 할인", { confidence: 0.4 })).some((w) => w.includes("신뢰도 40%"))).toBe(true);
  });
});

describe("카드 목록 행", () => {
  const rows = adminRows(CARDS);
  it("카드마다 자기 화면으로 간다 (모든 검수·보기가 같은 카드를 열던 문제)", () => {
    for (const c of CARDS) {
      const r = rows.find((x) => x.id === c.id)!;
      if (c.reviewStatus === "approved") expect(r.href).toBe(`/admin/rules?id=${c.id}`);
      if (c.reviewStatus === "pending") expect(r.href).toBe(`/admin/review?id=${c.id}`);
    }
    const hrefs = rows.map((r) => r.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });
  it("사용자가 직접 추가한 개인 카드(검수 없음)는 카드 상품 목록에 넣지 않는다", () => {
    const mine = { ...ml, id: "custom_mine", reviewStatus: "none" as const };
    expect(adminRows([...CARDS, mine]).some((r) => r.id === mine.id)).toBe(false);
    expect(adminRows([...CARDS, { ...mine, reviewStatus: "approved" as const }]).some((r) => r.id === mine.id)).toBe(true);
  });
  it("상태별 개수의 합 = 전체", () => {
    const n = countSt(rows);
    expect(n.approved + n.pending + n.none).toBe(rows.length);
    expect(n.pending).toBe(CARDS.filter((c) => c.reviewStatus === "pending").length);
  });
});

describe("검수 → 반영", () => {
  it("실적 구간: 겹친 구간은 하나로, 0원부터가 아니면 그 미만 구간을 채운다", () => {
    const t = tiersOf(ml.rules);
    expect(t[0]).toEqual({ min: 0, max: 300000 });
    expect(new Set(t.map((x) => x.min)).size).toBe(t.length);
    expect(tiersOf([])).toEqual([{ min: 0, max: null }]);
    expect(tiersOf(ml.rules)).toEqual(ml.tiers);
  });
  it("조건 없음 규칙 + 30만원 이상 규칙 → 50만원에서 둘 다 적용 (겹친 구간 때문에 30만 규칙이 막히던 문제)", () => {
    const base = { cardId: "", confidence: 0.95, supported: true, rawText: "근거 문장" };
    const a: BenefitRule = { ...base, id: "a", name: "기본 적립", kind: "point", rate: 0.005, target: {}, limitsByTier: [{ tier: { min: 0, max: null } }] };
    const b: BenefitRule = { ...base, id: "b", name: "카페 할인", kind: "discount", rate: 0.1, target: { categories: ["cafe"] }, limitsByTier: [{ tier: { min: 300000, max: null }, monthlyCap: 10000 }] };
    const card: CardProduct = approvedCard({ id: "custom_t", issuer: "신한카드", name: "t", grade: "B", sourceUrl: "https://a", checkedAt: "2026-10-01", validFrom: "" }, [a, b]);
    expect(card.tiers).toEqual([{ min: 0, max: 300000 }, { min: 300000, max: null }]);
    const t: Transaction = { id: "x", type: "expense", amount: 10000, currency: "KRW", date: "2026-09-20", merchant: "스타벅스", merchantIndustry: "cafe", categoryId: "etc", payType: "credit", cardId: card.id };
    const run = (prev: number) => calcCard(t, card, { cardId: card.id, addedAt: "2026-08-01" }, prev, emptyLedger(), "2026-09", [], true).total;
    expect(run(500000)).toBe(1050);
    expect(run(100000)).toBe(50);
  });
  it("혜택 삭제: 그 규칙만 빠지고 실적 구간 · 등급을 남은 규칙으로 다시 정한다 · 출처는 그대로", () => {
    const base = { cardId: "", confidence: 0.95, supported: true, rawText: "근거 문장" };
    const a: BenefitRule = { ...base, id: "a", name: "기본 적립", kind: "point", rate: 0.005, target: {}, limitsByTier: [{ tier: { min: 0, max: null } }] };
    const b: BenefitRule = { ...base, id: "b", name: "카페 할인", kind: "discount", rate: 0.1, target: { categories: ["cafe"] }, limitsByTier: [{ tier: { min: 300000, max: null }, monthlyCap: 10000 }] };
    const card = approvedCard({ id: "custom_d", issuer: "신한카드", name: "d", sourceUrl: "https://card.example/d", checkedAt: "2026-10-01", validFrom: "" }, [a, b]);
    const left = withoutRule(card, "b");
    expect(left.rules.map((r) => r.id)).toEqual(["a"]);
    expect(left.tiers).toEqual([{ min: 0, max: null }]);
    expect(left.grade).toBe("A");
    expect(left.sourceUrl).toBe("https://card.example/d");
    expect(withoutRule(card, "없는 id").rules).toHaveLength(2);
    expect(withoutRule(left, "a").rules).toEqual([]);
  });
  it("원문을 붙여 넣어 만든 카드도 출처 URL을 저장한다(원문만 반영되고 출처가 빠지던 신고)", () => {
    const form = { id: "custom_s", issuer: "신한카드", name: "s", sourceUrl: "https://card.example/s", checkedAt: "2026-10-01", validFrom: "", text: "카페 10% 할인" };
    const { text: _text, ...d } = form;
    void _text;
    expect(approvedCard(d, [rule("카페 10% 할인")]).sourceUrl).toBe("https://card.example/s");
  });
  it("승인 카드: 카드 id로 묶고, 유효 시작일은 규칙에 없을 때만 채운다", () => {
    const d = { id: "custom_x", issuer: "신한카드", name: "테스트", grade: "B" as const, sourceUrl: "https://a", checkedAt: "2026-10-01", validFrom: "2026-11-01" };
    const c = approvedCard(d, [rule("가 할인 규칙"), rule("나 할인 규칙", { validFrom: "2026-12-01" })]);
    expect(c.reviewStatus).toBe("approved");
    expect(c.rules.every((r) => r.cardId === "custom_x")).toBe(true);
    expect(c.rules.map((r) => r.validFrom)).toEqual(["2026-11-01", "2026-12-01"]);
  });
  it("버전은 유효 시작일별로, 최근 것부터", () => {
    expect(versionsOf([rule("가 할인 규칙"), rule("나 할인 규칙", { validFrom: "2026-07-01" }), rule("다 할인 규칙", { validFrom: "2026-07-01" })])).toEqual([["2026-07-01", 2], ["", 1]]);
  });
  it("예전 형식의 초안은 버린다", () => {
    expect(parseDraft(JSON.stringify({ cardName: "x", rawText: "y", rules: [] }))).toBeNull();
    expect(parseDraft("{깨짐")).toBeNull();
  });
});

describe("규칙 JSON 수정", () => {
  const prev = ml.rules[0];
  it("JSON이 아니거나 필수 필드가 없으면 안내 문구", () => {
    expect(typeof parseRule("{", prev)).toBe("string");
    expect(typeof parseRule(JSON.stringify({ ...prev, limitsByTier: undefined }), prev)).toBe("string");
    expect(typeof parseRule(JSON.stringify({ ...prev, kind: "gift" }), prev)).toBe("string");
  });
  it("id·카드는 고칠 수 없고, 나머지는 고친 값이 들어간다", () => {
    const r = parseRule(JSON.stringify({ ...prev, id: "other", cardId: "other", rate: 0.2 }), prev);
    expect(typeof r).toBe("object");
    expect(r).toMatchObject({ id: prev.id, cardId: prev.cardId, rate: 0.2 });
  });
});
