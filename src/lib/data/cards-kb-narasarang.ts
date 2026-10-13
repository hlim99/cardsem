/* 나라사랑카드(군 장병용 체크카드) 3종 — KB국민(2기)과 3기 신한·하나.
 * 아직 CARDS에 등록하지 않은 후보 목록. 통합 한도 그룹 안의 서비스별 월 한도는 엔진이 한 규칙에 한 한도만 보므로
 * min(통합 한도, 서비스 한도)로 적는다.
 * ponytail: 서비스 한도가 통합 그룹 사용액과 비교돼 다른 서비스를 많이 쓴 달엔 적게 잡힘(보수적). 그룹+서비스 이중 한도를 엔진이 지원하면 풀 것 */
import type { BenefitRule, CardProduct, SpendTier } from "../types";

const base = { confidence: 0.9, supported: true } as const;
type Lim = BenefitRule["limitsByTier"][number];
/** 구간 배열과 통합 한도 배열을 짝지어 limitsByTier를 만든다. sub = 서비스 자체 월 한도 */
const caps = (tiers: SpendTier[], group: number[], sub = Infinity, extra: Partial<Lim> = {}): Lim[] =>
  tiers.map((tier, i) => ({ tier, monthlyCap: Math.min(group[i], sub), ...extra }));
const all = (tiers: SpendTier[], extra: Partial<Lim> = {}): Lim[] => tiers.map((tier) => ({ tier, ...extra }));

/* 군마트 가맹점명 조각 (국군복지단 운영 PX·해군마트) */
const PX = ["PX", "P.X", "군마트", "국군복지단", "해군마트"];

/* ── KB국민 나라사랑카드(체크) ── 전월 실적 10/20/30/50/100만원 */
const KB: SpendTier[] = [{ min: 0, max: 100000 }, { min: 100000, max: 200000 }, { min: 200000, max: 300000 }, { min: 300000, max: 500000 }, { min: 500000, max: 1000000 }, { min: 1000000, max: null }];
const KB_ON = KB.slice(1);
const KB_TOTAL = [5000, 10000, 20000, 30000, 50000];
const KB_TOTAL_TEXT = "월간 통합할인한도(전월 10만원 이상 5천원 / 20만원 이상 1만원 / 30만원 이상 2만원 / 50만원 이상 3만원 / 100만원 이상 5만원). 적용 대상: 대중교통, 영화, 놀이공원, 커피전문점, 패밀리레스토랑, 통신, 서점, 어학시험, 쇼핑";
const kbn = (r: Omit<BenefitRule, "cardId" | "confidence" | "supported" | "capGroupId" | "limitsByTier"> & Partial<Pick<BenefitRule, "confidence" | "supported">> & { sub?: number; extra?: Partial<Lim> }): BenefitRule => {
  const { sub, extra, ...rest } = r;
  return { ...base, ...rest, cardId: "kb_narasarang", capGroupId: "kbn_total", limitsByTier: caps(KB_ON, KB_TOTAL, sub, extra), rawText: `${rest.rawText} [${KB_TOTAL_TEXT}]` };
};

/* ── 신한카드 나라사랑카드 체크 ── Life 통합 캐시백 한도 10/20/50/70/100만원, 테마파크용 30만원 경계 추가 */
const SH: SpendTier[] = [{ min: 0, max: 100000 }, { min: 100000, max: 200000 }, { min: 200000, max: 300000 }, { min: 300000, max: 500000 }, { min: 500000, max: 700000 }, { min: 700000, max: 1000000 }, { min: 1000000, max: null }];
const SH_ON = SH.slice(1);
const SH_LIFE = [5000, 20000, 20000, 30000, 40000, 50000];
const SH_EXCL = ["무이자할부", "gift_card", "tax", "insurance", "school", "apt_fee", "gas", "electric", "utility"];
const shn = (r: Omit<BenefitRule, "cardId" | "confidence" | "supported" | "capGroupId" | "limitsByTier"> & Partial<Pick<BenefitRule, "confidence" | "supported">> & { sub?: number; extra?: Partial<Lim> }): BenefitRule => {
  const { sub, extra, ...rest } = r;
  return { ...base, ...rest, cardId: "shinhan_narasarang", capGroupId: "shn_life", target: { excludes: SH_EXCL, ...rest.target }, limitsByTier: caps(SH_ON, SH_LIFE, sub, extra),
    rawText: `${rest.rawText} [Life 서비스 통합 캐시백 한도: 전월 10~20만원 5천원 / 20~50만원 2만원 / 50~70만원 3만원 / 70~100만원 4만원 / 100만원 이상 5만원]` };
};

