"use client";
/* 월간 요약 (RPT-06). 한 달을 네 덩어리로 보여준다
 *  1. 핵심 숫자 4개 — 수입·지출·순수입·받은 혜택, 각각 지난달 대비
 *  2. 카테고리별 지출 — 그래프(도넛 + 순위 막대) ↔ 표(지난달·증감·건수·예산, 하위 카테고리 펼침)
 *  3. 일별 지출 — 그래프(세로 막대) ↔ 표
 *  4. 결제수단·카드별 — 지출과 받은/놓친 혜택
 * 숫자는 모두 lib/stats.ts(monthSummary·categoryRows)와 엔진(calc)에서 나온다. 엑셀 파일도 같은 함수를 쓴다 */
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { MonthPicker, Screen, ViewSwitch } from "@/components/shell";
import { AiTitle, Badge, Button, Card, CardChip, CardTitle, Cap, cx, EmptyState, Icon, Note, StatTile, TextLink, won } from "@/components/ui";
import { BarList, ColumnChart, DataTable, Donut, ViewToggle, type Column, type View } from "@/components/charts";
import { useStore } from "@/lib/store";
import { daysInMonth, fmtYm, krw, prevYm } from "@/lib/engine";
import { categoryRows, dailySeries, deltaTone, fmtPct, isUnclassified, monthSummary, pctChange, type CategoryRow } from "@/lib/stats";
import { categoryColors, CHART_EXPENSE, pct1 } from "@/lib/chart";
import { cardById, cardLabel } from "@/lib/data/cards";
import { PAY_TYPE } from "@/lib/labels";
import { fmtDateKo } from "@/lib/format";
import { buildExport, DEFAULT_EXPORT, exportFileName } from "@/lib/export";
import { buildXlsx, downloadBlob, XLSX_MIME } from "@/lib/xlsx";
import { useInsight } from "@/lib/ai/client";

/** 지난달 대비 한 줄. up=좋음 이면 늘면 초록, 아니면(지출) 늘면 빨강. 색만이 아니라 ▲▼와 말로도 방향을 알린다 */
function Delta({ cur, prev, upIsGood }: { cur: number; prev: number; upIsGood: boolean }) {
  const d = cur - prev;
  if (prev === 0 && cur === 0) return <span className="text-muted">지난달도 0원</span>;
  if (prev === 0) return <span className="text-muted">지난달 기록 없음</span>;
  if (d === 0) return <span className="text-muted">지난달과 같아요</span>;
  return <span className={deltaTone(d, upIsGood)}>{d > 0 ? "▲" : "▼"} {won(Math.abs(d))} ({fmtPct(pctChange(cur, prev))}) {d > 0 ? "늘었어요" : "줄었어요"}</span>;
}

/** AI 인사이트. 기록이 있는 달에만 그린다 — 빈 달에 0으로 채운 집계로 AI를 부르지 않도록 */
function MonthInsight({ month, aggregates, fallback }: { month: string; aggregates: unknown; fallback: string }) {
  const insight = useInsight(`monthly:${month}`, aggregates, fallback);
  return (
    <Card>
      <AiTitle note={insight.status === "loading" ? "생성 중…" : insight.status === "ai" ? "집계값만 사용" : "템플릿 문장"}>AI 인사이트</AiTitle>
      <p className={cx("m-0 text-body", insight.status === "loading" && "opacity-60")}>{insight.text}</p>
      {insight.error && <Cap className="text-amber-700">{insight.error}</Cap>}
      {insight.actions.length > 0 && <div className="flex gap-2 flex-wrap">{insight.actions.map((a) => <Badge key={a} kind="benefit">{a}</Badge>)}</div>}
    </Card>
  );
}

