"use client";
import { use, useState } from "react";
import { Screen } from "@/components/shell";
import { Badge, Card, Cap, Chip, EmptyState, KV, cx } from "@/components/ui";
import { num } from "@/lib/format";
import { useStore } from "@/lib/store";
import { cardLabel, isCustomCardId } from "@/lib/data/cards";
import { INDUSTRY } from "@/lib/data/merchants";
import { COND_LABEL, requiredFields, tierLabel } from "@/lib/engine";
import type { BenefitRule, Industry } from "@/lib/types";
import { RULE_KIND } from "@/lib/labels";

const ind = (k: string) => INDUSTRY[k as Industry]?.label ?? k;
const cond = (r: BenefitRule) => { const t = r.target; return [t.minAmount && `건당 ${num(t.minAmount)}원 이상`, t.daysOfWeek && `${t.daysOfWeek.map((d) => "일월화수목금토"[d]).join("·")}요일${t.holidayPolicy === "exclude" ? " (공휴일 제외)" : ""}`, t.timeRange && `${t.timeRange.from}~${t.timeRange.to}`, t.autoPayOnly && "자동납부 건만", t.payMethods && `결제수단 ${t.payMethods.join("·")}`, t.payChannels && `경로 ${t.payChannels.join("·")}`, t.channel && t.channel !== "any" && (t.channel === "online" ? "온라인만" : "오프라인만")].filter(Boolean).join(" · ") || "없음"; };
const limits = (r: BenefitRule) => r.limitsByTier.map((l) => `${tierLabel(l.tier)}: ${[l.monthlyCap !== undefined && `월 ${num(l.monthlyCap)}원`, l.dailyCount && `일 ${l.dailyCount}회`, l.monthlyCount && `월 ${l.monthlyCount}회`, l.yearlyCount && `연 ${l.yearlyCount}회`].filter(Boolean).join(" · ") || "한도 없음"}`).join(" / ") + (r.perTxnCap ? ` · 건당 ${num(r.perTxnCap)}원` : "") + (r.eligibleAmountCap ? ` · 대상 금액 ${num(r.eligibleAmountCap)}원까지` : "");
const pct = (rate: number) => `${Math.round(rate * 10000) / 100}%`; // 소수 둘째 자리까지 (0.25% 유지, 0.07 * 100 = 7.000000000000001 방지)
const pay = (r: BenefitRule) => r.rate !== undefined ? pct(r.rate) : r.rateBands ? r.rateBands.map((b) => `${b.minAmount / 10000}만↑ ${pct(b.rate)}`).join(", ") : r.fixedAmount ? `정액 ${num(r.fixedAmount)}원` : r.step ? `${num(r.step.per)}원당 ${num(r.step.amount)}원` : r.perUnit ? `리터당 ${r.perUnit.amount}원` : "—";

