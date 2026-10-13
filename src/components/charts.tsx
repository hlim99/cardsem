"use client";
/* 차트·표 컴포넌트. 라이브러리 없이 SVG를 직접 그린다 (번들 0KB 추가, 디자인 토큰 그대로 사용).
 * 규칙 (dataviz 가이드):
 *  - 막대는 최대 24px, 위쪽만 4px 둥글게, 계열 사이 2px 간격. 선은 2px. 그리드·축은 1px 실선
 *  - 마우스를 올리거나 키보드(Tab)로 포커스하면 툴팁. 값이 툴팁에만 있지 않도록 모든 차트는 표 보기를 함께 둔다
 *  - 낭독기: svg는 role="group"+차트 이름, 포커스되는 막대·점·조각마다 role과 값을 담은 aria-label.
 *    (svg를 role="img"로 두면 안의 포커스 요소가 낭독에서 사라진다) 툴팁은 같은 내용이라 aria-hidden
 *  - 계열이 2개 이상이면 범례를 항상 표시. 글자는 계열 색을 입히지 않고 텍스트 토큰을 쓴다
 * 그리는 크기는 ResizeObserver로 컨테이너 폭을 재서 픽셀 단위로 계산한다 (viewBox 늘이기는 글자가 찌그러짐) */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { cx, Seg } from "./ui";
import { compactWon, niceTicks } from "@/lib/chart";
import { won } from "@/lib/format";

export type ChartSeries = { key: string; name: string; color: string };
export type ChartDatum = { key: string; label: string; full?: string; values: Record<string, number> };

