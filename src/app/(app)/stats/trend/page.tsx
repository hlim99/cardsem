"use client";
/* 통계 · 추이 (RPT-07). 선택한 달까지 12개월
 *  - 월별 수입·지출: 막대 / 선 / 표
 *  - 카테고리 추이: 최대 4개를 골라 겹쳐 보기 (색은 카테고리마다 고정) / 표 */
import { useMemo, useState } from "react";
import { Card, CardTitle, Cap, Chip, Seg, won } from "@/components/ui";
import { ColumnChart, DataTable, LineChart, ViewToggle, type View } from "@/components/charts";
import { useStore } from "@/lib/store";
import { fmtYm, prevYm } from "@/lib/engine";
import { monthSummary } from "@/lib/stats";
import { categoryColors, CHART_EXPENSE, CHART_INCOME } from "@/lib/chart";

// x축 라벨. 해가 바뀌는 1월에만 연도를 붙인다 ('26.1). 툴팁·표는 fmtYm("2026년 1월")
const label = (ym: string) => (ym.endsWith("-01") ? `’${ym.slice(2, 4)}.1` : `${Number(ym.slice(5))}월`);
const full = fmtYm;

export default function TrendPage() {
  const { txns, month, categories, calcFor } = useStore();
  const [mode, setMode] = useState<"막대" | "선" | "표">("막대");
  const [catView, setCatView] = useState<View>("그래프");
  const months = useMemo(() => { const out: string[] = []; let m = month; for (let i = 0; i < 12; i++) { out.unshift(m); m = prevYm(m); } return out; }, [month]);
  const data = useMemo(() => months.map((ym) => monthSummary(txns, ym, categories)), [months, txns, categories]);
  const color = useMemo(() => categoryColors(categories), [categories]);
  const recorded = data.filter((d) => d.count > 0);
  const avgExpense = recorded.length ? recorded.reduce((s, d) => s + d.expense, 0) / recorded.length : 0;
  const maxMonth = recorded.reduce<(typeof data)[number] | null>((a, d) => (!a || d.expense > a.expense ? d : a), null);

  // 카테고리 후보 = 12개월 동안 지출이 있던 상위 카테고리. 기본 선택은 합계 상위 2개
  const tops = categories.filter((c) => !c.parentId && c.type === "expense");
  const catTotal = (id: string) => data.reduce((s, d) => s + (d.byCategory[id] ?? 0), 0);
  const ranked = tops.filter((c) => catTotal(c.id) > 0).sort((a, b) => catTotal(b.id) - catTotal(a.id));
  const [picked, setPicked] = useState<string[] | null>(null);
  const sel = (picked ?? ranked.slice(0, 2).map((c) => c.id)).filter((id) => tops.some((c) => c.id === id));
  const toggle = (id: string) => setPicked((p) => { const cur = p ?? sel; return cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id].slice(-4); });
  const name = (id: string) => categories.find((c) => c.id === id)?.name ?? id;

  const series = [{ key: "income", name: "수입", color: CHART_INCOME }, { key: "expense", name: "지출", color: CHART_EXPENSE }];
  const chartData = data.map((d) => ({ key: d.ym, label: label(d.ym), full: full(d.ym), values: { income: d.income, expense: Math.max(0, d.expense) } }));
  const tableRows = data.map((d) => ({ ...d, key: d.ym, received: d.count ? calcFor(d.ym).received : 0 }));

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardTitle right={<Seg items={["막대", "선", "표"] as const} value={mode} onChange={setMode} className="w-44 flex-none" />}>월별 수입·지출</CardTitle>
        <div className="flex gap-4 flex-wrap text-caption text-muted">
          <span>기록 있는 달 평균 지출 <b className="text-strong tabular-nums">{won(avgExpense)}</b></span>
          {maxMonth && <span>가장 많이 쓴 달 <b className="text-strong">{full(maxMonth.ym)} · {won(maxMonth.expense)}</b></span>}
        </div>
        {mode === "막대" && <ColumnChart label="최근 12개월 수입과 지출" series={series} data={chartData} highlight={month} height={240} />}
        {mode === "선" && <LineChart label="최근 12개월 수입과 지출 추이" series={series} data={chartData} height={240} />}
        {mode === "표" && (
          <DataTable caption="최근 12개월 수입·지출 표" minWidth={560} rows={[...tableRows].reverse()} initialSort={undefined}
            rowClassName={(r) => (r.ym === month ? "bg-primary-soft" : undefined)}
            columns={[
              { key: "ym", header: "월", render: (r) => full(r.ym), sortValue: (r) => r.ym },
              { key: "income", header: "수입", align: "right", render: (r) => won(r.income), sortValue: (r) => r.income },
              { key: "expense", header: "지출", align: "right", render: (r) => won(r.expense), sortValue: (r) => r.expense },
              { key: "net", header: "순수입", align: "right", render: (r) => <span className={r.net < 0 ? "text-red-700" : undefined}>{won(r.net)}</span>, sortValue: (r) => r.net },
              { key: "received", header: "받은 혜택", align: "right", render: (r) => <span className="text-benefit">{won(r.received)}</span>, sortValue: (r) => r.received },
              { key: "count", header: "거래", align: "right", render: (r) => `${r.expenseCount + r.incomeCount}건`, sortValue: (r) => r.expenseCount + r.incomeCount }, // 환불은 건수에서 뺀다 (월간 요약·엑셀과 같은 기준)
            ]}
            footer={["12개월 합계", won(data.reduce((s, d) => s + d.income, 0)), won(data.reduce((s, d) => s + d.expense, 0)), won(data.reduce((s, d) => s + d.net, 0)), won(tableRows.reduce((s, d) => s + d.received, 0)), `${data.reduce((s, d) => s + d.expenseCount + d.incomeCount, 0)}건`]} />
        )}
        <Cap>{full(months[0])} ~ {full(month)} · {recorded.length < 12 ? `기록이 있는 달은 ${recorded.length}개월이에요. 기록 없는 달은 0으로 그려요.` : "12개월 모두 기록이 있어요."}</Cap>
      </Card>

      <Card>
        <CardTitle right={<ViewToggle value={catView} onChange={setCatView} />}>카테고리 추이</CardTitle>
        <div className="flex gap-2 flex-wrap" role="group" aria-label="겹쳐 볼 카테고리 (최대 4개)">
          {(ranked.length ? ranked : tops).map((c) => <Chip key={c.id} on={sel.includes(c.id)} x={sel.includes(c.id)} onClick={() => toggle(c.id)}>{c.name}</Chip>)}
        </div>
        {sel.length === 0 ? <Cap>카테고리를 하나 이상 골라주세요.</Cap> : catView === "그래프" ? (
          <LineChart label={`카테고리 추이: ${sel.map(name).join(", ")}`} height={220}
            series={sel.map((id) => ({ key: id, name: name(id), color: color(id) }))}
            data={data.map((d) => ({ key: d.ym, label: label(d.ym), full: full(d.ym), values: Object.fromEntries(sel.map((id) => [id, Math.max(0, d.byCategory[id] ?? 0)])) }))} />
        ) : (
          <DataTable caption="카테고리별 월 지출 표" minWidth={200 + sel.length * 110} rows={[...data].reverse().map((d) => ({ ...d, key: d.ym }))}
            columns={[
              { key: "ym", header: "월", render: (r) => full(r.ym), sortValue: (r) => r.ym },
              ...sel.map((id) => ({ key: id, header: name(id), align: "right" as const, render: (r: (typeof data)[number]) => won(r.byCategory[id] ?? 0), sortValue: (r: (typeof data)[number]) => r.byCategory[id] ?? 0 })),
            ]}
            footer={["12개월 합계", ...sel.map((id) => won(catTotal(id)))]} />
        )}
        <Cap>최대 4개까지 겹쳐 봐요. 색은 카테고리마다 정해져 있어 월간 요약·비중 화면과 같아요.</Cap>
      </Card>
    </div>
  );
}