export default function RulesPage({ params }: PageProps<"/cards/[id]/rules">) {
  const { id } = use(params);
  const { userCards, calc, catalog } = useStore();
  const c = catalog.find((x) => x.id === id); const uc = userCards.find((u) => u.cardId === id);
  const [kind, setKind] = useState<"전체" | keyof typeof RULE_KIND>("전체");
  if (!c) return <Screen title="혜택 규칙" back><EmptyState title="카드를 찾을 수 없어요" /></Screen>;
  const mine = c.rules.filter((r) => !r.variantId || r.variantId === uc?.variantId); // 내 패키지 규칙만 — 개수·칩도 이 기준
  const rules = mine.filter((r) => kind === "전체" || r.kind === kind);
  const cm = calc.cards[id];
  return (
    <Screen title={`혜택 규칙 · ${cardLabel(id)}`} desc={`규칙 ${mine.length}개 · ${isCustomCardId(id) ? "직접 입력한 카드 · 검수 없이 계산" : `출처 확인 ${c.checkedAt} · 결제일 기준으로 당시 규칙 적용 (DAT-05)`}`} back>
      <div className="flex gap-2 overflow-x-auto no-scrollbar md:flex-wrap -mx-4 px-4 md:mx-0 md:px-0">
        <Chip on={kind === "전체"} onClick={() => setKind("전체")}>전체 {mine.length}</Chip>
        {(Object.keys(RULE_KIND) as (keyof typeof RULE_KIND)[]).map((k) => { const n = mine.filter((r) => r.kind === k).length; return n > 0 && <Chip key={k} on={kind === k} onClick={() => setKind(k)}>{RULE_KIND[k].label} {n}</Chip>; })}
      </div>
      <div className="grid md:grid-cols-2 gap-3">
        {rules.map((r) => {
          const led = cm?.rules.find((x) => x.rule.id === r.id);
          const deny = r.stacking?.filter((s) => s.mode === "deny").map((s) => c.rules.find((x) => x.id === s.ruleId)?.name).filter(Boolean);
          const allow = r.stacking?.filter((s) => s.mode === "allow").map((s) => c.rules.find((x) => x.id === s.ruleId)?.name).filter(Boolean);
          const req = requiredFields({ ...c, rules: [r] }, uc?.variantId);
          // 한도(capGroupId)·횟수(countGroupId)를 함께 쓰는 다른 규칙 이름
          const mates = (k: "capGroupId" | "countGroupId") => (r[k] ? mine.filter((x) => x.id !== r.id && x[k] === r[k]).map((x) => x.name) : []);
          // 규칙 이름 끝 글자가 제각각(%·영문·한글)이라 조사(와/과) 없이 쓴다
          const shared = [mates("capGroupId").length && `월 한도 함께 쓰는 규칙: ${mates("capGroupId").join(", ")}`, mates("countGroupId").length && `횟수 함께 세는 규칙: ${mates("countGroupId").join(", ")}`].filter(Boolean).join(" · ");
          return (
            <Card key={r.id} className={cx(!r.supported && "opacity-80")}>
              <div className="flex items-start gap-2"><span className="flex-1 flex flex-col gap-0.5"><span className="text-body font-semibold text-strong">{r.name}</span><Cap>{RULE_KIND[r.kind].label} · 신뢰도 {Math.round(r.confidence * 100)}%{r.validFrom && ` · ${r.validFrom}~`}</Cap></span>
                {!r.supported ? <Badge>규칙 미지원</Badge> : led?.remain === 0 ? <Badge kind="missed">한도 소진</Badge> : deny?.length ? <Badge kind="warn">중복 불가</Badge> : allow?.length ? <Badge kind="success">중복 허용</Badge> : null}</div>
              {r.supported ? (
                <KV rows={[
                  ["대상", [r.target.categories?.map(ind).join("·"), r.target.merchants?.join("·")].filter(Boolean).join(" / ") || "전 가맹점"],
                  ["지급", pay(r)], ["조건", cond(r)], ["한도", limits(r)],
                  ...(shared ? [["통합", shared] as [string, string]] : []),
                  ...(r.target.excludes?.length ? [["제외", r.target.excludes.map(ind).join(", ")] as [string, string]] : []),
                  ...(deny?.length ? [["배타", `${deny.join(", ")} · 같은 결제에는 큰 쪽만 적용돼요`] as [string, string]] : []),
                  ...(allow?.length ? [["중복", `${allow.join(", ")} · 같은 결제에 함께 적용돼요`] as [string, string]] : []),
                  ...(r.monthOverrides?.length ? [["특례", r.monthOverrides.map((o) => `${o.months.join("·")}월 한도 +${num(o.extraCap)}원`).join(", ")] as [string, string]] : []),
                  ...(req.length ? [["필요 필드", req.map((f) => COND_LABEL[f]).join(", ")] as [string, string]] : []),
                ]} />
              ) : <Cap>{r.unsupportedReason} · 구조상 계산할 수 없어 제외했어요. 조건 미입력과는 달라요.</Cap>}
              <div className="px-3 py-2.5 rounded-btn bg-gray-50 text-caption text-muted">원문: “{r.rawText}”</div>
            </Card>
          );
        })}
      </div>
    </Screen>
  );
}
