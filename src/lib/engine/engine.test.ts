/* 경계값 테스트 — [구현 계획서] 9.1절 */
import { describe, expect, it } from "vitest";
import { calcCard, computeMonth, emptyLedger, krw, monthSpend, previewTxn, resolveTier, spendOverrideOf, spendWindow, spendWindowLabel, timeIn } from "./index";
import { CARDS, cardById } from "../data/cards";
import { INDUSTRY } from "../data/merchants";
import { SEED_TXNS, SEED_USER_CARDS } from "../data/fixtures";
import type { BenefitRule, CardProduct, Transaction, UserCard } from "../types";

const ML = cardById("shinhan_mrlife")!, PP = cardById("shinhan_pointplan")!, HZ = cardById("hyundai_zero3")!;
const uc = (cardId: string, extra: Partial<UserCard> = {}): UserCard => ({ cardId, addedAt: "2026-08-01", ...extra });
const tx = (p: Partial<Transaction>): Transaction => ({ id: "x", type: "expense", amount: 10000, currency: "KRW", date: "2026-09-20", merchant: "테스트", categoryId: "etc", payType: "credit", cardId: "shinhan_mrlife", ...p });
const run = (t: Transaction, card = ML, prev = 600000, ledger = emptyLedger(), all: Transaction[] = []) => calcCard(t, card, uc(card.id), prev, ledger, "2026-09", all, true);

describe("실적 구간", () => {
  it("경계 바로 아래·위 (29만9천 / 30만 / 50만)", () => {
    expect(resolveTier(299999, ML.tiers)).toEqual({ min: 0, max: 300000 });
    expect(resolveTier(300000, ML.tiers)).toEqual({ min: 300000, max: 500000 });
    expect(resolveTier(500000, ML.tiers)).toEqual({ min: 500000, max: 1000000 });
  });
  it("구간에 혜택이 없으면 건너뜀 (Point Plan 40만 미만)", () => {
    const r = run(tx({ merchant: "무신사", amount: 50000, cardId: PP.id }), PP, 350000);
    expect(r.total).toBe(0);
    expect(r.blocked[0].reason).toContain("혜택 없음");
  });
  it("전월 실적: 수입 제외, 취소 차감, 제외 업종 제외", () => {
    const all: Transaction[] = [
      tx({ id: "a", amount: 100000, date: "2026-08-10" }),
      tx({ id: "b", amount: 30000, date: "2026-08-12", originalTxnId: "a" }),
      tx({ id: "c", type: "income", amount: 999999, date: "2026-08-15", payType: "transfer" }),
      tx({ id: "d", amount: 50000, date: "2026-08-20", merchant: "문화상품권" }),
    ];
    expect(monthSpend(all, ML.id, "2026-08", ML)).toBe(70000);
  });
});

describe("규칙 계산", () => {
  it("대상 금액 상한 → 할인 상한 순서 (공과금 6만원 → 5만원까지 10% = 5,000)", () => {
    const r = run(tx({ merchant: "한국전력 전기요금", amount: 60000 }));
    expect(r.total).toBe(5000);
  });
  it("시간대가 자정을 넘는 경우 (21:00~09:00)", () => {
    expect(run(tx({ merchant: "카카오T 택시", amount: 8000, paidAt: "23:55" })).total).toBe(800);
    expect(run(tx({ merchant: "카카오T 택시", amount: 8000, paidAt: "08:30" })).total).toBe(800);
    expect(run(tx({ merchant: "카카오T 택시", amount: 8000, paidAt: "13:00" })).total).toBe(0);
  });
  it("조건 필드가 비면 그 규칙만 건너뛰고 상한을 알려줌 (BNF-05)", () => {
    const r = run(tx({ merchant: "카카오T 택시", amount: 8000 }));
    expect(r.total).toBe(0);
    expect(r.skipped[0]).toMatchObject({ field: "paidAt", maxExtra: 800 });
  });
  it("계단식에서 딱 떨어지지 않는 금액 (63,000원 → 3천P)", () => {
    const r = run(tx({ merchant: "SKT 통신요금", amount: 63000, isAutoPay: true, cardId: PP.id }), PP, 500000);
    expect(r.applied.find((a) => a.ruleId === "pp_autopay_telecom")?.amount).toBe(3000); // 통신은 에너지(pp_autopay)와 나뉜 영역
  });
  it("금액 구간별 적립률 (Point Plan 10만원 → 1.0%)", () => {
    const r = run(tx({ merchant: "무신사", amount: 100000, cardId: PP.id }), PP, 500000);
    expect(r.total).toBe(1000);
  });
  it("리터당 할인: 주유량 있으면 계산, 없으면 건너뜀", () => {
    expect(run(tx({ merchant: "GS칼텍스", amount: 70000, fuelLiters: 40, date: "2026-09-19" })).total).toBe(2400);
    const r = run(tx({ merchant: "GS칼텍스", amount: 70000, date: "2026-09-19" }));
    expect(r.total).toBe(0); expect(r.skipped[0].field).toBe("fuelLiters");
  });
  it("요일 조건 + 공휴일 제외 (추석 9/26 토요일은 마트 할인 제외)", () => {
    expect(run(tx({ merchant: "이마트", amount: 40000, date: "2026-09-19" })).total).toBe(4000);
    expect(run(tx({ merchant: "이마트", amount: 40000, date: "2026-09-26" })).total).toBe(0);
  });
  it("무이자 할부는 제외 규칙 미적용, ZERO는 제외 조항 없어 적용", () => {
    expect(run(tx({ merchant: "무신사", amount: 90000, cardId: PP.id, installmentMonths: 3, isInterestFree: true }), PP, 500000).total).toBe(0);
    expect(run(tx({ merchant: "무신사", amount: 90000, cardId: HZ.id, installmentMonths: 3, isInterestFree: true }), HZ, 0).total).toBe(1080);
  });
});