/* ── 하나 나라사랑카드(체크) ── Basic 통합 할인한도 10/20/30/50/100만원 */
const HN: SpendTier[] = [{ min: 0, max: 100000 }, { min: 100000, max: 200000 }, { min: 200000, max: 300000 }, { min: 300000, max: 500000 }, { min: 500000, max: 1000000 }, { min: 1000000, max: null }];
const HN_ON = HN.slice(1);
const HN_BASIC = [5000, 10000, 20000, 30000, 50000];
const hnn = (r: Omit<BenefitRule, "cardId" | "confidence" | "supported" | "capGroupId" | "limitsByTier"> & Partial<Pick<BenefitRule, "confidence" | "supported">> & { sub?: number; extra?: Partial<Lim> }): BenefitRule => {
  const { sub, extra, ...rest } = r;
  return { ...base, confidence: 0.8, ...rest, cardId: "hana_narasarang", capGroupId: "hnn_basic", limitsByTier: caps(HN_ON, HN_BASIC, sub, extra),
    rawText: `${rest.rawText} [Basic 지난달 실적 구간별 월 통합 할인한도: 10만원 이상 5천원 / 20만원 이상 1만원 / 30만원 이상 2만원 / 50만원 이상 3만원 / 100만원 이상 5만원]` };
};

