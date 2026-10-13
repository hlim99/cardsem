/* 렌탈료 자동이체 할인 카드 — 우리카드 쿠쿠 렌탈프리멤버십과 비교용 3종. 2026-10-11 각 카드사 공식 상품 페이지 원문 확인.
 * ponytail: 아직 CARDS에 등록하지 않은 별도 목록. 등록하려면 cards.ts의 CARDS에 펼쳐 넣고 seed.sql을 다시 만든다 (docs/10 7.1)
 * 공통 한계: 약관의 "렌탈료 자동이체분은 전월실적 제외"는 업종이 아니라 가맹점 단위라 spendExcludes로 표현 못 함 → 실적이 조금 부풀 수 있음.
 *          "카드 발급 후 다음 달 말일까지 실적 무관 최저 구간 제공"도 엔진에 발급일 개념이 없어 빠짐 (사용자가 실적 보정으로 맞춤) */
import type { BenefitRule, CardProduct, SpendTier } from "../types";

const base = { confidence: 0.9, supported: true } as const;
const tiers = (...mins: number[]): SpendTier[] => mins.map((min, i) => ({ min, max: mins[i + 1] ?? null }));
const caps = (ts: SpendTier[], ...amounts: number[]) => amounts.map((monthlyCap, i) => ({ tier: ts[i + 1], monthlyCap }));

/* 렌탈료 자동이체 할인: 청구 렌탈료 전액을 월 한도까지 깎아 준다 ("렌탈료가 한도보다 적으면 렌탈료만큼") → rate 1 + monthlyCap */
const rental = (r: Omit<BenefitRule, "kind" | "rate" | "confidence" | "supported">): BenefitRule =>
  ({ ...base, kind: "discount", rate: 1, ...r, target: { autoPayOnly: true, ...r.target } });

/* 우리 쿠쿠 렌탈프리멤버십: 30만/70만/100만 */
const WR = tiers(0, 300000, 700000, 1000000);
/* 롯데 쿠쿠 롯데카드: 40만/80만/160만 */
const LC = tiers(0, 400000, 800000, 1600000);
/* IBK 코웨이: 30만/70만/120만 */
const IC = tiers(0, 300000, 700000, 1200000);
/* NH올원 Rental&코웨이: 30만/100만/200만 */
const NC = tiers(0, 300000, 1000000, 2000000);

const PARKS = ["에버랜드", "롯데월드", "서울랜드", "이월드", "경주월드", "통도환타지아"];
const PARK_REASON = "놀이공원 현장할인 — 결제액이 이미 할인된 금액이라 청구 기준 계산 불가 · 놀이공원 업종도 없음";

