/* 차트 눈금·집계·내보내기·xlsx 작성기 테스트. 화면과 엑셀 파일이 같은 숫자를 내는지 시드 데이터로 대조한다 */
import { describe, expect, it } from "vitest";
import { compactWon, niceTicks, categoryColors, CHART_OTHER } from "./chart";
import { categoryRows, dailySeries, deltaTone, fmtPct, isUnclassified, monthSummary, pctChange, shareBase } from "./stats";
import { buildExport, DEFAULT_EXPORT, monthsBetween } from "./export";
import { buildXlsx, colName, crc32, excelDate, toCsv, xmlEscape } from "./xlsx";
import { computeMonth } from "./engine";
import { CARDS } from "./data/cards";
import { DEFAULT_CATEGORIES } from "./data/merchants";
import { SEED_TXNS, SEED_USER_CARDS } from "./data/fixtures";
import type { Transaction } from "./types";

const cats = DEFAULT_CATEGORIES;
const calcFor = (ym: string) => computeMonth(ym, SEED_TXNS, SEED_USER_CARDS, CARDS);
const tx = (p: Partial<Transaction>): Transaction => ({ id: Math.random().toString(36).slice(2), type: "expense", amount: 10000, currency: "KRW", date: "2026-09-10", merchant: "가게", categoryId: "food.cafe", payType: "credit", cardId: "shinhan_mrlife", ...p });

describe("niceTicks · compactWon", () => {
  it("깔끔한 간격으로 max를 덮는다", () => {
    expect(niceTicks(0)).toEqual([0]);
    expect(niceTicks(NaN)).toEqual([0]);
    expect(niceTicks(713900)).toEqual([0, 200000, 400000, 600000, 800000]);
    expect(niceTicks(1000)).toEqual([0, 250, 500, 750, 1000]);
    const t = niceTicks(2_400_000);
    expect(t[t.length - 1]).toBeGreaterThanOrEqual(2_400_000);
    expect(t.length).toBeLessThanOrEqual(6);
  });
  it("만·억 단위로 줄인다", () => {
    expect(compactWon(0)).toBe("0");
    expect(compactWon(8000)).toBe("8,000");
    expect(compactWon(120000)).toBe("12만");
    expect(compactWon(125000)).toBe("12.5만");
    expect(compactWon(150000000)).toBe("1.5억");
    expect(compactWon(-30000)).toBe("-3만");
  });
});

describe("categoryColors", () => {
  it("정렬 순서로 고정, 하위는 부모 색, 기타·모르는 id는 회색", () => {
    const color = categoryColors(cats);
    expect(color("food")).toBe("var(--color-chart-1)");
    expect(color("food.cafe")).toBe(color("food"));
    expect(color("etc")).toBe(CHART_OTHER);
    expect(color("없는카테고리")).toBe(CHART_OTHER);
  });
});

describe("monthSummary", () => {
  it("환불은 환불한 달 지출에서 빠지고 카테고리에도 음수로 들어간다", () => {
    const pay = tx({ id: "p1", amount: 30000, date: "2026-09-05" });
    const refund = tx({ id: "r1", amount: 10000, date: "2026-09-08", originalTxnId: "p1" });
    const income = tx({ id: "i1", type: "income", amount: 500000, categoryId: "salary", payType: "transfer", cardId: undefined });
    const s = monthSummary([pay, refund, income], "2026-09", cats);
    expect(s.expense).toBe(20000);
    expect(s.refunds).toBe(10000);
    expect(s.income).toBe(500000);
    expect(s.net).toBe(480000);
    expect(s.byCategory.food).toBe(20000);
    expect(s.bySubCategory["food.cafe"]).toBe(20000);
    expect(s.countByCategory.food).toBe(1); // 환불은 건수에 안 센다
    expect(s.expenseCount).toBe(1);
    expect(s.incomeByCategory.salary).toBe(500000);
  });
  it("외화는 원화 환산액으로 센다", () => {
    const s = monthSummary([tx({ currency: "USD", amount: 10, amountKrw: 13500 })], "2026-09", cats);
    expect(s.expense).toBe(13500);
  });
});

