"use client";
import Link from "next/link";
import { useEffect, useEffectEvent, useId, useRef, type ReactNode, type ButtonHTMLAttributes, type InputHTMLAttributes, type SelectHTMLAttributes } from "react";

/* ── 유틸 ── */
export const cx = (...a: (string | false | null | undefined)[]) => a.filter(Boolean).join(" ");
export { won } from "@/lib/format";

/* ── Icon (Material Symbols Rounded 1종만) ── */
export function Icon({ name, size = 20, fill = false, className = "" }: { name: string; size?: number; fill?: boolean; className?: string }) {
  return (
    <span aria-hidden className={cx("msr", fill && "msr-fill", className)} style={{ fontSize: size, width: size, height: size }}>
      {name}
    </span>
  );
}

/* ── Button ── */
type BtnVariant = "primary" | "secondary" | "tonal" | "ghost" | "danger" | "dangerSolid";
type BtnSize = "lg" | "md" | "sm";
const btnV: Record<BtnVariant, string> = {
  primary: "bg-primary text-white hover:bg-primary-hover active:bg-primary-active",
  secondary: "bg-white border border-line-strong text-strong hover:bg-gray-50 active:bg-gray-100",
  tonal: "bg-primary-soft text-violet-700 hover:bg-primary-soft-2",
  ghost: "bg-transparent text-body hover:bg-gray-100",
  danger: "bg-danger-soft text-red-700 hover:bg-red-50",
  dangerSolid: "bg-danger text-white hover:bg-red-700",
};
const btnS: Record<BtnSize, string> = {
  lg: "h-btn-lg px-5 text-body rounded-md",
  md: "h-11 px-4 text-label rounded-btn",
  sm: "h-9 px-3.5 text-label rounded-btn",
};
export function Button({ variant = "primary", size = "lg", icon, className, children, href, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: BtnSize; icon?: string; href?: string }) {
  const cls = cx(
    "inline-flex items-center justify-center gap-1.5 font-semibold whitespace-nowrap select-none transition-[background,transform] duration-200 ease-out-soft active:scale-98 disabled:bg-gray-100 disabled:text-disabled disabled:pointer-events-none",
    btnV[variant], btnS[size], className,
  );
  const inner = (<>{icon && <Icon name={icon} size={size === "lg" ? 18 : 16} />}{children}</>);
  if (href) return <Link href={href} className={cls}>{inner}</Link>;
  return <button type="button" className={cls} {...rest}>{inner}</button>;
}

/* ── Badge ── */
export type BadgeKind = "gray" | "benefit" | "missed" | "success" | "warn" | "danger" | "info" | "dark" | "primary";
const badgeK: Record<BadgeKind, string> = {
  gray: "bg-gray-100 text-muted",
  benefit: "bg-benefit-soft text-violet-700",
  missed: "bg-missed-soft text-amber-700",
  success: "bg-success-soft text-green-700",
  warn: "bg-warning-soft text-amber-700",
  danger: "bg-danger-soft text-red-700",
  info: "bg-info-soft text-blue-700",
  dark: "bg-gray-800 text-white",
  primary: "bg-primary text-white",
};
export function Badge({ kind = "gray", icon, children, className }: { kind?: BadgeKind; icon?: string; children: ReactNode; className?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-1 h-6 px-2 rounded-sm text-overline whitespace-nowrap flex-none", badgeK[kind], className)}>
      {icon && <Icon name={icon} size={14} />}{children}
    </span>
  );
}
export const RefBadge = () => <Badge>참고값</Badge>;

/* ── Chip ── */
/** href를 주면 페이지 이동 링크(지금 페이지면 aria-current), 아니면 눌림 상태 버튼(aria-pressed) */
export function Chip({ on, onClick, icon, x, children, className, href, disabled }: { on?: boolean; onClick?: () => void; icon?: string; x?: boolean; children: ReactNode; className?: string; href?: string; disabled?: boolean }) {
  const cls = cx(
    "inline-flex items-center gap-1 h-9 px-3.5 rounded-full text-label whitespace-nowrap flex-none transition-colors duration-200",
    on ? "bg-primary text-white font-semibold" : "bg-white border border-line-strong text-body font-medium hover:bg-gray-50", disabled && "opacity-40 cursor-not-allowed hover:bg-white", className);
  const inner = <>{icon && <Icon name={icon} size={16} />}{children}{x && <Icon name="close" size={14} className={on ? "text-white" : "text-muted"} />}</>;
  if (href) return <Link href={href} onClick={onClick} aria-current={on ? "page" : undefined} className={cls}>{inner}</Link>;
  return <button type="button" onClick={onClick} aria-pressed={on} disabled={disabled} className={cls}>{inner}</button>;
}

