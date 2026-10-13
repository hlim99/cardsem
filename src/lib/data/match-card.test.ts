import { describe, it, expect } from "vitest";
import { approvalMatch, duplicateOf, fieldKey, matchCard, matchNote, normDate, normTime, payMethodOf, payTypeHint, refundCandidates, remainingFor, similarMerchant } from "./match-card";
import type { Transaction } from "../types";
const uc = ["shinhan_mrlife", "shinhan_pointplan", "samsung_taptap_o", "hyundai_zero3"].map((cardId) => ({ cardId, addedAt: "" }));
it("카드사+카드명", () => expect(matchCard(uc, { cardIssuer: "신한", cardName: "Point Plan" })).toMatchObject({ cardId: "shinhan_pointplan", level: "card" }));
it("카드사만·복수", () => expect(matchCard(uc, { cardIssuer: "신한", cardName: null })).toMatchObject({ cardId: "shinhan_mrlife", level: "issuer_ambiguous" }));
it("카드사만·단일", () => expect(matchCard(uc, { payMethodText: "삼성카드 1234" }).cardId).toBe("samsung_taptap_o"));
it("카드명만", () => expect(matchCard(uc, { payMethodText: "ZERO Edition3 일시불" }).cardId).toBe("hyundai_zero3"));
it("없음", () => expect(matchCard(uc, { cardIssuer: "롯데" }).level).toBe("unknown"));
it("정보 없음", () => expect(matchCard(uc, {}).level).toBe("none"));
it("BIN 앞자리가 맞으면 카드사보다 우선", () => {
  const withBin = uc.map((u) => (u.cardId === "shinhan_pointplan" ? { ...u, bin: "543210" } : u));
  expect(matchCard(withBin, { cardIssuer: "삼성", cardNumberPrefix: "5432" })).toMatchObject({ cardId: "shinhan_pointplan", level: "bin", prefix: "5432" });
  expect(matchCard(withBin, { cardIssuer: "삼성", cardNumberPrefix: "9999" })).toMatchObject({ cardId: "samsung_taptap_o", level: "issuer", prefix: "9999" });
  expect(matchCard(withBin, { cardNumberPrefix: "54" }).level).toBe("none"); // 4자리 미만은 안 씀
});
it("앞자리가 여러 장과 맞으면 확정하지 않고, 짧게 저장한 BIN도 긴 앞자리와 맞는다 (M23)", () => {
  const two = uc.map((u) => (u.cardId === "shinhan_mrlife" ? { ...u, bin: "543210" } : u.cardId === "shinhan_pointplan" ? { ...u, bin: "543299" } : u));
  const m = matchCard(two, { cardNumberPrefix: "5432" });
  expect(m).toMatchObject({ cardId: "shinhan_mrlife", level: "issuer_ambiguous", byBin: true, prefix: "5432" });
  expect(m.candidates.slice(0, 2)).toEqual(["shinhan_mrlife", "shinhan_pointplan"]);
  expect(matchNote(m, { cardNumberPrefix: "5432" })).toBe("카드번호 앞자리 5432와 맞는 등록 카드가 여러 장이라 확인해주세요");
  expect(matchCard(two, { cardNumberPrefix: "543299" })).toMatchObject({ cardId: "shinhan_pointplan", level: "bin" });
  const short = uc.map((u) => (u.cardId === "hyundai_zero3" ? { ...u, bin: "4321" } : u)); // 예전에 4자리로 저장한 BIN
  expect(matchCard(short, { cardNumberPrefix: "432155" })).toMatchObject({ cardId: "hyundai_zero3", level: "bin" });
});

