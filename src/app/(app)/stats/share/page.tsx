"use client";
/* 통계 · 비중 (RPT-08). 선택한 달 지출을 카테고리 / 카드 / 결제수단으로 나눠 본다
 *  - 카테고리: 도넛 + 순위 막대. 막대를 누르면 그 카테고리의 하위 카테고리로 들어간다
 *  - 카드·결제수단: 한 계열 순위 막대 (도넛은 부분-전체가 핵심일 때만) + 받은 혜택
 *  - 표 보기에서는 금액·비중·건수·혜택을 정렬해 본다
 *  - 비중 분모는 양수 항목 합(shareBase). 이전 달 결제의 환불로 음수가 된 항목은 그래프에서 빼고 표에만 "환불"로 보여준다 */
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, CardChip, CardTitle, Cap, Icon, Seg, TextLink, won } from "@/components/ui";
import { BarList, DataTable, Donut, ViewToggle, type View } from "@/components/charts";
import { useStore } from "@/lib/store";
import { fmtYm, krw } from "@/lib/engine";
import { categoryName, shareBase, topCategory } from "@/lib/stats";
import { categoryColors, CHART_EXPENSE, pct1 } from "@/lib/chart";
import { cardById, cardLabel } from "@/lib/data/cards";
import { PAY_TYPE } from "@/lib/labels";

type By = "카테고리" | "카드" | "결제수단";
type Row = { key: string; label: string; amount: number; count: number; benefit: number; missed: number; color: string; cardId?: string };

