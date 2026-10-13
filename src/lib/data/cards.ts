/* 카드 상품 목록 — [카드 혜택 검증 원문]의 실제 약관 20건을 5장 스키마로 옮긴 승인 규칙.
 * ponytail: 어드민 검수를 거친 JSON을 파일로 두고 배포 (축소안 6). Supabase 연결 시 card_products/benefit_rules 테이블로 이동 */
import type { BenefitRule, CardProduct, PerkKind, SpendTier, Transaction, UserCard } from "../types";
import { monthSpend, nextYm, resolveTier, spendWindow, spendWindowLabel, ymOf } from "../engine";
import { WOORI_RENTAL_CARDS } from "./cards-woori-rental"; // 렌탈 할인 카드 4종 (2026-10-11 추가)
import { KB_NARASARANG_CARDS } from "./cards-kb-narasarang"; // 나라사랑 체크카드 3종 (2026-10-11 추가)
import { RECEIPT_PICK_CARDS } from "./cards-receipt-picks"; // 시연 영수증(수영장·약국)에 혜택이 큰 카드 3종 (2026-10-12 추가)

const T0: SpendTier = { min: 0, max: null };
const base = { confidence: 0.95, supported: true } as const;

/* 신한 Mr.Life 구간 */
const ML: SpendTier[] = [{ min: 0, max: 300000 }, { min: 300000, max: 500000 }, { min: 500000, max: 1000000 }, { min: 1000000, max: null }];
const mlCaps = (a: number, b: number, c: number, extra: Partial<BenefitRule["limitsByTier"][number]> = {}) => [
  { tier: ML[1], monthlyCap: a, ...extra }, { tier: ML[2], monthlyCap: b, ...extra }, { tier: ML[3], monthlyCap: c, ...extra },
];
/* 신한 Point Plan 구간 */
const PP: SpendTier[] = [{ min: 0, max: 400000 }, { min: 400000, max: 800000 }, { min: 800000, max: 1200000 }, { min: 1200000, max: null }];
/* Point Plan "일상 생활비 적립" 통합 한도(pp_daily)를 함께 쓰는 규칙들의 공통 조건. 한 곳에 두어 규칙끼리 어긋나지 않게 한다
 *  - 제외 업종: SOL페이 추가 적립은 "일상 생활비 적립 한도 내"라 일상 적립과 같은 업종을 뺀다 (자동납부 업종도 여기서 빠짐)
 *  - 5·12월 한도 +1만P: 통합 한도라 그룹의 모든 규칙이 같은 한도를 봐야 한다 (한 규칙에만 있으면 나머지가 먼저 막힘) */
const PP_DAILY_EXCLUDES = ["무이자할부", "gas", "electric", "telecom", "tax", "utility", "insurance", "apt_fee", "gift_card", "school", "pharmacy", "rail", "overseas"];
const PP_DAILY_CAPS = [{ tier: PP[1], monthlyCap: 10000 }, { tier: PP[2], monthlyCap: 30000 }, { tier: PP[3], monthlyCap: 50000 }];
const PP_DAILY_OVERRIDES = [{ months: [5, 12], extraCap: 10000 }];
const PP_WEEKEND_LIMITS = [{ tier: PP[0], monthlyCap: 2000, monthlyCount: 2, dailyCount: 1 }, { tier: PP[1], monthlyCap: 5000, monthlyCount: 5, dailyCount: 1 }, { tier: PP[2], monthlyCap: 5000, monthlyCount: 5, dailyCount: 1 }, { tier: PP[3], monthlyCap: 5000, monthlyCount: 5, dailyCount: 1 }];
/* 정기결제 자동납부: 영역(도시가스·전기 통합 / 이동통신)별 월 1건, 1회 10만원까지 2만원당 1천P (영역별 최대 5천P) */
const ppAutopay = (id: string, name: string, categories: ("gas" | "electric" | "telecom")[]): BenefitRule => ({
  ...base, id, cardId: "shinhan_pointplan", name, kind: "point", step: { per: 20000, amount: 1000 },
  target: { categories, autoPayOnly: true, minAmount: 20000 }, eligibleAmountCap: 100000, perTxnCap: 5000,
  limitsByTier: [PP[1], PP[2], PP[3]].map((tier) => ({ tier, monthlyCap: 5000, monthlyCount: 1 })),
  stacking: [{ ruleId: "pp_domestic", mode: "deny" }],
  rawText: "도시가스·전기요금, 이동통신요금(SKT·KT·LG U+) 자동납부 승인금액 2만원당 1천 포인트. 2만원 이상 승인 건만, 영역별 월 1회, 1회 승인금액 10만원까지(영역별 최대 5천P). 도시가스와 전기요금은 통합 영역으로 월 1건. 전월 40만원 미만 없음, 이상 1만P(2개 영역 당 5천P)",
});
/* 삼성 taptap O 구간 */
const TT: SpendTier[] = [{ min: 0, max: 300000 }, { min: 300000, max: null }];

