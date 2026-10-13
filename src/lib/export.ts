/* 엑셀 내보내기 내용 (RPT-04). 기간 안의 거래로 시트 4장을 만든다 — 파일 형식(xlsx·csv)은 xlsx.ts가 담당
 *
 *  1. 거래내역      한 줄 = 거래 한 건. 지출·수입 열을 나눠 엑셀 SUM이 바로 맞게 하고, 환불은 지출 열에 음수
 *  2. 월별 요약     달마다 수입·지출·순수입·받은 혜택·놓친 혜택·건수 (화면의 월간 요약과 같은 규칙)
 *  3. 카테고리별    대분류·소분류별 지출, 비중, 건수
 *  4. 카드별 혜택   카드마다 결제 건수·결제액·받은 혜택·놓친 혜택
 *
 * 혜택 금액은 엔진(computeMonth)이 달 단위로 계산한 값을 그대로 쓴다. 기간이 달 중간에서 끊겨도
 * 그 달 전체 원장으로 계산된 결제별 혜택을 쓰므로, 화면에서 본 거래별 혜택과 같다 */
import type { Category, Transaction } from "./types";
import type { MonthCalc } from "./engine";
import { daysInMonth, industryOf, krw, nextYm, ymOf } from "./engine";
import { categoryName, shareBase, topCategory } from "./stats";
import { cardLabel } from "./data/cards";
import { INDUSTRY } from "./data/merchants";
import { PAY_CHANNEL, PAY_METHOD, PAY_TYPE } from "./labels";
import type { FooterCell, SheetColumn, SheetSpec, CellValue } from "./xlsx";

export type ExportOptions = { card: boolean; benefit: boolean; missed: boolean; memo: boolean; cond: boolean };
export const DEFAULT_EXPORT: ExportOptions = { card: true, benefit: true, missed: true, memo: false, cond: false };
export const EXPORT_GROUPS: { key: keyof ExportOptions; label: string; desc: string }[] = [
  { key: "card", label: "사용 카드 · 할부", desc: "어느 카드로 몇 개월 할부했는지" },
  { key: "benefit", label: "받은 혜택 · 적용 규칙", desc: "결제마다 받은 할인·적립 (참고값)" },
  { key: "missed", label: "놓친 혜택 · 최적 카드", desc: "다른 보유 카드였다면 더 받았을 금액" },
  { key: "memo", label: "메모 · 품목", desc: "직접 쓴 메모, 영수증 품목" },
  { key: "cond", label: "혜택 조건 필드", desc: "자동납부·간편결제·결제 경로·주유량" },
];

type Input = { txns: Transaction[]; from: string; to: string; categories: Category[]; calcFor: (ym: string) => MonthCalc; opts: ExportOptions };

const kind = (t: Transaction) => (t.type === "income" ? "수입" : t.originalTxnId ? "환불" : "지출");
/** 지출 열 값: 결제는 +, 환불은 −, 수입은 빈칸 */
const expenseVal = (t: Transaction) => (t.type === "income" ? null : t.originalTxnId ? -krw(t) : krw(t));

export function monthsBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let m = ymOf(from); m <= ymOf(to) && out.length < 240; m = nextYm(m)) out.push(m);
  return out;
}

