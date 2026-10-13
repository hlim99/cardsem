/* Supabase 테이블 ↔ TypeScript 타입 매핑과 CRUD. 스토어(store.tsx)가 로그인 상태일 때만 호출.
 * 기본 카드 카탈로그는 아직 코드(src/lib/data/cards.ts)에서 읽는다 — card_products의 기본 카드 행(owner_id null)은 어드민 편집용 시드.
 * 사용자가 직접 추가한 카드(custom_)는 card_products에 owner_id = 본인으로 저장하고 정의 전체를 custom_def에 둔다 (거래·카드의 card_id FK가 성립하게) */
import { supabase } from "./supabase";
import type { Budget, CardProduct, Category, Industry, RecurringRule, Transaction, UserCard } from "./types";
import { categoryForIndustry, DEFAULT_CATEGORIES, FALLBACK_CATEGORY } from "./data/merchants";
import { ymd } from "./recurring";

type Row = Record<string, unknown>;
const hhmm = (t?: string | null) => (t ? t.slice(0, 5) : undefined);
const und = <T>(v: T | null): T | undefined => (v === null ? undefined : v);
const localDate = (ts: unknown) => ymd(new Date(ts as string)); // timestamptz → 로컬 날짜 (앞 10자리는 UTC 날짜라 한국 0~9시에 하루 전이 됨)

/** 거래·반복 규칙 id (DB는 uuid 열). crypto.randomUUID는 https·localhost에서만 있어서,
 *  http://192.168.x.x 같은 주소에서는 getRandomValues로 RFC 4122 v4를 직접 만든다 */
export const newId = (): string => {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40; // 버전 4
  b[8] = (b[8] & 0x3f) | 0x80; // variant 10xx
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
};

/** 사용자 카테고리에 없는(지웠거나 다른 구분의) id면 업종으로 다시 고른다: 그 카테고리 → 상위 → 기타.
 *  로그인 모드에서 없는 카테고리 id는 FK 위반으로 저장이 거부되므로, 거래·반복 규칙을 쓰기 전에 항상 거친다 */
export const validCategory = (cats: Category[], t: { categoryId: string; type: Category["type"]; merchantIndustry?: Industry }) =>
  cats.some((c) => c.id === t.categoryId && c.type === t.type) ? t.categoryId : categoryForIndustry(cats, t.merchantIndustry, t.type);

/* ── row → type ── */
const catOf = (r: Row) => (r.category_id as string | null) ?? FALLBACK_CATEGORY[r.type as Category["type"]]; // 카테고리 삭제로 null이 되면 구분별 '기타'
const toTxn = (r: Row): Transaction => ({
  id: r.id as string, type: r.type as Transaction["type"], amount: Number(r.amount), currency: r.currency as Transaction["currency"],
  amountKrw: r.amount_krw == null ? undefined : Number(r.amount_krw), date: r.date as string, merchant: r.merchant as string,
  categoryId: catOf(r), merchantIndustry: und(r.merchant_industry as Transaction["merchantIndustry"] | null),
  payType: r.pay_type as Transaction["payType"], cardId: und(r.card_id as string | null), memo: und(r.memo as string | null),
  items: und(r.items as string[] | null), recurringId: und(r.recurring_id as string | null), paidAt: hhmm(r.paid_at as string | null),
  isAutoPay: und(r.is_auto_pay as boolean | null), payMethod: und(r.pay_method as Transaction["payMethod"] | null),
  payChannel: und(r.pay_channel as Transaction["payChannel"] | null), fuelLiters: r.fuel_liters == null ? undefined : Number(r.fuel_liters),
  installmentMonths: und(r.installment_months as number | null), isInterestFree: und(r.is_interest_free as boolean | null),
  approvalNo: und(r.approval_no as string | null), originalTxnId: und(r.original_txn_id as string | null),
});
const toCard = (r: Row): UserCard => ({
  cardId: r.card_id as string, variantId: und(r.variant_id as string | null), spendTierOverride: und(r.spend_tier_override as number | null),
  spendTierOverrideYm: und(r.spend_tier_override_ym as string | null),
  statementCycleDay: und(r.statement_cycle_day as number | null), bin: und(r.bin as string | null), issuedAt: und(r.issued_at as string | null),
  addedAt: localDate(r.added_at),
});
const toCat = (r: Row): Category => ({ id: r.id as string, type: r.type as Category["type"], name: r.name as string, icon: (r.icon as string) ?? "label", parentId: und(r.parent_id as string | null), order: r.sort_order as number });
const toBudget = (r: Row): Budget => ({ categoryId: und(r.category_id as string | null), amount: Number(r.amount) }); // null = 총예산
const toRecurring = (r: Row): RecurringRule => ({
  id: r.id as string, type: r.type as RecurringRule["type"], amount: Number(r.amount), merchant: r.merchant as string, categoryId: catOf(r),
  cardId: und(r.card_id as string | null), payType: r.pay_type as RecurringRule["payType"], cycle: r.cycle as RecurringRule["cycle"], day: r.day as number,
  startDate: r.start_date as string, endDate: und(r.end_date as string | null), isAutoPay: und(r.is_auto_pay as boolean | null), lastGeneratedAt: und(r.last_generated_at as string | null),
});