/* ── Card ── (기본 모양은 globals.css .card-base — className의 gap-0·bg-* 가 덮어쓸 수 있게 낮은 층에 둠) */
export function Card({ children, className, pad = "p-4 md:p-5", ...rest }: { children: ReactNode; className?: string; pad?: string } & React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cx("card-base", pad, className)} {...rest}>{children}</div>;
}
export function CardTitle({ children, right, className }: { children: ReactNode; right?: ReactNode; className?: string }) {
  return (
    <div className={cx("flex items-center gap-2", className)}>
      <span className="flex-1 text-h3 text-strong">{children}</span>{right}
    </div>
  );
}

/* ── Progress ── */
export function Progress({ pct, color = "bg-primary", h = 8, className }: { pct: number; color?: string; h?: number; className?: string }) {
  return (
    <div className={cx("rounded-full bg-gray-100 overflow-hidden", className)} style={{ height: h }} role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      <i className={cx("block h-full rounded-full transition-[width] duration-300 ease-out-soft", color)} style={{ width: `${Math.max(0, Math.min(pct, 100))}%` }} />
    </div>
  );
}

/* ── Toggle / Check ── */
export function Toggle({ on, onChange, label }: { on: boolean; onChange?: (v: boolean) => void; label?: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange?.(!on)} className={cx("relative w-12 h-7 rounded-full flex-none transition-colors duration-200", on ? "bg-primary" : "bg-gray-300")}>
      <i className={cx("absolute top-0.75 w-5.5 h-5.5 rounded-full bg-white transition-[left] duration-200 ease-out-soft", on ? "left-5.75" : "left-0.75")} />
    </button>
  );
}
export function Check({ on, onChange, label }: { on: boolean; onChange?: (v: boolean) => void; label?: string }) {
  return (
    <button type="button" role="checkbox" aria-checked={on} aria-label={label} onClick={() => onChange?.(!on)} className={cx("w-5.5 h-5.5 rounded-sm flex-none inline-flex items-center justify-center transition-colors", on ? "bg-primary" : "bg-white border-2 border-line-strong")}>
      {on && <Icon name="check" size={16} className="text-white" />}
    </button>
  );
}

/* ── Segmented ── (한 화면 안의 보기 전환·폼 값 고르기는 "여럿 중 하나"라 radiogroup. 페이지 이동은 같은 모양의 링크 — shell의 ViewSwitch) */
export const segBox = "flex bg-gray-100 rounded-md p-1 gap-1";
export const segItem = (on: boolean) => cx(
  "flex-1 h-9 rounded-sm text-label inline-flex items-center justify-center transition-all duration-200",
  on ? "bg-white shadow-1 font-semibold text-strong" : "font-medium text-muted hover:text-body");
export function Seg<T extends string>({ items, value, onChange, className }: { items: readonly T[] | T[]; value: T; onChange?: (v: T) => void; className?: string }) {
  return (
    <div role="radiogroup" className={cx(segBox, className)}>
      {items.map((t) => <button key={t} type="button" role="radio" aria-checked={t === value} onClick={() => onChange?.(t)} className={segItem(t === value)}>{t}</button>)}
    </div>
  );
}

