import type { Budget, Category, Industry, RecurringRule, Transaction } from "../types";

/* 업종 메타 — 혜택 매칭용. 사용자 카테고리와 분리 (TRX-13) */
export const INDUSTRY: Record<Industry, { label: string; icon: string }> = {
  cafe: { label: "카페", icon: "local_cafe" },
  restaurant: { label: "음식점", icon: "restaurant" },
  delivery: { label: "배달앱", icon: "delivery_dining" },
  convenience: { label: "편의점", icon: "local_convenience_store" },
  mart: { label: "대형마트", icon: "shopping_cart" },
  online_shop: { label: "온라인쇼핑", icon: "shopping_bag" },
  fashion: { label: "패션·트렌디숍", icon: "checkroom" },
  fuel: { label: "주유소", icon: "local_gas_station" },
  transit: { label: "대중교통", icon: "directions_bus" },
  taxi: { label: "택시", icon: "local_taxi" },
  movie: { label: "영화", icon: "movie" },
  telecom: { label: "이동통신", icon: "phone_iphone" },
  electric: { label: "전기요금", icon: "bolt" },
  gas: { label: "도시가스", icon: "local_fire_department" },
  utility: { label: "수도·공과금", icon: "water_drop" },
  hospital: { label: "병원", icon: "local_hospital" },
  pharmacy: { label: "약국", icon: "medication" },
  laundry: { label: "세탁소", icon: "local_laundry_service" },
  subscription: { label: "구독", icon: "subscriptions" },
  overseas: { label: "해외 가맹점", icon: "flight" },
  tax: { label: "국세·지방세", icon: "account_balance" },
  insurance: { label: "4대보험", icon: "health_and_safety" },
  apt_fee: { label: "아파트관리비", icon: "apartment" },
  gift_card: { label: "상품권·선불충전", icon: "card_giftcard" },
  school: { label: "학교납입금", icon: "school" },
  rail: { label: "철도", icon: "train" },
  electronics: { label: "전자제품", icon: "devices" },
  sports: { label: "스포츠·레저", icon: "pool" },
  department: { label: "백화점", icon: "storefront" },
  etc: { label: "기타", icon: "receipt_long" },
};

/* 가맹점 사전 — 키워드 포함 여부로 매핑. 없으면 LLM 폴백(데모에서는 etc).
 * 이름에서 가장 앞에 나온 키(브랜드)를 고르고, 같은 자리면 긴 키를 고른다 — '메가박스'는 '메가'가 아니라 영화,
 * '투썸플레이스 홈플러스 강서점'은 입점처(마트)가 아니라 카페 */
