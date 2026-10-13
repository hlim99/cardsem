/* 반복 거래(TRX-09) 회차 계산. 순수 함수만 — 스토어가 데이터를 읽은 직후(데모·로그인)와 규칙을 저장할 때 materialize를 부른다 */
import type { RecurringRule, Transaction } from "./types";
import { classifyMerchant } from "./data/merchants";

/** 로컬 날짜 YYYY-MM-DD. toISOString은 UTC라 한국 0~9시에 하루 전 날짜가 나와서 쓰지 않는다 */
export const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const parse = (s: string) => new Date(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
export const addDays = (s: string, n: number) => { const d = parse(s); d.setDate(d.getDate() + n); return ymd(d); };

export const WEEKDAYS = "일월화수목금토";
/** 화면 표시용 주기: "매월 25일", "매주 월요일" */
export const cycleLabel = (r: Pick<RecurringRule, "cycle" | "day">) => (r.cycle === "weekly" ? `매주 ${WEEKDAYS[r.day] ?? "?"}요일` : `매월 ${r.day}일`);

/** from~to(둘 다 포함) 사이의 회차 날짜, 시작일 전과 종료일 뒤는 뺀다.
 *  매월: day일. 그 달에 그 날이 없으면(29~31일) 말일에 한 번. 매주: day = 요일(0=일 … 6=토) */
export function dueDates(rule: Pick<RecurringRule, "cycle" | "day" | "startDate" | "endDate">, from: string, to: string): string[] {
  const lo = from > rule.startDate ? from : rule.startDate;
  const hi = rule.endDate && rule.endDate < to ? rule.endDate : to;
  const out: string[] = [];
  if (!(lo <= hi)) return out;
  if (rule.cycle === "weekly") {
    const d = parse(lo);
    d.setDate(d.getDate() + ((((rule.day - d.getDay()) % 7) + 7) % 7));
    for (; ymd(d) <= hi; d.setDate(d.getDate() + 7)) out.push(ymd(d));
    return out;
  }
  for (let y = +lo.slice(0, 4), m = +lo.slice(5, 7) - 1; ; m++) {
    const last = new Date(y, m + 1, 0).getDate(); // m이 12를 넘어도 Date가 다음 해로 넘겨 준다
    const s = ymd(new Date(y, m, Math.min(rule.day, last)));
    if (s > hi) return out;
    if (s >= lo) out.push(s);
  }
}

/** 아직 안 만든 회차를 찾기 시작할 날. 처음이면 시작일, 아니면 마지막 생성일이 든 기간(매월: 그 달, 매주: 그 날부터 7일)의 다음 날.
 *  이미 회차를 만든 규칙의 날짜·주기를 고쳐도 같은 달(주)에 한 번 더 생기지 않게 — 날짜를 고치지 않은 규칙은 다음 날부터 보는 것과 같다 */
export const nextFrom = (r: Pick<RecurringRule, "cycle" | "startDate" | "lastGeneratedAt">) => {
  const l = r.lastGeneratedAt;
  if (!l) return r.startDate;
  return r.cycle === "weekly" ? addDays(l, 7) : ymd(new Date(+l.slice(0, 4), +l.slice(5, 7), 1)); // 월 인덱스 = 다음 달
};

/** 규칙 한 회차를 거래로. 업종은 가맹점 사전으로 (혜택 매칭용) */
const toTxn = (r: RecurringRule, date: string): Omit<Transaction, "id"> => ({
  type: r.type, amount: r.amount, currency: "KRW", date, merchant: r.merchant, categoryId: r.categoryId, payType: r.payType,
  cardId: r.payType === "credit" || r.payType === "check" ? r.cardId : undefined, isAutoPay: r.isAutoPay, recurringId: r.id,
  merchantIndustry: r.type === "expense" ? classifyMerchant(r.merchant) : undefined,
});

/** 아직 만들지 않은 회차를 거래로 만들고, 바뀐 규칙(lastGeneratedAt = 마지막 회차)을 돌려준다.
 *  마지막 생성일의 다음 기간(nextFrom)부터 today까지만 본다 → 사용자가 지운 회차가 다시 생기지 않는다.
 *  같은 규칙·같은 날짜 거래가 이미 있으면 건너뛴다 (다른 기기·탭이 먼저 만든 경우). id는 부르는 쪽이 붙인다 */
export function materialize(rules: RecurringRule[], txns: Transaction[], today: string): { txns: Omit<Transaction, "id">[]; rules: RecurringRule[] } {
  const have = new Set(txns.filter((t) => t.recurringId).map((t) => `${t.recurringId}|${t.date}`));
  const out: Omit<Transaction, "id">[] = [];
  const changed: RecurringRule[] = [];
  for (const r of rules) {
    const dates = dueDates(r, nextFrom(r), today);
    if (!dates.length) continue;
    for (const d of dates) if (!have.has(`${r.id}|${d}`)) out.push(toTxn(r, d));
    changed.push({ ...r, lastGeneratedAt: dates[dates.length - 1] });
  }
  return { txns: out, rules: changed };
}
