"use client";
/* 도메인 컴포넌트: 거래 행, 카드 행, 혜택 배지 */
import Link from "next/link";
import type { ReactNode } from "react";
import { Badge, type BadgeKind, CardChip, cx, Icon, Num, won } from "./ui";
import { fmtDateLong, fmtMd, num } from "@/lib/format";
import type { Transaction } from "@/lib/types";
import { COND_LABEL, industryOf, krw, type TxnResult } from "@/lib/engine";
import { isUnclassified } from "@/lib/stats";
import { INDUSTRY, categoryIcon, categoryPath } from "@/lib/data/merchants";
import { cardById, cardLabel } from "@/lib/data/cards";
import { useStore } from "@/lib/store";

/** 거래의 혜택 상태 배지 (BNF-01·05·06) */
export function benefitBadge(t: Transaction, r?: TxnResult): { label: string; kind: BadgeKind } | null {
  if (t.type === "income") return null;
  if (t.originalTxnId) return { label: "환불 · 원거래 재계산", kind: "info" };
  if (t.payType === "cash" || t.payType === "transfer") return { label: "현금·이체 · 계산 제외", kind: "gray" };
  if (!r?.mine) return null;
  const m = r.mine;
  if (m.total > 0) return { label: `혜택 ${won(m.total)}`, kind: "benefit" };
  if (m.skipped.length) return { label: `${COND_LABEL[m.skipped[0].field]} 입력 시 최대 ${won(m.skipped[0].maxExtra)}`, kind: "missed" };
  if (m.status === "capped") return { label: r.diff > 0 ? `한도 소진 · 놓침 ${won(r.diff)}` : "한도 소진", kind: "missed" };
  if (m.status === "excluded") return { label: t.isInterestFree ? "무이자 · 혜택 제외" : "제외 업종", kind: "gray" };
  if (r.diff > 0) return { label: `놓침 ${won(r.diff)}`, kind: "missed" };
  // 업종을 몰라 업종 혜택 규칙이 전부 '대상 아님'으로 빠진 경우 — 원인을 드러내 고치게 한다
  if (isUnclassified(t)) return { label: "업종 미분류 · 확인 필요", kind: "missed" };
  return { label: "혜택 0원 · 대상 아님", kind: "gray" };
}

export function TxnIcon({ t, size = 40 }: { t: Transaction; size?: number }) {
  const { categories } = useStore();
  const ind = industryOf(t);
  const icon = t.originalTxnId ? "undo" : t.type === "income" ? "payments" : (ind ? INDUSTRY[ind].icon : categoryIcon(categories, t.categoryId));
  return (
    <span className={cx("rounded-md inline-flex items-center justify-center flex-none", t.type === "income" ? "bg-income-soft text-blue-700" : "bg-gray-100 text-body")} style={{ width: size, height: size, borderRadius: size * 0.3 }}>
      <Icon name={icon} size={Math.round(size / 2)} />
    </span>
  );
}

export function TxnRow({ t, result, last, showDate, checked, onCheck, href }: { t: Transaction; result?: TxnResult; last?: boolean; showDate?: boolean; checked?: boolean; onCheck?: (v: boolean) => void; href?: string }) {
  const { categories } = useStore();
  const b = benefitBadge(t, result);
  const sub = [showDate && fmtMd(t.date), categoryPath(categories, t.categoryId), t.paidAt, t.cardId ? cardLabel(t.cardId) : t.payType === "cash" ? "현금" : t.payType === "transfer" ? "계좌이체" : null, (t.installmentMonths ?? 0) > 1 && `할부 ${t.installmentMonths}개월${t.isInterestFree ? " · 무이자" : ""}`, t.currency !== "KRW" && `${t.currency} ${num(t.amount)}`, t.recurringId && "반복"].filter(Boolean).join(" · ");
  const amountCls = t.type === "income" || t.originalTxnId ? "text-income" : "text-expense";
  const sign = t.type === "income" || t.originalTxnId ? "+" : "-";
  const inner = (
    <>
      {onCheck && <span aria-hidden className={cx("w-5.5 h-5.5 rounded-sm flex-none inline-flex items-center justify-center", checked ? "bg-primary" : "bg-white border-2 border-line-strong")}>{checked && <Icon name="check" size={16} className="text-white" />}</span>}
      <TxnIcon t={t} />
      <span className="flex-1 flex flex-col gap-0.5 min-w-0">
        <span className="text-body font-semibold text-strong truncate">{t.merchant}</span>
        <span className="text-caption text-muted truncate">{sub}</span>
      </span>
      <span className="flex flex-col items-end gap-1 flex-none">
        <Num className={amountCls}>{sign}{won(krw(t))}</Num>
        {b && <Badge kind={b.kind}>{b.label}</Badge>}
      </span>
    </>
  );
  const cls = cx("flex items-center gap-3 py-3 w-full text-left", !last && "border-b border-line", (href || onCheck) && "hover:bg-gray-50 -mx-2 px-2 rounded-md");
  // 선택 모드: 행 전체가 체크박스 (키보드 Space·Enter, 스크린리더 aria-checked)
  if (onCheck) return <button type="button" role="checkbox" aria-checked={!!checked} onClick={() => onCheck(!checked)} className={cls}>{inner}</button>;
  return href ? <Link href={href} className={cls}>{inner}</Link> : <div className={cls}>{inner}</div>;
}