describe("한도·횟수·중복", () => {
  it("일 횟수 소진 뒤 두 번째 결제", () => {
    const L = emptyLedger();
    expect(run(tx({ merchant: "CU 역삼점", amount: 5000 }), ML, 600000, L).total).toBe(500);
    expect(run(tx({ merchant: "CU 역삼점", amount: 5000 }), ML, 600000, L).blocked[0].reason).toContain("일 1회");
  });
  it("통합 한도 그룹에서 두 규칙이 한도를 나눠 씀 (All Day 30~50만 구간 1만원)", () => {
    const L = emptyLedger();
    for (let d = 1; d <= 5; d++) run(tx({ merchant: "CU", amount: 10000, date: `2026-09-0${d}` }), ML, 400000, L); // 5 × 1,000
    for (let d = 6; d <= 9; d++) run(tx({ merchant: "온누리약국", amount: 10000, date: `2026-09-0${d}` }), ML, 400000, L); // 4 × 1,000 → 9,000
    const r = run(tx({ merchant: "온누리약국", amount: 10000, date: "2026-09-10" }), ML, 400000, L);
    expect(r.total).toBe(1000);
    expect(run(tx({ merchant: "크린토피아", amount: 10000, date: "2026-09-11" }), ML, 400000, L).blocked[0].reason).toContain("소진");
  });
  it("중복 허용 쌍은 합산, 배타 쌍은 큰 쪽만 (Point Plan)", () => {
    const weekend = run(tx({ merchant: "을지로 골목집", amount: 48000, date: "2026-09-06", cardId: PP.id }), PP, 500000);
    expect(weekend.applied.map((a) => a.ruleId).sort()).toEqual(["pp_domestic", "pp_weekend"]);
    expect(weekend.total).toBe(1000 + 336);
    const auto = run(tx({ merchant: "한국전력", amount: 52000, isAutoPay: true, cardId: PP.id }), PP, 500000);
    expect(auto.applied.map((a) => a.ruleId)).toEqual(["pp_autopay"]);
    expect(auto.total).toBe(2000);
  });
  it("월 특례: 12월 일상 적립 한도 +1만", () => {
    const r = calcCard(tx({ merchant: "무신사", amount: 1500000, cardId: PP.id, date: "2026-12-05" }), PP, uc(PP.id), 500000, emptyLedger(), "2026-12", [], true);
    expect(r.total).toBe(20000); // 3% = 45,000 → 한도 10,000 + 10,000
  });
  it("부분 환불 후 원거래 재계산", () => {
    const orig = tx({ id: "o", merchant: "무신사", amount: 100000, cardId: PP.id });
    const refund = tx({ id: "r", amount: 40000, originalTxnId: "o", cardId: PP.id });
    expect(run(orig, PP, 500000, emptyLedger(), [orig, refund]).total).toBe(420); // 6만원 → 0.7%
  });
  it("사용자 실적 보정값 우선", () => {
    const calc = computeMonth("2026-09", SEED_TXNS, [uc(ML.id, { spendTierOverride: 1200000 })], CARDS);
    expect(calc.cards[ML.id].tier).toEqual({ min: 1000000, max: null });
  });
});