const DICT_RAW: [string, Industry][] = [
  ["스타벅스", "cafe"], ["투썸", "cafe"], ["이디야", "cafe"], ["컴포즈", "cafe"], ["폴바셋", "cafe"], ["커피", "cafe"], ["카페", "cafe"],
  ["배달의민족", "delivery"], ["배민", "delivery"], ["요기요", "delivery"], ["땡겨요", "delivery"], ["쿠팡이츠", "delivery"],
  ["CU", "convenience"], ["GS25", "convenience"], ["세븐일레븐", "convenience"], ["이마트24", "convenience"], ["편의점", "convenience"],
  ["이마트", "mart"], ["롯데마트", "mart"], ["홈플러스", "mart"], ["트레이더스", "mart"], ["코스트코", "mart"],
  ["쿠팡", "online_shop"], ["G마켓", "online_shop"], ["옥션", "online_shop"], ["11번가", "online_shop"], ["티몬", "online_shop"], ["위메프", "online_shop"], ["AK몰", "online_shop"], ["네이버쇼핑", "online_shop"], ["SSG", "online_shop"],
  ["무신사", "fashion"], ["29CM", "fashion"], ["W컨셉", "fashion"], ["자라", "fashion"], ["유니클로", "fashion"],
  ["GS칼텍스", "fuel"], ["SK에너지", "fuel"], ["S-Oil", "fuel"], ["에스오일", "fuel"], ["현대오일뱅크", "fuel"], ["주유소", "fuel"],
  ["후불교통", "transit"], ["티머니", "transit"], ["지하철", "transit"], ["버스", "transit"], ["코레일", "rail"], ["SRT", "rail"], ["KTX", "rail"],
  ["카카오T", "taxi"], ["카카오택시", "taxi"], ["택시", "taxi"], ["우버", "taxi"],
  ["CGV", "movie"], ["롯데시네마", "movie"], ["메가박스", "movie"],
  ["SKT", "telecom"], ["SK텔레콤", "telecom"], ["KT", "telecom"], ["LG U+", "telecom"], ["LGU+", "telecom"], ["유플러스", "telecom"],
  ["한국전력", "electric"], ["한전", "electric"], ["전기요금", "electric"],
  ["도시가스", "gas"], ["서울가스", "gas"], ["코원", "gas"],
  ["수도", "utility"], ["아리수", "utility"],
  ["병원", "hospital"], ["의원", "hospital"], ["치과", "hospital"], ["한의원", "hospital"],
  ["약국", "pharmacy"], ["온누리", "pharmacy"],
  ["세탁", "laundry"], ["크린토피아", "laundry"], ["런드리", "laundry"],
  ["넷플릭스", "subscription"], ["유튜브", "subscription"], ["스포티파이", "subscription"], ["멜론", "subscription"], ["디즈니", "subscription"], ["쿠팡플레이", "subscription"], ["ChatGPT", "subscription"],
  ["국세", "tax"], ["지방세", "tax"], ["위택스", "tax"], ["홈택스", "tax"],
  ["건강보험", "insurance"], ["국민연금", "insurance"],
  ["관리비", "apt_fee"],
  ["상품권", "gift_card"], ["기프트", "gift_card"], ["문화상품권", "gift_card"],
  ["등록금", "school"], ["학교", "school"],
  // 스포츠센터·수영장·헬스장 (수영장 정기권·강습 영수증). ponytail: '수영'은 부산 수영구도 맞는다 — 오분류가 보이면 '수영장'·'정기수영'으로 좁힐 것
  ["스포츠센터", "sports"], ["체육센터", "sports"], ["체육관", "sports"], ["수영", "sports"], ["헬스", "sports"], ["피트니스", "sports"], ["필라테스", "sports"], ["요가", "sports"], ["클라이밍", "sports"], ["볼링", "sports"], ["골프", "sports"],
  ["백화점", "department"], ["더현대", "department"], ["신세계", "department"], ["갤러리아", "department"], ["AK플라자", "department"],
  ["애플스토어", "electronics"], ["하이마트", "electronics"], ["삼성디지털", "electronics"],
  ["인테이크", "online_shop"],
  ["골목집", "restaurant"], ["식당", "restaurant"], ["김밥", "restaurant"], ["국밥", "restaurant"], ["치킨", "restaurant"], ["피자", "restaurant"], ["버거", "restaurant"], ["맥도날드", "restaurant"], ["롯데리아", "restaurant"], ["파스타", "restaurant"], ["초밥", "restaurant"], ["갈비", "restaurant"], ["삼겹", "restaurant"], ["분식", "restaurant"], ["뷔페", "restaurant"],
];

/* 'CU'·'KT'처럼 영문·숫자로만 된 키는 앞뒤가 영문·숫자가 아닐 때만 맞춘다 ('Cucina 파스타'가 편의점으로 잡히지 않게.
 * 한글은 \b가 안 먹어서 직접 씀). 각 키는 이름 안에서 맞은 위치를 돌려준다 (없으면 -1) */
const DICT = DICT_RAW.map(([k, ind]): [(n: string) => number, number, Industry] => {
  const key = k.toLowerCase();
  if (!/^[a-z0-9]+$/.test(key)) return [(n) => n.indexOf(key), key.length, ind];
  const re = new RegExp(`(^|[^a-z0-9])${key}(?![a-z0-9])`);
  return [(n) => { const m = re.exec(n); return m ? m.index + m[1].length : -1; }, key.length, ind];
});

/* ponytail: 단순 포함 검색 (위치 → 길이 순). 사전 300개·LLM 폴백은 Edge Function으로 붙일 자리 */
export function classifyMerchant(name: string): Industry | undefined {
  const n = name.toLowerCase();
  let best: [number, number, Industry] | undefined;
  for (const [at, len, ind] of DICT) {
    const i = at(n);
    if (i >= 0 && (!best || i < best[0] || (i === best[0] && len > best[1]))) best = [i, len, ind];
  }
  return best?.[2];
}