export default function SharePage() {
  const router = useRouter();
  const { txns, month, categories, calc, userCards } = useStore();
  const [by, setBy] = useState<By>("카테고리");
  const [view, setView] = useState<View>("그래프");
  const [drill, setDrill] = useState<string | null>(null); // 하위 카테고리로 들어간 상위 카테고리 id
  const color = useMemo(() => categoryColors(categories), [categories]);

  // 행 만들기: 같은 거래 집합을 기준만 바꿔 묶는다 (환불은 음수로)
  const rows: Row[] = useMemo(() => {
    const m = new Map<string, Row>();
    for (const t of txns) {
      if (!t.date.startsWith(month) || t.type !== "expense") continue;
      const top = topCategory(categories, t.categoryId);
      if (by === "카테고리" && drill && top !== drill) continue;
      const key = by === "카테고리" ? (drill ? t.categoryId : top) : by === "카드" ? (t.cardId ?? t.payType) : t.payType;
      const label = by === "카테고리" ? (drill && key === drill ? `${categoryName(categories, drill)} (하위 미지정)` : categoryName(categories, key)) : by === "카드" ? (t.cardId ? cardLabel(t.cardId) : PAY_TYPE[t.payType]) : PAY_TYPE[t.payType];
      const e = m.get(key) ?? { key, label, amount: 0, count: 0, benefit: 0, missed: 0, color: by === "카테고리" ? color(drill ?? key) : CHART_EXPENSE, cardId: by === "카드" ? t.cardId : undefined };
      const r = calc.byTxn[t.id];
      if (t.originalTxnId) e.amount -= krw(t);
      else { e.amount += krw(t); e.count++; e.benefit += r?.mine?.total ?? 0; e.missed += Math.max(0, r?.diff ?? 0); }
      m.set(key, e);
    }
    return [...m.values()].filter((r) => r.amount !== 0 || r.count > 0).sort((a, b) => b.amount - a.amount);
  }, [txns, month, categories, by, drill, calc, color]);

  const total = rows.reduce((a, r) => a + r.amount, 0); // 순지출 (환불 차감)
  const base = shareBase(rows.map((r) => r.amount)); // 비중 분모
  const share = (r: Row) => (r.amount > 0 && base > 0 ? r.amount / base : 0);
  const shown = rows.filter((r) => r.amount > 0);
  const negative = rows.filter((r) => r.amount < 0);
  const title = by === "카테고리" && drill ? `${categoryName(categories, drill)} 안에서` : `${by}별`;

  return (
    <div className="flex flex-col gap-4">
      <Seg items={["카테고리", "카드", "결제수단"] as const} value={by} onChange={(v) => { setBy(v); setDrill(null); }} className="md:w-105" />
      <Card>
        <CardTitle right={<ViewToggle value={view} onChange={setView} />}>{title} 지출 비중</CardTitle>
        <div className="flex items-center gap-2 flex-wrap">
          {drill && <Button variant="ghost" size="sm" icon="arrow_back" onClick={() => setDrill(null)}>전체 카테고리</Button>}
          <Cap>{fmtYm(month)} · 지출 {won(total)} · 환불은 빼고 셈</Cap>
          {drill && <TextLink href={`/transactions?cat=${encodeURIComponent(drill)}`}>{categoryName(categories, drill)} 거래 보기</TextLink>}
        </div>
        {view === "그래프" ? (
          shown.length === 0 ? <Cap className="py-6 text-center">{negative.length ? "이 달은 환불만 있어서 비중을 그릴 수 없어요. 표에서 확인해 주세요." : "이 달은 지출이 없어요."}</Cap> : (
            <div className="flex flex-col md:flex-row gap-6 md:items-center">
              {by === "카테고리" && !drill && <div className="self-center"><Donut label={`${title} 지출 비중`} centerLabel={negative.length ? "비중 기준 합계" : "지출 합계"} items={shown.map((r) => ({ key: r.key, label: r.label, value: r.amount, color: r.color }))} /></div>}
              <div className="flex-1 min-w-0">
                <BarList max={shown[0].amount}
                  onSelect={by === "카테고리" && !drill ? (k) => { if (categories.some((c) => c.parentId === k)) setDrill(k); else router.push(`/transactions?cat=${encodeURIComponent(k)}`); } : undefined}
                  items={shown.map((r) => ({
                    key: r.key, value: r.amount,
                    color: by === "카테고리" ? r.color : CHART_EXPENSE, // 하위 카테고리는 부모 색 하나 (순위로 진하기를 바꾸지 않는다)
                    label: r.cardId && cardById(r.cardId) ? <span className="inline-flex items-center gap-2"><CardChip color={cardById(r.cardId)!.color} w={22} h={14} />{r.label}</span> : r.label,
                    aria: by === "카테고리" && !drill ? `${r.label} ${won(r.amount)}, ${categories.some((c) => c.parentId === r.key) ? "하위 카테고리 보기" : "거래 목록 보기"}` : undefined,
                    sub: <>{pct1(share(r))} · {r.count}건{by !== "카테고리" && r.benefit > 0 ? <> · 받은 혜택 <span className="text-benefit font-semibold">{won(r.benefit)}</span></> : null}</>,
                  }))} />
              </div>
            </div>
          )
        ) : (
          <DataTable caption={`${title} 지출 표`} minWidth={by === "카테고리" ? 420 : 560} rows={rows} initialSort={{ key: "amount", dir: "desc" }}
            columns={[
              { key: "label", header: by === "카테고리" ? "카테고리" : by, render: (r) => <span className="flex items-center gap-2 min-w-0"><i aria-hidden className="w-2.5 h-2.5 rounded-xs flex-none" style={{ background: r.color }} /><span className="text-strong truncate">{r.label}</span></span>, sortValue: (r) => r.label },
              { key: "amount", header: "금액", align: "right", render: (r) => won(r.amount), sortValue: (r) => r.amount },
              { key: "share", header: "비중", align: "right", render: (r) => (r.amount < 0 ? <span className="text-muted">환불</span> : pct1(share(r))), sortValue: (r) => r.amount },
              { key: "count", header: "건수", align: "right", render: (r) => `${r.count}건`, sortValue: (r) => r.count },
              ...(by !== "카테고리" ? [
                { key: "benefit", header: "받은 혜택", align: "right" as const, render: (r: Row) => (r.cardId ? <span className="text-benefit">{won(r.benefit)}</span> : "-"), sortValue: (r: Row) => r.benefit },
                { key: "missed", header: "놓친 혜택", align: "right" as const, render: (r: Row) => (r.cardId && r.missed > 0 ? <span className="text-amber-700">{won(r.missed)}</span> : "-"), sortValue: (r: Row) => r.missed },
              ] : []),
            ]}
            footer={["합계", won(total), base ? "100%" : "-", `${rows.reduce((a, r) => a + r.count, 0)}건`, ...(by !== "카테고리" ? [won(rows.reduce((a, r) => a + r.benefit, 0)), won(rows.reduce((a, r) => a + r.missed, 0))] : [])]} />
        )}
        {negative.length > 0 && <Cap>{negative.map((r) => `${r.label} ${won(r.amount)}`).join(", ")}: 이전 달 결제의 환불이 이번 달 결제보다 커서 음수예요. 비중은 음수 항목을 빼고 계산하고, 표에서 볼 수 있어요.</Cap>}
        {by === "카테고리" && !drill && view === "그래프" && <Cap><Icon name="touch_app" size={14} className="align-[-2px]" /> 막대를 누르면 하위 카테고리로 나눠 보거나, 하위가 없으면 그 카테고리 거래를 모아 봐요.</Cap>}
        {by === "카드" && <Cap>등록 카드 {userCards.length}장 · 현금·계좌이체는 혜택이 없어요. 혜택은 참고값이에요.</Cap>}
      </Card>
    </div>
  );
}