describe("categoryRows · dailySeries", () => {
  it("이번 달·지난달 중 한쪽만 있어도 행을 만들고, 하위와 '하위 미지정'을 펼친다", () => {
    const cur = monthSummary([tx({ amount: 40000, categoryId: "food.cafe" }), tx({ amount: 5000, categoryId: "food" })], "2026-09", cats);
    const prev = monthSummary([tx({ date: "2026-08-10", amount: 30000, categoryId: "transport.taxi" })], "2026-08", cats);
    const rows = categoryRows(cur, prev, cats, [{ categoryId: "food", amount: 100000 }]);
    const food = rows.find((r) => r.id === "food")!;
    expect(food.amount).toBe(45000);
    expect(food.share).toBe(1);
    expect(food.budget).toBe(100000);
    expect(food.children.map((c) => c.name)).toEqual(["카페", "식비 (하위 미지정)"]);
    const transport = rows.find((r) => r.id === "transport")!;
    expect(transport.amount).toBe(0);
    expect(transport.delta).toBe(-30000);
  });
  it("말일까지 빈 날 없이 채운다", () => {
    const d = dailySeries(monthSummary([tx({ date: "2026-02-03" })], "2026-02", cats));
    expect(d).toHaveLength(28);
    expect(d[2]).toMatchObject({ date: "2026-02-03", expense: 10000, count: 1 });
  });
  it("이전 달 결제의 환불로 음수가 된 카테고리는 비중 0, 나머지 비중 합은 100%", () => {
    // 8월 쇼핑 19만 원 결제를 9월에 취소, 9월에는 식비 5만 + 교통 3만만 씀 → 쇼핑 −19만, 순지출 −11만
    const pay = tx({ id: "aug", date: "2026-08-20", amount: 190000, categoryId: "shopping" });
    const list = [pay, tx({ id: "cxl", date: "2026-09-03", amount: 190000, categoryId: "shopping", originalTxnId: "aug" }),
      tx({ amount: 50000, categoryId: "food.cafe" }), tx({ amount: 30000, categoryId: "transport" })];
    const cur = monthSummary(list, "2026-09", cats);
    expect(cur.expense).toBe(-110000);
    expect(shareBase(Object.values(cur.byCategory))).toBe(80000);
    const rows = categoryRows(cur, monthSummary(list, "2026-08", cats), cats);
    const by = Object.fromEntries(rows.map((r) => [r.id, r]));
    expect(by.shopping.amount).toBe(-190000);
    expect(by.shopping.share).toBe(0);
    expect(by.food.share).toBe(50000 / 80000);
    expect(rows.reduce((a, r) => a + r.share, 0)).toBeCloseTo(1, 9);
  });
  it("업종 미분류: 업종 없고 사전에도 없는 결제만 (환불·수입 제외)", () => {
    expect(isUnclassified(tx({ merchant: "알수없는가게" }))).toBe(true);
    expect(isUnclassified(tx({ merchant: "스타벅스 역삼점" }))).toBe(false); // 사전으로 카페
    expect(isUnclassified(tx({ merchant: "월세", payType: "transfer", cardId: undefined }))).toBe(false); // 카드 결제가 아니면 업종이 혜택에 쓰이지 않음
    expect(isUnclassified(tx({ merchant: "알수없는가게", merchantIndustry: "cafe" }))).toBe(false);
    expect(isUnclassified(tx({ merchant: "알수없는가게", merchantIndustry: "etc" }))).toBe(true); // AI가 모르면 etc로 답한다
    expect(isUnclassified(tx({ merchant: "알수없는가게", originalTxnId: "x" }))).toBe(false);
    expect(isUnclassified(tx({ merchant: "알수없는가게", type: "income" }))).toBe(false);
  });
  it("증감률: 비교 대상 0이면 null", () => {
    expect(pctChange(100, 0)).toBeNull();
    expect(fmtPct(pctChange(100, 0))).toBe("비교 불가");
    expect(fmtPct(pctChange(150, 100))).toBe("+50%");
  });
  it("증감 색: 지출은 늘면 빨강, 수입은 늘면 초록, 같으면 회색", () => {
    expect([deltaTone(1, false), deltaTone(-1, false), deltaTone(1, true), deltaTone(0, true)]).toEqual(["text-red-700", "text-green-700", "text-green-700", "text-muted"]);
  });
});