/* ── Field / Input / Select ── */
/** group: Seg처럼 버튼 묶음을 감쌀 때. <label>로 감싸면 라벨 글자나 빈 곳을 눌러도 첫 버튼이 눌리므로 role=group <div>로 그린다 */
export function Field({ label, hint, error, children, className, group }: { label?: ReactNode; hint?: string; error?: string; children: ReactNode; className?: string; group?: boolean }) {
  const id = useId();
  const Tag = group ? "div" : "label";
  return (
    <Tag role={group ? "group" : undefined} aria-labelledby={group && label ? id : undefined} className={cx("flex flex-col gap-1.5 min-w-0", className)}>
      {label && <span id={id} className="text-label text-body">{label}</span>}
      {children}
      {(error || hint) && <span className={cx("text-caption", error ? "text-red-700" : "text-muted")}>{error || hint}</span>}
    </Tag>
  );
}
/* 기본 모양은 globals.css .input-box (낮은 층) → className의 h-10·w-40·border-danger 등이 그대로 적용된다 */
const inputBox = "input-box focus-within:border-line-focus focus-within:shadow-focus";
export function Input({ icon, suffix, className, error, ...rest }: InputHTMLAttributes<HTMLInputElement> & { icon?: string; suffix?: ReactNode; error?: boolean }) {
  return (
    <span className={cx(inputBox, "flex items-center gap-2.5", error && "border-danger bg-danger-soft", className)}>
      {icon && <Icon name={icon} size={20} className="text-muted" />}
      <input aria-invalid={error || undefined} className="flex-1 min-w-0 bg-transparent outline-none" {...rest} />
      {suffix && <span className="text-muted flex-none">{suffix}</span>}
    </span>
  );
}
export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <span className={cx(inputBox, "relative flex items-center", className)}>
      <select className="flex-1 min-w-0 appearance-none bg-transparent outline-none pr-6" {...rest}>{children}</select>
      <Icon name="expand_more" size={20} className="text-muted absolute right-3 pointer-events-none" />
    </span>
  );
}

/* ── FormRow (레이블 80px + 값 + 우측) ── */
export function FormRow({ label, children, right, muted, onClick }: { label: string; children: ReactNode; right?: ReactNode; muted?: boolean; onClick?: () => void }) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag type={onClick ? "button" : undefined} onClick={onClick} className={cx("flex items-center gap-3 min-h-btn-lg py-1 border-b border-line text-left w-full", onClick && "hover:bg-gray-50")}>
      <span className="text-label text-muted w-20 flex-none">{label}</span>
      <span className={cx("flex-1 min-w-0", muted ? "text-disabled" : "text-strong")}>{children}</span>
      {right ?? (onClick && <Icon name="chevron_right" size={20} className="text-muted" />)}
    </Tag>
  );
}

/* ── ListRow ── */
export function ListRow({ icon, title, sub, right, href, onClick, last, danger }: { icon?: string; title: ReactNode; sub?: ReactNode; right?: ReactNode; href?: string; onClick?: () => void; last?: boolean; danger?: boolean }) {
  const inner = (
    <>
      {icon && <IconTile name={icon} />}
      <span className="flex-1 flex flex-col gap-0.5 min-w-0">
        <span className={cx("text-body font-semibold", danger ? "text-red-700" : "text-strong")}>{title}</span>
        {sub && <span className="text-caption text-muted">{sub}</span>}
      </span>
      {right === undefined ? (href || onClick) && <Icon name="chevron_right" size={20} className="text-muted" /> : right}
    </>
  );
  const cls = cx("flex items-center gap-3 min-h-14 py-2 w-full text-left", !last && "border-b border-line");
  if (href) return <Link href={href} className={cls}>{inner}</Link>;
  if (onClick) return <button type="button" onClick={onClick} className={cls}>{inner}</button>;
  return <div className={cls}>{inner}</div>;
}

/* ── CardChip (카드 미니어처, 로고 대신 단색) ── */
export function CardChip({ color, w = 32, h = 20, className }: { color: string; w?: number; h?: number; className?: string }) {
  return <span className={cx("inline-block flex-none", className)} style={{ width: w, height: h, borderRadius: Math.round(h / 5), background: color }} />;
}

/* ── 아이콘 타일 (리스트 행·알림·패턴 등 공통) ── */
export function IconTile({ name, size = 36, tone = "gray", className }: { name: string; size?: number; tone?: "gray" | "primary" | "success" | "warn" | "danger" | "info"; className?: string }) {
  const t = { gray: "bg-gray-100 text-body", primary: "bg-primary-soft text-primary", success: "bg-success-soft text-green-700", warn: "bg-warning-soft text-amber-700", danger: "bg-danger-soft text-red-700", info: "bg-info-soft text-blue-700" }[tone];
  return <span className={cx("inline-flex items-center justify-center flex-none", t, className)} style={{ width: size, height: size, borderRadius: Math.round(size * 0.28) }}><Icon name={name} size={Math.round(size * 0.55)} /></span>;
}

/* ── 텍스트 링크 (본문 안의 "전체 보기" 류) ── */
export function TextLink({ href, onClick, children, className }: { href?: string; onClick?: () => void; children: ReactNode; className?: string }) {
  const cls = cx("text-label font-semibold text-link hover:underline", className);
  return href ? <Link href={href} className={cls}>{children}</Link> : <button type="button" onClick={onClick} className={cls}>{children}</button>;
}