describe("월 계산", () => {
  const calc = computeMonth("2026-09", SEED_TXNS, SEED_USER_CARDS, CARDS);
  it("수입·현금·환불은 계산 대상이 아님", () => {
    expect(computeMonth("2026-08", SEED_TXNS, SEED_USER_CARDS, CARDS).byTxn["i001"]).toBeUndefined(); // 8/25 급여
    expect(calc.byTxn["c001"]).toBeUndefined();
    expect(calc.byTxn["r001"]).toBeUndefined();
  });
  it("받은 혜택 ≤ 받을 수 있었던 혜택, 차액 = 놓친 합계", () => {
    expect(calc.received).toBeGreaterThan(0);
    expect(calc.could).toBeGreaterThanOrEqual(calc.received);
    expect(calc.missed).toBe(calc.could - calc.received);
  });
  const seedId = (date: string, merchant: string) => SEED_TXNS.find((t) => t.date === date && t.merchant.startsWith(merchant))!.id;
  it("최적 카드 비교: 평일 주유(주유량 미입력)는 Mr.Life 주말 주유 할인 대상이 아니라 0, 카드 3장 모두 비교됨", () => {
    const r = calc.byTxn[seedId("2026-09-14", "GS칼텍스")];
    expect(r.compare).toHaveLength(3);
    expect(r.compare.find((c) => c.cardId === ML.id)).toMatchObject({ amount: 0, note: "요일 조건 불일치" });
  });
  it("시드 환불은 같은 카드·같은 가맹점의 원거래에 붙어 있다 (r001 → 9/12 무신사)", () => {
    for (const r of SEED_TXNS.filter((t) => t.originalTxnId)) {
      const o = SEED_TXNS.find((t) => t.id === r.originalTxnId)!;
      expect(o.cardId).toBe(r.cardId);
      expect(r.merchant.startsWith(o.merchant)).toBe(true);
    }
    expect(calc.byTxn[seedId("2026-09-12", "무신사")].mine!.total).toBe(720); // (89,000 − 29,000) × 1.2%
    expect(calc.byTxn[seedId("2026-09-09", "쿠팡")].mine!.total).toBe(696);   // 58,000 × 1.2% (환불과 무관)
    expect([calc.received, calc.could, calc.missed]).toEqual([18468, 21713, 3245]);
  });
  it("결제 1건 계산이 200ms 이내 (BNF-07)", () => {
    const s = performance.now();
    for (let i = 0; i < 200; i++) run(tx({ merchant: "스타벅스", amount: 6100, paidAt: "22:00" }));
    expect((performance.now() - s) / 200).toBeLessThan(200);
  });
});

/* 정성 혜택은 규칙이 아니라 카드 정보 — 계산에도, "계산 불가"에도 섞이면 안 됨 */
describe("정성 혜택 (perks)", () => {
  const KW = cardById("kb_youwishup")!, SP = cardById("shinhan_simpleplan")!;
  it("perks가 있는 카드도 계산은 규칙만 본다 (unsupported에 섞이지 않음)", () => {
    expect(KW.perks!.length).toBe(2); // 연 1회 쿠폰 · Mastercard 라운지
    const r = run(tx({ cardId: KW.id, merchant: "캐시닥약국", merchantIndustry: "pharmacy", amount: 10000 }), KW, 400000);
    expect(r.total).toBe(500); // 1만 × 병원·약국·스포츠 5%
    const perkIds = KW.perks!.map((p) => p.id); // 계산 못 하는 '규칙'(주차·세차)은 나올 수 있지만 정성 혜택은 섞이면 안 됨
    expect(r.unsupported.filter((u) => perkIds.includes(u.ruleId))).toEqual([]);
    expect(r.applied.map((a) => a.ruleId)).toEqual(["rp_kw_health"]);
  });
  it("정성 혜택은 규칙 목록에 들어가지 않는다", () => {
    const perkIds = CARDS.flatMap((c) => c.perks ?? []).map((p) => p.id);
    const ruleIds = CARDS.flatMap((c) => c.rules).map((r) => r.id);
    expect(perkIds.length).toBeGreaterThan(0);
    expect(perkIds.filter((id) => ruleIds.includes(id))).toEqual([]);
  });
  it("검수 대기 규칙은 그대로 unsupported로 남는다 (정성 혜택과 구분)", () => {
    const r = run(tx({ cardId: SP.id, merchant: "무신사", amount: 50000 }), SP, 0);
    expect(r.unsupported).toEqual([{ ruleId: "sp_all", name: "국내외 정률 적립", reason: "적립률 원문 확인 전 · 검수 대기" }]);
    expect(SP.perks).toBeUndefined();
  });
});

