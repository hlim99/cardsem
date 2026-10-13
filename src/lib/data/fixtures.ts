/* 테스트 전용 고정 데이터 — 카드 3장, 2026년 7월 후반(사이클 실적용)·8월(전월 실적용)·9월 거래.
 * 앱(데모 포함)은 쓰지 않는다. 엔진·리포트·알림 테스트가 이 장부로 계산 결과를 고정한다 */
import type { Budget, RecurringRule, Transaction, UserCard } from "../types";
import { classifyMerchant, INDUSTRY_TO_CATEGORY } from "./merchants";

export const TODAY = "2026-09-20";

export const SEED_USER_CARDS: UserCard[] = [
  // Mr.Life는 청구 사이클 10일 카드 — 전월 실적 창이 7/10~8/9. 나머지 둘은 달력 월(1일~말일)
  { cardId: "shinhan_mrlife", addedAt: "2026-08-01", statementCycleDay: 10 },
  { cardId: "shinhan_pointplan", addedAt: "2026-08-01" },
  { cardId: "hyundai_zero3", addedAt: "2026-08-01" },
];

type Row = [string, string, number, string, Partial<Transaction>?];
const ML = "shinhan_mrlife", PP = "shinhan_pointplan", HZ = "hyundai_zero3";
const rows: Row[] = [
  // ── 7월 후반: 사이클 카드(Mr.Life 10일 시작)의 전월 실적 창 7/10~8/9에 들어가는 거래
  ["2026-07-14", "이마트 역삼점", 92000, ML, { paidAt: "19:10" }],
  ["2026-07-19", "스타벅스 강남역점", 6100, ML, { paidAt: "09:05" }],
  ["2026-07-22", "한국전력 전기요금", 47000, ML, { isAutoPay: true }],
  ["2026-07-26", "SK에너지 반포주유소", 55000, ML, { paidAt: "10:40", fuelLiters: 33.2 }],
  // ── 8월: 전월 실적 (Mr.Life 30~50만 구간, Point Plan 40~80만 구간, ZERO 무실적)
  ["2026-08-01", "넷플릭스", 17000, HZ, { isAutoPay: true, recurringId: "rc_netflix" }], // 반복 규칙(매월 1일)과 같은 날
  ["2026-08-03", "스타벅스 강남역점", 6100, ML, { paidAt: "08:40" }],
  ["2026-08-05", "이마트 역삼점", 128000, ML, { paidAt: "18:20" }],
  ["2026-08-08", "GS칼텍스 서초주유소", 70000, ML, { paidAt: "10:15", fuelLiters: 42.3 }],
  ["2026-08-10", "한국전력 전기요금", 48000, ML, { isAutoPay: true }],
  ["2026-08-12", "SKT 통신요금", 65000, PP, { isAutoPay: true }], // 반복 규칙(rc_skt: 10일·Mr.Life) 이전에 Point Plan으로 내던 회차 — PP 8월 실적(40~80만 구간)을 지키려고 규칙에 맞추지 않음
  ["2026-08-14", "무신사", 89000, HZ, {}],
  ["2026-08-15", "을지로 골목집", 52000, PP, { paidAt: "19:10" }],
  ["2026-08-17", "쿠팡", 158000, PP, { paidAt: "22:30", payChannel: "in_app", payMethod: "kakao_pay" }],
  ["2026-08-19", "CU 역삼점", 5800, ML, { paidAt: "21:50" }],
  ["2026-08-21", "홈플러스 강남점", 96000, ML, { paidAt: "15:00" }],
  ["2026-08-22", "카카오T 택시", 14500, ML, { paidAt: "23:40" }],
  ["2026-08-23", "배달의민족", 27000, PP, { paidAt: "19:30", payChannel: "in_app", payMethod: "issuer_pay" }],
  ["2026-08-26", "온누리약국", 12000, ML, { paidAt: "13:10" }],
  ["2026-08-27", "롯데시네마 월드타워", 28000, PP, { paidAt: "20:00" }],
  ["2026-08-28", "애플스토어 가로수길", 190000, PP, {}],
  ["2026-08-29", "SK에너지 반포주유소", 60000, ML, { paidAt: "09:30", fuelLiters: 36.1 }],
  ["2026-08-30", "이디야 역삼점", 4500, PP, { paidAt: "14:20" }],
  // ── 9월
  ["2026-09-01", "넷플릭스", 17000, HZ, { isAutoPay: true, recurringId: "rc_netflix" }],
  ["2026-09-02", "티머니 충전", 30000, HZ, { paidAt: "08:10" }],
  ["2026-09-03", "스타벅스 강남역점", 6100, PP, { paidAt: "08:42", items: ["아이스 아메리카노 T", "샷 추가"] }],
  ["2026-09-05", "이마트 역삼점", 84000, ML, { paidAt: "17:40" }], // 토요일 → 마트 10%
  ["2026-09-06", "을지로 골목집", 48000, PP, { paidAt: "19:20" }], // 일요일 → 주말 음식점 1천P + 일상 적립 (중복 허용)
  ["2026-09-07", "배달의민족", 24000, ML, { paidAt: "20:10", payChannel: "in_app", payMethod: "naver_pay" }],
  ["2026-09-08", "CU 역삼점", 4800, ML, { paidAt: "22:10" }],
  ["2026-09-09", "쿠팡", 58000, HZ, { paidAt: "22:40", payChannel: "in_app" }],
  ["2026-09-10", "한국전력 전기요금", 52000, PP, { isAutoPay: true }], // 자동납부 2만원당 1천P, 일상 적립과 배타
  ["2026-09-10", "SKT 통신요금", 65000, ML, { isAutoPay: true, recurringId: "rc_skt" }], // 월납 10%, 반복 규칙(매월 10일)과 같은 날
  ["2026-09-11", "온누리약국", 9000, ML, { paidAt: "12:30" }],
  ["2026-09-12", "무신사", 89000, HZ, { installmentMonths: 3, isInterestFree: true }], // 할부 총액
  ["2026-09-13", "홈플러스 강남점", 62000, PP, { paidAt: "16:00" }], // 일요일 마트 — Point Plan은 일상 적립만
  ["2026-09-14", "GS칼텍스 서초주유소", 70000, PP, { paidAt: "10:15" }], // 주유량 미입력 · 월요일이라 Mr.Life 주말 주유 할인도 대상 아님
  ["2026-09-15", "카카오T 택시", 12500, ML, { paidAt: "23:55" }], // Night 택시 10%
  ["2026-09-16", "이디야 역삼점", 6400, ML, { paidAt: "13:05" }], // 낮 → Night 시간대 외
  ["2026-09-17", "크린토피아 역삼점", 15000, ML, { paidAt: "18:30" }],
  ["2026-09-18", "후불교통", 12500, HZ, { paidAt: "07:50" }],
  ["2026-09-19", "메가MGC커피 선릉점", 9000, ML, { paidAt: "21:30", memo: "팀 아메리카노 사기" }], // Night 식음료
  ["2026-09-19", "CU 역삼점", 5200, ML, { paidAt: "23:10" }],
  ["2026-09-19", "요기요", 31000, PP, { paidAt: "19:45", payChannel: "in_app", payMethod: "issuer_pay" }], // 토요일 배달앱 SOL페이
  ["2026-09-20", "스타벅스 강남역점", 6100, ML, { items: ["아이스 아메리카노 T", "샷 추가"] }], // 시각 미입력 → BNF-05
];

