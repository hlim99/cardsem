/* 데모 영수증(수영장 정기권·강습, 약국, 카페, 백화점)에 혜택이 큰 카드 3종. 2026-10-12 각 카드사 공식 상품 페이지 원문 확인.
 * 셋 다 스포츠센터·수영장 업종 할인이 있고, 한 서비스가 약국까지 함께 묶는다 (KB 건강 영역 / BC HEALTH&BEAUTY / 신한은 별도 영역).
 * ponytail: 아직 CARDS에 등록하지 않은 별도 목록. 등록하려면 cards.ts의 CARDS에 펼쳐 넣고 seed.sql을 다시 만든다 (docs/10 7.1)
 * 공통 한계: "할인 받은 매출은 실적 제외"(KB)·"FLEX 이용금액 실적 제외"(BC)처럼 가맹점·혜택 단위 실적 제외는 spendExcludes로 표현 못 함.
 *          "카드 사용 등록 다음 달 말일까지 실적 무관 최저 구간" 유예도 엔진에 발급일 개념이 없어 빠짐 (사용자가 실적 보정으로 맞춤) */
import type { BenefitRule, CardProduct, SpendTier } from "../types";

const base = { confidence: 0.9, supported: true } as const;
const tiers = (...mins: number[]): SpendTier[] => mins.map((min, i) => ({ min, max: mins[i + 1] ?? null }));
/* 첫 구간(실적 미달)에는 행이 없고, 둘째 구간부터 한도를 차례로 준다 */
const caps = (ts: SpendTier[], ...amounts: number[]) => amounts.map((monthlyCap, i) => ({ tier: ts[i + 1], monthlyCap }));
const NO_FREE = ["무이자할부", "gift_card"];

/* ───────── KB국민 YOU Wish up: 40만/80만 ───────── */
const KW = tiers(0, 400000, 800000);
const KW_URL = "https://card.kbcard.com/CRD/DVIEW/HCAMCXPRICAC0076?mainCC=a&cooperationcode=09298";
const KW_NOTE = "최초 사용등록일로부터 다음달 말일(실적유예기간)까지는 전월 이용실적 40만원 미만시에도 각 할인 서비스의 1구간 월 할인한도 50%까지만 할인 제공";
/* 1·2구간 한도가 같은 서비스 */
const kwFlat = (cap: number) => KW.slice(1).map((tier) => ({ tier, monthlyCap: cap }));