export function DayHead({ date, sum }: { date: string; sum: number }) {
  return (
    <div className="flex justify-between items-center pt-3 first:pt-0">
      <span className="text-overline text-muted">{fmtDateLong(date)}</span>
      <span className="text-overline text-muted">{sum > 0 ? "+" : ""}{won(sum)}</span>
    </div>
  );
}

export function CardRow({ cardId, right, sub, big }: { cardId: string; right?: ReactNode; sub?: ReactNode; big?: boolean }) {
  const c = cardById(cardId);
  if (!c) return null;
  return (
    <div className="flex items-center gap-3 min-w-0">
      <CardChip color={c.color} w={big ? 48 : 36} h={big ? 30 : 24} />
      <span className="flex-1 flex flex-col gap-0.5 min-w-0">
        <span className={cx("text-strong truncate", big ? "text-body font-semibold" : "text-label")}>{c.issuer.replace("카드", "")} {c.name}</span>
        {sub && <span className="text-caption text-muted truncate">{sub}</span>}
      </span>
      {right}
    </div>
  );
}

/** 보유 카드 비교 리스트 (BNF-03). mineTotal: 결제한 카드가 받은 혜택 — 해제한 카드라 비교 목록에 없을 때만 따로 한 줄로 보여준다 */
export function CompareList({ compare, mineId, mineTotal }: { compare: { cardId: string; amount: number; note: string }[]; mineId?: string; mineTotal?: number }) {
  const gone = mineId && mineTotal !== undefined && !compare.some((c) => c.cardId === mineId) ? [{ cardId: mineId, amount: mineTotal, note: "해제한 카드 · 받은 혜택" }] : [];
  // 해제한 카드도 함께 정렬해 최적을 고른다. 동액이면 결제한 카드가 앞 — 상세의 '잘 골랐어요' 문구와 같은 카드에 배지가 붙게
  const rows = [...compare, ...gone].sort((a, b) => b.amount - a.amount || (a.cardId === mineId ? -1 : b.cardId === mineId ? 1 : 0));
  return (
    <div className="flex flex-col gap-2">
      {rows.map((c) => {
        const isBest = c === rows[0] && c.amount > 0;
        const card = cardById(c.cardId);
        return (
          <div key={c.cardId} className={cx("flex items-center gap-2.5 px-3 py-2.5 rounded-md border", isBest ? "bg-benefit-soft border-violet-200" : "border-line")}>
            {card && <CardChip color={card.color} />}
            <span className="flex-1 min-w-0 flex flex-col">
              <span className="text-label text-strong truncate">{cardLabel(c.cardId)}{c.cardId === mineId && <span className="text-caption text-muted"> · 사용</span>}</span>
              <span className="text-caption text-muted truncate">{c.note}</span>
            </span>
            {isBest && <Badge kind="primary">최적</Badge>}
            <Num className={c.amount > 0 ? "text-benefit" : "text-muted"}>{won(c.amount)}</Num>
          </div>
        );
      })}
    </div>
  );
}