/* ── 공용 ── */
function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.floor(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

export type View = "그래프" | "표";
/** 카드 제목 오른쪽에 두는 그래프/표 전환 */
export function ViewToggle({ value, onChange, className }: { value: View; onChange: (v: View) => void; className?: string }) {
  return <Seg items={["그래프", "표"] as const} value={value} onChange={onChange} className={cx("w-32 flex-none", className)} />;
}

export function Legend({ items, className }: { items: { label: string; color: string; shape?: "rect" | "line"; value?: ReactNode }[]; className?: string }) {
  return (
    <ul className={cx("flex flex-wrap gap-x-4 gap-y-1.5 m-0 p-0 list-none text-caption", className)}>
      {items.map((it) => (
        <li key={it.label} className="inline-flex items-center gap-1.5 text-body">
          <i aria-hidden className={cx("flex-none", it.shape === "line" ? "w-3 h-0.75 rounded-full" : "w-2.5 h-2.5 rounded-xs")} style={{ background: it.color }} />
          {it.label}{it.value !== undefined && <span className="text-strong font-semibold tabular-nums">{it.value}</span>}
        </li>
      ))}
    </ul>
  );
}

type TipRow = { name: string; color: string; value: string };
const TIP_W = 176;
function Tip({ x, y, width, title, rows }: { x: number; y: number; width: number; title: string; rows: TipRow[] }) {
  // 컨테이너 밖(=화면 밖)으로 나가지 않게 좌우를 붙잡는다. 아주 좁으면 폭도 줄인다
  const tw = Math.min(TIP_W, width);
  const left = Math.max(0, Math.min(width - tw, x - tw / 2));
  return (
    <div aria-hidden className="pointer-events-none absolute z-10 rounded-md border border-line bg-white px-3 py-2 shadow-2" style={{ left, top: Math.max(0, y), width: tw }}>
      <div className="text-overline text-muted">{title}</div>
      {rows.map((r) => (
        <div key={r.name} className="flex items-center gap-2 mt-1">
          <i aria-hidden className="w-3 h-0.75 rounded-full flex-none" style={{ background: r.color }} />
          <span className="text-label font-semibold text-strong tabular-nums">{r.value}</span>
          <span className="text-caption text-muted truncate">{r.name}</span>
        </div>
      ))}
    </div>
  );
}
const tipHeight = (rows: number) => 30 + rows * 24;

/** 위쪽만 둥근 세로 막대 (바닥은 각지게 기준선에 붙는다) */
function colPath(x: number, top: number, w: number, base: number) {
  const h = base - top;
  const r = Math.min(4, w / 2, h);
  return `M${x},${base}V${top + r}Q${x},${top} ${x + r},${top}H${x + w - r}Q${x + w},${top} ${x + w},${top + r}V${base}Z`;
}

// 11px 글자 폭 어림 (한글 11px, 숫자·기호 6.5px) — x 라벨 솎기용
const textW = (s: string) => [...s].reduce((a, ch) => a + (ch >= "\u3131" ? 11 : 6.5), 0);

/* 축 공통 계산: 왼쪽 눈금 라벨 폭, 아래 x 라벨 줄 */
function useAxes(w: number, height: number, labels: string[], max: number) {
  const n = labels.length;
  const ticks = niceTicks(max);
  const top = ticks[ticks.length - 1] || 1;
  const L = 44, R = 6, T = 10, B = 24;
  const plotW = Math.max(0, w - L - R), plotH = height - T - B;
  const band = n ? plotW / n : 0;
  const y = (v: number) => T + plotH - (Math.max(0, v) / top) * plotH;
  // x 라벨이 겹치지 않게 솎는다 (가장 긴 라벨 폭 + 8px 간격). 마지막(보통 이번 달)부터 거꾸로 세서 항상 보이게
  const every = Math.max(1, Math.ceil((Math.max(0, ...labels.map(textW)) + 8) / Math.max(1, band)));
  const showX = (i: number) => (n - 1 - i) % every === 0;
  return { ticks, L, R, T, B, plotW, plotH, band, y, showX };
}

// 눈금 숫자는 낭독하지 않는다 (값은 막대·점의 aria-label과 표 보기에 있다)
function Grid({ ax, w }: { ax: ReturnType<typeof useAxes>; w: number }) {
  return (
    <g aria-hidden>
      {ax.ticks.map((t) => (
        <g key={t}>
          <line x1={ax.L} x2={w - ax.R} y1={ax.y(t)} y2={ax.y(t)} stroke={t === 0 ? "var(--color-chart-axis)" : "var(--color-chart-grid)"} strokeWidth={1} shapeRendering="crispEdges" />
          <text x={ax.L - 6} y={ax.y(t)} dy="0.32em" textAnchor="end" fontSize={11} fill="var(--color-muted)" style={{ fontVariantNumeric: "tabular-nums" }}>{compactWon(t)}</text>
        </g>
      ))}
    </g>
  );
}

const hitClass = "outline-none cursor-pointer focus-visible:[stroke:var(--color-line-focus)] focus-visible:[stroke-width:2]";

/* ── 세로 막대 (계열 여러 개면 묶음 막대) ── */
export function ColumnChart({ data, series, height = 220, highlight, format = won, label }: {
  data: ChartDatum[]; series: ChartSeries[]; height?: number;
  highlight?: string; // 이 key만 진하게, 나머지는 옅게 (예: 이번 달)
  format?: (n: number) => string; label: string;
}) {
  const [ref, w] = useWidth();
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(0, ...data.flatMap((d) => series.map((s) => d.values[s.key] ?? 0)));
  const ax = useAxes(w, height, data.map((d) => d.label), max);
  const k = series.length, gap = 2;
  const barW = Math.max(2, Math.min(24, (ax.band * 0.72 - gap * (k - 1)) / k));
  const groupW = barW * k + gap * (k - 1);
  const center = (i: number) => ax.L + ax.band * i + ax.band / 2;
  const tipRows = (d: ChartDatum) => series.map((s) => ({ name: s.name, color: s.color, value: format(d.values[s.key] ?? 0) }));
  const a = active !== null ? data[active] : null;
  const aTop = a ? Math.min(...series.map((s) => ax.y(a.values[s.key] ?? 0))) : 0;

  return (
    <div className="flex flex-col gap-2">
      {k > 1 && <Legend items={series.map((s) => ({ label: s.name, color: s.color }))} />}
      <div ref={ref} className="relative w-full" style={{ height }} onPointerLeave={() => setActive(null)}>
        {w > 0 && (
          <svg width={w} height={height} role="group" aria-label={label} className="block">
            <Grid ax={ax} w={w} />
            {data.map((d, i) => (
              <g key={d.key}>
                {active === i && <rect x={ax.L + ax.band * i} y={ax.T} width={ax.band} height={ax.plotH} fill="var(--color-gray-50)" />}
                {series.map((s, j) => {
                  const v = d.values[s.key] ?? 0;
                  if (v <= 0) return null;
                  const x = center(i) - groupW / 2 + j * (barW + gap);
                  return <path key={s.key} d={colPath(x, ax.y(v), barW, ax.y(0))} fill={s.color} opacity={highlight && d.key !== highlight && active !== i ? 0.4 : 1} />;
                })}
                {ax.showX(i) && <text aria-hidden x={center(i)} y={height - 6} textAnchor="middle" fontSize={11} fill={highlight === d.key ? "var(--color-strong)" : "var(--color-muted)"} fontWeight={highlight === d.key ? 700 : 400}>{d.label}</text>}
              </g>
            ))}
            {data.map((d, i) => (
              <rect key={d.key} x={ax.L + ax.band * i} y={ax.T} width={ax.band} height={ax.plotH + ax.B} fill="transparent" tabIndex={0} role="img"
                aria-label={`${d.full ?? d.label} ${series.map((s) => `${s.name} ${format(d.values[s.key] ?? 0)}`).join(", ")}`}
                className={hitClass}
                onPointerEnter={() => setActive(i)} onFocus={() => setActive(i)} onBlur={() => setActive(null)}
                onClick={() => setActive(i)} />
            ))}
          </svg>
        )}
        {a && <Tip x={center(active!)} y={aTop - tipHeight(k) - 6} width={w} title={a.full ?? a.label} rows={tipRows(a)} />}
      </div>
    </div>
  );
}

/* ── 꺾은선 (계열 여러 개, 십자선 + 한 툴팁에 모든 계열) ── */
export function LineChart({ data, series, height = 200, format = won, label }: {
  data: ChartDatum[]; series: ChartSeries[]; height?: number; format?: (n: number) => string; label: string;
}) {
  const [ref, w] = useWidth();
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(0, ...data.flatMap((d) => series.map((s) => d.values[s.key] ?? 0)));
  const ax = useAxes(w, height, data.map((d) => d.label), max);
  const px = (i: number) => ax.L + ax.band * i + ax.band / 2;
  const a = active !== null ? data[active] : null;
  const last = data.length - 1;

  return (
    <div className="flex flex-col gap-2">
      {series.length > 1 && <Legend items={series.map((s) => ({ label: s.name, color: s.color, shape: "line" as const }))} />}
      <div ref={ref} className="relative w-full" style={{ height }} onPointerLeave={() => setActive(null)}>
        {w > 0 && (
          <svg width={w} height={height} role="group" aria-label={label} className="block">
            <Grid ax={ax} w={w} />
            {active !== null && <line x1={px(active)} x2={px(active)} y1={ax.T} y2={ax.T + ax.plotH} stroke="var(--color-chart-axis)" strokeWidth={1} shapeRendering="crispEdges" />}
            {series.map((s) => (
              <g key={s.key}>
                <polyline fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" points={data.map((d, i) => `${px(i)},${ax.y(d.values[s.key] ?? 0)}`).join(" ")} />
                {[active ?? last].filter((i) => i >= 0).map((i) => <circle key={i} cx={px(i)} cy={ax.y(data[i].values[s.key] ?? 0)} r={4} fill={s.color} stroke="white" strokeWidth={2} />)}
              </g>
            ))}
            {data.map((d, i) => ax.showX(i) && <text key={d.key} aria-hidden x={px(i)} y={height - 6} textAnchor="middle" fontSize={11} fill="var(--color-muted)">{d.label}</text>)}
            {data.map((d, i) => (
              <rect key={d.key} x={ax.L + ax.band * i} y={ax.T} width={ax.band} height={ax.plotH + ax.B} fill="transparent" tabIndex={0} role="img"
                aria-label={`${d.full ?? d.label} ${series.map((s) => `${s.name} ${format(d.values[s.key] ?? 0)}`).join(", ")}`}
                className={hitClass} onPointerEnter={() => setActive(i)} onFocus={() => setActive(i)} onBlur={() => setActive(null)} onClick={() => setActive(i)} />
            ))}
          </svg>
        )}
        {a && <Tip x={px(active!)} y={0} width={w} title={a.full ?? a.label} rows={series.map((s) => ({ name: s.name, color: s.color, value: format(a.values[s.key] ?? 0) }))} />}
      </div>
    </div>
  );
}

/* ── 도넛 (부분-전체, 6~8조각 이하에서만). 가운데에 합계, 조각에 올리면 가운데가 그 조각 값으로 바뀐다 ── */
export type DonutItem = { key: string; label: string; value: number; color: string };
function arc(cx: number, cy: number, R: number, r: number, a0: number, a1: number) {
  const p = (rad: number, ang: number) => `${cx + rad * Math.cos(ang)},${cy + rad * Math.sin(ang)}`;
  const large = a1 - a0 > Math.PI ? 1 : 0;
  return `M${p(R, a0)}A${R},${R} 0 ${large} 1 ${p(R, a1)}L${p(r, a1)}A${r},${r} 0 ${large} 0 ${p(r, a0)}Z`;
}
export function Donut({ items, size = 176, thickness = 26, label, centerLabel = "합계", format = won }: {
  items: DonutItem[]; size?: number; thickness?: number; label: string; centerLabel?: string; format?: (n: number) => string;
}) {
  const [active, setActive] = useState<number | null>(null);
  const pos = items.filter((it) => it.value > 0);
  const total = pos.reduce((s, it) => s + it.value, 0);
  const R = size / 2, r = R - thickness, c = size / 2;
  // 각 조각의 시작 각 = 앞 조각들의 누적 비율 (12시 방향부터 시계 방향)
  const starts = pos.map((_, i) => pos.slice(0, i).reduce((s, x) => s + x.value, 0));
  const segs = pos.map((it, i) => ({ ...it, a0: -Math.PI / 2 + (starts[i] / total) * Math.PI * 2, a1: -Math.PI / 2 + ((starts[i] + it.value) / total) * Math.PI * 2 }));
  const cur = active !== null ? segs[active] : null;
  return (
    <div className="relative flex-none" style={{ width: size, height: size }} onPointerLeave={() => setActive(null)}>
      <svg width={size} height={size} role="group" aria-label={segs.length ? `${label}: ${segs.map((s) => `${s.label} ${Math.round((s.value / total) * 1000) / 10}%`).join(", ")}` : label} className="block">
        {total <= 0 && <circle cx={c} cy={c} r={R - thickness / 2} fill="none" stroke="var(--color-gray-100)" strokeWidth={thickness} />}
        {segs.length === 1 && <circle cx={c} cy={c} r={R - thickness / 2} fill="none" stroke={segs[0].color} strokeWidth={thickness} />}
        {segs.length > 1 && segs.map((s, i) => (
          <path key={s.key} d={arc(c, c, active === i ? R : R - 2, r, s.a0, s.a1)} fill={s.color} stroke="white" strokeWidth={2} strokeLinejoin="round"
            opacity={active !== null && active !== i ? 0.55 : 1} tabIndex={0} role="img" className={hitClass}
            aria-label={`${s.label} ${format(s.value)} ${Math.round((s.value / total) * 1000) / 10}%`}
            onPointerEnter={() => setActive(i)} onFocus={() => setActive(i)} onBlur={() => setActive(null)} onClick={() => setActive(i)} />
        ))}
      </svg>
      <div aria-hidden className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center px-6">
        <span className="text-overline text-muted truncate max-w-full">{cur ? cur.label : centerLabel}</span>
        <span className="text-num-sm text-strong tabular-nums">{compactWon(cur ? cur.value : total)}{cur || total ? "원" : ""}</span>
        {cur && <span className="text-overline text-muted">{Math.round((cur.value / total) * 1000) / 10}%</span>}
      </div>
    </div>
  );
}

/* ── 가로 막대 목록 (순위 비교, 모바일에서도 라벨이 잘리지 않음) ── */
export function BarList({ items, format = won, max, onSelect }: {
  items: { key: string; label: ReactNode; value: number; color?: string; sub?: ReactNode; aria?: string }[];
  format?: (n: number) => string; max?: number; onSelect?: (key: string) => void;
}) {
  const top = max ?? Math.max(1, ...items.map((it) => it.value));
  return (
    <ul className="flex flex-col gap-3 m-0 p-0 list-none">
      {items.map((it) => {
        const body = (
          <>
            <div className="flex items-baseline justify-between gap-3">
              <span className="flex items-center gap-2 min-w-0 text-label text-strong">
                {it.color && <i aria-hidden className="w-2.5 h-2.5 rounded-xs flex-none" style={{ background: it.color }} />}
                <span className="truncate">{it.label}</span>
              </span>
              <span className="flex-none text-label font-semibold text-strong tabular-nums">{format(it.value)}</span>
            </div>
            <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, (it.value / top) * 100))}%`, background: it.color ?? "var(--color-chart-1)" }} />
            </div>
            {it.sub && <div className="text-caption text-muted">{it.sub}</div>}
          </>
        );
        return (
          <li key={it.key}>
            {onSelect ? <button type="button" onClick={() => onSelect(it.key)} aria-label={it.aria} className="w-full flex flex-col gap-1.5 text-left rounded-sm hover:bg-gray-50 -mx-1 px-1 py-0.5">{body}</button> : <div className="flex flex-col gap-1.5">{body}</div>}
          </li>
        );
      })}
    </ul>
  );
}

/* ── 표 ── 진짜 <table>이라 화면 낭독기가 행·열을 읽는다. 숫자 열은 오른쪽 정렬 + 고정폭 숫자.
 * sortValue가 있는 열은 머리글을 눌러 정렬 (오름↔내림) */
export type Column<R> = {
  key: string; header: string; align?: "left" | "right";
  render: (row: R) => ReactNode; sortValue?: (row: R) => number | string; className?: string;
};
export function DataTable<R extends { key: string }>({ columns, rows, footer, caption, minWidth = 480, initialSort, rowClassName, empty = "데이터가 없어요" }: {
  columns: Column<R>[]; rows: R[]; footer?: ReactNode[]; caption: string; minWidth?: number;
  initialSort?: { key: string; dir: "asc" | "desc" }; rowClassName?: (row: R) => string | undefined; empty?: string;
}) {
  const [sort, setSort] = useState(initialSort);
  const sorted = useMemo(() => {
    const col = sort && columns.find((c) => c.key === sort.key);
    if (!col?.sortValue) return rows;
    const sv = col.sortValue;
    return [...rows].sort((a, b) => { const x = sv(a), y = sv(b); const d = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "ko"); return sort!.dir === "asc" ? d : -d; });
  }, [rows, sort, columns]);
  const right = (c: Column<R>) => c.align === "right";
  return (
    <div className="overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0">
      <table className="w-full border-collapse text-label" style={{ minWidth }}>
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-line">
            {columns.map((c) => {
              const on = sort?.key === c.key;
              const head = <>{c.header}{on && <span aria-hidden>{sort!.dir === "asc" ? " ▲" : " ▼"}</span>}</>;
              return (
                <th key={c.key} scope="col" aria-sort={on ? (sort!.dir === "asc" ? "ascending" : "descending") : undefined} className={cx("py-2 px-2 first:pl-0 last:pr-0 text-overline text-muted font-semibold whitespace-nowrap", right(c) ? "text-right" : "text-left")}>
                  {c.sortValue ? <button type="button" className="hover:text-strong" onClick={() => setSort((s) => ({ key: c.key, dir: s?.key === c.key && s.dir === "desc" ? "asc" : "desc" }))}>{head}</button> : head}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 && <tr><td colSpan={columns.length} className="py-6 text-center text-caption text-muted">{empty}</td></tr>}
          {sorted.map((row) => (
            <tr key={row.key} className={cx("border-b border-line last:border-0", rowClassName?.(row))}>
              {columns.map((c) => <td key={c.key} className={cx("py-2.5 px-2 first:pl-0 last:pr-0 align-middle", right(c) ? "text-right tabular-nums whitespace-nowrap" : "text-left", c.className)}>{c.render(row)}</td>)}
            </tr>
          ))}
        </tbody>
        {footer && sorted.length > 0 && (
          <tfoot>
            <tr className="border-t border-line-strong">
              {footer.map((f, i) => <td key={i} className={cx("pt-2.5 px-2 first:pl-0 last:pr-0 font-semibold text-strong", right(columns[i]) ? "text-right tabular-nums whitespace-nowrap" : "text-left")}>{f}</td>)}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
