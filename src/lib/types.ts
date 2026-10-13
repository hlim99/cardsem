/* 카드셈 도메인 타입 — [구현 계획서] 5장 스키마 그대로 */

export type SpendTier = { min: number; max: number | null }; // 전월 실적 구간 (min 이상, max 미만)

export type Industry =
  | "cafe" | "restaurant" | "delivery" | "convenience" | "mart" | "online_shop" | "fashion" | "fuel"
  | "transit" | "taxi" | "movie" | "telecom" | "electric" | "gas" | "utility" | "hospital" | "pharmacy"
  | "laundry" | "subscription" | "overseas" | "tax" | "insurance" | "apt_fee" | "gift_card" | "school"
  | "rail" | "electronics" | "sports" | "department" | "etc";

export type PayMethod = "issuer_pay" | "samsung_pay" | "naver_pay" | "kakao_pay" | "card";
export type PayChannel = "in_app" | "offline" | "web";
export type CondField = "paidAt" | "isAutoPay" | "payMethod" | "payChannel" | "fuelLiters";

export type BenefitRule = {
  id: string;
  cardId: string;
  variantId?: string;
  name: string; // 화면 표시용 짧은 이름
  kind: "discount" | "cashback" | "point";

  target: {
    categories?: Industry[];
    merchants?: string[];
    channel?: "online" | "offline" | "any";
    daysOfWeek?: number[]; // 0=일 … 6=토
    holidayPolicy?: "include" | "exclude";
    timeRange?: { from: string; to: string }; // "21:00" ~ "09:00"
    minAmount?: number;
    excludes?: string[]; // Industry 또는 '무이자할부'
    autoPayOnly?: boolean;
    payMethods?: PayMethod[];
    payChannels?: PayChannel[];
  };

  rate?: number;
  rateBands?: { minAmount: number; rate: number }[];
  fixedAmount?: number;
  step?: { per: number; amount: number };
  perUnit?: { unit: "liter"; amount: number };

  eligibleAmountCap?: number;
  perTxnCap?: number;

  limitsByTier: {
    tier: SpendTier;
    monthlyCap?: number;
    dailyCount?: number;
    monthlyCount?: number;
    yearlyCount?: number;
  }[];

  capGroupId?: string;
  countGroupId?: string; // 여러 규칙이 일·월·연 횟수를 함께 쓰는 묶음 (예: "음식점과 배달앱 통합 일 1회")
  monthOverrides?: { months: number[]; extraCap: number }[];
  stacking?: { ruleId: string; mode: "allow" | "deny" }[];

  validFrom?: string;
  validTo?: string;
  rawText: string;
  supported: boolean;
  unsupportedReason?: string;
  confidence: number;
};

/* 금액으로 계산하지 않는 정성 혜택 (라운지·바우처·우대금리·연회비 면제·등급 유지 등).
 * 규칙이 아니라 카드에 딸린 정보라 결제별 계산에 들어가지 않는다 — BenefitRule.supported=false("계산 불가")와는 다르다 */
export type PerkKind = "lounge" | "voucher" | "rate" | "fee_waiver" | "status" | "installment" | "etc";
export type Perk = {
  id: string;
  kind: PerkKind;
  name: string;    // 화면 표시용 짧은 이름
  detail: string;  // 횟수·조건 등 사람이 읽는 설명 (2줄 이내 — 판단 결과의 설명으로도 쓰임)
  rawText: string; // 근거가 된 원문
  value?: number;  // 돈 형태로 받을 때의 원화 가치 (연회비 면제 = 연회비 등). 없으면 금액 표시 안 함
};

/* 결제 1건에 대한 정성 혜택 판단 — 모델은 값만 내므로 설명은 perk.detail, 금액은 perk.value */
export type PerkForm = "money" | "goods" | "service" | "none";
export type PerkJudgment = {
  perkId: string; name: string; kind: PerkKind;
  eligible: number;      // 이 결제로 받을 수 있을 확률 0~1
  form: PerkForm;        // 받는다면 돈 / 상품·이용권 / 서비스·자격
  confidence: number;    // form 선택의 신뢰도
  amount?: number;       // form=money 이고 perk.value 가 있을 때
  summary: string;       // 돈이 아닐 때 보여줄 2줄 설명
  engine: "openai"; model: string;
};

export type CardProduct = {
  id: string;
  issuer: string;
  name: string;
  type: "credit" | "check";
  color: string; // 카드 아트 단색
  grade: "A" | "B" | "C" | "D";
  annualFee?: number;
  tiers: SpendTier[]; // 실적 구간 (없으면 [{min:0,max:null}])
  spendExcludes: Industry[]; // 전월 실적 산정 제외 업종
  variants?: { id: string; name: string; desc: string }[];
  perks?: Perk[]; // 정성 혜택. 계산에 쓰이지 않고 카드 상세에만 표시
  sourceUrl: string;
  checkedAt: string;
  reviewStatus: "approved" | "pending" | "none";
  rules: BenefitRule[];
};

export type UserCard = {
  cardId: string;
  variantId?: string;
  spendTierOverride?: number; // 사용자가 직접 고친 전월 실적
  spendTierOverrideYm?: string; // 보정값을 적용할 달 "YYYY-MM". 없으면 예전 데이터라 모든 달에 적용(하위 호환)
  statementCycleDay?: number; // 청구 사이클 시작일 1~28. 없으면 달력 월(1일~말일)로 실적을 셈
  bin?: string;               // 카드번호 앞 6자리 (선택). 영수증의 앞자리와 대조해 카드를 바로 고른다. 뒷자리는 저장하지 않음
  issuedAt?: string;
  addedAt: string;
};

export type Transaction = {
  id: string;
  type: "income" | "expense";
  amount: number; // 결제 총액 (할부도 총액)
  currency: "KRW" | "USD" | "JPY";
  amountKrw?: number; // 외화면 결제일 환율 환산
  date: string; // YYYY-MM-DD
  merchant: string;
  categoryId: string; // 사용자 카테고리
  merchantIndustry?: Industry; // 가맹점 업종 — 혜택 매칭에만 사용
  payType: "credit" | "check" | "cash" | "transfer";
  cardId?: string;
  memo?: string;
  items?: string[];
  recurringId?: string;
  paidAt?: string; // "HH:MM"
  isAutoPay?: boolean;
  payMethod?: PayMethod;
  payChannel?: PayChannel;
  fuelLiters?: number;
  installmentMonths?: number;
  isInterestFree?: boolean;
  approvalNo?: string; // 카드 승인번호 (숫자만). 환불 영수증을 원결제에 붙이는 데만 쓰고 화면에는 보여주지 않는다
  originalTxnId?: string; // 취소·부분 환불이면 원거래 (amount는 환불액, 양수)
  receiptId?: string;
};

export type Category = { id: string; type: "income" | "expense"; name: string; icon: string; parentId?: string; order: number };
export type Budget = { categoryId?: string; amount: number }; // categoryId 없으면 총예산
export type RecurringRule = { id: string; type: "income" | "expense"; amount: number; merchant: string; categoryId: string; cardId?: string; payType: Transaction["payType"]; cycle: "monthly" | "weekly"; day: number; startDate: string; endDate?: string; isAutoPay?: boolean; lastGeneratedAt?: string };