/* 사용자가 고친 업종 기억 (업종 분류 3단계 중 1순위). 가맹점 이름 전체와 브랜드(첫 단어) 두 키로 저장해서
 * "스타벅스 강남점"을 카페로 고치면 "스타벅스 역삼점"에도 적용된다. 공백·대소문자는 무시 */
export type IndustryHints = Record<string, Industry>;
export function merchantKeys(name: string): string[] {
  const full = name.trim().toLowerCase().replace(/\s+/g, "");
  const brand = name.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
  return [...new Set([full, ...(name.trim().includes(" ") && brand.length >= 2 ? [brand] : [])])].filter(Boolean);
}
/* '기타'(etc)는 미분류와 같다 → 기록·AI 답으로 쓰지 않고 다음 단계로 (예전에 '기타'로 기억된 가맹점이 영영 미분류로 남지 않게) */
export const hintFor = (hints: IndustryHints, name: string): Industry | undefined => merchantKeys(name).map((k) => hints[k]).find((v) => v && v !== "etc");

/** 업종 정하기: ① 사용자가 고친 기록 → ② AI가 읽은 업종 → ③ 가맹점 사전. 어디서 왔는지도 돌려준다 (화면에 근거 표시) */
export function resolveIndustry(name: string, ai: Industry | null | undefined, hints: IndustryHints): { industry?: Industry; source: "user" | "ai" | "dict" | "none" } {
  const h = hintFor(hints, name);
  if (h) return { industry: h, source: "user" };
  if (ai && ai !== "etc") return { industry: ai, source: "ai" };
  const d = classifyMerchant(name);
  return d ? { industry: d, source: "dict" } : { source: "none" };
}

/* 사용자 카테고리 기본값 */
export const DEFAULT_CATEGORIES: Category[] = [
  { id: "food", type: "expense", name: "식비", icon: "restaurant", order: 0 },
  { id: "food.cafe", type: "expense", name: "카페", icon: "local_cafe", parentId: "food", order: 0 },
  { id: "food.delivery", type: "expense", name: "배달", icon: "delivery_dining", parentId: "food", order: 1 },
  { id: "food.out", type: "expense", name: "외식", icon: "restaurant", parentId: "food", order: 2 },
  { id: "food.conv", type: "expense", name: "편의점", icon: "local_convenience_store", parentId: "food", order: 3 },
  { id: "food.mart", type: "expense", name: "마트", icon: "shopping_cart", parentId: "food", order: 4 },
  { id: "transport", type: "expense", name: "교통", icon: "directions_bus", order: 1 },
  { id: "transport.transit", type: "expense", name: "대중교통", icon: "directions_bus", parentId: "transport", order: 0 },
  { id: "transport.taxi", type: "expense", name: "택시", icon: "local_taxi", parentId: "transport", order: 1 },
  { id: "transport.fuel", type: "expense", name: "주유", icon: "local_gas_station", parentId: "transport", order: 2 },
  { id: "shopping", type: "expense", name: "쇼핑", icon: "shopping_bag", order: 2 },
  { id: "shopping.fashion", type: "expense", name: "의류", icon: "checkroom", parentId: "shopping", order: 0 },
  { id: "shopping.online", type: "expense", name: "온라인", icon: "shopping_bag", parentId: "shopping", order: 1 },
  { id: "shopping.electronics", type: "expense", name: "전자", icon: "devices", parentId: "shopping", order: 2 },
  { id: "living", type: "expense", name: "생활", icon: "home", order: 3 },
  { id: "living.utility", type: "expense", name: "공과금", icon: "bolt", parentId: "living", order: 0 },
  { id: "living.telecom", type: "expense", name: "통신", icon: "phone_iphone", parentId: "living", order: 1 },
  { id: "living.health", type: "expense", name: "의료", icon: "local_hospital", parentId: "living", order: 2 },
  { id: "living.laundry", type: "expense", name: "세탁", icon: "local_laundry_service", parentId: "living", order: 3 },
  { id: "subscription", type: "expense", name: "구독", icon: "subscriptions", order: 4 },
  { id: "culture", type: "expense", name: "문화", icon: "movie", order: 5 },
  { id: "travel", type: "expense", name: "여행·해외", icon: "flight", order: 6 },
  { id: "etc", type: "expense", name: "기타", icon: "receipt_long", order: 7 },
  { id: "salary", type: "income", name: "급여", icon: "payments", order: 0 },
  { id: "allowance", type: "income", name: "용돈", icon: "volunteer_activism", order: 1 },
  { id: "refund", type: "income", name: "환급", icon: "undo", order: 2 },
  { id: "income.etc", type: "income", name: "기타 수입", icon: "add_circle", order: 3 },
];