describe("영수증 카드 판별", () => {
  it("'삼성페이'의 '삼성'을 삼성카드로 읽지 않는다 (C27)", () => {
    const two = [{ cardId: "samsung_taptap_o", addedAt: "" }, { cardId: "shinhan_mrlife", addedAt: "" }];
    expect(matchCard(two, { cardIssuer: "신한", payMethodText: "삼성페이 신한카드 일시불" })).toMatchObject({ cardId: "shinhan_mrlife", level: "issuer" });
    expect(matchCard(two, { cardIssuer: null, payMethodText: "삼성페이(현대카드)" }).level).toBe("unknown"); // 현대카드는 없음 → 삼성으로 고르지 않음
  });
  it("후보 순서: 추천 → 같은 카드사 → 나머지", () => {
    expect(matchCard(uc, { cardIssuer: "신한", cardName: "Point Plan" }).candidates).toEqual(["shinhan_pointplan", "shinhan_mrlife", "samsung_taptap_o", "hyundai_zero3"]);
    expect(matchCard(uc, {}).candidates).toEqual(uc.map((u) => u.cardId));
  });
  it("현금·간편결제만 있으면 카드를 고르지 않는다 (C26)", () => {
    for (const payMethodText of ["현금", "현금(소득공제)", "카카오페이"]) expect(matchCard(uc, { payMethodText }).cardId).toBeUndefined();
    expect(payTypeHint("현금(소득공제)")).toBe("cash");
    expect(payTypeHint("계좌이체")).toBe("transfer");
    expect(payTypeHint("신한카드")).toBeUndefined();
    // 은행 이름이 카드사 별칭과 겹쳐도 계좌이체면 카드를 고르지 않는다
    for (const d of [{ payMethodText: "신한은행 계좌이체" }, { cardIssuer: "신한", payMethodText: "신한은행 계좌이체" }]) {
      expect(matchCard(uc, d).cardId).toBeUndefined();
      expect(matchCard(uc, d).level).toBe("none");
      expect(matchNote(matchCard(uc, d), d)).toBe("계좌이체로 읽었어요");
    }
    expect(matchCard(uc, { payMethodText: "신한카드 계좌 자동이체" }).cardId).toBe("shinhan_mrlife"); // '카드'가 있으면 카드로 본다
  });
  it("안내 문구가 깨지지 않는다 (M12)", () => {
    expect(matchNote(matchCard(uc, { payMethodText: "현금" }), { payMethodText: "현금" })).toBe("현금 결제로 읽었어요");
    expect(matchNote(matchCard(uc, { payMethodText: "카카오페이" }), { payMethodText: "카카오페이" })).toBe("'카카오페이'는 보유 카드에 없어요. 카드로 결제했다면 골라주세요");
    expect(matchNote(matchCard(uc, { cardIssuer: "기타" }), { cardIssuer: "기타" })).toBe("영수증에 카드 정보가 없어요. 카드로 결제했다면 골라주세요"); // '기타카드' 아님
    expect(matchNote(matchCard(uc, { payMethodText: "신한" }), { payMethodText: "신한" })).toBe("AI 추론 · 신한 카드가 여러 장이라 확인해주세요");
  });
  it("결제수단 문구 → 간편결제 수단", () => {
    expect(payMethodOf("SOL페이 신한카드")).toBe("issuer_pay");
    expect(payMethodOf("삼성페이 신한카드")).toBe("samsung_pay");
    expect(payMethodOf("Shinhan Pay")).toBe("issuer_pay");
    expect(payMethodOf("신한카드 일시불")).toBeUndefined();
  });
});

