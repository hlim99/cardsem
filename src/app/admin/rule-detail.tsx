"use client";
/* 승인 규칙 한 줄 = 펼치면 모든 내부 값. 어드민이 규칙 JSON을 말줄임 없이 읽고 검수할 수 있게 (승인 규칙 화면) */
import { useState } from "react";
import { Badge, Button, Cap, cx, Icon } from "@/components/ui";
import { tierLabel } from "@/lib/engine";
import { num } from "@/lib/format";
import { PAY_CHANNEL, PAY_METHOD, RULE_KIND } from "@/lib/labels";
import { INDUSTRY } from "@/lib/data/merchants";
import type { BenefitRule, Industry } from "@/lib/types";

const DAYS = ["일", "월", "화", "수", "목", "금", "토"];
const ind = (k: string) => INDUSTRY[k as Industry]?.label ?? k; // '무이자할부'처럼 업종이 아닌 제외 항목은 그대로
const won = (n: number) => `${num(n)}원`;
/* 타입(src/lib/types.ts BenefitRule)에 정의된 키 전부. 규칙에 없는 키는 null로 보여 '어떤 조건이 비어 있는지'까지 읽히게 */
const RULE_KEYS = ["id", "cardId", "variantId", "name", "kind", "target", "rate", "rateBands", "fixedAmount", "step", "perUnit", "eligibleAmountCap", "perTxnCap", "limitsByTier", "capGroupId", "countGroupId", "monthOverrides", "stacking", "validFrom", "validTo", "rawText", "supported", "unsupportedReason", "confidence"] as const;
const TARGET_KEYS = ["categories", "merchants", "excludes", "channel", "daysOfWeek", "holidayPolicy", "timeRange", "minAmount", "autoPayOnly", "payMethods", "payChannels"] as const;
export const allKeys = (r: BenefitRule) => {
  const t = Object.fromEntries(TARGET_KEYS.map((k) => [k, (r.target as Record<string, unknown>)[k] ?? null]));
  return Object.fromEntries(RULE_KEYS.map((k) => [k, k === "target" ? t : (r as Record<string, unknown>)[k] ?? null]));
};

/** 금액을 정하는 키를 한 문장으로 */
export function amountText(r: BenefitRule) {
  const parts = [
    r.rate !== undefined && `${+(r.rate * 100).toFixed(2)}%`,
    r.rateBands && `금액 구간별 ${r.rateBands.map((b) => `${won(b.minAmount)}↑ ${+(b.rate * 100).toFixed(2)}%`).join(", ")}`,
    r.fixedAmount !== undefined && `건당 ${won(r.fixedAmount)}`,
    r.step && `${won(r.step.per)}당 ${won(r.step.amount)}`,
    r.perUnit && `리터당 ${won(r.perUnit.amount)}`,
    r.eligibleAmountCap !== undefined && `할인 대상 금액 ${won(r.eligibleAmountCap)}까지`,
    r.perTxnCap !== undefined && `건당 최대 ${won(r.perTxnCap)}`,
  ];
  return parts.filter(Boolean).join(" · ") || "—";
}

/** 적용 조건(target)을 사람이 읽는 줄로. 없는 조건은 빼고 */
export function targetLines(r: BenefitRule): [string, string][] {
  const t = r.target;
  return ([
    ["업종", t.categories?.map(ind).join(", ")],
    ["가맹점", t.merchants?.join(", ")],
    ["제외", t.excludes?.map(ind).join(", ")],
    ["채널", t.channel && { online: "온라인", offline: "오프라인", any: "모두" }[t.channel]],
    ["요일", t.daysOfWeek?.map((d) => DAYS[d]).join("·")],
    ["공휴일", t.holidayPolicy && (t.holidayPolicy === "exclude" ? "공휴일 제외" : "공휴일 포함")],
    ["시간대", t.timeRange && `${t.timeRange.from} ~ ${t.timeRange.to}`],
    ["최소 금액", t.minAmount !== undefined && `건당 ${won(t.minAmount)} 이상`],
    ["자동납부", t.autoPayOnly && "자동납부 결제만"],
    ["결제 수단", t.payMethods?.map((m) => PAY_METHOD[m] ?? m).join(", ")],
    ["결제 경로", t.payChannels?.map((c) => PAY_CHANNEL[c] ?? c).join(", ")],
  ] as [string, string | false | undefined][]).filter((x): x is [string, string] => !!x[1]);
}