export function buildExport({ txns, from, to, categories, calcFor, opts }: Input): { sheets: SheetSpec[]; count: number } {
  const list = txns.filter((t) => t.date >= from && t.date <= to).sort((a, b) => (a.date + (a.paidAt ?? "")).localeCompare(b.date + (b.paidAt ?? "")));
  const res = (t: Transaction) => calcFor(ymOf(t.date)).byTxn[t.id];
  const benefitOf = (t: Transaction) => res(t)?.mine?.total ?? 0;
  const missedOf = (t: Transaction) => Math.max(0, res(t)?.diff ?? 0);
  const isCardPay = (t: Transaction) => t.type === "expense" && !t.originalTxnId && !!t.cardId;
  const foreign = list.some((t) => t.currency !== "KRW");

  /* 1. 거래내역 */
  const cols: SheetColumn[] = [
    { header: "날짜", type: "date", width: 12 }, { header: "시각", width: 8 }, { header: "구분", width: 7 }, { header: "가맹점", width: 24 },
    { header: "대분류", width: 10 }, { header: "소분류", width: 10 }, { header: "업종", width: 10 },
    { header: "지출(원)", type: "int", width: 12 }, { header: "수입(원)", type: "int", width: 12 }, { header: "결제수단", width: 10 },
  ];
  if (foreign) cols.push({ header: "통화", width: 6 }, { header: "원래 금액", type: "num", width: 11 });
  if (opts.card) cols.push({ header: "카드", width: 22 }, { header: "할부(개월)", type: "int", width: 9 });
  if (opts.benefit) cols.push({ header: "받은 혜택(원)", type: "int", width: 12 }, { header: "적용 혜택", width: 30 });
  if (opts.missed) cols.push({ header: "놓친 혜택(원)", type: "int", width: 12 }, { header: "최적 카드", width: 22 });
  if (opts.memo) cols.push({ header: "메모", width: 20 }, { header: "품목", width: 24 });
  if (opts.cond) cols.push({ header: "자동납부", width: 8 }, { header: "간편결제", width: 14 }, { header: "결제 경로", width: 10 }, { header: "주유량(L)", type: "num", width: 9 });

  const rows: CellValue[][] = list.map((t) => {
    const top = topCategory(categories, t.categoryId);
    const ind = industryOf(t);
    const r = res(t);
    const row: CellValue[] = [
      t.date, t.paidAt ?? "", kind(t), t.merchant,
      categoryName(categories, top), top === t.categoryId ? "" : categoryName(categories, t.categoryId), ind ? INDUSTRY[ind].label : "미분류",
      expenseVal(t), t.type === "income" ? krw(t) : null, PAY_TYPE[t.payType] ?? t.payType,
    ];
    if (foreign) row.push(t.currency, t.currency === "KRW" ? null : t.amount);
    if (opts.card) row.push(t.cardId ? cardLabel(t.cardId) : "", t.installmentMonths && t.installmentMonths > 1 ? t.installmentMonths : null);
    if (opts.benefit) row.push(isCardPay(t) ? benefitOf(t) : null, r?.mine?.applied.map((a) => a.name).join(" + ") ?? "");
    if (opts.missed) row.push(isCardPay(t) ? missedOf(t) : null, isCardPay(t) && missedOf(t) > 0 && r?.bestCardId ? cardLabel(r.bestCardId) : "");
    if (opts.memo) row.push(t.memo ?? "", t.items?.join(", ") ?? "");
    if (opts.cond) row.push(t.isAutoPay ? "예" : "", t.payMethod ? PAY_METHOD[t.payMethod] : "", t.payChannel ? PAY_CHANNEL[t.payChannel] : "", t.fuelLiters ?? null);
    return row;
  });
  const sumCols = new Set(["지출(원)", "수입(원)", "받은 혜택(원)", "놓친 혜택(원)"]);
  const footer: FooterCell[] = cols.map((c, i) => (i === 0 ? "합계" : sumCols.has(c.header) ? { sum: true } : null));

  /* 2. 월별 요약 */
  const monthRows: CellValue[][] = monthsBetween(from, to).map((ym) => {
    const inMonth = list.filter((t) => ymOf(t.date) === ym);
    const income = inMonth.filter((t) => t.type === "income").reduce((s, t) => s + krw(t), 0);
    const expense = inMonth.reduce((s, t) => s + (expenseVal(t) ?? 0), 0);
    const pay = inMonth.filter(isCardPay);
    const mFrom = ym === ymOf(from) ? from : `${ym}-01`, mTo = ym === ymOf(to) ? to : `${ym}-${String(daysInMonth(ym)).padStart(2, "0")}`;
    const full = mFrom === `${ym}-01` && mTo === `${ym}-${String(daysInMonth(ym)).padStart(2, "0")}`;
    const calc = calcFor(ym);
    // 한 달 전체면 화면과 같은 "월 배분" 놓친 혜택(같은 한도를 두 번 세지 않음), 일부 기간이면 결제별 차액 합
    const missed = full ? calc.missed : pay.reduce((s, t) => s + missedOf(t), 0);
    return [`${Number(ym.slice(0, 4))}년 ${Number(ym.slice(5))}월`, full ? "한 달 전체" : `${Number(mFrom.slice(8))}일~${Number(mTo.slice(8))}일`, income, expense, income - expense, pay.reduce((s, t) => s + benefitOf(t), 0), missed, inMonth.filter((t) => !t.originalTxnId).length];
  });

  /* 3. 카테고리별 지출 (하위가 없으면 소분류 빈칸) */
  const leaf = new Map<string, { top: string; sub: string; amount: number; count: number }>();
  for (const t of list) {
    if (t.type !== "expense") continue;
    const top = topCategory(categories, t.categoryId);
    const e = leaf.get(t.categoryId) ?? { top, sub: top === t.categoryId ? "" : t.categoryId, amount: 0, count: 0 };
    e.amount += expenseVal(t) ?? 0;
    if (!t.originalTxnId) e.count++;
    leaf.set(t.categoryId, e);
  }
  // 비중 분모는 양수 행 합 (화면과 같은 규칙). 환불로 음수가 된 행은 비중 빈칸
  const base = shareBase([...leaf.values()].map((e) => e.amount));
  const topTotal = new Map<string, number>();
  for (const e of leaf.values()) topTotal.set(e.top, (topTotal.get(e.top) ?? 0) + e.amount);
  const catRows: CellValue[][] = [...leaf.values()]
    .sort((a, b) => (topTotal.get(b.top)! - topTotal.get(a.top)!) || a.top.localeCompare(b.top) || b.amount - a.amount)
    .map((e) => [categoryName(categories, e.top), e.sub ? categoryName(categories, e.sub) : "", e.amount, e.amount > 0 && base > 0 ? e.amount / base : null, e.count]);

  /* 4. 카드별 혜택 */
  const byCard = new Map<string, { count: number; amount: number; benefit: number; missed: number }>();
  for (const t of list) {
    // 카드 환불은 결제액에서 뺀다 (월간 요약·카드 상세와 같은 규칙). 건수·혜택은 원래 결제 쪽에서 센다
    if (t.type === "expense" && t.originalTxnId && t.cardId) { const e = byCard.get(t.cardId) ?? { count: 0, amount: 0, benefit: 0, missed: 0 }; e.amount -= krw(t); byCard.set(t.cardId, e); continue; }
    if (!isCardPay(t)) continue;
    const e = byCard.get(t.cardId!) ?? { count: 0, amount: 0, benefit: 0, missed: 0 };
    e.count++; e.amount += krw(t); e.benefit += benefitOf(t); e.missed += missedOf(t);
    byCard.set(t.cardId!, e);
  }
  const cardRows: CellValue[][] = [...byCard.entries()].sort((a, b) => b[1].amount - a[1].amount).map(([id, e]) => [cardLabel(id), e.count, e.amount, e.benefit, e.missed]);

  const sheets: SheetSpec[] = [
    { name: "거래내역", columns: cols, rows, footer },
    {
      name: "월별 요약",
      columns: [{ header: "월", width: 12 }, { header: "기간", width: 12 }, { header: "수입(원)", type: "int", width: 13 }, { header: "지출(원)", type: "int", width: 13 }, { header: "순수입(원)", type: "int", width: 13 }, { header: "받은 혜택(원)", type: "int", width: 13 }, { header: "놓친 혜택(원)", type: "int", width: 13 }, { header: "거래 건수", type: "int", width: 10 }],
      rows: monthRows, footer: ["합계", "", { sum: true }, { sum: true }, { sum: true }, { sum: true }, { sum: true }, { sum: true }],
    },
    {
      name: "카테고리별 지출",
      columns: [{ header: "대분류", width: 12 }, { header: "소분류", width: 12 }, { header: "지출(원)", type: "int", width: 13 }, { header: "비중", type: "pct", width: 9 }, { header: "건수", type: "int", width: 8 }],
      rows: catRows, footer: ["합계", "", { sum: true }, base > 0 ? 1 : 0, { sum: true }],
    },
    {
      name: "카드별 혜택",
      columns: [{ header: "카드", width: 24 }, { header: "결제 건수", type: "int", width: 10 }, { header: "결제액(원)", type: "int", width: 13 }, { header: "받은 혜택(원)", type: "int", width: 13 }, { header: "놓친 혜택(원)", type: "int", width: 13 }],
      rows: cardRows, footer: ["합계", { sum: true }, { sum: true }, { sum: true }, { sum: true }],
    },
  ];
  return { sheets, count: list.length };
}

export const exportFileName = (from: string, to: string, ext: "xlsx" | "csv") => `카드셈_${from}_${to}.${ext}`;