/* ───────── 신한 Discount Plan+: 40만/80만/120만/180만 ───────── */
const DP = tiers(0, 400000, 800000, 1200000, 1800000);
const DP_URL = "https://www.shinhancard.com/pconts/html/card/apply/credit/1232390_2207.html";
const DP_TIME = caps(DP, 5000, 10000, 15000, 20000);
const DP_DAILY = caps(DP, 15000, 25000, 35000, 50000);
const DP_MONTHLY = caps(DP, 5000, 10000, 15000, 20000);
const dpDaily = (r: Pick<BenefitRule, "id" | "name" | "rawText"> & { rate: number; target: BenefitRule["target"] }): BenefitRule => ({
  ...base, kind: "discount", cardId: "shinhan_discountplan_plus", capGroupId: "rp_dp_daily", eligibleAmountCap: 50000,
  limitsByTier: DP_DAILY.map((l) => ({ ...l, dailyCount: 1, monthlyCount: 5 })), ...r, target: { excludes: NO_FREE, ...r.target },
});
const DP_SHOP_RAW = "[Daily Plan 서비스] 쇼핑 10% 결제일 할인 - 마트 / 온라인쇼핑 / 아울렛 / 잡화. 각 영역(마트/온라인쇼핑/아울렛/잡화) 별로 일 1회, 월 5회까지 할인됩니다. 할인받기 전 이용금액 기준 1회 5만원까지 할인됩니다. 월 통합 혜택 한도(Daily Plan): 40만원 이상 80만원 미만 1만 5천원 / 80만원 이상 120만원 미만 2만 5천원 / 120만원 이상 180만원 미만 3만 5천원 / 180만원 이상 5만원";
const DP_MOVE_RAW = "[Daily Plan 서비스] 이동 5% 결제일 할인 - 주유 / 카쉐어링 / 주차 / 택시. 주유 SK에너지, GS칼텍스, HD현대오일뱅크, S-OIL / 카쉐어링 쏘카 / 주차 주차장 업종, 카카오T 주차 / 택시 택시 업종, 카카오T 택시. 각 영역 별로 일 1회, 월 5회까지, 할인받기 전 이용금액 기준 1회 5만원까지 할인됩니다. 주유 영역은 휘발유, 경유, 등유만 할인되며 LPG 이용금액은 할인되지 않습니다.";
const DP_LIFE_RAW = "[Daily Plan 서비스] 생활 5% 결제일 할인 - 해외 / 병원·약국 / 미용실 / 온라인서점. 병원·약국: 종합병원, 개인병원, 치과병원, 응급실운영병원, 약국 업종. 온라인서점: 교보문고, YES24. 각 영역 별로 일 1회, 월 5회까지 할인됩니다. 할인받기 전 이용금액 기준 1회 5만원까지 할인됩니다. 해외 영역은 해외겸용(Mastercard) 카드 이용 시에만 할인되며, 최종 원화 청구금액을 기준으로 할인됩니다.";
const DP_TIME_RAW = "Time Plan 서비스 - DAY(07~15시) 10% 결제일 할인: 카페(스타벅스, 투썸플레이스, 폴바셋, 커피빈, 메가커피, 이디야) / 음식점(한식, 일식, 양식, 중식, 일반대중음식, 패스트푸드, 뷔페 업종). NIGHT(18~22시) 10% 결제일 할인: 편의점(CU, GS25, 세븐일레븐, 이마트24) / 배달앱(배달의민족, 요기요, 쿠팡이츠). 각 영역 별로 일 1회 할인됩니다. 할인받기 전 이용금액 기준 1회 1만원까지 할인됩니다. 카페, 음식점, 편의점 영역은 오프라인 매장 이용 시에만 할인됩니다. 배달앱 영역은 공식 배달앱에서 '앱 내 카드결제' 시 할인됩니다. 월 통합 혜택 한도(Time Plan): 40만원 이상 80만원 미만 5천원 / 80만원 이상 120만원 미만 1만원 / 120만원 이상 180만원 미만 1만 5천원 / 180만원 이상 2만원";
const dpTime = (r: Pick<BenefitRule, "id" | "name"> & { target: BenefitRule["target"] }): BenefitRule => ({
  ...base, kind: "discount", rate: 0.1, cardId: "shinhan_discountplan_plus", capGroupId: "rp_dp_time", eligibleAmountCap: 10000,
  limitsByTier: DP_TIME.map((l) => ({ ...l, dailyCount: 1 })), rawText: DP_TIME_RAW, ...r, target: { excludes: NO_FREE, ...r.target },
});
const DP_MONTHLY_RAW = "[Monthly Plan 서비스] 정기결제(공과금/디지털구독·멤버십/피트니스) 최대 20% 할인 - 공과금 10% / 디지털구독·멤버십 20% / 피트니스 5% 할인. 공과금: 아파트관리비, 도시가스, 전기요금, 통신요금(SKT/KT/LGU+). 디지털구독: 넷플릭스, 유튜브 프리미엄, 티빙, 디즈니플러스, 밀리의서재. 멤버십: 네이버플러스 멤버십, 쿠팡 와우 멤버십. 피트니스: 스포츠센터/레포츠클럽, 테니스장, 수영장, 실내/외 골프장 업종. 할인받기 전 이용금액 기준 공과금 1회 5만원, 디지털구독·멤버십 1회 1만원, 피트니스 1회 10만원까지 할인됩니다. 공과금 영역은 자동납부 시에만 할인됩니다. 공과금 중 통신 요금은 월 1회, 피트니스 영역은 일 1회 할인되며, 그 외 대상 가맹점 및 디지털구독, 멤버십 영역은 일/월 횟수 제한없이 할인됩니다. 월 통합 혜택 한도(Monthly Plan 정기결제): 40만원 이상 80만원 미만 5천원 / 80만원 이상 120만원 미만 1만원 / 120만원 이상 180만원 미만 1만 5천원 / 180만원 이상 2만원";
const dpMonthly = (r: Pick<BenefitRule, "id" | "name" | "rate" | "eligibleAmountCap"> & { target: BenefitRule["target"]; extra?: object }): BenefitRule => ({
  ...base, kind: "discount", cardId: "shinhan_discountplan_plus", capGroupId: "rp_dp_monthly", rawText: DP_MONTHLY_RAW,
  limitsByTier: DP_MONTHLY.map((l) => ({ ...l, ...r.extra })), id: r.id, name: r.name, rate: r.rate, eligibleAmountCap: r.eligibleAmountCap,
  target: { excludes: NO_FREE, ...r.target },
});