export const SEED_TXNS: Transaction[] = rows.map(([date, merchant, amount, cardId, extra], i) => {
  const ind = classifyMerchant(merchant);
  return {
    id: `t${String(i + 1).padStart(3, "0")}`, type: "expense", amount, currency: "KRW", date, merchant, cardId,
    payType: "credit", merchantIndustry: ind, categoryId: (ind && INDUSTRY_TO_CATEGORY[ind]) || "etc", ...extra,
  };
});
// 환불의 원거래는 행 위치(t001…)가 아니라 내용으로 찾는다 — 앞에 행을 끼워 넣어도 엉뚱한 결제에 붙지 않게 (없으면 로드 때 바로 터짐)
const MUSINSA_0912 = SEED_TXNS.find((t) => t.date === "2026-09-12" && t.merchant === "무신사")!.id;
SEED_TXNS.push(
  { id: "i000", type: "income", amount: 2400000, currency: "KRW", date: "2026-07-10", merchant: "7월 급여", categoryId: "salary", payType: "transfer", recurringId: "rc_salary" },
  { id: "i001", type: "income", amount: 2400000, currency: "KRW", date: "2026-08-10", merchant: "8월 급여", categoryId: "salary", payType: "transfer", recurringId: "rc_salary" },
  { id: "i002", type: "income", amount: 2400000, currency: "KRW", date: "2026-09-10", merchant: "9월 급여", categoryId: "salary", payType: "transfer", recurringId: "rc_salary" },
  { id: "c001", type: "expense", amount: 8500, currency: "KRW", date: "2026-09-04", merchant: "김밥천국", categoryId: "food.out", merchantIndustry: "restaurant", payType: "cash" },
  { id: "r001", type: "expense", amount: 29000, currency: "KRW", date: "2026-09-19", merchant: "무신사 · 부분 환불", categoryId: "shopping.fashion", merchantIndustry: "fashion", payType: "credit", cardId: HZ, originalTxnId: MUSINSA_0912 },
);

export const SEED_BUDGETS: Budget[] = [
  { amount: 1500000 },
  { categoryId: "food", amount: 500000 },
  { categoryId: "food.cafe", amount: 50000 },
  { categoryId: "transport", amount: 340000 },
  { categoryId: "shopping", amount: 400000 },
  { categoryId: "subscription", amount: 70000 },
];

export const SEED_RECURRING: RecurringRule[] = [
  { id: "rc_netflix", type: "expense", amount: 17000, merchant: "넷플릭스", categoryId: "subscription", cardId: HZ, payType: "credit", cycle: "monthly", day: 1, startDate: "2026-01-01", isAutoPay: true, lastGeneratedAt: "2026-09-01" },
  { id: "rc_salary", type: "income", amount: 2400000, merchant: "급여", categoryId: "salary", payType: "transfer", cycle: "monthly", day: 10, startDate: "2026-01-10", lastGeneratedAt: "2026-09-10" }, // 다음 회차 10/10은 TODAY(9/20) 뒤라 아직 없음
  { id: "rc_skt", type: "expense", amount: 65000, merchant: "SKT 통신요금", categoryId: "living.telecom", cardId: ML, payType: "credit", cycle: "monthly", day: 10, startDate: "2026-01-10", isAutoPay: true, lastGeneratedAt: "2026-09-10" },
];