describe("기존 거래와 맞춰 보기", () => {
  const tx = (id: string, merchant: string, amount: number, date: string, extra: Partial<Transaction> = {}): Transaction => ({ id, type: "expense", amount, currency: "KRW", date, merchant, categoryId: "etc", payType: "credit", cardId: "shinhan_mrlife", ...extra });
  const txns = [
    tx("a", "스타벅스 강남점", 12000, "2026-09-10"),
    tx("b", "스타벅스 역삼점", 30000, "2026-09-15"),
    tx("c", "스타벅스 강남점", 12000, "2026-05-01"), // 90일 넘음
    tx("d", "이디야", 50000, "2026-09-12"),
    tx("e", "스타벅스 강남점", 20000, "2026-09-11"),
    tx("r", "스타벅스 강남점 · 부분 환불", 15000, "2026-09-12", { originalTxnId: "e" }), // e는 5,000원만 남음
  ];
  it("가맹점 유사", () => {
    expect(similarMerchant("스타벅스코리아", "스타벅스 강남점")).toBe(true);
    expect(similarMerchant("(주)이마트 역삼점", "이마트")).toBe(true);
    expect(similarMerchant("GS25 역삼", "GS칼텍스")).toBe(false);
  });
  it("원거래 후보: 비슷한 가맹점 + 남은 금액 ≥ 취소액 + 90일 이내, 금액이 딱 맞는 것 먼저", () => {
    expect(refundCandidates(txns, { merchant: "스타벅스", krw: 12000, date: "2026-09-20" }).map((t) => t.id)).toEqual(["a", "b"]);
    expect(refundCandidates(txns, { merchant: "스타벅스", krw: 40000, date: "2026-09-20" })).toEqual([]);
    expect(refundCandidates(txns, { merchant: "스타벅스", krw: 12000, date: "2026-09-09" })).toEqual([]); // 취소일 이후 결제는 아님
  });
  it("중복: 같은 날짜·같은 금액·비슷한 가맹점", () => {
    expect(duplicateOf(txns, { merchant: "스타벅스커피 강남", krw: 12000, date: "2026-09-10" })?.id).toBe("a");
    expect(duplicateOf(txns, { merchant: "스타벅스 강남점", krw: 12000, date: "2026-09-11" })).toBeUndefined();
    expect(duplicateOf(txns, { merchant: "이디야", krw: 12000, date: "2026-09-10" })).toBeUndefined();
    // 같은 날 결제·취소는 중복이 아니고, 이미 저장한 환불과는 중복
    expect(duplicateOf(txns, { merchant: "스타벅스 강남점", krw: 12000, date: "2026-09-10", isCancel: true })).toBeUndefined();
    expect(duplicateOf(txns, { merchant: "스타벅스 강남점", krw: 15000, date: "2026-09-12", isCancel: true })?.id).toBe("r");
    expect(duplicateOf(txns, { merchant: "스타벅스 강남점", krw: 15000, date: "2026-09-12" })).toBeUndefined();
  });
  it("외화는 원래 통화로 비교: 원화를 명세서 청구액으로 고친 원거래도 전액 취소 후보·중복이 된다", () => {
    const usd = tx("u", "AMAZON.COM", 25, "2026-09-10", { currency: "USD", amountKrw: 34000 }); // 참고 환산은 34,500원
    const doc = { merchant: "AMAZON", amount: 25, currency: "USD" as const, krw: 34500, date: "2026-09-12" };
    expect(refundCandidates([usd], doc).map((t) => t.id)).toEqual(["u"]);
    expect(refundCandidates([usd], { ...doc, amount: 26 })).toEqual([]);
    const part = tx("p", "AMAZON.COM · 부분 환불", 10, "2026-09-11", { currency: "USD", amountKrw: 13600, originalTxnId: "u" });
    expect(remainingFor(usd, [usd, part], doc)).toBe(15);
    expect(refundCandidates([usd, part], { ...doc, amount: 15 }).map((t) => t.id)).toEqual(["u"]);
    expect(duplicateOf([usd], { merchant: "AMAZON.COM", amount: 25, currency: "USD", krw: 34500, date: "2026-09-10" })?.id).toBe("u");
  });
});

describe("모델 값 정리", () => {
  it("날짜·시각 형식을 맞추고 아니면 비운다 (M11)", () => {
    expect(normDate("2026.9.5")).toBe("2026-09-05");
    expect(normDate("2026-09-05")).toBe("2026-09-05");
    expect(normDate("2026-02-30")).toBeUndefined();
    expect(normDate("9/5")).toBeUndefined();
    expect(normDate(null)).toBeUndefined();
    expect(normTime("9:05")).toBe("09:05");
    expect(normTime("25:00")).toBeUndefined();
  });
  it("필드 이름이 흔들려도 화면 키로 (M14)", () => {
    expect(["amount", "합계", "total_amount", "total"].map(fieldKey)).toEqual(["total", "total", "total", "total"]);
    expect(["paidAt", "date", "결제일", "payMethodText", "merchant"].map(fieldKey)).toEqual(["paidAt", "date", "date", "card", "merchant"]);
  });
});