/* taptap O 라이프스타일 패키지 1~6 (매월 앱에서 선택). 커피 1개(스타벅스 50% 또는 커피전문점 30%) × 쇼핑 1개 7% 할인,
 * 나머지 쇼핑 둘은 1% 적립. 한도: 커피 업종 월 1만원, 쇼핑 업종 월 5천원 (할인은 전월 30만원 이상, 적립은 조건 없음) — [카드 혜택 검증 원문] 2.1 */
type TtShop = "om" | "sc" | "ts";
const TT_SHOP: Record<TtShop, { label: string; target: BenefitRule["target"] }> = {
  om: { label: "오픈마켓", target: { merchants: ["G마켓", "옥션", "11번가"] } },
  sc: { label: "소셜커머스", target: { categories: ["online_shop"], merchants: ["쿠팡", "티몬", "위메프"] } },
  ts: { label: "트렌디숍", target: { categories: ["fashion"] } },
};
const TT_PACKS = ([["sb", "om"], ["sb", "sc"], ["sb", "ts"], ["coffee", "om"], ["coffee", "sc"], ["coffee", "ts"]] as const).map(([coffee, shop], i) => {
  const coffeeLabel = coffee === "sb" ? "스타벅스 50%" : "커피전문점 30%";
  const rest = (Object.keys(TT_SHOP) as TtShop[]).filter((k) => k !== shop);
  return { id: `p${i + 1}`, n: i + 1, coffee, shop, rest, name: `패키지 ${i + 1} · ${coffee === "sb" ? "스타벅스" : "커피전문점"}+${TT_SHOP[shop].label}`,
    desc: `${coffeeLabel} · ${TT_SHOP[shop].label} 7% · ${rest.map((k) => `${TT_SHOP[k].label} 1%`).join(" · ")}` };
});
const ttPackRules = (p: (typeof TT_PACKS)[number]): BenefitRule[] => {
  const pre = { ...base, cardId: "samsung_taptap_o", variantId: p.id } as const;
  return [
    p.coffee === "sb"
      ? { ...pre, id: `tt_${p.id}_sb`, name: "스타벅스 50% 할인", kind: "discount", rate: 0.5, target: { merchants: ["스타벅스"], excludes: ["무이자할부"] }, capGroupId: "tt_coffee",
          limitsByTier: [{ tier: TT[1], monthlyCap: 10000 }], rawText: `라이프스타일 패키지${p.n}: 스타벅스 50% 할인. 커피 업종 월 1만원 한도, 전월 30만원 이상` }
      : { ...pre, id: `tt_${p.id}_coffee`, name: "커피전문점 30% 할인", kind: "discount", rate: 0.3, target: { categories: ["cafe"], excludes: ["무이자할부"] }, capGroupId: "tt_coffee",
          limitsByTier: [{ tier: TT[1], monthlyCap: 10000 }], rawText: `라이프스타일 패키지${p.n}: 스타벅스를 포함한 커피전문점 30% 할인. 커피 업종 월 1만원 한도, 전월 30만원 이상` },
    { ...pre, id: `tt_${p.id}_${p.shop}`, name: `${TT_SHOP[p.shop].label} 7% 할인`, kind: "discount", rate: 0.07, target: { ...TT_SHOP[p.shop].target, excludes: ["무이자할부"] },
      capGroupId: "tt_shop", limitsByTier: [{ tier: TT[1], monthlyCap: 5000 }], rawText: `패키지${p.n}: ${TT_SHOP[p.shop].label} 7% 할인. 쇼핑 업종 월 5천원 한도, 전월 30만원 이상` },
    ...p.rest.map((k): BenefitRule => ({ ...pre, id: `tt_${p.id}_${k}`, name: `${TT_SHOP[k].label} 1% 적립`, kind: "point", rate: 0.01, target: TT_SHOP[k].target,
      limitsByTier: [{ tier: TT[0] }, { tier: TT[1] }], rawText: `패키지${p.n}: ${TT_SHOP[k].label} 1% 적립. 실적 조건 없음` })),
  ];
};