export default function MonthlyPage() {
  const router = useRouter();
  const { txns, month, today, categories, budgets, calc, calcFor } = useStore();
  const [catView, setCatView] = useState<View>("그래프");
  const [dayView, setDayView] = useState<View>("그래프");
  const [open, setOpen] = useState<Set<string>>(new Set());

  const pm = prevYm(month);
  const s = useMemo(() => monthSummary(txns, month, categories), [txns, month, categories]);
  const p = useMemo(() => monthSummary(txns, pm, categories), [txns, pm, categories]);
  const pc = calcFor(pm);
  const rows = useMemo(() => categoryRows(s, p, categories, budgets), [s, p, categories, budgets]);
  const color = useMemo(() => categoryColors(categories), [categories]);
  const days = useMemo(() => dailySeries(s), [s]);
  const spentRows = rows.filter((r) => r.amount > 0);
  // 이전 달 결제의 환불이 이번 달 결제보다 커서 음수가 된 카테고리 — 비중·도넛에서 빼고 표에만 보여준다
  const refundRows = rows.filter((r) => r.amount < 0);
  const unclassified = useMemo(() => txns.filter((t) => t.date.startsWith(month) && isUnclassified(t)).length, [txns, month]);

  // 결제수단·카드별: 카드 결제는 엔진 결과(받은 혜택·결제별 놓친 차액), 현금·이체는 금액만
  const payRows = useMemo(() => {
    const m = new Map<string, { key: string; label: string; cardId?: string; amount: number; count: number; benefit: number; missed: number }>();
    for (const t of txns) {
      if (!t.date.startsWith(month) || t.type !== "expense") continue;
      const key = t.cardId ?? t.payType;
      const e = m.get(key) ?? { key, label: t.cardId ? cardLabel(t.cardId) : PAY_TYPE[t.payType], cardId: t.cardId, amount: 0, count: 0, benefit: 0, missed: 0 };
      const r = calc.byTxn[t.id];
      if (t.originalTxnId) e.amount -= krw(t);
      else { e.amount += krw(t); e.count++; e.benefit += r?.mine?.total ?? 0; e.missed += Math.max(0, r?.diff ?? 0); }
      m.set(key, e);
    }
    return [...m.values()].sort((a, b) => b.amount - a.amount);
  }, [txns, month, calc]);

  // 일평균: 지난 달은 말일까지, 이번 달은 오늘까지, 미래 달은 계산하지 않음
  const elapsed = month < today.slice(0, 7) ? daysInMonth(month) : month === today.slice(0, 7) ? Number(today.slice(8)) : 0;
  const peak = days.reduce((a, d) => (d.expense > a.expense ? d : a), days[0]);

  // AI가 실패하면 쓰는 템플릿 문장. 조사가 이름 받침에 흔들리지 않게 "원으로", "카테고리(…)예요"로 끝맺는다
  const top = spentRows[0];
  const diff = s.expense - p.expense;
  const insightFallback = `이번 달 지출은 ${won(s.expense)}${p.count === 0 ? "이에요" : diff === 0 ? "으로 지난달과 같아요" : `으로 지난달보다 ${won(Math.abs(diff))} ${diff > 0 ? "늘었어요" : "줄었어요"}`}. ${top ? `가장 많이 쓴 건 ${top.name} 카테고리(${pct1(top.share)})예요. ` : ""}받은 혜택은 ${won(calc.received)}, 놓친 혜택은 ${won(calc.missed)}이에요.`;
  const insightData = {
    month, income: s.income, expense: s.expense, prevIncome: p.income, prevExpense: p.expense, net: s.net, receivedBenefit: calc.received, prevReceivedBenefit: pc.received, missedBenefit: calc.missed,
    topCategories: spentRows.slice(0, 5).map((r) => ({ name: r.name, amount: r.amount, share: Math.round(r.share * 100), prevAmount: r.prev })),
    biggestDay: peak && peak.expense > 0 ? { date: peak.date, amount: peak.expense } : null,
  };

  const range = [`${month}-01`, `${month}-${String(daysInMonth(month)).padStart(2, "0")}`] as const;
  const downloadMonth = () => {
    const { sheets } = buildExport({ txns, from: range[0], to: range[1], categories, calcFor, opts: DEFAULT_EXPORT });
    downloadBlob(buildXlsx(sheets) as BlobPart, exportFileName(range[0], range[1], "xlsx"), XLSX_MIME);
  };
  const goCat = (id: string) => router.push(`/transactions?cat=${encodeURIComponent(id)}`);

  /* 카테고리 표: 상위 행 + 펼친 하위 행을 한 목록으로 */
  type TRow = Omit<CategoryRow, "children"> & { level: 0 | 1; parent?: string; hasKids?: boolean };
  const flat: TRow[] = rows.flatMap((r) => [
    { ...r, level: 0 as const, hasKids: r.children.length > 0 },
    ...(open.has(r.id) ? r.children.map((c) => ({ ...c, level: 1 as const, parent: r.id })) : []),
  ]);
  const toggle = (id: string) => setOpen((o) => { const n = new Set(o); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const catCols: Column<TRow>[] = [
    { key: "name", header: "카테고리", render: (r) => r.level === 0 ? (
      <span className="flex items-center gap-2 min-w-0">
        {r.hasKids ? <button type="button" onClick={() => toggle(r.id)} aria-expanded={open.has(r.id)} aria-label={`${r.name} 하위 카테고리 ${open.has(r.id) ? "접기" : "펼치기"}`} className="w-6 h-6 -ml-1 rounded-sm inline-flex items-center justify-center text-muted hover:bg-gray-100"><Icon name={open.has(r.id) ? "expand_more" : "chevron_right"} size={18} /></button> : <span className="w-5" />}
        <i aria-hidden className="w-2.5 h-2.5 rounded-xs flex-none" style={{ background: color(r.id) }} />
        <button type="button" onClick={() => goCat(r.id)} className="text-strong font-semibold truncate hover:underline text-left">{r.name}</button>
      </span>
    ) : <span className="pl-12 text-body">{r.name}</span> },
    { key: "amount", header: "이번 달", align: "right", render: (r) => <span className={r.level === 0 ? "text-strong font-semibold" : "text-body"}>{won(r.amount)}</span> },
    { key: "share", header: "비중", align: "right", render: (r) => (r.amount < 0 ? <span className="text-muted">환불</span> : <span className="text-body">{pct1(r.share)}</span>) },
    { key: "prev", header: `${Number(pm.slice(5))}월`, align: "right", render: (r) => <span className="text-muted">{won(r.prev)}</span> },
    { key: "delta", header: "증감", align: "right", render: (r) => r.delta === 0 ? <span className="text-muted">-</span> : <span className={deltaTone(r.delta, false)}>{r.delta > 0 ? "▲" : "▼"} {won(Math.abs(r.delta))}</span> },
    { key: "count", header: "건수", align: "right", render: (r) => <span className="text-body">{r.count}건</span> },
    { key: "budget", header: "예산 사용", align: "right", render: (r) => r.budget ? <span className={cx(r.amount / r.budget >= 1 ? "text-red-700 font-semibold" : r.amount / r.budget >= 0.8 ? "text-amber-700 font-semibold" : "text-body")}>{Math.round((r.amount / r.budget) * 100)}%</span> : <span className="text-disabled">-</span> },
  ];
  const sum = (k: "amount" | "prev" | "count") => rows.reduce((a, r) => a + r[k], 0);

  return (
    <Screen title={<MonthPicker />} nav right={<span className="hidden md:flex"><Button variant="secondary" size="md" icon="download" onClick={downloadMonth} disabled={s.count === 0}>이 달 엑셀로 받기</Button></span>}>
      <ViewSwitch value="월간 요약" />

      {s.count === 0 ? (
        <Card><EmptyState icon="event_busy" title={`${fmtYm(month)}에는 기록이 없어요`} desc="거래를 추가하거나 영수증을 올리면 요약이 채워져요." action={<div className="flex gap-2"><Button size="md" variant="tonal" icon="add" href="/transactions/new">거래 추가</Button><Button size="md" variant="secondary" icon="photo_camera" href="/receipt">영수증</Button></div>} /></Card>
      ) : (<>
        {/* 1. 핵심 숫자 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
          <StatTile label="수입" value={won(s.income)} sub={<Delta cur={s.income} prev={p.income} upIsGood />} />
          <StatTile label="지출" value={won(s.expense)} sub={<Delta cur={s.expense} prev={p.expense} upIsGood={false} />} />
          <StatTile label="순수입 (수입 − 지출)" value={won(s.net)} sub={<Delta cur={s.net} prev={p.net} upIsGood />} />
          <StatTile tone="primary" label="받은 혜택 (참고값)" value={won(calc.received)} sub={p.count === 0 ? "지난달 기록 없음" : `지난달 ${won(pc.received)} · 놓친 혜택 ${won(calc.missed)}`} />
        </div>

        {/* 업종을 모르는 결제는 업종 혜택·통계에서 빠지므로 사용자가 확인해서 고치게 한다 */}
        {unclassified > 0 && (
          <Note tone="amber" icon="help">
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span>업종을 알 수 없는 결제가 있어요. 업종을 정해 주면 혜택 계산과 통계가 정확해져요.</span>
              <TextLink href="/transactions?unclassified=1">업종 미분류 {unclassified}건 · 확인하기</TextLink>
            </span>
          </Note>
        )}

        {/* 2. 카테고리별 지출 */}
        <Card>
          <CardTitle right={<ViewToggle value={catView} onChange={setCatView} />}>카테고리별 지출</CardTitle>
          {catView === "그래프" ? (
            spentRows.length === 0 ? <Cap>{refundRows.length ? "이 달은 환불만 있어서 비중을 그릴 수 없어요. 표에서 확인해 주세요." : "이 달은 지출이 없어요."}</Cap> : (
              <div className="flex flex-col md:flex-row gap-6 md:items-center">
                <div className="self-center"><Donut label={`${fmtYm(month)} 카테고리별 지출 비중`} centerLabel={refundRows.length ? "비중 기준 합계" : "지출 합계"} items={spentRows.map((r) => ({ key: r.id, label: r.name, value: r.amount, color: color(r.id) }))} /></div>
                <div className="flex-1 min-w-0">
                  <BarList onSelect={goCat} max={spentRows[0].amount} items={spentRows.map((r) => ({
                    key: r.id, label: r.name, value: r.amount, color: color(r.id), aria: `${r.name} ${won(r.amount)}, 거래 목록 보기`,
                    sub: <>{pct1(r.share)} · {r.count}건 · {r.prev === 0 ? "지난달 0원" : <>지난달보다 <span className={deltaTone(r.delta, false)}>{r.delta === 0 ? "같음" : `${r.delta > 0 ? "▲" : "▼"} ${won(Math.abs(r.delta))}`}</span></>}</>,
                  }))} />
                </div>
              </div>
            )
          ) : (
            <DataTable caption={`${fmtYm(month)} 카테고리별 지출 표`} columns={catCols} rows={flat} minWidth={640}
              rowClassName={(r) => (r.level === 1 ? "bg-gray-50" : undefined)}
              footer={["합계", won(sum("amount")), spentRows.length ? "100%" : "-", won(sum("prev")), (() => { const d = sum("amount") - sum("prev"); return d === 0 ? "-" : `${d > 0 ? "▲" : "▼"} ${won(Math.abs(d))}`; })(), `${sum("count")}건`, ""]} />
          )}
          {refundRows.length > 0 && <Cap>{refundRows.map((r) => `${r.name} ${won(r.amount)}`).join(", ")}: 이전 달 결제의 환불이 이번 달 결제보다 커서 음수예요. 비중은 음수 카테고리를 빼고 계산하고, 표에서 볼 수 있어요.</Cap>}
          <Cap>카테고리를 누르면 그 카테고리 거래만 모아 봐요. 환불은 환불한 달 지출에서 빠져요.</Cap>
        </Card>

        {/* 3. 일별 지출 */}
          <Card>
            <CardTitle right={<ViewToggle value={dayView} onChange={setDayView} />}>일별 지출</CardTitle>
            <div className="flex gap-4 flex-wrap text-caption">
              <span className="text-muted">일평균 <b className="text-strong tabular-nums">{elapsed ? won(s.expense / elapsed) : "-"}</b></span>
              {peak && peak.expense > 0 && <span className="text-muted">가장 많이 쓴 날 <b className="text-strong">{fmtDateKo(peak.date)} · {won(peak.expense)}</b></span>}
            </div>
            {dayView === "그래프" ? (
              <ColumnChart label={`${fmtYm(month)} 일별 지출`} height={200}
                series={[{ key: "expense", name: "지출", color: CHART_EXPENSE }]}
                data={days.map((d) => ({ key: d.date, label: String(d.day), full: fmtDateKo(d.date), values: { expense: Math.max(0, d.expense) } }))} />
            ) : (
              <DataTable caption={`${fmtYm(month)} 일별 지출 표`} minWidth={360}
                rows={days.filter((d) => d.count > 0 || d.income !== 0 || d.expense !== 0).map((d) => ({ ...d, key: d.date }))}
                columns={[
                  { key: "date", header: "날짜", render: (d) => fmtDateKo(d.date), sortValue: (d) => d.date },
                  { key: "expense", header: "지출", align: "right", render: (d) => won(d.expense), sortValue: (d) => d.expense },
                  { key: "income", header: "수입", align: "right", render: (d) => (d.income ? <span className="text-income">{won(d.income)}</span> : "-"), sortValue: (d) => d.income },
                  { key: "count", header: "건수", align: "right", render: (d) => `${d.count}건`, sortValue: (d) => d.count },
                ]}
                footer={["합계", won(s.expense), won(s.income), `${s.expenseCount + s.incomeCount}건`]} empty="이 달은 거래가 없어요" />
            )}
          </Card>

          {/* 4. 결제수단·카드별 */}
          <Card>
            <CardTitle right={<Badge>참고값</Badge>}>결제수단·카드별</CardTitle>
            <DataTable caption={`${fmtYm(month)} 결제수단·카드별 지출과 혜택`} minWidth={360} rows={payRows}
              columns={[
                { key: "label", header: "결제수단", render: (r) => <span className="flex items-center gap-2 min-w-0">{r.cardId && cardById(r.cardId) ? <CardChip color={cardById(r.cardId)!.color} w={24} h={16} /> : <Icon name={r.key === "cash" ? "payments" : "account_balance"} size={18} className="text-muted" />}<span className="truncate text-strong">{r.label}</span></span> },
                { key: "amount", header: "지출", align: "right", render: (r) => won(r.amount) },
                { key: "benefit", header: "받은 혜택", align: "right", render: (r) => (r.cardId ? <span className="text-benefit font-semibold">{won(r.benefit)}</span> : "-") },
                { key: "missed", header: "놓친 혜택", align: "right", render: (r) => (r.cardId && r.missed > 0 ? <span className="text-amber-700">{won(r.missed)}</span> : "-") },
              ]}
              footer={["합계", won(payRows.reduce((a, r) => a + r.amount, 0)), won(payRows.reduce((a, r) => a + r.benefit, 0)), won(payRows.reduce((a, r) => a + r.missed, 0))]} />
            <Cap>놓친 혜택은 결제마다 &ldquo;가장 유리한 보유 카드였다면&rdquo;의 차액 합이라, 한도를 나눠 쓰는 월 배분값({won(calc.missed)})보다 클 수 있어요.</Cap>
          </Card>

        <MonthInsight key={month} month={month} aggregates={insightData} fallback={insightFallback} />

        <div className="flex flex-col md:flex-row gap-2 md:items-center">
          <span className="md:hidden"><Button variant="secondary" icon="download" onClick={downloadMonth} className="w-full">이 달 엑셀로 받기</Button></span>
          <TextLink href={`/settings/export?from=${range[0]}&to=${range[1]}`}>기간·열을 골라 내보내기</TextLink>
        </div>
      </>)}
    </Screen>
  );
}