import { categoryForIndustry, classifyMerchant, DEFAULT_CATEGORIES, merchantKeys, resolveIndustry } from "./merchants";
describe("업종 분류 3단계 (resolveIndustry)", () => {
  it("사용자 기록 → AI → 사전 → 없음 순서", () => {
    const hints = Object.fromEntries(merchantKeys("스타벅스 강남점").map((k) => [k, "cafe" as const]));
    expect(resolveIndustry("스타벅스 역삼점", "restaurant", hints)).toEqual({ industry: "cafe", source: "user" }); // 브랜드 키로 다른 지점도
    expect(resolveIndustry("새로운가게", "restaurant", {})).toEqual({ industry: "restaurant", source: "ai" });
    expect(resolveIndustry("GS25 역삼점", null, {}).source).toBe("dict");
    expect(resolveIndustry("알수없는곳", null, {})).toEqual({ source: "none" });
  });
  it("'기타'는 기록·AI 답으로 쓰지 않는다 (미분류에 갇히지 않게)", () => {
    expect(resolveIndustry("GS25 역삼점", "etc", { gs25역삼점: "etc" }).source).toBe("dict");
    expect(resolveIndustry("알수없는곳", "etc", { 알수없는곳: "etc" })).toEqual({ source: "none" });
  });
  it("키는 공백·대소문자를 무시하고, 한 단어 이름은 브랜드 키를 따로 만들지 않는다", () => {
    expect(merchantKeys("  Star Bucks  ")).toEqual(["starbucks", "star"]);
    expect(merchantKeys("이마트")).toEqual(["이마트"]);
  });
  it("사전은 가장 앞에 나온 키, 같은 자리면 긴 키. 짧은 영문 키는 단어 단위로 (C78)", () => {
    expect(classifyMerchant("메가박스 코엑스")).toBe("movie");
    expect(classifyMerchant("메가MGC커피 선릉점")).toBe("cafe");
    expect(classifyMerchant("쿠팡플레이")).toBe("subscription");
    expect(classifyMerchant("쿠팡이츠")).toBe("delivery");
    expect(classifyMerchant("Cucina 파스타")).toBe("restaurant");
    expect(classifyMerchant("CU역삼점")).toBe("convenience");
    expect(classifyMerchant("KTX 서울역")).toBe("rail");
    expect(classifyMerchant("이마트24 역삼")).toBe("convenience");
    // 매장 안 매장은 입점처가 아니라 앞의 브랜드로
    expect(classifyMerchant("투썸플레이스 홈플러스 강서점")).toBe("cafe");
    expect(classifyMerchant("커피빈 이마트 성수점")).toBe("cafe");
  });
  it("세금·보험·관리비는 공과금 카테고리로 (C29)", () => {
    expect(["tax", "insurance", "apt_fee"].map((i) => categoryForIndustry(DEFAULT_CATEGORIES, i as "tax"))).toEqual(["living.utility", "living.utility", "living.utility"]);
  });
});

/* 실제 영수증 4장 (2026-09-12~13 수영장, 카드번호 655620 동일).
 * 결제는 발급사 '우리카드', 환불·재결제는 매입사 '비씨카드'로 카드사명이 다르게 찍혔다 */
describe("같은 카드인데 카드사 표기가 다른 영수증 (우리 ↔ 비씨)", () => {
  const WOORI = "woori_super2";
  const pay1 = { merchant: "월정기수영[성인]", cardIssuer: "우리", cardName: null, payMethodText: "우리카드 일시불", cardNumberPrefix: "655620", approvalNo: "63506541" };
  const pay2 = { ...pay1, merchant: "주2회 강습수영", approvalNo: "63511364" };
  const refund3 = { merchant: "월정기수영 중도해약 반환금", cardIssuer: "BC", cardName: null, payMethodText: "비씨카드", cardNumberPrefix: "655620", approvalNo: "63506541" }; // 원결제①과 같은 번호
  const pay4 = { ...refund3, merchant: "월정기수영+헬스[성인]", approvalNo: "31384800" };

  it("BIN을 기억해 둔 카드면 카드사 표기와 무관하게 네 장 모두 같은 카드", () => {
    const cards = [{ cardId: WOORI, bin: "655620", addedAt: "" }, { cardId: "shinhan_mrlife", bin: "944521", addedAt: "" }];
    for (const doc of [pay1, pay2, refund3, pay4]) {
      expect(matchCard(cards, doc)).toMatchObject({ cardId: WOORI, level: "bin" });
    }
  });

  it("BIN을 모르면 결제는 발급사로 맞지만, 매입사(비씨)는 '없는 카드'가 아니라 발급사 불명으로 둔다", () => {
    const cards = [{ cardId: WOORI, addedAt: "" }, { cardId: "shinhan_mrlife", addedAt: "" }];
    expect(matchCard(cards, pay1)).toMatchObject({ cardId: WOORI, level: "issuer" });
    const m = matchCard(cards, refund3);
    expect(m.level).toBe("acquirer"); // 예전 동작은 unknown("보유 카드에 없어요")이었다
    expect(m.cardId).toBeUndefined();  // 멋대로 고르지 않고 사용자가 고르게 둔다
    expect(m.candidates).toContain(WOORI);
    expect(matchNote(m, refund3)).toContain("매입사");
    expect(matchNote(m, refund3)).toContain("655620");
  });

  // 카탈로그에 BC 발급 카드가 아직 없어서 '진짜 BC 카드를 가진 경우'는 카드가 추가될 때 검증한다.
  // 그 경우 byIssuer가 비지 않아 acquirer 분기 앞에서 issuer로 걸린다 (matchCard 순서상 보장)
});