export const CARDS: CardProduct[] = [
  {
    id: "hyundai_zero3", issuer: "현대카드", name: "ZERO Edition3 (포인트형)", type: "credit", color: "#2C2C34", grade: "A", annualFee: 10000,
    tiers: [T0], spendExcludes: ["gift_card", "tax", "apt_fee", "school", "utility", "electric", "gas"],
    sourceUrl: "https://www.hyundaicard.com/", checkedAt: "2026-09-16", reviewStatus: "approved",
    rules: [
      { ...base, id: "z1", cardId: "hyundai_zero3", name: "국내외 가맹점 1.2% M포인트 적립", kind: "point", rate: 0.012,
        target: { excludes: ["utility", "electric", "gas", "apt_fee", "school", "tax"] }, limitsByTier: [{ tier: T0 }],
        rawText: "국내외 가맹점 1.2% M포인트 적립. 전월 실적·한도 없음. 카드론, 현금서비스, 연회비, 제수수료, 이자, 공과금, 전기요금, 도시가스요금, 아파트관리비, 학교납입금, 대학등록금 제외" },
    ],
  },
  {
    id: "shinhan_mrlife", issuer: "신한카드", name: "Mr.Life", type: "credit", color: "#1F5BC0", grade: "C", annualFee: 15000,
    tiers: ML, spendExcludes: ["gift_card"],
    sourceUrl: "https://www.shinhancard.com/", checkedAt: "2026-09-16", reviewStatus: "approved",
    rules: [
      { ...base, id: "ml_util", cardId: "shinhan_mrlife", name: "월납 공과금 10% 할인", kind: "discount", rate: 0.1,
        target: { categories: ["electric", "gas", "telecom"] }, eligibleAmountCap: 50000, perTxnCap: 5000,
        limitsByTier: mlCaps(3000, 7000, 10000, { dailyCount: 1 }),
        rawText: "전기요금, 도시가스요금, SKT·LG U+·KT 통신요금 10% 할인. 할인한도 3천원/7천원/1만원(전월 실적 구간별). 일 1회, 1회 승인금액 5만원까지 적용" },
      { ...base, id: "ml_mart", cardId: "shinhan_mrlife", name: "주말 3대 할인마트 10% 할인", kind: "discount", rate: 0.1,
        target: { categories: ["mart"], merchants: ["이마트", "롯데마트", "홈플러스"], daysOfWeek: [0, 6], holidayPolicy: "exclude", excludes: ["gift_card"] },
        eligibleAmountCap: 50000, perTxnCap: 5000, limitsByTier: mlCaps(3000, 7000, 10000, { dailyCount: 1 }),
        rawText: "이마트·롯데마트·홈플러스 토·일요일 10% 할인. 그 외 공휴일 미해당. 상품권 제외. 할인한도 3천원/7천원/1만원, 일 1회, 1회 승인금액 5만원까지" },
      { ...base, id: "ml_fuel", cardId: "shinhan_mrlife", name: "주말 4대 주유소 리터당 60원 할인", kind: "discount", perUnit: { unit: "liter", amount: 60 },
        target: { categories: ["fuel"], merchants: ["SK에너지", "GS칼텍스", "현대오일뱅크", "S-Oil", "에스오일"], daysOfWeek: [0, 6] },
        eligibleAmountCap: 100000, perTxnCap: 3750, // 10만원 ÷ 1,600원/L ≈ 62.5L × 60원
        limitsByTier: mlCaps(11250, 11250, 11250, { dailyCount: 1 }), // ponytail: 월 승인 30만원 ≈ 187L × 60원 근사
        rawText: "SK에너지·GS칼텍스·HD현대오일뱅크·S-Oil 주말 리터당 60원 할인. 일 1회, 1회 승인금액 10만원까지, 월 승인금액 30만원까지" },
      ...(["convenience", "hospital", "laundry"] as const).map((cat, i): BenefitRule => ({
        ...base, id: `ml_allday_${cat}`, cardId: "shinhan_mrlife", name: `Time 할인 All Day · ${["편의점", "병원·약국", "세탁소"][i]} 10%`, kind: "discount", rate: 0.1,
        target: { categories: cat === "hospital" ? ["hospital", "pharmacy"] : [cat] }, eligibleAmountCap: 10000, perTxnCap: 1000, capGroupId: "ml_allday",
        limitsByTier: mlCaps(10000, 20000, 30000, { dailyCount: 1, monthlyCount: 5 }),
        rawText: "Time 할인 All Day 10%: 편의점 / 병원·약국 / 세탁소. 할인한도 1만/2만/3만원(실적 구간별, 통합). 구분 영역별 각각 일 1회·월 5회, 1회 승인금액 1만원까지",
      })),
      ...(["online_shop", "taxi", "restaurant"] as const).map((cat, i): BenefitRule => ({
        ...base, id: `ml_night_${cat}`, cardId: "shinhan_mrlife", name: `Time 할인 Night · ${["온라인쇼핑", "택시", "식음료"][i]} 10%`, kind: "discount", rate: 0.1,
        target: { categories: cat === "restaurant" ? ["restaurant", "cafe"] : [cat], timeRange: { from: "21:00", to: "09:00" },
          merchants: cat === "online_shop" ? ["옥션", "G마켓", "AK몰", "11번가", "티몬", "위메프", "쿠팡"] : undefined },
        eligibleAmountCap: 10000, perTxnCap: 1000, capGroupId: "ml_night",
        limitsByTier: mlCaps(10000, 20000, 30000, { dailyCount: 1, monthlyCount: 10 }),
        rawText: "Time 할인 Night 10%: 오후 9시~오전 9시 온라인쇼핑(옥션·G마켓·AK몰·11번가·티몬·위메프·쿠팡) / 택시 / 식음료(한식·양식·일식·중식·뷔페·대중음식점·패스트푸드·커피전문점). 할인한도 1만/2만/3만원, 영역별 일 1회·월 10회, 1회 승인금액 1만원까지",
      })),
      { ...base, id: "ml_intake", cardId: "shinhan_mrlife", name: "인테이크몰 20% 할인", kind: "discount", rate: 0.2,
        target: { merchants: ["인테이크"] }, limitsByTier: [{ tier: ML[1], monthlyCount: 4 }, { tier: ML[2], monthlyCount: 4 }, { tier: ML[3], monthlyCount: 4 }],
        rawText: "인테이크몰 20% 할인. 전월 유실적 고객 대상, 월 4회" },
    ],
  },
  {
    id: "shinhan_pointplan", issuer: "신한카드", name: "Point Plan", type: "credit", color: "#5A34D3", grade: "D", annualFee: 15000,
    tiers: PP, spendExcludes: ["gift_card", "tax", "utility", "insurance", "apt_fee", "school"],
    sourceUrl: "https://www.shinhancard.com/", checkedAt: "2026-09-16", reviewStatus: "approved",
    rules: [
      { ...base, id: "pp_domestic", cardId: "shinhan_pointplan", name: "일상 생활비 적립 (건당 금액 구간별)", kind: "point",
        rateBands: [{ minAmount: 0, rate: 0.005 }, { minAmount: 30000, rate: 0.007 }, { minAmount: 100000, rate: 0.01 }, { minAmount: 300000, rate: 0.02 }, { minAmount: 1000000, rate: 0.03 }],
        target: { excludes: PP_DAILY_EXCLUDES }, capGroupId: "pp_daily", monthOverrides: PP_DAILY_OVERRIDES, limitsByTier: PP_DAILY_CAPS,
        stacking: [{ ruleId: "pp_weekend", mode: "allow" }, { ruleId: "pp_autopay", mode: "deny" }, { ruleId: "pp_autopay_telecom", mode: "deny" }],
        rawText: "국내 가맹점 건당 결제금액 3만원 미만 0.5%, 3~10만원 0.7%, 10~30만원 1.0%, 30~100만원 2.0%, 100만원 이상 3.0% 적립. 무이자할부·도시가스·전기·이동통신 제외. 월 통합 적립 한도: 40만원 미만 없음 / 40~80만 1만P / 80~120만 3만P / 120만 이상 5만P. 가족행사월(5월, 12월) 한도 1만P 추가. 주말 외식비 적립과 중복 제공, 정기결제 자동납부 적립과는 중복 불가" },
      { ...base, id: "pp_solpay", cardId: "shinhan_pointplan", name: "신한 SOL페이 0.1% 추가 적립", kind: "point", rate: 0.001,
        target: { payMethods: ["issuer_pay"], excludes: PP_DAILY_EXCLUDES }, capGroupId: "pp_daily", monthOverrides: PP_DAILY_OVERRIDES, limitsByTier: PP_DAILY_CAPS,
        rawText: "신한 SOL페이 결제 시 0.1% 추가 적립 (일상 생활비 적립 한도 내)" },
      { ...base, id: "pp_overseas", cardId: "shinhan_pointplan", name: "해외 결제 1% 적립", kind: "point", rate: 0.01,
        target: { categories: ["overseas"] }, capGroupId: "pp_daily", monthOverrides: PP_DAILY_OVERRIDES, limitsByTier: PP_DAILY_CAPS,
        rawText: "해외 결제 최종 원화 청구금액 기준 1% 적립. 해외 일시불 후 할부 전환 제외" },
      // 음식점과 배달앱은 금액 한도(capGroupId)와 횟수(countGroupId: 통합 일 1회·월 2/5회)를 함께 쓴다
      { ...base, id: "pp_weekend", cardId: "shinhan_pointplan", name: "주말 음식점 1천 포인트", kind: "point", fixedAmount: 1000,
        target: { categories: ["restaurant"], excludes: ["cafe"], channel: "offline", daysOfWeek: [0, 6], minAmount: 20000 }, capGroupId: "pp_weekend", countGroupId: "pp_weekend",
        limitsByTier: PP_WEEKEND_LIMITS, stacking: [{ ruleId: "pp_domestic", mode: "allow" }],
        rawText: "주말 음식점 2만원 이상 결제 시 1천 포인트. 음식점과 배달앱 통합 일 1회. 전월 40만원 미만 월 2회, 이상 월 5회. 커피 업종 제외, 오프라인 가맹점만" },
      { ...base, id: "pp_delivery", cardId: "shinhan_pointplan", name: "주말 배달앱 1천 포인트 (SOL페이)", kind: "point", fixedAmount: 1000,
        target: { categories: ["delivery"], merchants: ["배달의민족", "배민", "요기요", "땡겨요"], daysOfWeek: [0, 6], minAmount: 20000, payChannels: ["in_app"], payMethods: ["issuer_pay"] }, capGroupId: "pp_weekend", countGroupId: "pp_weekend",
        limitsByTier: PP_WEEKEND_LIMITS,
        rawText: "배달의민족·요기요·땡겨요 앱 내 카드결제 중 신한 SOL페이 결제 시 1천 포인트 (주말, 2만원 이상). 음식점과 배달앱 통합 일 1회" },
      // 도시가스·전기는 "통합 영역 월 1건"이라 한 규칙으로 묶는다 (규칙 하나 = 횟수 하나). 이동통신은 별도 영역
      ppAutopay("pp_autopay", "자동납부 도시가스·전기 2만원당 1천 포인트", ["gas", "electric"]),
      ppAutopay("pp_autopay_telecom", "자동납부 이동통신 2만원당 1천 포인트", ["telecom"]),
    ],
  },
  {
    id: "samsung_taptap_o", issuer: "삼성카드", name: "taptap O", type: "credit", color: "#2E7DF6", grade: "B", annualFee: 10000,
    tiers: TT, spendExcludes: ["gift_card", "tax", "apt_fee"],
    variants: TT_PACKS.map((p) => ({ id: p.id, name: p.name, desc: p.desc })),
    sourceUrl: "https://www.samsungcard.com/", checkedAt: "2026-09-16", reviewStatus: "approved",
    rules: [
      ...TT_PACKS.flatMap(ttPackRules),
      { ...base, id: "tt_transit", cardId: "samsung_taptap_o", name: "대중교통 10% 청구할인", kind: "discount", rate: 0.1,
        target: { categories: ["transit", "taxi"], excludes: ["무이자할부"] }, limitsByTier: [{ tier: TT[1], monthlyCap: 5000 }],
        rawText: "대중교통(버스·지하철·택시) 10% 청구할인. 시외·고속버스 제외. 전월 30만원 이상, 월 최대 5천원" },
      { ...base, id: "tt_telecom", cardId: "samsung_taptap_o", name: "통신 자동납부 10% 청구할인", kind: "discount", rate: 0.1,
        target: { categories: ["telecom"], autoPayOnly: true, excludes: ["무이자할부"] }, limitsByTier: [{ tier: TT[1], monthlyCap: 5000 }],
        rawText: "SKT·KT·LG U+ 자동납부 시 10% 청구할인. 결합상품요금·단말기 구매·대리점 결제 제외. 전월 30만원 이상, 월 최대 5천원" },
      { ...base, id: "tt_movie", cardId: "samsung_taptap_o", name: "영화 5천원 청구할인", kind: "discount", fixedAmount: 5000,
        target: { categories: ["movie"], minAmount: 10000, excludes: ["무이자할부"] }, limitsByTier: [{ tier: TT[1], dailyCount: 1, monthlyCount: 2, yearlyCount: 12 }],
        rawText: "영화 1만원 이상 결제 시 5천원 청구할인. 일 1회, 월 2회, 연 12회. CGV·롯데시네마, 예매 대행 사이트 제외. 전월 30만원 이상" },
    ],
  },
  {
    id: "lotte_likit2", issuer: "롯데카드", name: "LOCA LIKIT 2.0", type: "credit", color: "#E5484D", grade: "A", annualFee: 15000,
    tiers: [T0], spendExcludes: ["gift_card", "tax", "apt_fee"],
    sourceUrl: "https://www.lottecard.co.kr/", checkedAt: "2026-09-16", reviewStatus: "approved",
    rules: [
      { ...base, id: "lk_dom", cardId: "lotte_likit2", name: "국내 1.2% 할인", kind: "discount", rate: 0.012, target: { excludes: ["overseas", "gift_card", "tax", "apt_fee"] }, limitsByTier: [{ tier: T0 }], rawText: "국내 1.2% 할인, 실적 조건과 할인 한도 없음" },
      { ...base, id: "lk_ovs", cardId: "lotte_likit2", name: "해외 2.0% 할인", kind: "discount", rate: 0.02, target: { categories: ["overseas"] }, limitsByTier: [{ tier: T0 }], rawText: "해외 2.0% 할인, 실적 조건과 할인 한도 없음" },
    ],
  },
  {
    id: "woori_super2", issuer: "우리카드", name: "카드의정석2 SUPER", type: "credit", color: "#1DA466", grade: "A", annualFee: 20000,
    tiers: [T0], spendExcludes: ["gift_card", "tax", "apt_fee"],
    sourceUrl: "https://pc.wooricard.com/", checkedAt: "2026-09-16", reviewStatus: "approved",
    rules: [
      { ...base, id: "ws_all", cardId: "woori_super2", name: "국내외 2.0% 청구할인", kind: "discount", rate: 0.02, target: { excludes: ["gift_card", "tax", "apt_fee", "무이자할부"] }, limitsByTier: [{ tier: T0 }], rawText: "국내외 2.0% 청구할인, 전월 실적 없음" },
    ],
  },
  {
    id: "shinhan_simpleplan", issuer: "신한카드", name: "Simple Plan+", type: "credit", color: "#A6A6B6", grade: "A",
    tiers: [T0], spendExcludes: ["gift_card"],
    sourceUrl: "https://www.shinhancard.com/", checkedAt: "2026-09-16", reviewStatus: "approved",
    rules: [
      { ...base, id: "sp_all", cardId: "shinhan_simpleplan", name: "국내외 정률 적립", kind: "point", target: {}, limitsByTier: [{ tier: T0 }], supported: false, unsupportedReason: "적립률 원문 확인 전 · 검수 대기", rawText: "실적 없이 한도 없이 (카드다모아 요약)", confidence: 0.4 },
    ],
  },
  ...WOORI_RENTAL_CARDS,
  ...KB_NARASARANG_CARDS,
  ...RECEIPT_PICK_CARDS,
];