/* 청구 사이클 실적 창 — 원장·한도는 그대로, 실적 집계 구간만 바뀐다 */
describe("실적 산정 창", () => {
  it("사이클이 없으면 달력 월 1일~말일", () => {
    expect(spendWindow("2026-09")).toEqual({ from: "2026-09-01", to: "2026-09-30" });
    expect(spendWindow("2026-02")).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(spendWindow("2026-09", 1)).toEqual({ from: "2026-09-01", to: "2026-09-30" }); // 1일 시작 = 달력 월
  });
  it("사이클 10일이면 전월 10일~당월 9일 (연 경계 포함)", () => {
    expect(spendWindow("2026-09", 10)).toEqual({ from: "2026-08-10", to: "2026-09-09" });
    expect(spendWindow("2026-01", 10)).toEqual({ from: "2025-12-10", to: "2026-01-09" });
  });
  it("창 경계는 양끝 포함, 밖은 제외", () => {
    const all = [
      tx({ id: "a", date: "2026-08-09", amount: 10000 }), tx({ id: "b", date: "2026-08-10", amount: 20000 }),
      tx({ id: "c", date: "2026-09-09", amount: 30000 }), tx({ id: "d", date: "2026-09-10", amount: 40000 }),
    ];
    expect(monthSpend(all, ML.id, "2026-09", ML, 10)).toBe(50000); // b + c
    expect(monthSpend(all, ML.id, "2026-09", ML)).toBe(70000);     // 달력 9월 = c + d
  });
  it("computeMonth가 사이클 카드의 전월 실적을 창 기준으로 잡는다", () => {
    const cal = computeMonth("2026-09", SEED_TXNS, [uc(ML.id)], CARDS);
    const cyc = computeMonth("2026-09", SEED_TXNS, [uc(ML.id, { statementCycleDay: 10 })], CARDS);
    expect(cal.cards[ML.id].prevSpend).toBe(440400); // 달력 8월
    expect(cyc.cards[ML.id].prevSpend).toBe(404200); // 7/10~8/9
    expect(cyc.cards[ML.id].tier).toEqual(cal.cards[ML.id].tier); // 시드는 두 경우 모두 30~50만 구간
  });
  it("실적 보정값은 사이클보다 우선", () => {
    const c = computeMonth("2026-09", SEED_TXNS, [uc(ML.id, { statementCycleDay: 10, spendTierOverride: 1200000 })], CARDS);
    expect(c.cards[ML.id].prevSpend).toBe(1200000);
    expect(c.cards[ML.id].tier).toEqual({ min: 1000000, max: null });
  });
  it("표기: 달력은 N월, 사이클은 기간", () => {
    expect(spendWindowLabel("2026-09")).toBe("9월");
    expect(spendWindowLabel("2026-09", 10)).toBe("8/10~9/9");
  });
});

/* ── 감사 회귀 테스트: 고치기 전에는 실패하던 입력 ── */
const SAT = "2026-09-19"; // 토요일

describe("업종과 가맹점이 둘 다 있으면 AND", () => {
  it("3대 마트가 아닌 마트·편의점에는 주말 마트 할인이 없다", () => {
    expect(run(tx({ merchant: "이마트24 역삼점", amount: 30000, date: SAT })).total).toBe(1000); // 편의점 All Day만
    expect(run(tx({ merchant: "코스트코 양재점", amount: 50000, date: SAT })).total).toBe(0);
    expect(run(tx({ merchant: "이마트 역삼점", amount: 40000, date: SAT })).total).toBe(4000); // 대조군
  });
  it("지정 몰이 아니면 Night 온라인쇼핑 할인 없음, 지정 몰은 적용", () => {
    expect(run(tx({ merchant: "네이버쇼핑", amount: 10000, paidAt: "22:00" })).total).toBe(0);
    expect(run(tx({ merchant: "쿠팡이츠", amount: 10000, paidAt: "22:00" })).total).toBe(0); // 배달 업종이라 '쿠팡' 부분일치로 붙지 않음
    expect(run(tx({ merchant: "쿠팡", amount: 10000, paidAt: "22:00" })).total).toBe(1000);
  });
  it("4대 정유사가 아닌 주유소, 지정 배달앱이 아닌 배달은 제외", () => {
    expect(run(tx({ merchant: "알뜰주유소", amount: 70000, fuelLiters: 40, date: SAT })).total).toBe(0);
    const pp = run(tx({ merchant: "쿠팡이츠", amount: 25000, date: SAT, cardId: PP.id, payChannel: "in_app", payMethod: "issuer_pay" }), PP, 500000);
    expect(pp.applied.map((a) => a.ruleId)).not.toContain("pp_delivery");
  });
});