/* ── 통계 타일 (홈·리포트·어드민 공통) ── */
export function StatTile({ label, value, sub, tone = "white", subTone, className }: { label: string; value: ReactNode; sub?: ReactNode; tone?: "white" | "primary" | "missed"; subTone?: string; className?: string }) {
  const box = tone === "primary" ? "bg-primary border-primary text-white" : tone === "missed" ? "bg-white border-missed" : "bg-white border-line";
  return (
    <div className={cx("border rounded-lg p-3.5 md:p-5 flex flex-col gap-1.5 md:gap-2.5 min-w-0 shadow-1", box, className)}>
      <span className={cx("text-caption md:text-label", tone === "primary" ? "text-violet-100" : tone === "missed" ? "text-amber-700" : "text-muted")}>{label}</span>
      <span className={cx("text-num-md xl:text-num-lg tracking-num whitespace-nowrap", tone === "missed" ? "text-amber-700" : tone === "primary" ? "text-white" : "text-strong")}>{value}</span>
      {sub && <span className={cx("text-overline md:text-caption md:font-normal", tone === "primary" ? "text-violet-100" : subTone ?? "text-muted")}>{sub}</span>}
    </div>
  );
}

/* ── AI 섹션 제목 (인사이트·정규화) ── */
export function AiTitle({ children, note }: { children: ReactNode; note?: ReactNode }) {
  return <div className="flex items-center gap-2"><IconTile name="auto_awesome" size={28} tone="primary" /><CardTitle>{children}</CardTitle>{note && <Cap>{note}</Cap>}</div>;
}

/* ── 텍스트 ── */
export const Cap = ({ children, className }: { children: ReactNode; className?: string }) => <span className={cx("text-caption text-muted", className)}>{children}</span>;
export const Num = ({ children, className, size = "sm" }: { children: ReactNode; className?: string; size?: "sm" | "md" | "lg" }) => (
  <span className={cx(size === "lg" ? "text-num-lg" : size === "md" ? "text-num-md" : "text-num-sm", "tracking-num whitespace-nowrap", className)}>{children}</span>
);
export function PageTitle({ title, desc }: { title: ReactNode; desc?: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <h1 className="m-0 text-h1 tracking-title text-strong">{title}</h1>
      {desc && <p className="m-0 text-muted">{desc}</p>}
    </div>
  );
}
export function KV({ rows, keyW = "w-14" }: { rows: [string, ReactNode][]; keyW?: string }) {
  return (
    <div className="flex flex-col gap-1.5 text-caption">
      {rows.map(([k, v]) => (
        <div key={k} className="flex gap-2.5"><span className={cx("text-muted flex-none", keyW)}>{k}</span><span className="text-body">{v}</span></div>
      ))}
    </div>
  );
}

/* ── Info box ── */
export function Note({ icon = "info", tone = "gray", children }: { icon?: string; tone?: "gray" | "violet" | "amber" | "blue"; children: ReactNode }) {
  const t = { gray: "bg-gray-50 border border-line text-muted", violet: "bg-benefit-soft text-violet-700", amber: "bg-warning-soft text-amber-700", blue: "bg-info-soft text-blue-700" }[tone];
  return (
    <div className={cx("flex items-start gap-2.5 px-3.5 py-3 rounded-md text-caption", t)}>
      <Icon name={icon} size={18} className="mt-px" /><span className="flex-1">{children}</span>
    </div>
  );
}

/* ── EmptyState ── */
export function EmptyState({ icon = "inbox", title, desc, action }: { icon?: string; title: string; desc?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
      <span className="w-14 h-14 rounded-lg bg-gray-100 inline-flex items-center justify-center text-muted"><Icon name={icon} size={28} /></span>
      <span className="text-body font-semibold text-strong">{title}</span>
      {desc && <Cap>{desc}</Cap>}
      {action}
    </div>
  );
}

/* ── Sheet / Modal ── */
/** 모달 공통 키보드 처리: 열려 있는 동안 Esc로 닫고, 열릴 때 패널 안 첫 요소로 포커스를 옮겼다가 닫히면 연 버튼으로 돌려준다.
 * 돌려받은 ref를 패널(배경 버튼이 아닌 안쪽 상자)에 단다 */