/** [onDelete]가 있으면 펼친 아래에 「이 혜택 삭제」, 없고 [locked]가 있으면 지울 수 없는 까닭을 보인다 */
export function RuleDetail({ r, last, onDelete, locked }: { r: BenefitRule; last?: boolean; onDelete?: () => void; locked?: string }) {
  const [open, setOpen] = useState(false);
  const [json, setJson] = useState(false);
  const targets = targetLines(r);
  return (
    <div className={cx(!last && "border-b border-line")}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="w-full flex items-start gap-3 px-5 py-3.5 text-left hover:bg-gray-50">
        <Icon name={open ? "expand_less" : "expand_more"} size={20} className="text-muted mt-0.5 flex-none" />
        <span className="flex-1 min-w-0 flex flex-col gap-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-label font-semibold text-strong">{r.name}</span>
            <Badge kind={RULE_KIND[r.kind].badge}>{RULE_KIND[r.kind].label}</Badge>
            {r.variantId && <Badge>패키지 {r.variantId}</Badge>}
            <Badge kind={r.supported ? "success" : "gray"}>{r.supported ? "계산함" : "계산 안 함"}</Badge>
          </span>
          <Cap className="text-body">{amountText(r)}</Cap>
          <Cap>{targets.map(([k, v]) => `${k}: ${v}`).join(" · ") || "모든 가맹점"}</Cap>
        </span>
      </button>
      {open && (
        <div className="px-5 pb-5 pl-13 flex flex-col gap-4">
          <dl className="grid grid-cols-[96px_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-label">
            <dt className="text-muted">규칙 id</dt><dd className="font-mono text-caption break-all">{r.id}</dd>
            {targets.map(([k, v]) => <Row key={k} k={k} v={v} />)}
            <Row k="혜택 금액" v={amountText(r)} />
            {r.capGroupId && <Row k="한도 묶음" v={`${r.capGroupId} — 같은 묶음의 규칙과 월 한도를 함께 씀`} />}
            {r.countGroupId && <Row k="횟수 묶음" v={`${r.countGroupId} — 같은 묶음의 규칙과 일·월·연 횟수를 함께 씀`} />}
            {r.stacking?.map((s) => <Row key={s.ruleId} k={s.mode === "deny" ? "중복 불가" : "중복 가능"} v={s.ruleId} />)}
            {r.monthOverrides?.map((o, i) => <Row key={i} k="달별 추가 한도" v={`${o.months.join("·")}월 +${won(o.extraCap)}`} />)}
            {(r.validFrom || r.validTo) && <Row k="유효 기간" v={`${r.validFrom ?? "처음"} ~ ${r.validTo ?? "계속"}`} />}
            {!r.supported && <Row k="계산 안 하는 이유" v={r.unsupportedReason ?? "—"} />}
            <Row k="신뢰도" v={`${Math.round(r.confidence * 100)}%`} />
          </dl>
          <div className="flex flex-col gap-1.5">
            <Cap className="font-semibold text-strong">전월 실적 구간별 한도</Cap>
            <div className="border border-line rounded-md overflow-hidden">
              {r.limitsByTier.map((l, i) => (
                <div key={i} className={cx("grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-3 px-3 py-2 text-label", i > 0 && "border-t border-line")}>
                  <span className="text-strong">{tierLabel(l.tier)}</span>
                  <span className="text-body">{[l.monthlyCap !== undefined ? `월 ${won(l.monthlyCap)}` : "월 한도 없음", l.dailyCount && `하루 ${l.dailyCount}회`, l.monthlyCount && `월 ${l.monthlyCount}회`, l.yearlyCount && `연 ${l.yearlyCount}회`].filter(Boolean).join(" · ")}</span>
                </div>
              ))}
            </div>
            <Cap>표에 없는 실적 구간에서는 이 혜택이 없어요.</Cap>
          </div>
          <div className="flex flex-col gap-1.5">
            <Cap className="font-semibold text-strong">카드사 원문 (rawText)</Cap>
            <p className="text-label text-body whitespace-pre-wrap bg-gray-50 rounded-md px-3 py-2.5 max-w-none">{r.rawText}</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <button type="button" onClick={() => setJson((j) => !j)} aria-expanded={json} className="self-start text-label font-semibold text-link">{json ? "JSON 접기" : "규칙 JSON 전체 보기 (모든 키, 없는 값은 null)"}</button>
            {json && <pre className="text-caption font-mono bg-gray-50 rounded-md px-3 py-2.5 overflow-x-auto whitespace-pre">{JSON.stringify(allKeys(r), null, 2)}</pre>}
          </div>
          {onDelete ? <Button variant="danger" size="sm" icon="delete" className="self-start" onClick={onDelete}>이 혜택 삭제</Button> : locked && <Cap>{locked}</Cap>}
        </div>
      )}
    </div>
  );
}

const Row = ({ k, v }: { k: string; v: string }) => (<><dt className="text-muted">{k}</dt><dd className="text-body break-words min-w-0">{v}</dd></>);
