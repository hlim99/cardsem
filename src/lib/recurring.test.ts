/* 반복 거래 회차 계산과 스토어가 DB에 쓰기 전에 거치는 보조 함수(db.ts) 테스트.
 * Supabase 클라이언트는 호출을 기록하는 가짜로 바꿔, 실제로 어떤 요청이 나가는지 본다 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addDays, cycleLabel, dueDates, materialize, nextFrom, ymd } from "./recurring";
import { db, loadAll, newId, validCategory } from "./db";
import { DEFAULT_CATEGORIES } from "./data/merchants";
import type { RecurringRule, Transaction } from "./types";

/* ── 가짜 Supabase: from(table).a(..).b(..) 호출을 줄마다 기록하고, await하면 respond(기록)를 돌려준다 ── */
let calls: string[][] = [];
let respond: (log: string[]) => unknown[] = () => [];
const builder = (table: string) => {
  const log = [table];
  calls.push(log);
  const p: object = new Proxy({}, {
    get: (_, k) => k === "then"
      ? (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve({ data: respond(log), error: null }).then(res, rej)
      : (...a: unknown[]) => { log.push(`${String(k)} ${JSON.stringify(a)}`); return p; },
  });
  return p;
};
vi.mock("./supabase", () => ({ SUPABASE_READY: true, supabase: () => ({ from: builder }) }));
beforeEach(() => { calls = []; respond = () => []; });

const rule = (p: Partial<RecurringRule> = {}): RecurringRule => ({ id: "r1", type: "expense", amount: 17000, merchant: "넷플릭스", categoryId: "subscription", cardId: "hyundai_zero3", payType: "credit", cycle: "monthly", day: 1, startDate: "2026-01-01", isAutoPay: true, ...p });

describe("dueDates", () => {
  it("매월 31일은 말일이 짧은 달에 말일로 한 번 (윤년 2월 포함)", () => {
    expect(dueDates(rule({ day: 31 }), "2026-01-01", "2026-05-31")).toEqual(["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30", "2026-05-31"]);
    expect(dueDates(rule({ day: 30, startDate: "2028-01-01" }), "2028-02-01", "2028-03-31")).toEqual(["2028-02-29", "2028-03-30"]);
  });
  it("시작일 전·종료일 뒤·조회 범위 밖은 뺀다 (해를 넘겨도)", () => {
    expect(dueDates(rule({ day: 10, startDate: "2026-11-15", endDate: "2027-02-10" }), "2026-01-01", "2027-12-31")).toEqual(["2026-12-10", "2027-01-10", "2027-02-10"]);
    expect(dueDates(rule({ day: 10 }), "2026-10-11", "2026-10-31")).toEqual([]);
    expect(dueDates(rule({ endDate: "2026-01-01" }), "2026-03-01", "2026-04-01")).toEqual([]);
  });
  it("매주는 day = 요일(0=일)", () => {
    // 2026-10-05는 월요일
    expect(dueDates(rule({ cycle: "weekly", day: 1, startDate: "2026-10-01" }), "2026-10-01", "2026-10-26")).toEqual(["2026-10-05", "2026-10-12", "2026-10-19", "2026-10-26"]);
    expect(dueDates(rule({ cycle: "weekly", day: 0, startDate: "2026-10-04" }), "2026-10-04", "2026-10-11")).toEqual(["2026-10-04", "2026-10-11"]);
    expect(cycleLabel({ cycle: "weekly", day: 1 })).toBe("매주 월요일");
    expect(cycleLabel({ cycle: "monthly", day: 25 })).toBe("매월 25일");
  });
  it("로컬 날짜 계산 (UTC로 바뀌지 않음)", () => {
    expect(ymd(new Date(2026, 9, 9, 0, 30))).toBe("2026-10-09");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("materialize", () => {
  it("마지막 생성일 다음 날부터 오늘까지 회차를 만들고 lastGeneratedAt을 옮긴다", () => {
    const r = materialize([rule({ lastGeneratedAt: "2026-09-01" }), rule({ id: "r2", type: "income", merchant: "급여", categoryId: "salary", payType: "transfer", cardId: undefined, day: 25, lastGeneratedAt: "2026-09-25" })], [], "2026-10-09");
    expect(r.txns).toHaveLength(1);
    expect(r.txns[0]).toMatchObject({ date: "2026-10-01", amount: 17000, recurringId: "r1", cardId: "hyundai_zero3", isAutoPay: true, merchantIndustry: "subscription", currency: "KRW" });
    expect(r.rules).toEqual([expect.objectContaining({ id: "r1", lastGeneratedAt: "2026-10-01" })]); // 급여는 10/25 전이라 그대로
  });
  it("처음이면 시작일부터, 이미 같은 날 거래가 있으면 건너뛰되 생성일은 옮긴다", () => {
    const have = { id: "x", recurringId: "r1", date: "2026-08-01" } as Transaction;
    const r = materialize([rule({ startDate: "2026-07-01" })], [have], "2026-09-15");
    expect(r.txns.map((t) => t.date)).toEqual(["2026-07-01", "2026-09-01"]);
    expect(r.rules[0].lastGeneratedAt).toBe("2026-09-01");
  });
  it("사용자가 지운 회차는 다시 만들지 않는다 (생성일 이후만 본다)", () => {
    expect(materialize([rule({ lastGeneratedAt: "2026-10-01" })], [], "2026-10-09")).toEqual({ txns: [], rules: [] });
  });
  it("날짜·주기를 고쳐도 이미 만든 달(주)에 한 번 더 만들지 않는다", () => {
    // 매월 25일 → 28일로 고침. 10월은 25일에 이미 만들었다
    const moved = rule({ day: 28, lastGeneratedAt: "2026-10-25" });
    expect(materialize([moved], [], "2026-10-29")).toEqual({ txns: [], rules: [] });
    expect(materialize([moved], [], "2026-11-29").txns.map((t) => t.date)).toEqual(["2026-11-28"]);
    // 매주 월(10-05) → 수: 그 주의 수요일(10-07)은 건너뛰고 다음 주부터
    expect(nextFrom(rule({ cycle: "weekly", day: 3, lastGeneratedAt: "2026-10-05" }))).toBe("2026-10-12");
    expect(nextFrom(rule({ lastGeneratedAt: "2026-12-31" }))).toBe("2027-01-01");
    expect(nextFrom(rule({ startDate: "2026-07-01" }))).toBe("2026-07-01");
  });
  it("현금·이체 규칙은 카드 id를 붙이지 않고, 수입은 업종을 매기지 않는다", () => {
    const r = materialize([rule({ payType: "cash", startDate: "2026-10-01" }), rule({ id: "r3", type: "income", payType: "transfer", startDate: "2026-10-01" })], [], "2026-10-01");
    expect(r.txns[0].cardId).toBeUndefined();
    expect(r.txns[1].merchantIndustry).toBeUndefined();
  });
});

describe("newId", () => {
  const orig = crypto.randomUUID;
  afterEach(() => { Object.defineProperty(crypto, "randomUUID", { value: orig, configurable: true }); });
  it("randomUUID가 없는 http 주소에서도 uuid v4를 만든다", () => {
    Object.defineProperty(crypto, "randomUUID", { value: undefined, configurable: true });
    const ids = Array.from({ length: 50 }, newId);
    for (const id of ids) expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(new Set(ids).size).toBe(50);
  });
});

describe("validCategory", () => {
  const cats = DEFAULT_CATEGORIES.filter((c) => c.id !== "food.cafe");
  it("있는 카테고리는 그대로, 지운 카테고리는 업종 → 상위 → 기타", () => {
    expect(validCategory(DEFAULT_CATEGORIES, { categoryId: "food.cafe", type: "expense" })).toBe("food.cafe");
    expect(validCategory(cats, { categoryId: "food.cafe", type: "expense", merchantIndustry: "cafe" })).toBe("food");
    expect(validCategory(cats, { categoryId: "nope", type: "expense" })).toBe("etc");
    expect(validCategory(cats, { categoryId: "food", type: "income" })).toBe("income.etc"); // 구분이 다른 카테고리
  });
});

describe("db (가짜 Supabase)", () => {
  it("setBudgets: upsert만 하고, 이번에 지운 것으로 넘긴 예산만 삭제한다 (다른 탭·기기가 만든 예산은 건드리지 않음)", async () => {
    await db.setBudgets("u1", [{ amount: 1500000 }, { categoryId: "food", amount: 300000 }]);
    expect(calls).toHaveLength(1); // 지운 게 없으면 삭제 요청도 없다
    expect(calls[0].join(" | ")).toContain(`upsert [[{"user_id":"u1","category_id":null,"amount":1500000},{"user_id":"u1","category_id":"food","amount":300000}],{"onConflict":"user_id,category_id"}]`);
    calls.length = 0;
    await db.setBudgets("u1", [{ amount: 1500000 }], ["shopping"]);
    expect(calls[1]).toEqual(["budgets", "delete []", `eq ["user_id","u1"]`, `in ["category_id",["shopping"]]`]);
  });
  it("setBudgets: 총예산을 지웠다고 넘기면(undefined) 그 행만 지운다", async () => {
    await db.setBudgets("u1", [{ categoryId: "food", amount: 1 }], [undefined]);
    expect(calls.at(-1)).toEqual(["budgets", "delete []", `eq ["user_id","u1"]`, `is ["category_id",null]`]);
  });
  it("loadAll: 거래가 1000건을 넘으면 페이지를 넘겨 끝까지 읽고, 영수증 기록으로 receiptId를 채운다", async () => {
    const row = (i: number) => ({ id: `t${i}`, type: "expense", amount: "1000", currency: "KRW", date: "2026-10-01", merchant: "가게", category_id: null, pay_type: "cash" });
    respond = (log) => {
      if (log[0] === "transactions") return log.some((l) => l.startsWith("range [0,")) ? Array.from({ length: 1000 }, (_, i) => row(i)) : [row(1000), { ...row(1001), type: "income" }];
      if (log[0] === "categories") return [{ id: "etc", type: "expense", name: "기타", sort_order: 1 }];
      if (log[0] === "receipts") return [{ id: "rc1", transaction_id: "t1001" }, { id: "rc2", transaction_id: null }];
      return [];
    };
    const d = await loadAll("u1");
    expect(d.txns).toHaveLength(1002);
    expect(calls.filter((c) => c[0] === "transactions").map((c) => c.find((l) => l.startsWith("range")))).toEqual(["range [0,999]", "range [1000,1999]"]);
    expect(d.txns[1001]).toMatchObject({ receiptId: "rc1", categoryId: "income.etc" }); // 카테고리 null인 수입은 수입 '기타'
    expect(d.txns[0].categoryId).toBe("etc");
    expect(calls.find((c) => c[0] === "receipts")).toContain("range [0,999]"); // 영수증 기록도 페이지로
  });
  it("insertTxn: 반복 회차 중복은 무시하는 upsert(실제로 들어간 행 수를 돌려줌), 영수증 거래는 receipts 행도", async () => {
    respond = (log) => (log[0] === "transactions" ? [{ id: "a" }] : []);
    expect(await db.insertTxn("u1", { id: "a", type: "expense", amount: 1, currency: "KRW", date: "2026-10-01", merchant: "m", categoryId: "etc", payType: "cash", receiptId: "doc_1" })).toBe(1);
    expect(calls[0].join(" | ")).toContain(`{"onConflict":"user_id,recurring_id,date","ignoreDuplicates":true}] | select ["id"]`);
    expect(calls[1]).toEqual(["receipts", `insert [[{"user_id":"u1","transaction_id":"a","storage_path":"not_stored","status":"done"}]]`]);
  });
  it("카드 보유 행은 직접 추가한 카드도 그대로 보낸다 (card_products에 내 카드 행이 있어 FK 통과)", async () => {
    await db.upsertCard("u1", { cardId: "custom_1", addedAt: "2026-10-01" });
    await db.upsertCard("u1", { cardId: "shinhan_mrlife", addedAt: "2026-10-01", spendTierOverride: 500000, spendTierOverrideYm: "2026-10" });
    expect(calls).toHaveLength(2);
    expect(calls[1][1]).toContain(`"spend_tier_override_ym":"2026-10"`);
  });
  it("직접 추가한 카드: 내 것만 읽고, 정의 전체를 custom_def로 저장하고, 지울 때는 거래·반복 거래의 카드를 비운 뒤 지운다", async () => {
    const card = { id: "custom_1", issuer: "기타", name: "내 카드", type: "credit", color: "#000", grade: "A", tiers: [{ min: 0, max: null }], spendExcludes: [], sourceUrl: "", checkedAt: "2026-10-01", reviewStatus: "none", rules: [] } as const;
    respond = (log) => (log[0] === "card_products" ? [{ custom_def: card }] : log[0] === "categories" ? [{ id: "etc", type: "expense", name: "기타", sort_order: 1 }] : []);
    expect((await loadAll("u1")).customCards).toEqual([card]);
    expect(calls.find((c) => c[0] === "card_products")).toContain(`eq ["owner_id","u1"]`);
    calls = [];
    await db.upsertCustomCard("u1", { ...card, tiers: [...card.tiers], spendExcludes: [], rules: [], sourceUrl: "https://card.example/p" });
    expect(calls[0][1]).toContain(`"id":"custom_1","owner_id":"u1"`);
    // 출처 · 확인일은 정의 안뿐 아니라 열에도 (DB에서 source_url을 조회하면 보이게)
    expect(calls[0][1]).toContain(`"source_url":"https://card.example/p","checked_at":"2026-10-01"`);
    expect(calls[0][1]).toContain(`"custom_def":{"id":"custom_1"`);
    calls = [];
    await db.removeCustomCard("u1", "custom_1");
    expect(calls.map((c) => [c[0], c[1]])).toEqual([
      ["transactions", `update [{"card_id":null}]`], ["recurring_rules", `update [{"card_id":null}]`], ["user_cards", "delete []"], ["card_products", "delete []"],
    ]);
    expect(calls[3]).toContain(`eq ["owner_id","u1"]`);
  });
});