describe("통합 횟수 (countGroupId)", () => {
  // 데이터에 들어간 값과 무관하게 엔진 동작만 확인
  const PPg: CardProduct = { ...PP, rules: PP.rules.map((r) => (r.id === "pp_weekend" || r.id === "pp_delivery" ? { ...r, countGroupId: "pp_weekend" } : r)) };
  it("같은 날 주말 음식점과 배달앱은 합쳐 일 1회", () => {
    const L = emptyLedger();
    const a = run(tx({ merchant: "을지로 골목집", amount: 30000, date: SAT, cardId: PP.id }), PPg, 500000, L);
    const b = run(tx({ merchant: "요기요", amount: 25000, date: SAT, cardId: PP.id, payChannel: "in_app", payMethod: "issuer_pay" }), PPg, 500000, L);
    expect(a.applied.find((x) => x.ruleId === "pp_weekend")?.amount).toBe(1000);
    expect(b.applied.map((x) => x.ruleId)).not.toContain("pp_delivery");
    expect(b.blocked.find((x) => x.ruleId === "pp_delivery")?.reason).toContain("일 1회");
  });
});

describe("조건 필드 누락은 확정 조건을 통과한 규칙에만 안내", () => {
  it("실적 구간에 혜택이 없으면 시각을 몰라도 '최대 N원'을 내지 않는다", () => {
    const r = run(tx({ merchant: "카카오T 택시", amount: 8000 }), ML, 200000);
    expect(r.skipped).toEqual([]);
    expect(r.status).not.toBe("missing");
  });
  it("최소 금액 미달이면 결제수단이 비어도 안내하지 않는다", () => {
    const r = run(tx({ merchant: "요기요", amount: 15000, date: SAT, cardId: PP.id, payChannel: "in_app" }), PP, 500000);
    expect(r.skipped.map((s) => s.ruleId)).not.toContain("pp_delivery");
    expect(r.blocked.find((b) => b.ruleId === "pp_delivery")?.reason).toContain("최소");
  });
  it("일 횟수를 이미 썼으면 두 번째 택시의 시각 미입력을 안내하지 않는다", () => {
    const L = emptyLedger();
    expect(run(tx({ merchant: "카카오T 택시", amount: 8000, paidAt: "23:00" }), ML, 600000, L).total).toBe(800);
    const r = run(tx({ merchant: "카카오T 택시", amount: 8000 }), ML, 600000, L);
    expect(r.skipped).toEqual([]);
    expect(r.blocked[0].reason).toContain("일 1회");
  });
  it("월 한도를 다 썼으면 '최대 0원' 대신 한도 소진", () => {
    const L = emptyLedger(); L.used["shinhan_mrlife:ml_night"] = 20000; // 50~100만 구간 Night 통합 한도 2만원
    const r = run(tx({ merchant: "카카오T 택시", amount: 8000 }), ML, 600000, L);
    expect(r.skipped).toEqual([]);
    expect(r.status).toBe("capped");
  });
});

describe("연 횟수 한도는 같은 해 이전 달을 이어서 센다", () => {
  const TTO = cardById("samsung_taptap_o")!;
  it("영화 월 2회 × 8달 = 16번 결제해도 연 12회(6만원)까지만", () => {
    const movies = Array.from({ length: 16 }, (_, i) => tx({ id: `mv${i}`, merchant: "CGV 강남", amount: 15000, cardId: TTO.id, date: `2026-0${Math.floor(i / 2) + 1}-0${(i % 2) + 5}` }));
    const ucs = [uc(TTO.id, { variantId: "p1", spendTierOverride: 400000 })]; // 보정 달 없음 = 모든 달 (예전 데이터)
    const months = ["01", "02", "03", "04", "05", "06", "07", "08"].map((m) => computeMonth(`2026-${m}`, movies, ucs, CARDS));
    expect(months.reduce((s, c) => s + c.received, 0)).toBe(60000);
    expect(months[6].byTxn["mv12"].mine!.blocked.some((b) => b.reason.includes("연 12회"))).toBe(true);
    expect(computeMonth("2027-01", [...movies, tx({ id: "nx", merchant: "CGV 강남", amount: 15000, cardId: TTO.id, date: "2027-01-05" })], ucs, CARDS).received).toBe(5000); // 해가 바뀌면 다시
  });
});