/* 업종 → 기본 사용자 카테고리 (가맹점 자동 분류 시 초기값) */
export const INDUSTRY_TO_CATEGORY: Partial<Record<Industry, string>> = {
  cafe: "food.cafe", restaurant: "food.out", delivery: "food.delivery", convenience: "food.conv", mart: "food.mart",
  online_shop: "shopping.online", fashion: "shopping.fashion", electronics: "shopping.electronics",
  fuel: "transport.fuel", transit: "transport.transit", taxi: "transport.taxi", rail: "transport.transit",
  movie: "culture", telecom: "living.telecom", electric: "living.utility", gas: "living.utility", utility: "living.utility",
  hospital: "living.health", pharmacy: "living.health", laundry: "living.laundry", subscription: "subscription", overseas: "travel",
  sports: "culture", department: "shopping",
  tax: "living.utility", insurance: "living.utility", apt_fee: "living.utility", // 세금·4대보험·관리비는 공과금으로. 상품권·학교납입금은 맞는 기본 카테고리가 없어 '기타'
};

/** 업종에 맞는 기본 카테고리를 고르되, 사용자가 지운 카테고리면 '기타'로 (FK 위반·화면 불일치 방지).
 *  하위가 없으면 상위로, 그것도 없으면 type별 기타(etc / income.etc), 그것도 없으면 그 type의 첫 카테고리 */
export function categoryForIndustry(cats: Category[], industry: Industry | undefined, type: "expense" | "income" = "expense"): string {
  const has = (id?: string) => !!id && cats.some((c) => c.id === id && c.type === type);
  const want = type === "expense" && industry ? INDUSTRY_TO_CATEGORY[industry] : undefined;
  if (want && has(want)) return want;
  const parent = want?.split(".")[0];
  if (parent && has(parent)) return parent;
  const fb = type === "expense" ? "etc" : "income.etc";
  if (has(fb)) return fb;
  return cats.find((c) => c.type === type)?.id ?? fb;
}

export const categoryPath = (cats: Category[], id: string) => {
  const c = cats.find((x) => x.id === id);
  if (!c) return id;
  const p = c.parentId ? cats.find((x) => x.id === c.parentId) : undefined;
  return p ? `${p.name} › ${c.name}` : c.name;
};
export const categoryIcon = (cats: Category[], id: string) => cats.find((x) => x.id === id)?.icon ?? "receipt_long";

/* 카테고리 삭제 — 하위까지 지우고, 거래·반복 거래는 '기타'로 옮기고, 딸린 예산은 지운다 (DB budgets FK cascade와 동일) */
export const FALLBACK_CATEGORY = { expense: "etc", income: "income.etc" } as const;
type CatState = { categories: Category[]; txns: Transaction[]; recurring: RecurringRule[]; budgets: Budget[] };
export function deleteCategory(s: CatState, id: string): CatState {
  const c = s.categories.find((x) => x.id === id);
  if (!c || id === FALLBACK_CATEGORY[c.type]) return s; // '기타'는 옮길 곳이라 못 지움
  const gone = new Set([id, ...s.categories.filter((x) => x.parentId === id).map((x) => x.id)]);
  const to = FALLBACK_CATEGORY[c.type];
  const move = <T extends { categoryId: string }>(xs: T[]) => xs.map((x) => (gone.has(x.categoryId) ? { ...x, categoryId: to } : x));
  return {
    categories: s.categories.filter((x) => !gone.has(x.id)),
    txns: move(s.txns),
    recurring: move(s.recurring),
    budgets: s.budgets.filter((b) => !b.categoryId || !gone.has(b.categoryId)),
  };
}