/* 사용자가 직접 추가한 카드 (CARD-02). 스토어가 바뀔 때마다 registerCustomCards로 알려 주고,
 * cardById·cardLabel은 기본 카드 다음으로 여기서 찾는다. 계산은 store의 catalog(= CARDS + 사용자 카드)를 쓴다 */
let customCards: CardProduct[] = [];
export const registerCustomCards = (list: CardProduct[]) => { customCards = list; };
/** 카드 고르는 화면(가입 /welcome, 카드 등록 /cards/add)에서 검색 전에 보여 줄 대표 카드.
 *  ponytail: 고정 목록 — 가입자가 쌓이면 user_cards 보유 수 상위로 바꿀 것 (RLS 때문에 집계 RPC 필요) */
export const POPULAR_CARD_IDS = ["hyundai_zero3", "shinhan_mrlife", "samsung_taptap_o", "lotte_likit2", "woori_super2"];
/** 검색어가 없으면 전체 카드를 대표 카드 → 나머지 순으로, 있으면 카드사·카드명으로 찾는다 ('카드'·공백·대소문자 무시).
 *  ponytail: 카드가 17장이라 다 보여준다. 수십 장이 넘으면 검색 전에는 대표 카드만 보여주는 방식으로 되돌릴 것 */
export function cardSearch(catalog: CardProduct[], q: string) {
  const norm = (s: string) => s.toLowerCase().replace(/카드|\s/g, "");
  if (q.trim()) return catalog.filter((c) => norm(c.issuer + c.name).includes(norm(q)));
  const rank = (id: string) => { const i = POPULAR_CARD_IDS.indexOf(id); return i < 0 ? 99 : i; };
  return [...catalog].sort((a, b) => rank(a.id) - rank(b.id)); // sort는 안정 정렬이라 나머지는 카탈로그 순서 유지
}
export const isCustomCardId = (id?: string) => !!id && id.startsWith("custom_");
export const cardById = (id?: string) => CARDS.find((c) => c.id === id) ?? customCards.find((c) => c.id === id);
export const cardLabel = (id?: string) => { const c = cardById(id); return c ? `${c.issuer.replace("카드", "")} ${c.name}` : "—"; };
/* 정성 혜택 종류 — 카드 상세 표시용 (merchants.ts의 INDUSTRY와 같은 형태) */
export const PERK_KIND: Record<PerkKind, { label: string; icon: string }> = {
  lounge: { label: "라운지·여행", icon: "flight" },
  voucher: { label: "바우처·쿠폰", icon: "confirmation_number" },
  rate: { label: "우대금리", icon: "savings" },
  fee_waiver: { label: "연회비", icon: "credit_card_off" },
  status: { label: "등급·멤버십", icon: "workspace_premium" },
  installment: { label: "무이자 할부", icon: "calendar_month" },
  etc: { label: "기타", icon: "star" },
};
export const GRADE_DESC: Record<CardProduct["grade"], string> = { A: "무실적·무한도 정률", B: "단일 실적 + 단일 월 한도", C: "실적 구간별 한도, 요일·시간대", D: "통합 한도 매트릭스, 구간별 적립률, 중복·배타" };