/* ── type → row (user_id는 RLS용으로 항상 붙인다) ── */
const txnRow = (uid: string, t: Partial<Transaction>) => ({
  ...(t.id && { id: t.id }), user_id: uid, type: t.type, amount: t.amount, currency: t.currency, amount_krw: t.amountKrw ?? null, date: t.date, merchant: t.merchant,
  category_id: t.categoryId, merchant_industry: t.merchantIndustry ?? null, pay_type: t.payType, card_id: t.cardId ?? null, memo: t.memo ?? null, items: t.items ?? null,
  recurring_id: t.recurringId ?? null, paid_at: t.paidAt || null, is_auto_pay: t.isAutoPay ?? null, pay_method: t.payMethod ?? null, pay_channel: t.payChannel ?? null,
  fuel_liters: t.fuelLiters ?? null, installment_months: t.installmentMonths ?? null, is_interest_free: t.isInterestFree ?? null, approval_no: t.approvalNo ?? null, original_txn_id: t.originalTxnId ?? null, // receiptId는 receipts.transaction_id 쪽에 (insertTxns)
});
// added_at: 등록일(YYYY-MM-DD)을 정오(UTC)로 저장해 어느 시간대에서 읽어도 같은 날짜가 되게 (없으면 DB 기본값 now())
const cardRow = (uid: string, c: UserCard) => ({ user_id: uid, card_id: c.cardId, ...(c.addedAt && { added_at: `${c.addedAt}T12:00:00Z` }), variant_id: c.variantId ?? null, spend_tier_override: c.spendTierOverride ?? null, spend_tier_override_ym: c.spendTierOverrideYm ?? null, statement_cycle_day: c.statementCycleDay ?? null, bin: c.bin ?? null, issued_at: c.issuedAt ?? null });
const catRow = (uid: string, c: Category) => ({ user_id: uid, id: c.id, type: c.type, name: c.name, icon: c.icon, parent_id: c.parentId ?? null, sort_order: c.order });
const budgetRow = (uid: string, b: Budget) => ({ user_id: uid, category_id: b.categoryId ?? null, amount: b.amount });
const recurringRow = (uid: string, r: RecurringRule) => ({
  id: r.id, user_id: uid, type: r.type, amount: r.amount, merchant: r.merchant, category_id: r.categoryId, card_id: r.cardId ?? null, pay_type: r.payType,
  cycle: r.cycle, day: r.day, start_date: r.startDate, end_date: r.endDate ?? null, is_auto_pay: r.isAutoPay ?? null, last_generated_at: r.lastGeneratedAt ?? null,
});

const must = <T>(r: { data: T | null; error: { message: string } | null }) => { if (r.error) throw new Error(r.error.message); return r.data!; };

/* PostgREST는 한 요청에 최대 1000행만 돌려준다(초과분은 오류 없이 잘림) → 끝까지 페이지를 넘겨 읽는다.
 * id를 두 번째 정렬 키로 둬야 같은 날짜 행이 페이지 경계에서 빠지거나 겹치지 않는다 */
const PAGE = 1000;
async function readAll(table: string, col: string, ascending = true, cols = "*"): Promise<Row[]> {
  const out: Row[] = [];
  for (let from = 0; ; from += PAGE) {
    // ponytail: 서버 max_rows가 1000 이상이라고 본다. 더 작게 바꾸면 "빈 페이지가 나올 때까지"로 바꿀 것
    const page = must(await supabase().from(table).select<string, Row>(cols).order(col, { ascending }).order("id").range(from, from + PAGE - 1));
    out.push(...page);
    if (page.length < PAGE) return out;
  }
}

export type Loaded = { txns: Transaction[]; userCards: UserCard[]; categories: Category[]; budgets: Budget[]; recurring: RecurringRule[]; customCards: CardProduct[] };