/* ───────── 신세계 BC 바로 SEVEN FLEX: 30만/60만/90만/120만 ───────── */
const BF = tiers(0, 300000, 600000, 900000, 1200000);
const BF_URL = "https://m.bccard.com/app/mobileweb/CardDetail.do?exec=cardDetail&cardGdsNo=101883";
/* ponytail: 월 통합 할인한도(1만/2만/3만/5만) 하나로만 셈. 카테고리별 한도(60만 미만 1만, 이상 2만 · PAY 1.5만)는 빠짐
 *  → 30~90만 구간은 통합 한도가 더 작아 정확하고, 90만 이상에서 한 카테고리에 2만원 넘게 몰리면 과대 계산. 규칙별 한도 + 통합 한도 2단 묶음이 엔진에 생기면 고친다 */
const BF_CAPS = caps(BF, 10000, 20000, 30000, 50000);
const BF_COMMON = "공통 : 백화점/쇼핑몰/할인점 내 임대매장 이용금액 제외. 할인 대상이 중복으로 해당되는 경우 할인금액이 높은 서비스가 우선 적용 (매출 건당 하나의 서비스만 적용). 카테고리별 월 할인한도: FLEX/HEALTH&BEAUTY/YUMMY/DAILY 각 20,000원, PAY 15,000원 (전월실적 60만원 미만인 경우 카테고리별 월 할인한도 10,000원). 월 통합 할인한도: 전월실적 30만원 이상 10,000원 / 60만원 이상 20,000원 / 90만원 이상 30,000원 / 120만원 이상 50,000원. 청구할인 제외: 무이자할부 이용금액, 기프트/선불카드 구매 및 충전금액, 상품권 구매금액";
const bf = (r: Omit<BenefitRule, "cardId" | "kind" | "rate" | "limitsByTier" | "capGroupId" | "confidence" | "supported"> & Partial<BenefitRule>): BenefitRule => ({
  ...base, kind: "discount", rate: 0.07, cardId: "bc_sevenflex", capGroupId: "rp_bf_all", limitsByTier: BF_CAPS, ...r,
  target: { excludes: NO_FREE, ...r.target }, rawText: `${r.rawText} ${BF_COMMON}`,
});