/* 환불 영수증을 원결제에 붙이기 — 위 영수증 ③(중도해약 반환금 50,000, 승인번호 63506541) */
describe("환불 영수증의 원거래 후보", () => {
  const tx = (id: string, merchant: string, amount: number, date: string, extra: Partial<Transaction> = {}): Transaction =>
    ({ id, type: "expense", amount, currency: "KRW", date, merchant, categoryId: "etc", payType: "credit", cardId: "woori_super2", ...extra });
  const txns = [
    tx("p1", "월정기수영[성인]", 50000, "2026-09-12", { paidAt: "16:04", approvalNo: "63506541" }),
    tx("p2", "주2회 강습수영", 10000, "2026-09-12", { paidAt: "16:05", approvalNo: "63511364" }),
    tx("p4", "월정기수영+헬스[성인]", 70000, "2026-09-13", { approvalNo: "31384800" }),
  ];
  const doc = { merchant: "월정기수영 중도해약 반환금", krw: 50000, date: "2026-09-13" };

  it("승인번호가 같은 결제 하나로 확정한다 (가맹점 표기·같은 날 재결제와 무관)", () => {
    const ids = refundCandidates(txns, { ...doc, approvalNo: "63506541" }).map((t) => t.id);
    expect(ids).toEqual(["p1"]);
    expect(approvalMatch(txns, { ...doc, approvalNo: "63506541" })?.id).toBe("p1");
  });

  it("가맹점 이름이 전혀 달라도 승인번호가 맞으면 그 결제다", () => {
    const ids = refundCandidates(txns, { merchant: "(주)스포츠센터 환불", krw: 50000, date: "2026-09-13", approvalNo: "63506541" }).map((t) => t.id);
    expect(ids).toEqual(["p1"]);
  });

  it("이미 전액 환불된 결제는 승인번호가 같아도 후보에서 뺀다", () => {
    const refunded = [...txns, tx("r1", "월정기수영[성인] · 취소", 50000, "2026-09-13", { originalTxnId: "p1" })];
    expect(approvalMatch(refunded, { ...doc, approvalNo: "63506541" })).toBeUndefined();
  });

  it("승인번호가 없으면 종전대로 가맹점·금액·기간으로 찾는다 — 같은 날 재결제도 후보", () => {
    const ids = refundCandidates(txns, doc).map((t) => t.id);
    expect(ids[0]).toBe("p1");   // 50,000 정확히 일치
    expect(ids).toContain("p4"); // 70,000도 50,000을 덮을 수 있어 후보
    expect(ids).not.toContain("p2"); // 남은 금액(10,000) < 취소액(50,000)
  });
});

// 시연 영수증 가맹점이 혜택 매칭 업종으로 잡히는지 (수영장·백화점은 2026-10-12 추가한 업종)
describe("시연 영수증 업종", () => {
  it.each([
    ["월정기수영[성인]", "sports"], ["주2회 강습수영", "sports"], ["월정기수영+헬스[성인]", "sports"], ["월정기수영 중도해약 반환금", "sports"],
    ["(주)현대백화점압구정본점", "department"], ["캐시닥약국", "pharmacy"], ["스타벅스 강남역점", "cafe"],
  ])("%s → %s", (name, ind) => expect(classifyMerchant(name)).toBe(ind));
});