export function useDialog<T extends HTMLElement = HTMLDivElement>(open: boolean, onClose: () => void) {
  const ref = useRef<T>(null);
  const close = useEffectEvent(onClose);
  useEffect(() => {
    if (!open) return;
    const panel = ref.current;
    // ponytail: 안쪽 autoFocus가 먼저 포커스를 가져갔으면 그대로 두고, 연 버튼을 알 수 없으니 복귀는 건너뜀
    const inside = !!panel?.contains(document.activeElement);
    const opener = inside ? null : (document.activeElement as HTMLElement | null);
    if (!inside) panel?.querySelector<HTMLElement>("a[href],button:not([disabled]),input,select,textarea")?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); opener?.focus(); };
  }, [open]);
  return ref;
}
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const ref = useDialog(open, onClose);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end md:items-center md:justify-center" role="dialog" aria-modal aria-label={title}>
      <button type="button" aria-label="닫기" tabIndex={-1} className="absolute inset-0 bg-gray-900/40" onClick={onClose} />
      <div ref={ref} className="relative bg-white rounded-t-xl md:rounded-xl px-5 pt-2 pb-8 md:p-6 flex flex-col gap-4 shadow-3 w-full md:max-w-120 max-h-[90vh] overflow-y-auto">
        <i className="w-10 h-1 rounded bg-gray-300 mx-auto md:hidden" />
        <div className="flex items-center gap-2">
          <h2 className="m-0 flex-1 text-h2 tracking-title text-strong">{title}</h2>
          <button type="button" aria-label="닫기" onClick={onClose} className="w-10 h-10 -mr-2 inline-flex items-center justify-center text-muted rounded-md hover:bg-gray-100"><Icon name="close" size={24} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* ── Amount (큰 금액 입력/표시) ── */
export function AmountBig({ label, value, onChange, color = "border-primary", readOnly }: { label: string; value: number; onChange?: (v: number) => void; color?: string; readOnly?: boolean }) {
  return (
    <label className="flex flex-col gap-1 py-2">
      <Cap>{label}</Cap>
      <span className={cx("flex items-baseline gap-1 border-b-2 pb-2", color)}>
        <input
          inputMode="numeric" readOnly={readOnly}
          className="flex-1 min-w-0 bg-transparent text-display tracking-title text-strong outline-none"
          value={value ? value.toLocaleString("ko-KR") : ""} placeholder="0"
          onChange={(e) => onChange?.(Number(e.target.value.replace(/[^\d]/g, "")) || 0)}
        />
        <span className="text-h3 text-muted">원</span>
      </span>
    </label>
  );
}

/* ── 데스크톱 테이블 ── */
/** 좁은 화면에서도 열이 잘리지 않게 최소 폭(고정 px 열 + 가변 열 80px씩 + 간격·여백)을 두고 가로로 스크롤한다.
 * 가변 열(fr·minmax)을 넉넉히 잡으면 데스크톱 칸(어드민 승인 규칙 표 760px)에서도 스크롤바가 생긴다 */
export const tableMinWidth = (cols: { w: string }[]) => cols.reduce((s, c) => s + (/^\d+px$/.test(c.w) ? parseInt(c.w) : 80), 0) + 16 * (cols.length - 1) + 40;
export function Table({ cols, children, className }: { cols: { label: string; w: string; align?: "right" }[]; children: ReactNode; className?: string }) {
  const grid = cols.map((c) => c.w).join(" ");
  return (
    <div className={cx("bg-card border border-line rounded-lg pt-4 flex flex-col overflow-x-auto", className)}>
      <div className="flex flex-col" style={{ minWidth: tableMinWidth(cols) }}>
        <div className="grid gap-4 px-5 pb-2.5 border-b border-line" style={{ gridTemplateColumns: grid }}>
          {cols.map((c) => <span key={c.label + c.w} className={cx("text-overline text-muted", c.align === "right" && "text-right")}>{c.label}</span>)}
        </div>
        <div className="flex flex-col [&>*]:grid [&>*]:gap-4 [&>*]:px-5 [&>*]:py-3 [&>*]:items-center [&>*:not(:last-child)]:border-b [&>*]:border-line" style={{ ["--grid" as string]: grid }}>
          {children}
        </div>
      </div>
    </div>
  );
}
export const TRow = ({ children, className, href }: { children: ReactNode; className?: string; href?: string }) => {
  const style = { gridTemplateColumns: "var(--grid)" };
  if (href) return <Link href={href} className={cx("hover:bg-gray-50", className)} style={style}>{children}</Link>;
  return <div className={className} style={style}>{children}</div>;
};