export const RECEIPT_PICK_CARDS: CardProduct[] = [
  {
    id: "kb_youwishup", issuer: "KB국민카드", name: "KB YOU Wish up", type: "credit", color: "#5C4F45", grade: "D", annualFee: 50000,
    tiers: KW, spendExcludes: ["gift_card", "apt_fee", "school", "tax", "utility", "electric", "gas"],
    perks: [
      { id: "rp_kw_k_coupon", kind: "voucher", name: "연 1회 쿠폰 (포인트리 2만점 / 영화관람권 2매)", value: 20000,
        detail: "발급 다음 해부터, 연회비 약정기간 이용실적 600만원 이상이면 포인트리 2만점이나 롯데시네마 관람권 2매 중 하나",
        rawText: "쿠폰 서비스 (2종 중 택1) 01. KB국민카드 포인트리 2만점 02. 롯데시네마 모바일 영화관람권 2매. 카드 발급 첫해: 이용불가. 다음해 이후: 연회비 전액 납부 및 해당 카드로 전년도 연회비 약정기간 동안 연간 이용실적 600만원 이상 이용 시 제공" },
      { id: "rp_kw_k_master", kind: "lounge", name: "Mastercard 공항 라운지·발레파킹", detail: "전월 40만원 이상이면 국내 공항 라운지 연 2회, 공항·호텔 발레파킹 월 2회·연 6회",
        rawText: "KB국민카드 선택 서비스: 국내 공항 발레파킹 서비스 월 2회, 연 6회 / 국내 공항 라운지 서비스 연 2회 / 국내 호텔 발레파킹 서비스 월 2회, 연 6회. 전월 이용실적 40만원 이상" },
    ],
    sourceUrl: KW_URL, checkedAt: "2026-10-12", reviewStatus: "approved",
    rules: [
      // 건강 영역: 병원·약국·스포츠가 한 한도를 같이 쓴다. 스포츠센터·수영장 정기권이 여기 들어간다
      { ...base, id: "rp_kw_health", cardId: "kb_youwishup", name: "병원·약국·스포츠 5% 할인", kind: "discount", rate: 0.05,
        target: { categories: ["hospital", "pharmacy", "sports"], excludes: NO_FREE }, limitsByTier: caps(KW, 5000, 10000),
        stacking: [{ ruleId: "rp_kw_pay", mode: "allow" }],
        rawText: `병원, 약국, 스포츠 5% 할인. 병원: 종합병원, 일반병원(치과/한방), 일반의원(치과/한의원), 건강진단센터 업종 / 약국: 약국 업종 / 스포츠: 스포츠용품점, 레저용품점, 골프(연습)장, 테니스장, 볼링장, 스키장, 수영장, 종합스포츠센터, 레포츠클럽, 요가 업종. 대상 가맹점은 당사 업종분류기준에 따름. 월 할인한도: 1구간 40만원 이상 5,000원 / 2구간 80만원 이상 10,000원. ${KW_NOTE}` },
      // 여가 영역: 온라인쇼핑·주유·커피 통합 한도
      { ...base, id: "rp_kw_coffee", cardId: "kb_youwishup", name: "커피전문점 5% 할인 (오프라인)", kind: "discount", rate: 0.05,
        target: { categories: ["cafe"], channel: "offline", excludes: NO_FREE }, capGroupId: "rp_kw_leisure", limitsByTier: caps(KW, 5000, 10000),
        rawText: "온라인쇼핑, 주유, 커피 5% 할인. 커피: 커피 오프라인 매장 (커피전문점 업종). [커피] 오프라인 매장은 커피전문점 업종 결제 건에 한함(앱주문 제외). 백화점/대형마트 등 일부 입점 매장 제외. 월 할인한도(온라인쇼핑, 주유, 커피 통합): 1구간 40만원 이상 5,000원 / 2구간 80만원 이상 10,000원" },
      { ...base, id: "rp_kw_fuel", cardId: "kb_youwishup", name: "SK에너지·GS칼텍스 주유 5% 할인", kind: "discount", rate: 0.05,
        target: { categories: ["fuel"], merchants: ["SK에너지", "GS칼텍스"], excludes: NO_FREE }, capGroupId: "rp_kw_leisure", limitsByTier: caps(KW, 5000, 10000),
        rawText: "온라인쇼핑, 주유, 커피 5% 할인. 주유: SK에너지, GS칼텍스. 월 할인한도(통합): 1구간 40만원 이상 5,000원 / 2구간 80만원 이상 10,000원" },
      { ...base, id: "rp_kw_online", cardId: "kb_youwishup", name: "온라인몰 5% 할인 (KB Pay)", kind: "discount", rate: 0.05,
        target: { merchants: ["G마켓", "11번가", "SSG.COM", "무신사", "지그재그", "W컨셉", "29CM", "오늘의집", "다이소몰"], channel: "online", payMethods: ["issuer_pay"], excludes: [...NO_FREE, "delivery"] },
        capGroupId: "rp_kw_leisure", limitsByTier: caps(KW, 5000, 10000),
        rawText: "온라인쇼핑 (KB Pay 결제 시) G마켓, 11번가, SSG.COM, 무신사, 지그재그, W컨셉, 29CM, 오늘의집, 온라인 다이소몰. [온라인몰] KB Pay 결제 시에만 할인 제공. 상품권, 여행 티켓, 도서, 배달, 멤버십 구독료, 외부 제휴몰, 별도 팝업사이트 제외. 월 할인한도(통합): 1구간 40만원 이상 5,000원 / 2구간 80만원 이상 10,000원" },
      // KB Pay 10%는 음식·건강·여가·차량 할인과 겹쳐 받고, 통신·구독 할인과는 겹치지 않는다
      { ...base, id: "rp_kw_pay", cardId: "kb_youwishup", name: "KB Pay 결제 10% 할인", kind: "discount", rate: 0.1,
        target: { payMethods: ["issuer_pay"], excludes: [...NO_FREE, "overseas"] }, perTxnCap: 2500, limitsByTier: kwFlat(5000),
        stacking: [{ ruleId: "rp_kw_tel", mode: "deny" }, { ruleId: "rp_kw_ott", mode: "deny" }],
        rawText: `KB Pay 10% 할인. 국내 가맹점에서 KB Pay로 결제한 이용건. 해외 가맹점 결제건 제외. 음식/건강/여가/차량 할인서비스와 중복 적용 가능 (단, 통신/구독 할인은 중복 적용 불가). 월 할인한도: 1구간 40만원 이상·2구간 80만원 이상 5,000원 (건당 2,500원 한도). ${KW_NOTE}` },
      // 음식점·편의점은 한 한도
      { ...base, id: "rp_kw_food", cardId: "kb_youwishup", name: "음식점 10% 할인", kind: "discount", rate: 0.1,
        target: { categories: ["restaurant"], excludes: NO_FREE }, capGroupId: "rp_kw_food", perTxnCap: 2500, limitsByTier: kwFlat(5000),
        rawText: "음식점, 편의점 10% 할인. 음식점(한식, 일식, 중식, 양식, 뷔페, 패밀리레스토랑, 일반음식점 업종), 편의점(GS25, CU). 백화점/대형마트 등 일부 입점 매장 제외. 월 할인한도 5,000원 (건당 2,500원 한도)" },
      { ...base, id: "rp_kw_cvs", cardId: "kb_youwishup", name: "편의점(GS25·CU) 10% 할인", kind: "discount", rate: 0.1,
        target: { categories: ["convenience"], merchants: ["GS25", "CU"], channel: "offline", excludes: NO_FREE }, capGroupId: "rp_kw_food", perTxnCap: 2500, limitsByTier: kwFlat(5000),
        rawText: "음식점, 편의점 10% 할인. 편의점(GS25, CU). 편의점은 오프라인 매장 일반 결제건에 한함(온라인 가맹점 제외). 월 할인한도 5,000원 (건당 2,500원 한도)" },
      // 이동통신·OTT는 표에서 한 한도 칸을 같이 쓴다
      { ...base, id: "rp_kw_tel", cardId: "kb_youwishup", name: "이동통신 자동납부 10% 할인", kind: "discount", rate: 0.1,
        target: { categories: ["telecom"], merchants: ["SKT", "SK텔레콤", "KT", "LG U+", "LG유플러스", "Liiv M"], autoPayOnly: true, excludes: NO_FREE },
        capGroupId: "rp_kw_tel", perTxnCap: 2500, limitsByTier: kwFlat(5000),
        rawText: "이동통신요금 10% 할인. SKT, KT, LG U+, Liiv M 이동통신 자동납부 요금. 인터넷, IPTV 등 결합상품 제외. 월 할인한도: 이동통신요금 5,000원 (건당 2,500원 한도)" },
      { ...base, id: "rp_kw_ott", cardId: "kb_youwishup", name: "OTT 정기결제 30% 할인", kind: "discount", rate: 0.3, confidence: 0.8,
        target: { merchants: ["넷플릭스", "유튜브", "웨이브", "티빙", "디즈니"], autoPayOnly: true, payChannels: ["web"], excludes: NO_FREE },
        capGroupId: "rp_kw_tel", perTxnCap: 2500, limitsByTier: kwFlat(5000),
        rawText: "OTT 30% 할인. 넷플릭스, 유튜브, 웨이브, 티빙, 디즈니 플러스 공식 홈페이지를 통한 정기결제 이용건. 간편결제, 인앱 결제, 단건 결제, 포인트 및 캐시 충전 등은 제외. 유튜브는 유튜브 프리미엄 멤버십 결제건에 한함" },
      { ...base, id: "rp_kw_car", cardId: "kb_youwishup", name: "주차장·세차장 10% 할인", kind: "discount", rate: 0.1,
        target: { merchants: ["주차", "세차"] }, limitsByTier: kwFlat(10000),
        supported: false, unsupportedReason: "주차장·세차장 업종이 업종 목록에 없어 가맹점 이름만으로는 판정 불가", confidence: 0.7,
        rawText: "주차장, 세차장 10% 할인. 주차장, 세차장 업종. 주유소 내 세차장은 당사 업종분류기준에 따라 제외될 수 있음. 월 할인한도 10,000원" },
    ],
  },
  {
    id: "shinhan_discountplan_plus", issuer: "신한카드", name: "Discount Plan+", type: "credit", color: "#1B2A4A", grade: "D", annualFee: 50000,
    tiers: DP, spendExcludes: ["gift_card", "tax", "school", "apt_fee", "gas", "electric", "utility"],
    perks: [
      { id: "rp_dp_k_planday", kind: "etc", name: "Plan Day — 매월 1일 할인율 2배", detail: "매월 1일 Time Plan·Daily Plan 첫 할인 거래(서비스당 1회)에 할인율 2배. 월 통합 한도·횟수 안에서",
        rawText: "[Plan Day 서비스] 매월 1일 Time Plan, Daily Plan 서비스 2배 할인. 매월 1일 Time Plan 서비스, Daily Plan 서비스 첫 번째 할인 거래에 할인율 2배 적용(서비스당 1회). Daily Plan 서비스의 해외 영역에는 Plan Day 서비스가 적용되지 않습니다. Plan Day 서비스는 Time Plan 서비스, Daily Plan 서비스의 월 통합 할인 한도 및 일/월 횟수 한도 내에서 제공됩니다." },
      { id: "rp_dp_k_reward", kind: "etc", name: "Monthly 리워드 최대 5천원 캐시백", detail: "전월 150만원 이상 3천원, 180만원 이상 5천원을 다다음달 20일에 캐시백",
        rawText: "Monthly 리워드 최대 5천원 캐시백. 전월 150만원 이상 이용 시 3천원 캐시백, 전월 180만원 이상 이용 시 5천원 캐시백. 전월 이용금액을 기준으로 다다음달 20일에 캐시백이 제공됩니다." },
      { id: "rp_dp_k_mart", kind: "voucher", name: "장보기 3만원 캐시백 (연 1회)", value: 30000, detail: "이마트·트레이더스·롯데마트 오프라인 3만원 이상 결제 시 연 1회. 2년차부터는 전년도 1,000만원 이상 이용 시",
        rawText: "[Annual Plan 서비스] 장보기 3만원 캐시백 (연 1회). 마트(이마트, 트레이더스 홀세일 클럽, 롯데마트) 3만원 이상 결제 시 3만원 캐시백. 발급 초년도의 경우 연회비 납부 시 이용 실적에 관계 없이 제공되며, 발급 2차년도부터는 연회비 납부 및 전년도 이용금액 1,000만원 이상 시 제공됩니다." },
      { id: "rp_dp_k_annual", kind: "voucher", name: "스피드메이트 정비·테마파크 현장 할인", detail: "전월 30만원 이상. 스피드메이트 엔진오일 등 통합 월 1회·연 3회, 에버랜드·롯데월드 50%·캐리비안베이 30% 테마파크별 연 3회",
        rawText: "[Annual Plan 서비스] 스피드메이트 정비 현장 할인·테마파크 할인 (전월실적 30만원 이상). 국산차 엔진오일 교환 3만원 할인 등 통합 월 1회, 연 3회. 에버랜드, 롯데월드 자유이용권 50% 할인, 캐리비안베이 입장권 30% 할인. 테마파크별 일 1회, 연 3회. 본인 자유이용권 및 입장권에 한하여 할인됩니다." },
    ],
    sourceUrl: DP_URL, checkedAt: "2026-10-12", reviewStatus: "approved",
    rules: [
      // Monthly Plan: 피트니스·공과금·디지털구독이 정기결제 통합 한도 하나를 같이 쓴다
      dpMonthly({ id: "rp_dp_fitness", name: "피트니스(스포츠센터·수영장) 5% 할인", rate: 0.05, eligibleAmountCap: 100000,
        target: { categories: ["sports"] }, extra: { dailyCount: 1 } }),
      dpMonthly({ id: "rp_dp_bill", name: "공과금 자동납부 10% 할인", rate: 0.1, eligibleAmountCap: 50000,
        target: { categories: ["apt_fee", "gas", "electric"], autoPayOnly: true } }),
      dpMonthly({ id: "rp_dp_telecom", name: "통신요금 자동납부 10% 할인 (월 1회)", rate: 0.1, eligibleAmountCap: 50000,
        target: { categories: ["telecom"], merchants: ["SKT", "SK텔레콤", "KT", "LG U+", "LGU+", "LG유플러스"], autoPayOnly: true }, extra: { monthlyCount: 1 } }),
      dpMonthly({ id: "rp_dp_digital", name: "디지털구독·멤버십 정기결제 20% 할인", rate: 0.2, eligibleAmountCap: 10000,
        target: { merchants: ["넷플릭스", "유튜브", "티빙", "디즈니", "밀리의서재", "네이버플러스", "쿠팡 와우", "쿠팡와우"], autoPayOnly: true } }),
      { ...base, id: "rp_dp_movie", cardId: "shinhan_discountplan_plus", name: "CGV·롯데시네마 예매 5천원 할인", kind: "discount", fixedAmount: 5000,
        target: { categories: ["movie"], merchants: ["CGV", "롯데시네마"], minAmount: 12000, excludes: NO_FREE },
        limitsByTier: caps(DP, 5000, 5000, 5000, 5000).map((l) => ({ ...l, monthlyCount: 1 })),
        rawText: "[Monthly Plan 서비스] 영화 예매 5천원 결제일 할인. CGV, 롯데시네마 영화 예매 5천원 할인(월1회). 할인 받기 전 이용 금액 기준 1회 1만 2천원 이상인 경우 할인됩니다. 영화 예매 시에만 할인되며 영화 예매권, 상품권, 매점 이용 시에는 할인되지 않습니다." },
      // Daily Plan: 영역마다 일 1회·월 5회, 1회 5만원까지, 쇼핑·이동·생활 통합 한도
      dpDaily({ id: "rp_dp_medi", name: "병원·약국 5% 할인", rate: 0.05, target: { categories: ["hospital", "pharmacy"] }, rawText: DP_LIFE_RAW }),
      dpDaily({ id: "rp_dp_overseas", name: "해외 일시불 5% 할인", rate: 0.05, target: { categories: ["overseas"] }, rawText: DP_LIFE_RAW }),
      dpDaily({ id: "rp_dp_book", name: "온라인서점 5% 할인", rate: 0.05, target: { merchants: ["교보문고", "YES24", "예스24"], channel: "online" }, rawText: DP_LIFE_RAW }),
      dpDaily({ id: "rp_dp_mart", name: "마트 10% 할인", rate: 0.1, target: { categories: ["mart"], merchants: ["이마트", "트레이더스", "롯데마트"], channel: "offline" }, rawText: DP_SHOP_RAW }),
      dpDaily({ id: "rp_dp_online", name: "온라인쇼핑 10% 할인", rate: 0.1, target: { merchants: ["네이버플러스 스토어", "쿠팡", "SSG.COM", "무신사", "29CM"], channel: "online", excludes: [...NO_FREE, "delivery", "subscription"] }, rawText: DP_SHOP_RAW }),
      dpDaily({ id: "rp_dp_outlet", name: "프리미엄 아울렛 10% 할인", rate: 0.1, target: { merchants: ["신세계사이먼", "현대 프리미엄 아울렛", "현대프리미엄아울렛", "롯데 프리미엄 아울렛", "롯데프리미엄아울렛"], channel: "offline" }, rawText: DP_SHOP_RAW }),
      dpDaily({ id: "rp_dp_goods", name: "올리브영·다이소 10% 할인", rate: 0.1, target: { merchants: ["올리브영", "다이소"] }, rawText: DP_SHOP_RAW }),
      dpDaily({ id: "rp_dp_fuel", name: "4대 정유사 주유 5% 할인", rate: 0.05, target: { categories: ["fuel"], merchants: ["SK에너지", "GS칼텍스", "현대오일뱅크", "S-OIL", "S-Oil", "에스오일"] }, rawText: DP_MOVE_RAW }),
      dpDaily({ id: "rp_dp_taxi", name: "택시 5% 할인", rate: 0.05, target: { categories: ["taxi"] }, rawText: DP_MOVE_RAW }),
      dpDaily({ id: "rp_dp_socar", name: "쏘카 5% 할인", rate: 0.05, target: { merchants: ["쏘카"] }, rawText: DP_MOVE_RAW }),
      // Time Plan: 시간대 할인, 영역별 일 1회, 1회 1만원까지
      dpTime({ id: "rp_dp_cafe", name: "DAY 카페 10% 할인 (07~15시)", target: { categories: ["cafe"], merchants: ["스타벅스", "투썸", "폴바셋", "커피빈", "메가커피", "메가MGC", "이디야"], channel: "offline", timeRange: { from: "07:00", to: "15:00" } } }),
      dpTime({ id: "rp_dp_food", name: "DAY 음식점 10% 할인 (07~15시)", target: { categories: ["restaurant"], channel: "offline", timeRange: { from: "07:00", to: "15:00" } } }),
      dpTime({ id: "rp_dp_cvs", name: "NIGHT 편의점 10% 할인 (18~22시)", target: { categories: ["convenience"], merchants: ["CU", "GS25", "세븐일레븐", "이마트24"], channel: "offline", timeRange: { from: "18:00", to: "22:00" } } }),
      dpTime({ id: "rp_dp_delivery", name: "NIGHT 배달앱 10% 할인 (18~22시)", target: { categories: ["delivery"], merchants: ["배달의민족", "배민", "요기요", "쿠팡이츠"], payChannels: ["in_app"], timeRange: { from: "18:00", to: "22:00" } } }),
    ],
  },
  {
    id: "bc_sevenflex", issuer: "BC카드", name: "신세계 BC 바로 SEVEN FLEX", type: "credit", color: "#2B2B2B", grade: "D", annualFee: 20000,
    tiers: BF, spendExcludes: ["tax", "utility", "electric", "gas", "apt_fee", "school", "gift_card"],
    sourceUrl: BF_URL, checkedAt: "2026-10-12", reviewStatus: "approved",
    rules: [
      // HEALTH&BEAUTY 한 서비스가 운동(헬스클럽)과 병원·약국을 함께 묶는다. 이·미용원은 업종 목록에 없어 빠짐
      bf({ id: "rp_bf_health", name: "운동·골프·병원·약국 7% 할인", confidence: 0.8,
        target: { categories: ["sports", "hospital", "pharmacy"], channel: "offline" },
        rawText: "[HEALTH&BEAUTY] 운동·골프·병원·약국·이/미용원 7% 할인. 대상 가맹점 : 헬스클럽 업종, 골프 업종, 병원/약국/동물병원, 이/미용원 업종. 골프 업종 : 골프연습장, 스크린골프, 골프경기장. 병원/약국/동물병원 : 종합병원, 병의원, 한의원, 치과, 동물병원. 오프라인 매장 결제 건에 한함. 건강진단, 산후조리원 등 기타의료기관 제외." }),
      bf({ id: "rp_bf_flex", name: "신세계백화점·W컨셉 7% 할인",
        target: { merchants: ["신세계백화점", "신세계 백화점", "신세계아울렛", "신세계 아울렛", "신세계면세점", "신세계 면세점", "W컨셉", "W Concept", "더블유컨셉"] },
        rawText: "[FLEX] 신세계백화점·W concept 등 7% 할인. 대상 가맹점 : 신세계백화점(문화센터 포함), 신세계아울렛, 신세계면세점, W Concept. 신세계백화점 : 오프라인 매장 결제에 한함 (단, 문화센터의 경우 온라인 결제 포함). 전월 실적 제외 항목: FLEX 카테고리 이용금액." }),
      // ponytail: SSG PAY·스마일페이는 PayMethod에 없어 빠짐
      bf({ id: "rp_bf_pay", name: "온라인 간편결제 7% 할인", target: { channel: "online", payMethods: ["naver_pay", "kakao_pay", "samsung_pay"] },
        rawText: "[PAY] 네이버페이·카카오페이 등 7% 할인. 대상 가맹점 : 네이버페이, 카카오페이, 스마일페이, 삼성페이, SSG PAY. 온라인 가맹점에서 해당 간편결제 이용 시에 한하며, 오프라인 가맹점에서 이용 시 제외." }),
      // ponytail: "제과점 업종"은 업종 목록에 없어 빠짐 (카페 7개 브랜드·편의점 4사만 계산)
      bf({ id: "rp_bf_cafe", name: "카페 7개 브랜드 7% 할인", target: { categories: ["cafe"], merchants: ["스타벅스", "커피빈", "폴바셋", "투썸", "이디야", "할리스", "아티제"] },
        rawText: "[YUMMY] 카페·편의점·제과점 7% 할인. 대상 가맹점 : 카페(스타벅스, 커피빈, 폴바셋, 투썸플레이스, 이디야, 할리스, 아티제), 편의점(CU, GS25, 이마트24, 세븐일레븐), 제과점 업종." }),
      bf({ id: "rp_bf_cvs", name: "편의점 4사 7% 할인 (오프라인)", target: { categories: ["convenience"], merchants: ["CU", "GS25", "이마트24", "세븐일레븐"], channel: "offline" },
        rawText: "[YUMMY] 카페·편의점·제과점 7% 할인. 편의점(CU, GS25, 이마트24, 세븐일레븐). 편의점 : 오프라인 매장 결제 건에 한함 (온라인 결제건 제외)." }),
      bf({ id: "rp_bf_telecom", name: "통신3사 휴대폰요금 자동이체 7% 할인 (월 1회)",
        target: { categories: ["telecom"], merchants: ["KT", "SKT", "SK텔레콤", "LGU+", "LG U+", "LG유플러스"], autoPayOnly: true },
        limitsByTier: BF_CAPS.map((l) => ({ ...l, monthlyCount: 1 })),
        rawText: "[DAILY] 통신3사휴대폰요금·대중교통 등 7% 할인. KT/SKT/LGU+ 휴대폰요금 자동이체. 휴대폰요금 : 대상 통신사에 자동납부 신청 후 결제한 건에 한함(월 1회)." }),
      bf({ id: "rp_bf_transit", name: "대중교통(버스·지하철) 7% 할인", target: { categories: ["transit"] },
        rawText: "[DAILY] 통신3사휴대폰요금·대중교통 등 7% 할인. 대중교통(버스/지하철)." }),
      bf({ id: "rp_bf_sub", name: "넷플릭스·유튜브 프리미엄 7% 할인", target: { merchants: ["넷플릭스", "유튜브"], autoPayOnly: true },
        rawText: "[DAILY] 넷플릭스, 유튜브 프리미엄 : 공식 앱 및 홈페이지를 통해 직접 신청한 이용 건에 한하며, 구글플레이, 앱스토어, 1회성 일반 구매 결제, 앱마켓 결제 등 제외." }),
      bf({ id: "rp_bf_kakaot", name: "카카오T 자동결제 7% 할인", target: { merchants: ["카카오T", "카카오 T"], payChannels: ["in_app"] },
        rawText: "[DAILY] 카카오T : 카카오T 앱에 카드 등록 후 등록된 카드로 자동 결제 시에 한하며, 카카오T 이용 후 현장(택시, 주차장 등) 결제 등 자동 결제 외 결제 금액 제외." }),
    ],
  },
];