describe("전월 실적 보정은 지정한 달에만", () => {
  it("spendTierOverrideYm이 있으면 그 달만, 다른 달은 계산값", () => {
    const ucs = [uc(ML.id, { spendTierOverride: 1200000, spendTierOverrideYm: "2026-09" })];
    expect(computeMonth("2026-09", SEED_TXNS, ucs, CARDS).cards[ML.id].prevSpend).toBe(1200000);
    expect(computeMonth("2026-08", SEED_TXNS, ucs, CARDS).cards[ML.id].prevSpend).toBe(monthSpend(SEED_TXNS, ML.id, "2026-07", ML));
    expect(computeMonth("2026-10", SEED_TXNS, ucs, CARDS).cards[ML.id].prevSpend).toBe(monthSpend(SEED_TXNS, ML.id, "2026-09", ML));
    expect([spendOverrideOf(ucs[0], "2026-09"), spendOverrideOf(ucs[0], "2026-10")]).toEqual([1200000, undefined]); // 화면의 '보정됨' 표시도 이걸로
    expect(spendOverrideOf(uc(ML.id, { spendTierOverride: 1200000 }), "2030-01")).toBe(1200000); // 달 없는 예전 데이터는 모든 달
  });
});

describe("해제한 카드의 과거 결제", () => {
  const full = computeMonth("2026-09", SEED_TXNS, SEED_USER_CARDS, CARDS);
  const noML = computeMonth("2026-09", SEED_TXNS, SEED_USER_CARDS.filter((u) => u.cardId !== ML.id), CARDS);
  it("받은 혜택은 그대로, 비교·최적 카드 후보에서는 빠진다", () => {
    expect(noML.received).toBe(full.received);
    const taxi = SEED_TXNS.find((t) => t.date === "2026-09-15" && t.cardId === ML.id)!.id;
    expect(noML.byTxn[taxi].mine!.total).toBe(full.byTxn[taxi].mine!.total);
    expect(noML.byTxn[taxi].compare.map((c) => c.cardId)).not.toContain(ML.id);
    expect(noML.cards[ML.id]).toBeUndefined();
    expect(noML.could).toBeGreaterThanOrEqual(noML.received);
  });
  it("카탈로그에도 없는 카드면 놓친 혜택으로 치지 않는다", () => {
    const c = computeMonth("2026-09", [tx({ id: "u", merchant: "무신사", amount: 50000, cardId: "custom_gone" })], SEED_USER_CARDS, CARDS);
    expect(c.byTxn["u"].diff).toBe(0);
    expect([c.received, c.could, c.missed, c.missedTop.length]).toEqual([0, 0, 0, 0]);
  });
});

describe("기타 경계", () => {
  it("환불은 환불한 날이 속한 달의 실적에서 뺀다 (원결제 달을 소급해 바꾸지 않음)", () => {
    const all = [tx({ id: "p", amount: 100000, date: "2026-09-30" }), tx({ id: "q", amount: 150000, date: "2026-10-02" }), tx({ id: "r", amount: 100000, date: "2026-10-03", originalTxnId: "p" })];
    expect(monthSpend(all, ML.id, "2026-09", ML)).toBe(100000);
    expect(monthSpend(all, ML.id, "2026-10", ML)).toBe(50000);
  });
  it("시각은 앞자리 0이 없어도 분으로 비교 ('9:30'은 야간 아님)", () => {
    expect(timeIn("9:30", "21:00", "09:00")).toBe(false);
    expect(timeIn("8:30", "21:00", "09:00")).toBe(true);
    expect(run(tx({ merchant: "카카오T 택시", amount: 8000, paidAt: "9:30" })).total).toBe(0);
  });
  it("2027년 공휴일도 반영 (설 연휴 토요일 마트 할인 제외)", () => {
    expect(calcCard(tx({ merchant: "이마트", amount: 40000, date: "2027-02-06" }), ML, uc(ML.id), 600000, emptyLedger(), "2027-02", [], true).total).toBe(0);
  });
  it("외화에 원화 환산액이 없으면 대략 환율로 채운다", () => {
    expect(krw(tx({ amount: 45.5, currency: "USD" }))).toBe(62790);
    expect(krw(tx({ amount: 45.5, currency: "USD", amountKrw: 61000 }))).toBe(61000);
  });
  it("저장된 거래를 다시 미리보기할 때 자기 자신이 쓴 횟수에 막히지 않는다 (excludeId)", () => {
    const saved = tx({ id: "cu", merchant: "CU 역삼점", amount: 5000, date: "2026-09-21" });
    const all = [saved];
    const calc = computeMonth("2026-09", all, [uc(ML.id, { spendTierOverride: 600000 })], CARDS);
    const ucs = [uc(ML.id, { spendTierOverride: 600000 })];
    expect(previewTxn(saved, calc, ucs, CARDS, all)[0].calc.total).toBe(0); // 자기 자신에게 막힘
    expect(previewTxn(saved, calc, ucs, CARDS, all, { excludeId: "cu" })[0].calc.total).toBe(500);
  });
  it("부분 환불된 원거래를 excludeId로 다시 보면 환불 뺀 금액 그대로 (저장값과 같음)", () => {
    const orig = tx({ id: "o", merchant: "무신사", amount: 100000, cardId: PP.id, date: "2026-09-12" });
    const all = [orig, tx({ id: "r", amount: 40000, originalTxnId: "o", cardId: PP.id, date: "2026-09-19" })];
    const ucs = [uc(PP.id, { spendTierOverride: 500000 })];
    const calc = computeMonth("2026-09", all, ucs, CARDS);
    expect(calc.byTxn.o.mine?.total).toBe(420); // 6만원 → 0.7%
    expect(previewTxn(orig, calc, ucs, CARDS, all, { excludeId: "o" })[0].calc.total).toBe(420);
  });
});