/** 지금 쌓고 있는 실적 창 — 카드 목록·상세·홈·알림이 같은 숫자를 쓰도록 여기 둔다.
 *  engine의 CardMonth.thisSpend는 "보고 있는 달(ym)에 끝나는 창"인데, 청구 사이클 카드는 그 창이 달 중간(N-1일)에 끝나
 *  오늘 이미 마감됐을 수 있다 (예: 사이클 10일, 9/20에 8/10~9/9). 그럴 때는 오늘 결제가 들어가는 다음 창(9/10~10/9)을 보여준다.
 *  지난달을 보면 창은 마감(closed) */
export function spendProgress(txns: Transaction[], card: CardProduct, uc: UserCard, ym: string, today: string) {
  const cycle = uc.statementCycleDay;
  const wym = ymOf(today) === ym && today > spendWindow(ym, cycle).to ? nextYm(ym) : ym; // 이 창이 끝나는 달
  const spend = monthSpend(txns, card.id, wym, card, cycle);
  const nextTier = card.tiers.find((t) => t.min > 0 && spend < t.min);
  const goal = nextTier?.min ?? [...card.tiers].reverse()[0].min;
  return {
    label: spendWindowLabel(wym, cycle), // "9월" 또는 "9/10~10/9"
    forYm: nextYm(wym), // 이 창의 실적으로 혜택 구간이 정해지는 달
    spend, nextTier, tier: resolveTier(spend, card.tiers),
    pct: goal > 0 ? Math.min(100, (spend / goal) * 100) : 100,
    closed: spendWindow(wym, cycle).to < today, // 이미 끝난 창 — "N원 남음"을 보이지 않는다
  };
}