describe("buildExport (시드 데이터)", () => {
  const { sheets, count } = buildExport({ txns: SEED_TXNS, from: "2026-09-01", to: "2026-09-30", categories: cats, calcFor, opts: { ...DEFAULT_EXPORT, memo: true, cond: true } });
  const [txSheet, monthSheet, catSheet, cardSheet] = sheets;
  const col = (name: string) => txSheet.columns.findIndex((c) => c.header === name);
  const s = monthSummary(SEED_TXNS, "2026-09", cats);
  const calc = calcFor("2026-09");

  it("거래내역 지출·수입 합이 월간 요약과 같다", () => {
    expect(count).toBe(SEED_TXNS.filter((t) => t.date.startsWith("2026-09")).length);
    const sum = (i: number) => txSheet.rows.reduce((a, r) => a + (typeof r[i] === "number" ? (r[i] as number) : 0), 0);
    expect(sum(col("지출(원)"))).toBe(s.expense);
    expect(sum(col("수입(원)"))).toBe(s.income);
  });
  it("받은 혜택 합이 엔진의 월 합계와 같다", () => {
    const sum = txSheet.rows.reduce((a, r) => a + (typeof r[col("받은 혜택(원)")] === "number" ? (r[col("받은 혜택(원)")] as number) : 0), 0);
    expect(sum).toBe(calc.received);
  });
  it("결제수단은 한국어 라벨, 날짜순 정렬", () => {
    const pays = new Set(txSheet.rows.map((r) => r[col("결제수단")]));
    for (const p of pays) expect(["신용카드", "체크카드", "현금", "계좌이체"]).toContain(p);
    const dates = txSheet.rows.map((r) => r[0] as string);
    expect([...dates].sort()).toEqual(dates);
  });
  it("월별 요약: 한 달 전체면 화면과 같은 값", () => {
    expect(monthSheet.rows).toHaveLength(1);
    const [, period, income, expense, net, received, missed] = monthSheet.rows[0];
    expect(period).toBe("한 달 전체");
    expect([income, expense, net, received, missed]).toEqual([s.income, s.expense, s.net, calc.received, calc.missed]);
  });
  it("카테고리별 합이 지출과 같고 비중 합은 100%", () => {
    expect(catSheet.rows.reduce((a, r) => a + (r[2] as number), 0)).toBe(s.expense);
    expect(catSheet.rows.reduce((a, r) => a + (r[3] as number), 0)).toBeCloseTo(1, 6);
  });
  it("카드별 결제액 합 = 카드 결제 − 카드 환불 (월간 요약 결제수단·카드별과 같은 규칙)", () => {
    const sept = SEED_TXNS.filter((t) => t.date.startsWith("2026-09") && t.type === "expense" && t.cardId);
    const net = sept.reduce((a, t) => a + (t.originalTxnId ? -t.amount : t.amount), 0);
    expect(cardSheet.rows.reduce((a, r) => a + (r[2] as number), 0)).toBe(net);
  });
  it("기간이 달 중간에 걸치면 월별 요약에 일부 기간으로 표시", () => {
    const part = buildExport({ txns: SEED_TXNS, from: "2026-08-15", to: "2026-09-10", categories: cats, calcFor, opts: DEFAULT_EXPORT });
    expect(part.sheets[1].rows.map((r) => r[1])).toEqual(["15일~31일", "1일~10일"]);
    expect(monthsBetween("2025-11-03", "2026-02-01")).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
  });
  it("카테고리별 시트: 음수 행은 비중 빈칸, 양수 행 비중 합은 100%", () => {
    const pay = tx({ id: "aug", date: "2026-08-20", amount: 190000, categoryId: "shopping" });
    const list = [pay, tx({ id: "cxl", date: "2026-09-03", amount: 190000, categoryId: "shopping", originalTxnId: "aug" }), tx({ amount: 50000, categoryId: "food.cafe" })];
    const e = buildExport({ txns: list, from: "2026-09-01", to: "2026-09-30", categories: cats, calcFor: (ym) => computeMonth(ym, list, SEED_USER_CARDS, CARDS), opts: DEFAULT_EXPORT });
    const rows = e.sheets[2].rows;
    expect(rows.find((r) => r[0] === "쇼핑")![3]).toBeNull();
    expect(rows.reduce((a, r) => a + ((r[3] as number) ?? 0), 0)).toBeCloseTo(1, 9);
    expect(rows.reduce((a, r) => a + (r[2] as number), 0)).toBe(-140000); // 금액 합은 순지출 그대로
  });
  it("하위 카테고리가 음수인 달: 화면 하위 행 비중 = 엑셀 카테고리 시트 비중", () => {
    // 8월 배달 2만 원을 9월에 환불, 9월에는 카페 5만 + 교통 3만 → 하위 기준 분모 8만
    const list = [tx({ id: "aug", date: "2026-08-20", amount: 20000, categoryId: "food.delivery" }),
      tx({ id: "cxl", date: "2026-09-03", amount: 20000, categoryId: "food.delivery", originalTxnId: "aug" }),
      tx({ amount: 50000, categoryId: "food.cafe" }), tx({ amount: 30000, categoryId: "transport" })];
    const rows = categoryRows(monthSummary(list, "2026-09", cats), monthSummary(list, "2026-08", cats), cats);
    const cafe = rows.find((r) => r.id === "food")!.children.find((c) => c.id === "food.cafe")!;
    const e = buildExport({ txns: list, from: "2026-09-01", to: "2026-09-30", categories: cats, calcFor: (ym) => computeMonth(ym, list, SEED_USER_CARDS, CARDS), opts: DEFAULT_EXPORT });
    const sheetCafe = e.sheets[2].rows.find((r) => r[1] === "카페")!;
    expect(cafe.share).toBe(50000 / 80000);
    expect(cafe.share).toBe(sheetCafe[3]);
  });
  it("환불은 지출 열에 음수, 구분 '환불'", () => {
    const pay = tx({ id: "p1", amount: 30000, date: "2026-09-05" });
    const refund = tx({ id: "r1", amount: 10000, date: "2026-09-08", originalTxnId: "p1" });
    const e = buildExport({ txns: [pay, refund], from: "2026-09-01", to: "2026-09-30", categories: cats, calcFor: (ym) => computeMonth(ym, [pay, refund], SEED_USER_CARDS, CARDS), opts: DEFAULT_EXPORT });
    const r = e.sheets[0].rows.find((x) => x[2] === "환불")!;
    expect(r[7]).toBe(-10000);
  });
});