describe("리뷰 회귀", () => {
  const TTO = cardById("samsung_taptap_o")!;
  const rule = (p: Partial<BenefitRule>): BenefitRule => ({ id: "r", cardId: "cg", name: "r", kind: "discount", target: {}, limitsByTier: [{ tier: { min: 0, max: null } }], rawText: "", supported: true, confidence: 1, ...p });
  const one = (rules: BenefitRule[]): CardProduct => ({ ...ML, id: "cg", tiers: [{ min: 0, max: null }], rules });

  it("결제일이 비거나 달 형식이 틀려도 연 횟수 카드 계산이 끝없이 돌지 않는다", () => {
    const ucs = [...SEED_USER_CARDS, uc(TTO.id, { variantId: "p1" })];
    expect(() => computeMonth("", SEED_TXNS, ucs, CARDS)).not.toThrow();
    expect(computeMonth("", SEED_TXNS, ucs, CARDS).received).toBe(0);
    expect(() => computeMonth("2026-00", SEED_TXNS, ucs, CARDS)).not.toThrow();
  });

  it("excludeId 미리보기도 이전 달 연 횟수를 이어받는다 (상반기 12회 → 7월 영화는 막힘)", () => {
    const movies = Array.from({ length: 12 }, (_, i) => tx({ id: `mv${i}`, merchant: "CGV 강남", amount: 15000, cardId: TTO.id, date: `2026-0${Math.floor(i / 2) + 1}-0${(i % 2) + 5}` }));
    const jul = tx({ id: "jul", merchant: "CGV 강남", amount: 15000, cardId: TTO.id, date: "2026-07-10" });
    const all = [...movies, jul];
    const ucs = [uc(TTO.id, { variantId: "p1", spendTierOverride: 400000 })];
    const calc = computeMonth("2026-07", all, ucs, CARDS);
    const p = previewTxn(jul, calc, ucs, CARDS, all, { excludeId: "jul" })[0].calc;
    const direct = previewTxn(jul, computeMonth("2026-07", movies, ucs, CARDS), ucs, CARDS, movies)[0].calc;
    expect(p.total).toBe(0);
    expect(p.blocked.some((b) => b.reason.includes("연 12회"))).toBe(true);
    expect(p).toEqual(direct);
  });

  it("제외 업종 사유는 업종 키 대신 한글 이름, 업종을 모르는 결제의 비교 메모는 '업종 미분류'", () => {
    const card = one([rule({ target: { excludes: ["overseas"] } })]);
    expect(run(tx({ merchantIndustry: "overseas", cardId: "cg" }), card).blocked[0].reason).toBe("제외 업종 (해외 가맹점)");
    const nobody = one([rule({ target: { categories: ["cafe"] } })]);
    const calc = computeMonth("2026-09", [tx({ merchant: "처음보는가게 9", cardId: "cg" })], [uc("cg")], [nobody]);
    expect(calc.byTxn.x.compare[0].note).toBe("업종 미분류");
    // 기타(etc)도 미분류와 같은 메모, 적용 조건 sub도 업종 키 대신 한글 이름
    const etc = computeMonth("2026-09", [tx({ merchant: "처음보는가게 9", merchantIndustry: "etc", cardId: "cg" })], [uc("cg")], [nobody]);
    expect(etc.byTxn.x.compare[0].note).toBe("업종 미분류");
    expect(run(tx({ merchant: "처음보는가게 9", merchantIndustry: "cafe", cardId: "cg" }), one([rule({ rate: 0.1, target: { categories: ["cafe"] } })])).applied[0].checks[0].sub).toBe(`업종 ${INDUSTRY.cafe.label} 해당`);
  });
  it("같은 countGroupId 규칙 둘이 한 결제에 함께 걸려도 통합 일 1회", () => {
    const lim = [{ tier: { min: 0, max: null }, dailyCount: 1 }];
    const card = one([
      rule({ id: "A", name: "카페 10%", rate: 0.1, target: { categories: ["cafe"] }, countGroupId: "g", limitsByTier: lim }),
      rule({ id: "B", name: "스타벅스 500원", fixedAmount: 500, target: { merchants: ["스타벅스"] }, countGroupId: "g", limitsByTier: lim }),
    ]);
    const L = emptyLedger();
    const r = calcCard(tx({ merchant: "스타벅스 역삼", amount: 10000, cardId: "cg" }), card, uc("cg"), 0, L, "2026-09", [], true);
    expect(r.applied.map((a) => [a.ruleId, a.amount])).toEqual([["A", 1000]]);
    expect(r.blocked.find((b) => b.ruleId === "B")?.reason).toContain("통합 횟수");
    expect(L.counts["cg:g"]).toMatchObject({ day: { "2026-09-20": 1 }, month: 1 });
  });

  it("업종을 모르는 결제는 가맹점이 맞으면 업종+가맹점 규칙을 적용 (업종을 알면 AND 유지)", () => {
    const card = one([rule({ id: "bb", name: "블루보틀 10%", rate: 0.1, target: { categories: ["cafe"], merchants: ["블루보틀"] } })]);
    const go = (p: Partial<Transaction>) => calcCard(tx({ merchant: "블루보틀 성수", cardId: "cg", ...p }), card, uc("cg"), 0, emptyLedger(), "2026-09", [], true).total;
    expect(go({})).toBe(1000);
    expect(go({ merchantIndustry: "restaurant" })).toBe(0);
  });
});

