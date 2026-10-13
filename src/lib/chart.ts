/* 차트 계산 — 눈금, 축 라벨, 카테고리 색 배정. React 의존 없는 순수 함수 (charts.tsx가 그림을 그린다) */
import type { Category } from "./types";

/** 0부터 max를 덮는 "깔끔한" 눈금. 간격은 1·2·2.5·5·10 × 10^n 중 하나라 축 라벨이 읽기 쉽다 */
export function niceTicks(max: number, target = 4): number[] {
  if (!(max > 0) || !Number.isFinite(max)) return [0];
  const rough = max / target;
  const mag = 10 ** Math.floor(Math.log10(rough));
  const norm = rough / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
  const top = Math.ceil(max / step - 1e-9) * step;
  const ticks: number[] = [];
  for (let v = 0; v <= top + step / 2; v += step) ticks.push(Math.round(v));
  return ticks;
}

/** 축·좁은 자리용 짧은 금액. 1억 이상 "1.2억", 1만 이상 "12만"/"12.5만", 그 아래는 쉼표 */
export function compactWon(n: number): string {
  const a = Math.abs(n), s = n < 0 ? "-" : "";
  const trim = (x: number) => String(Math.round(x * 10) / 10);
  if (a >= 1e8) return `${s}${trim(a / 1e8)}억`;
  if (a >= 1e4) return `${s}${trim(a / 1e4)}만`;
  return `${s}${Math.round(a).toLocaleString("ko-KR")}`;
}

/** 비율(0~1) → "12.3%" */
export const pct1 = (ratio: number) => `${Math.round(ratio * 1000) / 10}%`;

export const CHART_COLORS = [1, 2, 3, 4, 5, 6, 7].map((i) => `var(--color-chart-${i})`);
export const CHART_OTHER = "var(--color-chart-other)";
export const CHART_INCOME = "var(--color-chart-income)";
export const CHART_EXPENSE = "var(--color-chart-expense)";

/** 상위 카테고리 id → 차트 색. 순위가 아니라 카테고리 정렬 순서로 고정해서, 필터·달이 바뀌어도 같은 카테고리는 같은 색.
 *  '기타'(etc / income.etc)와 8번째 이후는 회색으로 묶는다. 하위 카테고리는 부모 색을 쓴다 */
export function categoryColors(cats: Category[]): (id: string) => string {
  const out: Record<string, string> = {};
  for (const type of ["expense", "income"] as const) {
    const tops = cats.filter((c) => c.type === type && !c.parentId && c.id !== "etc" && c.id !== "income.etc").sort((a, b) => a.order - b.order);
    tops.forEach((c, i) => { out[c.id] = i < CHART_COLORS.length ? CHART_COLORS[i] : CHART_OTHER; });
  }
  for (const c of cats) if (c.parentId) out[c.id] = out[c.parentId] ?? CHART_OTHER;
  return (id) => out[id] ?? CHART_OTHER;
}