/* 로그인 직후 전부 읽기. 첫 로그인(카테고리 0개)이면 기본 카테고리·총예산을 넣어준다 */
export async function loadAll(uid: string): Promise<Loaded> {
  const sb = supabase();
  const [t, c, cat, b, r, cc, rc] = await Promise.all([
    readAll("transactions", "date"), sb.from("user_cards").select("*").order("added_at"), sb.from("categories").select("*").order("sort_order"),
    sb.from("budgets").select("*"), sb.from("recurring_rules").select("*"),
    sb.from("card_products").select("custom_def").eq("owner_id", uid).order("created_at"), // 내가 직접 추가한 카드 (RLS가 남의 카드는 막음)
    readAll("receipts", "created_at", true, "id, transaction_id"),
  ]);
  let categories = must(cat).map(toCat); let budgets = must(b).map(toBudget);
  if (categories.length === 0) {
    categories = DEFAULT_CATEGORIES; budgets = [{ amount: 1500000 }];
    // 두 탭·기기가 동시에 첫 로그인해도 실패하지 않게 이미 있으면 건너뛴다 (상위 카테고리가 먼저 있어야 parent FK 통과)
    const sorted = [...categories].sort((a, x) => Number(!!a.parentId) - Number(!!x.parentId));
    must(await sb.from("categories").upsert(sorted.map((x) => catRow(uid, x)), { onConflict: "user_id,id", ignoreDuplicates: true }));
    must(await sb.from("budgets").upsert(budgets.map((x) => budgetRow(uid, x)), { onConflict: "user_id,category_id", ignoreDuplicates: true }));
  }
  const receiptOf = new Map(rc.filter((x) => x.transaction_id).map((x) => [x.transaction_id as string, x.id as string]));
  const txns = t.map((x) => { const tx = toTxn(x); const rid = receiptOf.get(tx.id); return rid ? { ...tx, receiptId: rid } : tx; });
  return { txns, userCards: must(c).map(toCard), categories, budgets, recurring: must(r).map(toRecurring), customCards: must(cc).map((x) => x.custom_def as CardProduct) };
}

/** 거래 여러 건 저장하고 실제로 들어간 행 수를 돌려준다. 반복 거래 회차는 (user_id, recurring_id, date) 유일 색인에 걸리면 조용히 건너뛴다
 *  (두 기기가 같은 날 앱을 열어 같은 회차를 만든 경우 — 스토어가 수가 모자라면 다시 읽는다). 영수증으로 만든 거래는 receipts 행도 남긴다 → 새로고침 후에도 '영수증 있음' */
async function insertTxns(uid: string, ts: Transaction[]): Promise<number> {
  if (!ts.length) return 0;
  const sb = supabase();
  const added = must(await sb.from("transactions").upsert(ts.map((t) => txnRow(uid, t)), { onConflict: "user_id,recurring_id,date", ignoreDuplicates: true }).select("id"));
  const withReceipt = ts.filter((t) => t.receiptId);
  // ponytail: 원본 이미지는 아직 저장하지 않는다(storage_path 'not_stored'). 비공개 버킷 업로드를 붙이면 경로로 바꿀 것
  if (withReceipt.length) must(await sb.from("receipts").insert(withReceipt.map((t) => ({ user_id: uid, transaction_id: t.id, storage_path: "not_stored", status: "done" }))));
  return added.length;
}