export const WOORI_RENTAL_CARDS: CardProduct[] = [
  {
    id: "woori_rentalfree", issuer: "우리카드", name: "쿠쿠 렌탈프리멤버십", type: "credit", color: "#B0122B", grade: "C", annualFee: 10000,
    tiers: WR, spendExcludes: ["tax", "overseas"],
    sourceUrl: "https://nm.wooricard.com/dcmw/yh1/crd/crd01/M1CRD101S02.do?recomNo=223476", checkedAt: "2026-10-11", reviewStatus: "approved",
    rules: [
      rental({ id: "wr_rental", cardId: "woori_rentalfree", name: "쿠쿠 렌탈요금 자동이체 할인", target: { merchants: ["쿠쿠"] },
        limitsByTier: caps(WR, 10000, 15000, 20000).map((l) => ({ ...l, monthlyCount: 1 })),
        rawText: "전월실적에 따른 쿠쿠 렌탈요금 자동이체 할인서비스. 전월실적 30만원 이상 월 할인한도 10,000원 / 70만원 이상 15,000원 / 100만원 이상 20,000원. 쿠쿠 렌탈요금 자동이체 시 할인적용. 쿠쿠렌탈 자동이체가 아닌 일반결제, 렌탈요금 자동이체 경과 후 승인된 건은 할인이 미적용됩니다. 할인받을 금액보다 렌탈 자동이체 승인된 금액이 작을 경우 승인금액만큼 할인이 적용됩니다. 렌탈 자동이체 승인 건이 여러 건인 경우 우선 매입되는 1건에 한해 할인이 적용됩니다." }),
      { ...base, id: "wr_movie", cardId: "woori_rentalfree", name: "CGV 인터넷 예매 6천원 청구할인", kind: "discount", fixedAmount: 6000,
        target: { categories: ["movie"], merchants: ["CGV"], channel: "online", minAmount: 12000 },
        limitsByTier: [WR[1], WR[2], WR[3]].map((tier) => ({ tier, dailyCount: 1, monthlyCount: 1, yearlyCount: 10 })),
        rawText: "영화 할인: 12,000원 이상 결제 시 6,000원 청구할인. CGV 인터넷 홈페이지 예매고객에 한해 제공. 일 1회, 월 1회, 연 10회 한도. 전월실적 30만원 이상 시 제공" },
      { ...base, id: "wr_coffee", cardId: "woori_rentalfree", name: "커피전문점 5% 청구할인", kind: "discount", rate: 0.05,
        target: { categories: ["cafe"], merchants: ["스타벅스", "커피빈", "카페베네", "투썸"], excludes: ["gift_card"] },
        limitsByTier: caps(WR, 3000, 3000, 3000).map((l) => ({ ...l, dailyCount: 1 })),
        rawText: "스타벅스, 커피빈, 카페베네, 투썸플레이스에서 결제 시 5% 청구할인. 월 할인 한도: 3,000원. 일 1회 한도. 단, 커피상품권 구매, 선불권 충전매출 할인 제외. 백화점/대형마트 내 매장, 미군부대 내 매장은 할인대상에서 제외. 전월실적 30만원 이상 시 제공" },
      { ...base, id: "wr_park", cardId: "woori_rentalfree", name: "놀이공원 자유이용권 본인 50% 현장할인", kind: "discount", rate: 0.5,
        target: { merchants: PARKS }, limitsByTier: [WR[1], WR[2], WR[3]].map((tier) => ({ tier, monthlyCount: 1, yearlyCount: 10 })),
        supported: false, unsupportedReason: PARK_REASON, confidence: 0.8,
        rawText: "전국 놀이공원 자유이용권 본인 50% 할인(현장할인). 에버랜드, 롯데월드, 서울랜드, 이월드(대구), 경주월드, 통도환타지아. 통합 월 1회, 연 10회 한도. 전월실적 30만원 이상 시 제공" },
    ],
  },
  {
    id: "lotte_cuckoo", issuer: "롯데카드", name: "쿠쿠 롯데카드", type: "credit", color: "#C8102E", grade: "C", annualFee: 20000,
    tiers: LC, spendExcludes: ["tax", "school", "gas", "electric", "utility", "apt_fee", "gift_card", "taxi", "transit"],
    perks: [
      { id: "lc_k_install", kind: "installment", name: "쿠쿠 장기할부 월 캐시백", detail: "쿠쿠에서 40만원 이상 24·36개월 장기할부(연 7.0%) 시 다음 달부터 36개월차까지 매월 26일 8천~2만4천원 캐시백. 렌탈료 할인과 중복 안 됨",
        rawText: "쿠쿠 롯데카드로 쿠쿠에서 40만원 이상 장기 할부 이용시 혜택. 지난달 이용실적 40만원 이상 8,000원 / 80만원 이상 12,000원 / 160만원 이상 24,000원, 이번 달 26일 캐시백 지급(월1회). 장기 할부 이용월 기준 다음 달부터 36개월차까지 혜택이 제공됩니다. 렌탈료 결제일 할인과 장기 할부 캐시백은 중복 제공 되지 않습니다." },
    ],
    sourceUrl: "https://www.lottecard.co.kr/app/LPCDADB_V100.lc?vtCdKndC=P15895-A15895", checkedAt: "2026-10-11", reviewStatus: "approved",
    rules: [
      rental({ id: "lc_rental", cardId: "lotte_cuckoo", name: "쿠쿠 렌탈료 결제일 할인", target: { merchants: ["쿠쿠"] }, limitsByTier: caps(LC, 8000, 12000, 24000),
        rawText: "쿠쿠 렌탈료 결제 시 결제일 할인. 자동납부 필수, 월 횟수 제한 없음. 지난달 카드 이용 실적 40만원 이상 8,000원 / 80만원 이상 12,000원 / 160만원 이상 24,000원. 지난달 이용금액이 40만원 미만인 경우는 결제일 할인이 되지 않습니다. 렌탈료 자동 납부 승인 건이 여러 건인 경우 월 할인 한도 내에서 할인 됩니다. 렌탈료가 렌탈료 할인 한도보다 적을 경우 렌탈료 만큼만 할인됩니다." }),
    ],
  },
  {
    id: "ibk_coway", issuer: "IBK기업은행", name: "코웨이 IBK카드", type: "credit", color: "#0A4DA2", grade: "B", annualFee: 12000,
    tiers: IC, spendExcludes: ["tax", "gas", "electric", "utility", "apt_fee", "school", "gift_card", "transit"],
    sourceUrl: "https://www.ibk.co.kr/cardbiz/detailBizNew.ibk?PDLN_CD=12&PDGR_CD=11&PDTM_CD=321&PDCD=0001", checkedAt: "2026-10-11", reviewStatus: "approved",
    rules: [
      // 코웨이·웅진 렌탈료는 통합할인한도 하나를 같이 쓴다
      rental({ id: "ic_rental", cardId: "ibk_coway", name: "코웨이·웅진 렌탈료 자동이체 청구할인", target: { merchants: ["코웨이", "웅진"] }, limitsByTier: caps(IC, 13000, 17000, 23000),
        rawText: "코웨이 렌탈료 자동이체 결제시 최대 23,000원 청구할인. 웅진 렌탈료 자동이체 결제 시 청구할인. 전월이용실적 30만원 이상 13,000원 / 70만원 이상 17,000원 / 120만원 이상 23,000원 (통합할인한도). 렌탈료 자동이체 필수. 자동이체 건이 여러 건인 경우에도 합산하여 할인한도 내에서 할인 적용. 렌탈료가 렌탈료 할인금액보다 적을 경우 렌탈료 납부금액 내에서 할인 적용" }),
    ],
  },
  {
    id: "nh_rental_coway", issuer: "NH농협카드", name: "NH올원 Rental&코웨이카드", type: "credit", color: "#00A0E2", grade: "C", annualFee: 10000,
    tiers: NC, spendExcludes: ["school", "tax", "utility", "apt_fee", "gas", "electric", "gift_card"],
    sourceUrl: "https://card.nonghyup.com/servlet/IpCc2021R.act?CD_WRS_SQNO=90000366", checkedAt: "2026-10-11", reviewStatus: "approved",
    rules: [
      rental({ id: "nr_rental", cardId: "nh_rental_coway", name: "코웨이 렌탈료 청구할인", target: { merchants: ["코웨이"] }, limitsByTier: caps(NC, 10000, 15000, 30000),
        rawText: "매월 코웨이 렌탈료 1~3만원 청구할인. 전월실적 30만원이상 1만원 / 100만원이상 1만5천원 / 200만원이상 3만원. 전월실적 산정 시 코웨이 렌탈 이용액은 제외됩니다. 렌탈료 승인금액이 할인받을 금액보다 적을 경우 승인금액만큼 할인 적용됩니다. 렌탈료 1만원 2건 인 경우 : 각 1만원, 5천원 (총 1만5천원) 할인. 코웨이 렌탈료 할인 서비스는 해당카드로 렌탈료 자동이체 신청 시 적용됩니다." }),
      { ...base, id: "nr_park", cardId: "nh_rental_coway", name: "놀이공원 본인 30~50% 현장할인", kind: "discount", rate: 0.5,
        target: { merchants: [...PARKS, "광주패밀리랜드", "한국민속촌"] }, limitsByTier: [NC[1], NC[2], NC[3]].map((tier) => ({ tier, monthlyCount: 1, yearlyCount: 6 })),
        supported: false, unsupportedReason: PARK_REASON, confidence: 0.8,
        rawText: "전국 주요 놀이공원 할인 (통합 월1회, 연6회). 에버랜드, 롯데월드, 서울랜드, 통도환타지아, 어뮤즈먼트(경주월드), 이월드(대구), 광주패밀리랜드, 한국민속촌(용인): 본인 자유이용권 50% 현장할인. 캐리비안베이, 캘리포니아비치(경주월드): 본인 입장료 30% 현장할인. 아쿠아환타지아(통도): 본인 및 동반1인 입장료 30% 현장할인. 전주시 동물원: 본인 무료 입장(청구할인). 전월실적 30만원 이상 시 제공" },
    ],
  },
];