describe("무이자 할부 제외", () => {
  it("할부 2개월 이상 + 무이자만 제외하고, 일시불에 남은 무이자 표시는 무시한다", () => {
    const base = { id: "nf", type: "expense" as const, amount: 100000, currency: "KRW" as const, date: "2026-09-10", merchant: "LOCA 결제처", categoryId: "etc", payType: "credit" as const, cardId: "woori_super2" };
    const uc = [{ cardId: "woori_super2", addedAt: "" }];
    const run = (p: Partial<Transaction>) => computeMonth("2026-09", [{ ...base, ...p }], uc, CARDS).byTxn.nf.mine?.total ?? 0;
    expect(run({ installmentMonths: 3, isInterestFree: true })).toBe(0);
    expect(run({ installmentMonths: 1, isInterestFree: true })).toBe(2000);
    expect(run({})).toBe(2000);
  });
});

describe("외화 결제와 반올림", () => {
  const uc = (cardId: string) => [{ cardId, addedAt: "" }];
  const base = { id: "fx", type: "expense" as const, date: "2026-09-10", merchant: "Amazon", categoryId: "shopping.online", payType: "credit" as const, merchantIndustry: "online_shop" as const };
  it("외화 결제는 업종이 온라인쇼핑이어도 해외 규칙(LIKIT 해외 2%)에 맞고 국내 1.2%는 빠진다", () => {
    const t = { ...base, amount: 100, currency: "USD" as const, amountKrw: 138000, cardId: "lotte_likit2" };
    const r = computeMonth("2026-09", [t], uc("lotte_likit2"), CARDS).byTxn.fx.mine!;
    expect(r.applied.map((a) => a.ruleId)).toEqual(["lk_ovs"]);
    expect(r.total).toBe(2760);
  });
  it("원화 결제는 그대로 국내 규칙", () => {
    const t = { ...base, amount: 138000, currency: "KRW" as const, cardId: "lotte_likit2" };
    expect(computeMonth("2026-09", [t], uc("lotte_likit2"), CARDS).byTxn.fx.mine!.applied.map((a) => a.ruleId)).toEqual(["lk_dom"]);
  });
  it("부동소수 오차로 1원 모자라지 않는다 (리터당 60원 × 32.3L = 1,938원)", () => {
    const t = { id: "fuel", type: "expense" as const, amount: 54000, currency: "KRW" as const, date: "2026-09-13", merchant: "GS칼텍스 서초주유소", categoryId: "transport.fuel", payType: "credit" as const, cardId: "shinhan_mrlife", merchantIndustry: "fuel" as const, fuelLiters: 32.3 };
    const r = computeMonth("2026-09", [t], [{ cardId: "shinhan_mrlife", addedAt: "", spendTierOverride: 600000 }], CARDS).byTxn.fuel.mine!;
    expect(r.applied.find((a) => a.ruleId === "ml_fuel")?.amount).toBe(1938);
  });
});