export const db = {
  insertTxn: (uid: string, t: Transaction) => insertTxns(uid, [t]),
  insertTxns,
  updateTxn: (uid: string, id: string, patch: Partial<Transaction>) => {
    const row = txnRow(uid, patch) as Row; // 넘어온 필드만 보낸다 (undefined는 제외, null은 "비움")
    const keys: Record<string, keyof Transaction> = { amount: "amount", currency: "currency", amount_krw: "amountKrw", date: "date", merchant: "merchant", category_id: "categoryId", merchant_industry: "merchantIndustry", pay_type: "payType", card_id: "cardId", memo: "memo", items: "items", paid_at: "paidAt", is_auto_pay: "isAutoPay", pay_method: "payMethod", pay_channel: "payChannel", fuel_liters: "fuelLiters", installment_months: "installmentMonths", is_interest_free: "isInterestFree", approval_no: "approvalNo", original_txn_id: "originalTxnId", type: "type" };
    const partial = Object.fromEntries(Object.entries(row).filter(([k]) => k in keys && keys[k] in patch));
    return supabase().from("transactions").update(partial).eq("id", id).then(must);
  },
  deleteTxns: (ids: string[]) => supabase().from("transactions").delete().or(`id.in.(${ids.join(",")}),original_txn_id.in.(${ids.join(",")})`).then(must),
  upsertCard: (uid: string, c: UserCard) => supabase().from("user_cards").upsert(cardRow(uid, c)).then(must),
  deleteCard: (cardId: string) => supabase().from("user_cards").delete().eq("card_id", cardId).then(must),
  /** 직접 추가한 카드 저장. id는 custom_ 으로 시작해야 한다 (DB CHECK). 목록 화면용 열 몇 개 + 정의 전체(custom_def) */
  upsertCustomCard: (uid: string, c: CardProduct) => supabase().from("card_products").upsert({
    id: c.id, owner_id: uid, issuer: c.issuer, name: c.name, type: c.type, color: c.color, grade: c.grade, review_status: c.reviewStatus, custom_def: c,
    // 출처 · 확인일은 열에도 — 정의(custom_def)에만 있으면 DB에서 source_url을 조회할 때 비어 보였다
    source_url: c.sourceUrl || null, checked_at: c.checkedAt || null,
  }).then(must),
  /** 직접 추가한 카드 삭제. 그 카드로 기록한 거래·반복 거래는 남기고 카드만 비운 뒤(card_id FK) 보유 행 → 카드 행 순서로 지운다 */
  removeCustomCard: async (uid: string, id: string) => {
    const sb = supabase();
    must(await sb.from("transactions").update({ card_id: null }).eq("user_id", uid).eq("card_id", id));
    must(await sb.from("recurring_rules").update({ card_id: null }).eq("user_id", uid).eq("card_id", id));
    must(await sb.from("user_cards").delete().eq("user_id", uid).eq("card_id", id));
    must(await sb.from("card_products").delete().eq("owner_id", uid).eq("id", id));
  },
  /** 예산 목록 통째로 저장: upsert 후 목록에 없는 행만 지운다. '전부 지우고 다시 넣기'는 삽입이 실패하면 총예산까지 사라져서 쓰지 않는다.
   *  b는 categoryId가 겹치지 않아야 한다(같은 문장에서 같은 키를 두 번 고치면 PG가 거부) — 스토어가 중복을 걸러서 넘긴다 */
  /** 예산 저장: 넘긴 목록은 upsert, 지우는 건 removed로 명시한 것만 (undefined = 총예산).
   *  "목록에 없는 건 전부 삭제"로 하면 오래 열어 둔 탭·다른 기기가 그 사이 다른 곳에서 만든 예산을 지운다 */
  setBudgets: async (uid: string, b: Budget[], removed: (string | undefined)[] = []) => {
    const sb = supabase();
    if (b.length) must(await sb.from("budgets").upsert(b.map((x) => budgetRow(uid, x)), { onConflict: "user_id,category_id" }));
    const ids = removed.filter((x): x is string => !!x);
    if (ids.length) must(await sb.from("budgets").delete().eq("user_id", uid).in("category_id", ids));
    if (removed.some((x) => !x)) must(await sb.from("budgets").delete().eq("user_id", uid).is("category_id", null));
  },
  /** 카테고리 저장: upsert(상위를 먼저 넣어야 parent FK 통과) + removed로 명시한 것만 삭제 (하위는 parent FK cascade로 함께) */
  setCategories: async (uid: string, c: Category[], removed: string[] = []) => {
    const sorted = [...c].sort((a, b) => Number(!!a.parentId) - Number(!!b.parentId));
    if (sorted.length) must(await supabase().from("categories").upsert(sorted.map((x) => catRow(uid, x)), { onConflict: "user_id,id" }));
    if (removed.length) must(await supabase().from("categories").delete().eq("user_id", uid).in("id", removed));
  },
  // 카테고리 삭제 전에 딸린 거래·반복 거래를 다른 카테고리로 옮긴다
  moveCategory: async (uid: string, from: string[], to: string) => {
    must(await supabase().from("transactions").update({ category_id: to }).eq("user_id", uid).in("category_id", from));
    must(await supabase().from("recurring_rules").update({ category_id: to }).eq("user_id", uid).in("category_id", from));
  },
  upsertRecurring: (uid: string, r: RecurringRule) => supabase().from("recurring_rules").upsert(recurringRow(uid, r)).then(must),
  // 이미 만든 거래는 남는다 (transactions.recurring_id FK가 on delete set null)
  deleteRecurring: (id: string) => supabase().from("recurring_rules").delete().eq("id", id).then(must),
  /** 회원 탈퇴: 본인 장부 전부 삭제. FK 순서대로 (영수증 → 거래 → 반복 규칙 → 예산·카드·알림 → 카테고리 → 직접 추가한 카드).
   *  auth.users 행은 서비스 키가 있어야 지울 수 있어 여기서는 남는다 */
  deleteAllMine: async (uid: string) => {
    for (const table of ["receipts", "transactions", "recurring_rules", "budgets", "user_cards", "notifications", "categories"])
      must(await supabase().from(table).delete().eq("user_id", uid));
    must(await supabase().from("card_products").delete().eq("owner_id", uid));
  },
};