export const KB_NARASARANG_CARDS: CardProduct[] = [
  {
    id: "kb_narasarang", issuer: "KB국민카드", name: "나라사랑카드(체크)", type: "check", color: "#55603A", grade: "D", annualFee: 0,
    tiers: KB, spendExcludes: ["transit", "overseas"],
    perks: [
      { id: "kbn_k_pop", kind: "status", name: "GS리테일 POP 서비스", detail: "GS25·GS더프레시 행사상품 할인·1+1·GS ALL POINT 추가 적립. 실적 무관, GS25 해군마트 제외", rawText: "GS리테일 팝서비스: GS25, GS더프레시에서 행사 상품 구매 시 할인, 1+1, GS ALL POINT 추가 적립 등 365일 다양한 서비스. 전월 이용실적과 무관하게 서비스 혜택 제공. GS25 해군마트는 팝서비스 제공 제외" },
      { id: "kbn_k_ins", kind: "etc", name: "상해보험 무료 가입", detail: "KB손해보험 단체보험. 군부대 내외 사고 최대 5천만원, 부대 밖 대중교통상해 최대 1억원 (현역 복무 중)", rawText: "KB손해보험 단체보험 무료 가입. 군부대 내외 화재, 폭발, 붕괴사고 최대 5천만원 보장. 군부대 외 일반사고 최대 5천만원 보장. 군부대 외 대중교통상해 최대 1억원 보장. 상기 서비스는 현역 복무 중인 경우에만 제공" },
      { id: "kbn_k_event", kind: "etc", name: "경조사 서비스", detail: "본인 부모 조사 시 꽃바구니 2개, 본인 결혼 시 화환 2개 (현역 복무 중)", rawText: "본인 부모조사(弔死) 발생 시 제단 꽃바구니 2개 증정. 본인 결혼 시 축하 화환 2개 증정" },
      { id: "kbn_k_fee", kind: "fee_waiver", name: "금융수수료 면제", detail: "국군재정관리단 급여이체 시 KB·타행 ATM 인출, 인터넷·모바일 타행이체 수수료 면제", rawText: "국군재정관리단을 통한 급여이체 시 서비스 제공. KB국민은행 자동화기기 인출 및 이체 수수료 면제. KB국민은행 외(타행) 자동화기기 인출 수수료 면제. 인터넷, 모바일, 폰뱅킹 타행이체 수수료 면제" },
      { id: "kbn_k_first", kind: "etc", name: "발급 초기 실적 면제", detail: "첫 사용 등록일부터 다음 달 말일까지 실적 없이 월 1만원 한도로 할인 (대중교통·통신 자동이체 제외)", rawText: "최초 카드 사용등록일로부터 다음달 말일까지 이용실적이 없어도 월간 할인한도 1만원 이내에서 할인. 단, 대중교통 요금할인, 통신요금 자동이체 할인 서비스는 제외" },
    ],
    sourceUrl: "https://m.kbcard.com/c/04120", checkedAt: "2026-10-11", reviewStatus: "approved",
    rules: [
      // 상품설명서 PDF의 군마트 표는 글자가 깨져 있어 구간 금액을 카드고릴라 비교 기사로 맞췄다 → 신뢰도 낮춤
      { ...base, confidence: 0.75, id: "kbn_px_small", cardId: "kb_narasarang", name: "군마트(P.X) 3만원 미만 10% 환급할인", kind: "discount",
        rateBands: [{ minAmount: 0, rate: 0.1 }, { minAmount: 30000, rate: 0 }], target: { merchants: PX }, perTxnCap: 1000,
        limitsByTier: all(KB, { monthlyCount: 2 }),
        rawText: "군마트(P.X) 및 GS25 해군마트 환급할인: 건당 3만원 미만 10%, 1회 1천원까지, 월 2회. 전월 이용실적 관계없이 할인 혜택 제공. 상기 서비스는 현역 복무 중인 경우에만 제공" },
      { ...base, confidence: 0.75, id: "kbn_px", cardId: "kb_narasarang", name: "군마트(P.X) 3만원 이상 5~20% 환급할인", kind: "discount",
        rateBands: [{ minAmount: 30000, rate: 0.05 }, { minAmount: 70000, rate: 0.1 }, { minAmount: 100000, rate: 0.2 }], target: { merchants: PX, minAmount: 30000 },
        limitsByTier: all(KB, { monthlyCap: 50000 }),
        rawText: "군마트(P.X) 및 GS25 해군마트 환급할인: 건당 3만원 이상 5%, 7만원 이상 10%, 10만원 이상 20%, 월 최대 5만원. 전월 이용실적 관계없이 할인 혜택 제공. 상기 서비스는 현역 복무 중인 경우에만 제공" },
      { ...base, id: "kbn_kt", cardId: "kb_narasarang", name: "군 KT공중전화 요금 10% 환급할인", kind: "discount", rate: 0.1, target: { categories: ["telecom"], merchants: ["KT"], autoPayOnly: true },
        limitsByTier: all(KB, { monthlyCap: 10000 }), supported: false, unsupportedReason: "「KT나라사랑」 요금제 자동이체만 대상인데 일반 KT 요금과 가맹점명으로 구분할 수 없음",
        rawText: "「KT나라사랑카드 통화서비스」 및 「KT나라사랑 요금제」 요금 자동이체 시 10% 환급할인. 월 최대 1만원 할인. 전월 이용실적 관계없이 할인혜택 제공" },
      kbn({ id: "kbn_transit", name: "대중교통 20% 할인", kind: "discount", rate: 0.2, target: { categories: ["transit"] }, sub: 10000,
        rawText: "후불교통(시내버스/지하철) 20% 청구할인, 고속/시외버스 20% 환급할인. 교통이용금액 월 5만원까지 할인 적용(최대 할인액 10,000원)" }),
      kbn({ id: "kbn_cgv", name: "CGV 35% 환급할인", kind: "discount", rate: 0.35, target: { categories: ["movie"], merchants: ["CGV"], minAmount: 10000, excludes: ["gift_card"] }, eligibleAmountCap: 20000,
        rawText: "CGV 35% 환급할인. 건당 이용금액 1만원 이상 시 건당 최대 이용금액 2만원까지 할인 적용(최대 할인액 7,000원). 인터넷 예매 시 직영 홈페이지 및 CGV 앱 결제만. 상품권 구매 및 매점 이용분 제외" }),
      kbn({ id: "kbn_starbucks", name: "스타벅스 20% 환급할인", kind: "discount", rate: 0.2, target: { merchants: ["스타벅스"], minAmount: 10000, excludes: ["gift_card"] }, eligibleAmountCap: 20000,
        rawText: "스타벅스 20% 환급할인. 건당 이용금액 1만원 이상 시 건당 최대 이용금액 2만원까지 할인 적용(최대 할인액 4,000원). 상품권 구매 및 스타벅스 카드 충전 제외. 백화점/대형마트 등 입점 매장 제외" }),
      kbn({ id: "kbn_park", name: "에버랜드·롯데월드 50% 환급할인", kind: "discount", rate: 0.5, target: { merchants: ["에버랜드", "롯데월드"], channel: "offline", minAmount: 30000 }, eligibleAmountCap: 50000,
        rawText: "에버랜드, 롯데월드 현장예매 50% 환급할인. 건당 이용금액 3만원 이상 시 건당 최대 이용금액 5만원까지 할인 적용(최대 할인액 25,000원)" }),
      kbn({ id: "kbn_family", name: "아웃백·VIPS 20% 환급할인", kind: "discount", rate: 0.2, target: { merchants: ["아웃백", "VIPS", "빕스"], minAmount: 30000, excludes: ["gift_card"] }, eligibleAmountCap: 50000,
        rawText: "아웃백스테이크하우스, VIPS 20% 환급할인. 건당 이용금액 3만원 이상 시 건당 최대 이용금액 5만원까지 할인 적용(최대 할인액 10,000원). 상품권 구매 및 백화점, 대형할인점 입점 매장 제외" }),
      kbn({ id: "kbn_telecom", name: "이동통신 자동이체 2,500원 환급할인", kind: "discount", fixedAmount: 2500, target: { categories: ["telecom"], autoPayOnly: true, minAmount: 50000 }, extra: { monthlyCount: 1 },
        rawText: "이동통신 자동납부 건당 금액이 5만원 이상 시 2,500원 환급할인(월 1회). 해당 카드로 자동이체 등록 시 적용. 유무선 통신요금 통합청구금액 자동이체 시 제외. SKT, KT, LGU+에 한하여 적용" }),
      kbn({ id: "kbn_kyobo", name: "교보문고 5% 환급할인", kind: "discount", rate: 0.05, target: { merchants: ["교보문고"], minAmount: 20000 }, eligibleAmountCap: 50000,
        rawText: "교보문고 5% 환급할인. 건당 이용금액 2만원 이상 시 건당 최대 이용금액 5만원까지 할인 적용(최대 할인액 2,500원). 핫트랙스 제외, 인터넷은 교보문고 직영 홈페이지만" }),
      kbn({ id: "kbn_langtest", name: "TOEIC·JPT 온라인 접수 2,000원 환급할인", kind: "discount", fixedAmount: 2000, target: { merchants: ["TOEIC", "토익", "JPT"] }, extra: { monthlyCount: 1, yearlyCount: 6 },
        rawText: "어학시험 온라인 접수 시 2,000원 환급할인. TOEIC, JPT 정기 접수 및 특별 추가 접수 응시료, 패키지 접수 응시료. 월 1회, 연 6회 적용" }),
      kbn({ id: "kbn_shop", name: "홈쇼핑·G마켓·옥션 5% 환급할인", kind: "discount", rate: 0.05, target: { merchants: ["GS홈쇼핑", "GS SHOP", "CJ홈쇼핑", "CJ온스타일", "G마켓", "옥션"], minAmount: 30000 }, eligibleAmountCap: 50000,
        rawText: "GS홈쇼핑, CJ홈쇼핑, G마켓, 옥션 5% 환급할인. 건당 이용금액 3만원 이상 시 건당 최대 이용금액 5만원까지 할인 적용(최대 할인액 2,500원)" }),
    ],
  },
  {
    id: "shinhan_narasarang", issuer: "신한카드", name: "나라사랑카드 체크", type: "check", color: "#2B3F2A", grade: "D", annualFee: 0,
    tiers: SH, spendExcludes: ["gift_card", "tax", "insurance", "school", "apt_fee", "gas", "electric", "utility"],
    perks: [
      { id: "shn_k_event", kind: "etc", name: "현역병 경조사 지원", detail: "본인 결혼 시 화환 1개, 본인 부모·조부모 조사 시 꽃바구니 2개 (인증 후 1833-8848 신청)", rawText: "현역병(육/해/공/해병대) 대상 경조사 서비스. 본인 결혼 시 축하 화환 1개. 본인의 부모, 조부모 조사 시 꽃바구니 2개 증정" },
      { id: "shn_k_member", kind: "status", name: "Multi Membership 자동 가입", detail: "GS POP·해피포인트·CJ ONE·아모레 뷰티포인트·LG전자 멤버십. 실적 무관", rawText: "GS POP, SPC 해피포인트, CJ ONE, 아모레퍼시픽 뷰티멤버십, LG전자 나라사랑멤버십. 카드발급과 동시에 가입, 전월 이용금액과 상관없이 제공" },
      { id: "shn_k_lg", kind: "etc", name: "LG전자 1% 포인트 적립", detail: "LG전자 온·오프라인몰 결제 시 마이신한포인트 1%, 연 최대 10만P", rawText: "LG전자 오프라인/온라인몰에서 결제 시 마이신한포인트 1%가 적립됩니다. 연 최대 10만포인트가 적립됩니다." },
    ],
    sourceUrl: "https://www.shinhancard.com/pconts/html/card/apply/check/2013660_2206.html", checkedAt: "2026-10-11", reviewStatus: "approved",
    rules: [
      // ponytail: "매월 10일 50%"는 일(day-of-month) 조건이 엔진에 없어 기본 20%로만 계산 (건당 1천원 한도라 차이는 소액 결제에서만)
      { ...base, id: "shn_px_small", cardId: "shinhan_narasarang", name: "군마트(P.X.) 3만원 미만 20% 캐시백", kind: "discount",
        rateBands: [{ minAmount: 0, rate: 0.2 }, { minAmount: 30000, rate: 0 }], target: { merchants: PX, excludes: SH_EXCL }, perTxnCap: 1000, capGroupId: "shn_px",
        limitsByTier: all(SH, { monthlyCap: 100000, dailyCount: 1 }), stacking: [{ ruleId: "shn_cvs", mode: "deny" }],
        rawText: "군마트(P.X.) 및 GS25 해군마트 캐시백: 건당 3만원 미만 기본 20%(매월 10일 50%), 일 1회 최대 1천원, 월 최대 10만원(3만원 이상과 합산). 전월 이용금액에 상관없이 적용. GS25 해군마트는 횟수·한도 초과 시 Life 편의점 20% 캐시백 적용" },
      { ...base, id: "shn_px", cardId: "shinhan_narasarang", name: "군마트(P.X.) 3만원 이상 20% 캐시백", kind: "discount", rate: 0.2,
        target: { merchants: PX, minAmount: 30000, excludes: SH_EXCL }, capGroupId: "shn_px", limitsByTier: all(SH, { monthlyCap: 100000 }), stacking: [{ ruleId: "shn_cvs", mode: "deny" }],
        rawText: "군마트(P.X.) 및 GS25 해군마트 캐시백: 건당 3만원 이상 20%, 월 최대 10만원(3만원 미만과 합산). 전월 이용금액에 상관없이 적용" },
      { ...base, id: "shn_resort", cardId: "shinhan_narasarang", name: "군 체력단련장·휴양시설 20% 캐시백", kind: "discount", rate: 0.2, target: {},
        limitsByTier: all(SH, { monthlyCap: 20000 }), supported: false, unsupportedReason: "대상 시설이 국군복지포털 지정 목록이라 가맹점 이름으로 가릴 수 없음",
        rawText: "국방부 및 국방부 유관기관이 지정한 군 체력단련장 및 군 휴양시설 이용 시 20% 캐시백. 월 최대 2만원. 이용 시설은 국군복지포털에서 확인" },
      // ponytail: 고속버스는 가맹점 사전에서 transit으로 분류돼 대중교통 20% 규칙에 걸림 (약관상은 광역교통 10%)
      shn({ id: "shn_transit", name: "대중교통 20% 캐시백", kind: "discount", rate: 0.2, target: { categories: ["transit"] }, sub: 5000,
        rawText: "시내버스/지하철에서 후불교통 기능을 이용한 터치(RF) 거래 시 20% 캐시백. 월 최대 5천원. 고속버스는 광역교통 캐시백 적용. 시외버스, 공항리무진, 공항버스, 공항철도, SRT 제외" }),
      shn({ id: "shn_intercity", name: "광역교통(고속버스·철도) 10% 캐시백", kind: "discount", rate: 0.1, target: { merchants: ["고속버스", "코레일", "KTX", "ITX", "새마을", "무궁화"] }, sub: 3000,
        rawText: "광역교통: 고속버스, 철도(KTX, ITX, 새마을호, 무궁화호) 10% 캐시백. 월 최대 3천원. 시외버스, 공항리무진, 공항버스, 공항철도, SRT 제외" }),
      shn({ id: "shn_kakaot", name: "카카오T 택시 10% 캐시백", kind: "discount", rate: 0.1, target: { categories: ["taxi"], merchants: ["카카오T", "카카오택시"], payChannels: ["in_app"] }, sub: 2000,
        rawText: "카카오 T 앱 내 카드결제(신용/체크카드 메뉴)로 택시 이용 시 10% 캐시백. 월 최대 2천원. 현장결제, 카카오페이 등 간편결제, 택시 외 서비스 제외" }),
      shn({ id: "shn_cvs", name: "편의점(GS25·CU) 20% 캐시백", kind: "discount", rate: 0.2, target: { categories: ["convenience"], merchants: ["GS25", "CU"], channel: "offline" }, perTxnCap: 1000, sub: 5000, extra: { dailyCount: 1, monthlyCount: 5 },
        rawText: "편의점(GS25, CU) 20% 캐시백. 일 1회 최대 1천원, 월 5회 최대 5천원. 오프라인 매장만. 백화점, 할인점, 면세점, 공항 등 입점 매장 제외" }),
      shn({ id: "shn_coffee", name: "주요 커피 브랜드 5% 캐시백", kind: "discount", rate: 0.05, target: { categories: ["cafe"], merchants: ["스타벅스", "이디야", "메가", "폴바셋", "컴포즈", "매머드", "빽다방"] }, perTxnCap: 2000, sub: 6000, extra: { dailyCount: 1, monthlyCount: 3 },
        rawText: "스타벅스, 이디야, 메가커피, 폴바셋, 컴포즈커피, 매머드커피, 빽다방 5% 캐시백. 일 1회 최대 2천원, 월 3회 최대 6천원. 오프라인 매장만(스타벅스 사이렌 오더 제외). 해외·선물하기·입점 매장 제외" }),
      shn({ id: "shn_book", name: "알라딘·YES24 5% 캐시백", kind: "discount", rate: 0.05, target: { merchants: ["알라딘", "YES24", "예스24"], channel: "online" }, sub: 6000,
        rawText: "도서(알라딘, YES24) 5% 캐시백. 월 최대 6천원. 공식 홈페이지 또는 모바일앱 이용 시에만(오프라인 매장 제외)" }),
      shn({ id: "shn_telecom", name: "이동통신 자동납부 5% 캐시백", kind: "discount", rate: 0.05, target: { categories: ["telecom"], autoPayOnly: true }, sub: 5000, extra: { monthlyCount: 1 },
        rawText: "SKT, KT, LG U+, 알뜰폰 이동통신요금 자동납부 시 5% 캐시백. 월 1회 최대 5천원. 매월 첫번째 거래건만. 선불폰·결합상품·약정금액 대납·대리점 정기결제 제외" }),
      shn({ id: "shn_sports", name: "스포츠센터/레포츠클럽 5% 캐시백", kind: "discount", rate: 0.05, target: { categories: ["sports"] }, sub: 6000, // 2026-10-12 스포츠·레저 업종 추가로 계산 가능
        rawText: "스포츠센타/레포츠클럽 업종 이용 시 5% 캐시백, 월 최대 6천원. 신한카드 가맹점 업종 기준" }),
      shn({ id: "shn_baemin", name: "배달의민족 5% 캐시백", kind: "discount", rate: 0.05, target: { merchants: ["배달의민족", "배민"] }, perTxnCap: 1000, sub: 5000, extra: { dailyCount: 1, monthlyCount: 5 },
        rawText: "배달의민족 5% 캐시백. 일 1회 최대 1천원, 월 5회 최대 5천원. 앱 내 카드결제만(현장결제 제외)" }),
      shn({ id: "shn_ott", name: "OTT 정기결제 10% 캐시백", kind: "discount", rate: 0.1, target: { merchants: ["유튜브", "YouTube", "티빙", "TVING", "넷플릭스", "Netflix"], autoPayOnly: true }, sub: 5000,
        rawText: "OTT(유튜브 프리미엄, 티빙, 넷플릭스) 10% 캐시백. 월 최대 5천원. 공식 홈페이지 정기결제(자동납부)만. 앱마켓 인앱결제·통신요금 합산 결제 제외" }),
      shn({ id: "shn_musinsa", name: "무신사/29CM 10% 캐시백", kind: "discount", rate: 0.1, target: { merchants: ["무신사", "29CM"], channel: "online" }, sub: 6000,
        rawText: "무신사/29CM 10% 캐시백. 월 최대 6천원. 공식 홈페이지 또는 모바일앱 이용 시에만(오프라인 매장 제외)" }),
      { ...base, id: "shn_cgv", cardId: "shinhan_narasarang", name: "CGV 2D 관람권 6,000원", kind: "discount", target: { merchants: ["CGV"] },
        limitsByTier: all(SH_ON, { monthlyCount: 1 }), supported: false, unsupportedReason: "관람권 정가 대비 차액이라 결제 금액만으로 할인액을 정할 수 없음",
        rawText: "CGV 온/오프라인에서 2D관람권 구매 시 정가 6천원에 제공. 동반 1인까지(최대 2매). 월 1회. 전월 이용금액 10만원 이상. 3D·특별관 등 제외, 티켓 단독 구매만" },
      ...(["에버랜드", "롯데월드", "서울랜드"] as const).map((park, i): BenefitRule => ({
        ...base, id: `shn_park_${i}`, cardId: "shinhan_narasarang", name: `${park} 자유이용권 50% 할인`, kind: "discount", rate: 0.5,
        target: { merchants: [park], excludes: SH_EXCL }, limitsByTier: all(SH.slice(3), { dailyCount: 1, yearlyCount: 3 }),
        rawText: "에버랜드, 롯데월드, 서울랜드 자유이용권 50% 할인. 테마파크별 일 1회, 연 3회. 전월 이용금액 30만원 이상. 본인 자유이용권 및 입장권에 한함",
      })),
      { ...base, id: "shn_caribbean", cardId: "shinhan_narasarang", name: "캐리비안베이 입장권 30% 할인", kind: "discount", rate: 0.3,
        target: { merchants: ["캐리비안베이"], excludes: SH_EXCL }, limitsByTier: all(SH.slice(3), { dailyCount: 1, yearlyCount: 3 }),
        rawText: "캐리비안베이 입장권 30% 할인. 테마파크별 일 1회, 연 3회. 전월 이용금액 30만원 이상. 본인 입장권에 한함" },
      { ...base, id: "shn_overseas", cardId: "shinhan_narasarang", name: "해외 이용 1% 캐시백", kind: "discount", rate: 0.01,
        target: { categories: ["overseas"], excludes: SH_EXCL }, limitsByTier: all(SH),
        rawText: "해외 가맹점에서 결제 시 이용금액의 1% 캐시백. 전월 이용금액 관계 없이 제공. 해외겸용(VISA) 카드만. 해외 현금인출, 국내 PG 경유 결제 제외" },
      { ...base, id: "shn_cu_event", cardId: "shinhan_narasarang", name: "CU 행사상품 10% 즉시할인", kind: "discount", rate: 0.1, target: { merchants: ["CU"] },
        limitsByTier: all(SH, { monthlyCap: 5000 }), supported: false, unsupportedReason: "행사상품 여부를 결제 내역으로 알 수 없음",
        rawText: "CU 오프라인 매장 및 포켓CU앱 결제 시 즉시할인 대상 행사상품 10% 즉시할인. 월 최대 5,000원. 전월 이용금액 관계 없이 제공. 편의점 20% 캐시백과 중복 가능" },
    ],
  },
  {
    id: "hana_narasarang", issuer: "하나카드", name: "하나 나라사랑카드(체크)", type: "check", color: "#00857C", grade: "D", annualFee: 0,
    // ponytail: 실적 제외 항목을 공식 원문으로 확인 못 해 비워 둠 — 검수 때 채울 것
    tiers: HN, spendExcludes: [],
    variants: [
      { id: "base", name: "기본", desc: "Easy·Basic 서비스만" },
      { id: "salary", name: "군 급여이체", desc: "국군재정관리단을 통해 하나은행 나라사랑통장으로 급여 수령 시 다음 달 Desire 서비스 추가" },
    ],
    perks: [
      { id: "hnn_k_ins", kind: "etc", name: "현역병 상해보험 무료", detail: "하나손해보험 단체보험 자동가입. 휴가·외출 중 상해 최대 5천만원, 대중교통 사고 최대 4억원 등", rawText: "현역병 상해보험: (휴가/외출/외박 中) 상해사망/후유장해 최대 5천만원, 대중교통 이용 중 교통사고 상해사망/후유장해 최대 4억원, (군 복무기간 內) 폭발·화재·붕괴 상해사망/후유장해 최대 4억원 등. 하나손해보험 단체보험 무료 자동가입" },
      { id: "hnn_k_phone", kind: "etc", name: "나라사랑 휴대폰 케어", detail: "군 급여이체 시 20개월 무료. 파손·침수 수리비 최대 10만원(자기부담 3만원 포함)", rawText: "휴대폰 파손 또는 침수 시 수리 비용을 최대 10만원 한도(자기부담금 3만원 포함) 내에서 보상. 군 급여이체 조건 충족 시 다음달부터 자동 가입 후 20개월 간 무료" },
      { id: "hnn_k_cgv", kind: "voucher", name: "CGV 팝콘 스몰세트 무료", detail: "군 급여이체 시. 월 1회, 연 6회", rawText: "CGV 현장 결제, 공식 모바일 앱/웹 결제 시 팝콘 스몰세트 1개 무료 제공. 월 1회, 연 6회 (Desire, 군 급여이체 시)" },
    ],
    sourceUrl: "https://www.card-gorilla.com/card/detail/2934", checkedAt: "2026-10-11", reviewStatus: "approved",
    rules: [
      // Easy (실적 조건 없음). ponytail: 일 한도(5천원·2만원)는 엔진에 일 금액 한도가 없어 빠짐
      { ...base, confidence: 0.8, id: "hnn_px_small", cardId: "hana_narasarang", name: "군마트(PX) 3만원 미만 30% 캐시백", kind: "discount",
        rateBands: [{ minAmount: 0, rate: 0.3 }, { minAmount: 30000, rate: 0 }], target: { merchants: PX }, limitsByTier: all(HN, { monthlyCap: 10000 }),
        rawText: "군마트(PX, 해군·해병대 군마트 포함) 결제 건당 3만원 미만 30% 캐시백, 월 1만원(일 5천원). 실적 조건 없음" },
      { ...base, confidence: 0.8, id: "hnn_px", cardId: "hana_narasarang", name: "군마트(PX) 3만원 이상 20% 캐시백", kind: "discount", rate: 0.2,
        target: { merchants: PX, minAmount: 30000 }, limitsByTier: all(HN, { monthlyCap: 100000 }),
        rawText: "군마트(PX, 해군·해병대 군마트 포함) 결제 건당 3만원 이상 20% 캐시백, 월 10만원(일 2만원). 실적 조건 없음" },
      { ...base, confidence: 0.8, id: "hnn_openmarket", cardId: "hana_narasarang", name: "쿠팡·네이버플러스 스토어 20% 캐시백", kind: "discount", rate: 0.2,
        target: { merchants: ["쿠팡", "네이버플러스", "스마트스토어"], excludes: ["delivery", "gift_card"], channel: "online" }, perTxnCap: 1000, limitsByTier: all(HN, { monthlyCap: 3000 }),
        rawText: "쿠팡, 네이버플러스 스토어 20% 캐시백, 월 3천원(일 1천원). 공식 홈페이지·앱 결제만. 오프라인, 상품권, 여행, 항공권, 티켓, 도서, 공연 매출 제외. 실적 조건 없음" },
      { ...base, confidence: 0.8, id: "hnn_cu", cardId: "hana_narasarang", name: "CU 행사품목 10% 현장할인", kind: "discount", rate: 0.1, target: { merchants: ["CU"] },
        limitsByTier: all(HN, { monthlyCap: 50000 }), supported: false, unsupportedReason: "행사품목 여부를 결제 내역으로 알 수 없음 (국군의날·현충일 30%도 같은 이유)",
        rawText: "CU 행사품목 10% 현장할인, 월 5만원. 국군의날·현충일 행사품목 30%, 일 5만원. 실적 조건 없음" },
      // Desire (군 급여이체 시) — variant "salary"
      { ...base, confidence: 0.8, id: "hnn_taxi", cardId: "hana_narasarang", variantId: "salary", name: "택시 20% 캐시백", kind: "discount", rate: 0.2,
        target: { categories: ["taxi"] }, limitsByTier: all(HN, { monthlyCap: 5000 }),
        rawText: "택시업종, 카카오T(택시) 20% 캐시백, 월 5천원. 군 급여이체 시 다음달 제공. 택시 업종은 오프라인 결제만, 카카오T는 앱 카드 등록 선결제만" },
      { ...base, confidence: 0.8, id: "hnn_delivery", cardId: "hana_narasarang", variantId: "salary", name: "배달앱 20% 캐시백", kind: "discount", rate: 0.2,
        target: { merchants: ["배달의민족", "배민", "쿠팡이츠", "요기요"] }, limitsByTier: all(HN, { monthlyCap: 5000 }),
        rawText: "배달의민족, 쿠팡이츠, 요기요 20% 캐시백, 월 5천원(국군의날/현충일 일 1만원). 공식 홈페이지·앱 결제만. 군 급여이체 시 다음달 제공" },
      { ...base, confidence: 0.8, id: "hnn_digital", cardId: "hana_narasarang", variantId: "salary", name: "디지털라이프 10% 캐시백", kind: "discount", rate: 0.1,
        target: { merchants: ["App Store", "앱스토어", "구글플레이", "Google Play", "유튜브", "YouTube", "네이버웹툰", "넷플릭스", "Netflix", "네이버플러스 멤버십", "쿠팡와우"] }, limitsByTier: all(HN, { monthlyCap: 2000 }),
        rawText: "애플 App Store, 구글플레이, 유튜브프리미엄, 네이버웹툰, 넷플릭스, 네이버플러스 멤버십, 쿠팡와우멤버십 10% 캐시백, 월 2천원. 군 급여이체 시 다음달 제공. 포인트·캐시 충전, 간편결제, 인앱결제 제외" },
      // Basic (지난달 실적 10만원 이상, 통합 할인한도)
      hnn({ id: "hnn_transit", name: "대중교통 20% 캐시백", kind: "discount", rate: 0.2, target: { categories: ["transit"] }, sub: 10000,
        rawText: "버스, 지하철 20% 캐시백, 월 1만원. 시외버스, 고속버스, 철도(KTX/SRT/ITX) 제외" }),
      hnn({ id: "hnn_condo", name: "국군콘도 20% 캐시백", kind: "discount", rate: 0.2, target: {}, sub: 10000, supported: false, unsupportedReason: "국군복지단 직영 호텔/콘도를 가맹점 이름으로 가릴 수 없음",
        rawText: "국군복지단 직영 호텔/콘도 20% 캐시백, 월 1만원. F&B 및 입점 점포 제외" }),
      hnn({ id: "hnn_starbucks", name: "스타벅스 20% 캐시백", kind: "discount", rate: 0.2, target: { merchants: ["스타벅스"], minAmount: 10000, excludes: ["gift_card"] }, perTxnCap: 4000,
        rawText: "스타벅스 결제 건당 1만원 이상 20% 캐시백, 건당 4천원. 대형시설물 입점점포, 상품권, 선불 충전 제외" }),
      hnn({ id: "hnn_family", name: "아웃백·VIPS 20% 캐시백", kind: "discount", rate: 0.2, target: { merchants: ["아웃백", "VIPS", "빕스"], minAmount: 10000, excludes: ["gift_card", "delivery"] }, sub: 20000,
        rawText: "아웃백스테이크하우스, VIPS 결제 건당 1만원 이상 20% 캐시백, 월 2만원. 대형시설물 입점점포, 배달·예약 앱 주문, 상품권 제외" }),
      hnn({ id: "hnn_fastfood", name: "패스트푸드 5% 캐시백", kind: "discount", rate: 0.05, target: { merchants: ["롯데리아", "맥도날드", "버거킹", "KFC", "써브웨이", "맘스터치"], minAmount: 10000, excludes: ["delivery"] }, sub: 2000,
        rawText: "롯데리아, 맥도날드, 버거킹, KFC, 써브웨이, 맘스터치 결제 건당 1만원 이상 5% 캐시백, 월 2천원. 대형시설물 입점점포, 배달 앱 주문 제외" }),
      hnn({ id: "hnn_online", name: "온라인쇼핑 10% 캐시백", kind: "discount", rate: 0.1, target: { merchants: ["무신사", "29CM", "G마켓", "옥션", "11번가"], minAmount: 10000, channel: "online" }, sub: 5000,
        rawText: "무신사, 29CM, G마켓, 옥션, 11번가 결제 건당 1만원 이상 10% 캐시백, 월 5천원. 공식 홈페이지·앱 결제만. 상품권, 여행, 항공권, 티켓, 도서, 공연 제외" }),
      hnn({ id: "hnn_langtest", name: "어학시험 5% 캐시백", kind: "discount", rate: 0.05, target: { merchants: ["TOEIC", "토익", "OPIc", "TEPS", "텝스", "JPT", "HSK"] }, sub: 5000,
        rawText: "TOEIC, OPIc, TEPS, JPT, HSK 응시료 5% 캐시백, 월 5천원. 공식 사이트 결제만" }),
      hnn({ id: "hnn_book", name: "교보문고·알라딘 5% 캐시백", kind: "discount", rate: 0.05, target: { merchants: ["교보문고", "알라딘"] }, sub: 5000,
        rawText: "교보문고, 알라딘 5% 캐시백, 월 5천원. 공식 홈페이지 및 오프라인 매장 결제만" }),
      hnn({ id: "hnn_intercity", name: "기차·고속/시외버스 5% 캐시백", kind: "discount", rate: 0.05, target: { merchants: ["코레일", "KTX", "SRT", "ITX", "고속버스", "시외버스"] }, sub: 2000,
        rawText: "기차(KTX, SRT, ITX), 고속·시외버스 5% 캐시백, 월 2천원. 공식 홈페이지·앱 및 오프라인 결제만. 여행사, 구매대행, 온라인쇼핑몰 경유 제외" }),
      hnn({ id: "hnn_park", name: "에버랜드·롯데월드 50% 현장할인", kind: "discount", rate: 0.5, target: { merchants: ["에버랜드", "롯데월드"] }, extra: { monthlyCount: 1 },
        rawText: "에버랜드, 롯데월드 50% 현장할인, 월 1회. 지난달 실적 10만원 이상. 이용권 1인 1매 구매에 한함" }),
    ],
  },
];