/* ── xlsx: 만든 zip을 직접 풀어서 확인 ── */
function unzip(buf: Uint8Array) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const files: Record<string, string> = {};
  let p = 0;
  const dec = new TextDecoder();
  while (dv.getUint32(p, true) === 0x04034b50) {
    const crc = dv.getUint32(p + 14, true), size = dv.getUint32(p + 18, true), nlen = dv.getUint16(p + 26, true), xlen = dv.getUint16(p + 28, true);
    const name = dec.decode(buf.subarray(p + 30, p + 30 + nlen));
    const data = buf.subarray(p + 30 + nlen + xlen, p + 30 + nlen + xlen + size);
    expect(crc32(data)).toBe(crc);
    files[name] = dec.decode(data);
    p += 30 + nlen + xlen + size;
  }
  return files;
}

describe("xlsx", () => {
  it("열 이름·날짜 일련번호·XML 이스케이프", () => {
    expect([colName(0), colName(25), colName(26), colName(701)]).toEqual(["A", "Z", "AA", "ZZ"]);
    expect(excelDate("1900-03-01")).toBe(61);
    expect(excelDate("2026-09-20")).toBe(46285);
    expect(excelDate("2026/09/20")).toBeNull();
    expect(xmlEscape(`a<b>&"c"\u0001`)).toBe("a&lt;b&gt;&amp;&quot;c&quot;");
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  });
  it("시트·서식·합계 수식이 들어간 zip을 만든다", () => {
    const bytes = buildXlsx([
      { name: "거래내역", columns: [{ header: "날짜", type: "date" }, { header: "가맹점" }, { header: "금액", type: "int" }], rows: [["2026-09-20", "=HYPERLINK(\"x\")", 6100], ["2026-09-21", "A&B <C>", -1000]], footer: ["합계", null, { sum: true }] },
      { name: "이름이 아주 아주 아주 아주 아주 긴 시트 [테스트]", columns: [{ header: "비중", type: "pct" }], rows: [[0.25]] },
    ]);
    const f = unzip(bytes);
    expect(Object.keys(f)).toEqual(expect.arrayContaining(["[Content_Types].xml", "_rels/.rels", "xl/workbook.xml", "xl/_rels/workbook.xml.rels", "xl/styles.xml", "xl/worksheets/sheet1.xml", "xl/worksheets/sheet2.xml"]));
    const s1 = f["xl/worksheets/sheet1.xml"];
    expect(s1).toContain('<c r="A2" s="4"><v>46285</v></c>'); // 날짜 셀
    expect(s1).toContain("=HYPERLINK(&quot;x&quot;)"); // 문자열 그대로, 수식 아님
    expect(s1).not.toContain("<f>HYPERLINK");
    expect(s1).toContain("A&amp;B &lt;C&gt;");
    expect(s1).toContain("<f>SUM(C2:C3)</f><v>5100</v>");
    expect(s1).toContain('<autoFilter ref="A1:C3"/>');
    expect(s1).toContain('state="frozen"');
    const wb = f["xl/workbook.xml"];
    expect(wb).toContain('name="거래내역"');
    expect(wb).not.toMatch(/name="[^"]*[[\]][^"]*"/); // 금지 문자 제거
    const long = /<sheet name="([^"]+)" sheetId="2"/.exec(wb)![1];
    expect(long.length).toBeLessThanOrEqual(31);
  });
  it("CSV: BOM, 따옴표, 수식 주입 방지, 합계 행", () => {
    const sheet = { name: "x", columns: [{ header: "가맹점" }, { header: "금액", type: "int" as const }], rows: [["=cmd|' /C calc'!A0", 100], ['쉼표, "따옴표"', 200]], footer: ["합계", { sum: true as const }] };
    expect(toCsv(sheet).trimEnd().endsWith(`"쉼표, ""따옴표""",200`)).toBe(true); // 기본은 합계 행 없음 (다른 앱으로 옮길 때 거래로 잘못 들어가지 않게)
    const csv = toCsv(sheet, true);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toContain(`'=cmd|' /C calc'!A0,100`);
    expect(csv).toContain(`"쉼표, ""따옴표""",200`);
    expect(csv.trimEnd().endsWith("합계,300")).toBe(true);
  });
});
