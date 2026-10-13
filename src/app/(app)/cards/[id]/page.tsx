"use client";
import { use, useState } from "react";
import { useRouter } from "next/navigation";
import { Screen } from "@/components/shell";
import { Badge, Button, Cap, Card, CardTitle, cx, EmptyState, Field, Icon, Input, KV, ListRow, Num, Progress, RefBadge, Select, Sheet, StatTile, TextLink, won } from "@/components/ui";
import { num } from "@/lib/format";
import { BarList, ColumnChart, DataTable, ViewToggle, type View } from "@/components/charts";
import { useStore } from "@/lib/store";
import { cardLabel, isCustomCardId, PERK_KIND, spendProgress } from "@/lib/data/cards";
import { INDUSTRY } from "@/lib/data/merchants";
import { CHART_COLORS } from "@/lib/chart";
import { CYCLE_DAYS, fmtYm, monthSpend, prevYm, resolveTier, spendOverrideOf, spendWindowLabel, tierLabel } from "@/lib/engine";
import type { UserCard } from "@/lib/types";
import { cardBenefit, cardIndustryRows, removeCardMessage } from "../card-stats";

const mLabel = (ym: string) => `${Number(ym.slice(5))}월`;
const BENEFIT_COLOR = CHART_COLORS[0]; // 보라 = 혜택

export default function CardDetailPage({ params }: PageProps<"/cards/[id]">) {
  const { id } = use(params);
  const router = useRouter();
  const { userCards, calc, calcFor, month, txns, today, catalog, loading, updateUserCard, removeUserCard, removeCustomCard } = useStore();
  const c = catalog.find((x) => x.id === id); const uc = userCards.find((u) => u.cardId === id); const cm = calc.cards[id];
  const [adjust, setAdjust] = useState(false);
  const [val, setVal] = useState(0);
  const [indView, setIndView] = useState<View>("그래프");
  const [trendView, setTrendView] = useState<View>("그래프");
  if (!c || !uc || !cm) return <Screen title="카드 상세" back="/cards">{loading ? <Cap className="py-12 text-center">불러오는 중이에요</Cap> : <EmptyState title="등록되지 않은 카드예요" action={<Button variant="secondary" size="md" href="/cards">내 카드로</Button>} />}</Screen>;

  const custom = isCustomCardId(id);
  const noTier = c.tiers.length === 1;
  const p = spendProgress(txns, c, uc, month, today); // 지금 쌓고 있는 실적 창 (사이클 카드는 마감된 창을 건너뜀)
  const mine = c.rules.filter((r) => !r.variantId || r.variantId === uc.variantId); // 내 패키지의 규칙만
  const supported = mine.filter((r) => r.supported);
  const unsupported = mine.filter((r) => !r.supported);

  // 전월 실적 보정: 엔진은 보정값을 이 달(spendTierOverrideYm)에만 쓴다. 계산값은 보정과 따로 다시 세어 비교할 수 있게 한다
  const computed = monthSpend(txns, id, prevYm(month), c, uc.statementCycleDay);
  const override = spendOverrideOf(uc, month); // 엔진과 같은 기준 (Ym 없는 예전 값은 모든 달에 적용)
  const overridden = override !== undefined;
  const otherYm = !overridden && uc.spendTierOverride !== undefined ? uc.spendTierOverrideYm : undefined; // 다른 달에 저장한 보정 (보정은 카드당 한 달치만)
  const prevLabel = spendWindowLabel(prevYm(month), uc.statementCycleDay);

  // 이번 달 요약 · 업종별 · 최근 6개월 (표와 그래프가 같은 행을 쓴다)
  const rows = cardIndustryRows(txns, calc, id);
  const bars = rows.filter((r) => r.amount > 0); // 막대는 양수만. 환불로 0원 이하가 된 업종은 표에만 — 그래프 아래에 몇 개 빠졌는지 알린다
  const sum = rows.reduce((s, r) => ({ amount: s.amount + r.amount, count: s.count + r.count, benefit: s.benefit + r.benefit, missed: s.missed + r.missed }), { amount: 0, count: 0, benefit: 0, missed: 0 });
  const months = [5, 4, 3, 2, 1, 0].map((n) => { let m = month; for (let i = 0; i < n; i++) m = prevYm(m); return m; });
  const trend = months.map((ym) => { const k = calcFor(ym); return { key: ym, ym, tier: k.cards[id]?.tier, ...cardBenefit(k, id) }; });

  const remove = () => {
    if (!confirm(removeCardMessage(cardLabel(id), custom, uc))) return;
    if (custom) removeCustomCard(id); else removeUserCard(id);
    router.push("/cards");
  };

  return (
    <Screen title="카드 상세" back="/cards" right={<Button variant="ghost" size="md" className="text-red-700" onClick={remove}>{custom ? "카드 삭제" : "등록 해제"}</Button>}>
      <div className="-mx-4 -mt-4 md:mx-0 md:mt-0 md:rounded-xl bg-violet-700 text-white px-5 pt-4 pb-6 md:p-6 flex flex-col gap-4">
        <div className="flex flex-col gap-1"><span className="text-overline text-violet-200">{c.issuer} · {c.type === "credit" ? "신용" : "체크"}{custom ? " · 직접 추가" : ""}</span><span className="text-h1 tracking-title">{c.name}</span>{uc.variantId && <Cap className="text-violet-100">{c.variants?.find((v) => v.id === uc.variantId)?.name}</Cap>}</div>
        <div className="flex flex-col gap-2">
          <div className="flex justify-between gap-2 text-caption text-violet-100"><span>{p.label} {noTier ? "이용액" : `실적 · ${mLabel(p.forYm)} 구간용`} (근사치)</span><span className="text-white font-semibold whitespace-nowrap">{num(p.spend)}{p.nextTier ? ` / ${num(p.nextTier.min)}` : ""}원</span></div>
          <div className="h-2 rounded-full bg-white/20 overflow-hidden"><i className="block h-full bg-white rounded-full" style={{ width: `${p.pct}%` }} /></div>
          <div className="flex justify-between items-center gap-2">
            <Cap className="text-violet-100">{noTier ? "실적 조건 없음" : `${mLabel(month)} 혜택은 전월 ${tierLabel(cm.tier)} 구간${overridden ? " (보정)" : ""} · ${p.closed ? "이 기간은 마감됐어요" : p.nextTier ? `다음 구간까지 ${won(p.nextTier.min - p.spend)}` : "최고 구간 달성"}`}</Cap>
            {!noTier && <button type="button" onClick={() => { setVal(override ?? computed); setAdjust(true); }} className="text-caption font-semibold underline flex-none">실적 보정</button>}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5 md:gap-4">
        <StatTile className="col-span-2 md:col-span-1" label={`${mLabel(month)} 이 카드 결제`} value={won(sum.amount)} sub={`${sum.count}건 · 환불은 빼고 셈`} />
        <StatTile tone="primary" label="받은 혜택" value={won(sum.benefit)} sub="참고값" />
        <StatTile tone="missed" label="놓친 혜택" value={won(sum.missed)} sub={sum.count === 0 ? "결제 없음" : sum.missed > 0 ? "다른 보유 카드였다면" : "이 카드가 최적이었어요"} />
      </div>

      <div className="grid md:grid-cols-2 gap-4 items-start">
        <Card>
          <CardTitle right={<ViewToggle value={indView} onChange={setIndView} />}>업종별 결제</CardTitle>
          {rows.length === 0 ? <Cap className="py-6 text-center">{fmtYm(month)}에는 이 카드로 결제한 내역이 없어요.</Cap> : indView === "그래프" ? (<>
            {bars.length > 0 && <BarList items={bars.map((r) => ({ key: r.key, label: r.label, value: r.amount, sub: <>{r.count}건 · 받은 혜택 <span className="text-benefit font-semibold">{won(r.benefit)}</span>{r.missed > 0 && <> · 놓친 혜택 <span className="text-amber-700">{won(r.missed)}</span></>}</> }))} />}
            {bars.length < rows.length && <Cap className={cx(bars.length === 0 && "py-6 text-center")}>환불로 금액이 0원 이하인 업종 {rows.length - bars.length}개는 표에서 확인해요.</Cap>}
          </>) : (
            <DataTable caption={`${fmtYm(month)} ${c.name} 업종별 결제 표`} minWidth={520} rows={rows} initialSort={{ key: "amount", dir: "desc" }}
              columns={[
                { key: "label", header: "업종", render: (r) => <span className="text-strong">{r.label}</span>, sortValue: (r) => r.label },
                { key: "amount", header: "금액", align: "right", render: (r) => won(r.amount), sortValue: (r) => r.amount },
                { key: "count", header: "건수", align: "right", render: (r) => `${r.count}건`, sortValue: (r) => r.count },
                { key: "benefit", header: "받은 혜택", align: "right", render: (r) => <span className="text-benefit">{won(r.benefit)}</span>, sortValue: (r) => r.benefit },
                { key: "missed", header: "놓친 혜택", align: "right", render: (r) => (r.missed > 0 ? <span className="text-amber-700">{won(r.missed)}</span> : "-"), sortValue: (r) => r.missed },
              ]}
              footer={["합계", won(sum.amount), `${sum.count}건`, won(sum.benefit), won(sum.missed)]} />
          )}
          <Cap>업종은 가맹점 기준이에요. 놓친 혜택은 결제마다 가장 유리한 보유 카드와의 차이를 더한 값이에요.</Cap>
          <TextLink href={`/transactions?card=${encodeURIComponent(id)}`} className="self-start">이 카드 거래 보기</TextLink>
        </Card>

        <Card>
          <CardTitle right={<ViewToggle value={trendView} onChange={setTrendView} />}>최근 6개월 받은 혜택</CardTitle>
          {trendView === "그래프" ? (
            <ColumnChart label={`${c.name} 최근 6개월 받은 혜택`} height={200} highlight={month}
              series={[{ key: "received", name: "받은 혜택", color: BENEFIT_COLOR }]}
              data={trend.map((t) => ({ key: t.ym, label: mLabel(t.ym), full: fmtYm(t.ym), values: { received: t.received } }))} />
          ) : (
            <DataTable caption={`${c.name} 최근 6개월 혜택 표`} minWidth={480} rows={[...trend].reverse()} rowClassName={(r) => (r.ym === month ? "bg-primary-soft" : undefined)}
              columns={[
                { key: "ym", header: "월", render: (r) => fmtYm(r.ym), sortValue: (r) => r.ym },
                { key: "tier", header: "적용 구간", render: (r) => (noTier ? "조건 없음" : r.tier ? tierLabel(r.tier) : "-") },
                { key: "received", header: "받은 혜택", align: "right", render: (r) => <span className="text-benefit">{won(r.received)}</span>, sortValue: (r) => r.received },
                { key: "missed", header: "놓친 혜택", align: "right", render: (r) => (r.missed > 0 ? <span className="text-amber-700">{won(r.missed)}</span> : "-"), sortValue: (r) => r.missed },
              ]}
              footer={["6개월 합계", "", won(trend.reduce((s, t) => s + t.received, 0)), won(trend.reduce((s, t) => s + t.missed, 0))]} />
          )}
          <Cap>달마다 그 달의 전월 실적 구간과 한도로 다시 계산한 참고값이에요.</Cap>
        </Card>
      </div>

      <div className="grid md:grid-cols-2 gap-4 items-start">
        <Card>
          <CardTitle right={<RefBadge />}>혜택 한도 · {fmtYm(month)}</CardTitle>
          <div className="flex flex-col gap-3.5">
            {cm.rules.map((r) => {
              const pct = r.cap ? (r.used / r.cap) * 100 : 0;
              const limitTxt = [r.cap !== undefined && `월 ${num(r.cap)}원`, r.limit?.dailyCount && `일 ${r.limit.dailyCount}회`, r.limit?.monthlyCount && `월 ${r.limit.monthlyCount}회`, r.limit?.yearlyCount && `연 ${r.limit.yearlyCount}회`].filter(Boolean).join(" · ");
              return (
                <div key={r.rule.id} className="flex flex-col gap-1.5">
                  <div className="flex justify-between items-baseline gap-2"><span className="text-label text-strong">{r.rule.name}</span><Cap className="flex-none">{r.limit ? limitTxt || "한도 없음" : "이 구간 혜택 없음"}</Cap></div>
                  {r.cap !== undefined && <Progress pct={pct} h={6} color={r.remain === 0 ? "bg-amber-500" : "bg-primary"} />}
                  <Cap className={r.remain === 0 ? "text-amber-700" : ""}>
                    {!r.limit ? `전월 실적 ${tierLabel(cm.tier)} 구간에는 제공되지 않아요` : r.cap !== undefined ? (r.remain === 0 ? "소진 · 다음 달 1일 초기화" : `잔여 ${num(r.remain!)}원 · ${r.monthCount}회 사용`) : `${r.monthCount}회 사용${r.rule.capGroupId ? " · 통합 한도 그룹" : ""}`}
                    {r.rule.capGroupId && r.cap !== undefined && " · 통합 한도 그룹"}
                  </Cap>
                </div>
              );
            })}
          </div>
        </Card>

        <div className="flex flex-col gap-4">
          <Card>
            <CardTitle right={<TextLink href={`/cards/${id}/rules`}>전체 보기</TextLink>}>혜택 규칙 {mine.length}개</CardTitle>
            {c.variants && (
              <Field label="패키지" hint="바꾸면 지난 달을 포함해 이 카드의 혜택을 모두 새 패키지로 다시 계산해요">
                <Select value={uc.variantId ?? ""} onChange={(e) => updateUserCard(id, { variantId: e.target.value || undefined })}>
                  {!uc.variantId && <option value="">패키지 선택</option>}
                  {c.variants.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                </Select>
              </Field>
            )}
            <div className="flex flex-col">
              {supported.slice(0, 4).map((r, i) => <ListRow key={r.id} title={r.name} sub={r.rawText.length > 48 ? r.rawText.slice(0, 48) + "…" : r.rawText} href={`/cards/${id}/rules`} last={i === Math.min(supported.length, 4) - 1 && unsupported.length === 0} />)}
              {unsupported.map((r, i) => <ListRow key={r.id} title={r.name} sub={r.unsupportedReason} right={<Badge>규칙 미지원</Badge>} last={i === unsupported.length - 1} />)}
            </div>
          </Card>
          {c.perks?.length ? (
            <Card>
              <CardTitle>정성 혜택 {c.perks.length}개</CardTitle>
              <Cap>금액으로 셈하지 않는 혜택이에요. 결제별 혜택 계산에는 들어가지 않아요.</Cap>
              <div className="flex flex-col">
                {c.perks.map((pk, i) => (
                  <div key={pk.id} className={cx("flex items-start gap-3 py-3", i < c.perks!.length - 1 && "border-b border-line")}>
                    <span className="w-9 h-9 rounded-md bg-primary-soft text-primary inline-flex items-center justify-center flex-none"><Icon name={PERK_KIND[pk.kind].icon} size={20} /></span>
                    <span className="flex-1 flex flex-col gap-0.5 min-w-0">
                      <span className="flex items-center gap-1.5 flex-wrap"><span className="text-label text-strong">{pk.name}</span><Badge>{PERK_KIND[pk.kind].label}</Badge></span>
                      <Cap>{pk.detail}</Cap>
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          ) : null}
          <Card>
            {custom ? (
              <div className="flex items-center gap-3"><Icon name="edit_note" size={20} className="text-muted" /><span className="flex-1 flex flex-col"><span className="text-label text-strong">직접 입력한 카드</span><Cap>검수 없이 입력한 혜택으로 계산해요 · 로그인하면 계정에, 데모 모드는 이 기기에만 저장돼요</Cap></span></div>
            ) : (
              <div className="flex items-center gap-3"><Icon name="verified" size={20} className="text-muted" /><span className="flex-1 flex flex-col min-w-0"><span className="text-label text-strong">출처 · {c.issuer} 상품 안내</span>{c.sourceUrl && <Cap className="truncate">{c.sourceUrl.replace(/^https?:\/\//, "")}</Cap>}<Cap>마지막 확인 {c.checkedAt.replace(/-/g, ". ")} · {c.reviewStatus === "approved" ? "관리자 검수 완료" : "검수 대기"}</Cap></span>{c.sourceUrl && <a href={c.sourceUrl} target="_blank" rel="noreferrer" aria-label="출처 열기"><Icon name="open_in_new" size={18} className="text-muted" /></a>}</div>
            )}
          </Card>
          <Card>
            <CardTitle>카드번호 앞 6자리 <Cap>(선택)</Cap></CardTitle>
            {/* 저장된 값이 바뀌면(다른 기기·DB 로딩) 입력칸을 다시 채운다 */}
            <BinField key={uc.bin ?? ""} uc={uc} others={userCards.filter((u) => u.cardId !== id).map((u) => u.bin).filter(Boolean) as string[]} onSave={(bin) => updateUserCard(id, { bin })} />
          </Card>
          <Card>
            <CardTitle>전월 실적 산정</CardTitle>
            <Field label="청구 사이클" hint={uc.statementCycleDay ? `${prevLabel}에 쓴 금액이 ${mLabel(month)} 혜택의 전월 실적이에요` : "카드사 명세서 기준일이 매월 1일이 아니면 골라주세요"}>
              <Select value={uc.statementCycleDay ?? ""} onChange={(e) => updateUserCard(id, { statementCycleDay: e.target.value ? Number(e.target.value) : undefined })}>
                <option value="">달력 월 (1일~말일)</option>
                {CYCLE_DAYS.map((d) => <option key={d} value={d}>매월 {d}일 시작</option>)}
              </Select>
            </Field>
            {!noTier && (
              <KV keyW="w-24" rows={[
                ["카드셈 계산값", `${won(computed)} (${prevLabel} 결제 기준)`],
                ["보정값", overridden ? `${won(override)}${uc.spendTierOverrideYm ? ` · ${fmtYm(uc.spendTierOverrideYm)}에만 적용` : ""}` : otherYm ? `없음 · ${fmtYm(otherYm)}에 ${won(uc.spendTierOverride!)}로 보정됨` : "없음"],
                [`${mLabel(month)} 적용 구간`, tierLabel(cm.tier)],
              ]} />
            )}
            <Cap>제외 업종: {c.spendExcludes.length ? c.spendExcludes.map((k) => INDUSTRY[k]?.label ?? k).join(", ") : "없음"} · 수입·현금·환불 제외 · 할부는 총액 · 근사치</Cap>
          </Card>
        </div>
      </div>

      <Sheet open={adjust} onClose={() => setAdjust(false)} title="실적 보정">
        <Cap>{fmtYm(month)} 혜택 구간을 정하는 전월 실적({prevLabel})을 카드사 앱 값으로 고쳐요. 이 달에만 적용되고 근사치 표시가 붙어요.{otherYm && ` 저장하면 ${fmtYm(otherYm)} 보정값은 지워져요.`}</Cap>
        <label className="flex flex-col gap-1.5"><span className="text-label text-body">카드사 앱 기준 전월 실적</span><Input inputMode="numeric" value={num(val)} onChange={(e) => setVal(Number(e.target.value.replace(/[^\d]/g, "")) || 0)} suffix="원" autoFocus /></label>
        <div className="flex items-center gap-3 px-3.5 py-3 rounded-md bg-gray-50"><span className="flex-1 flex flex-col"><span className="text-label text-strong">카드셈 계산값</span><Cap>입력한 결제 기준 · 보정과 무관</Cap></span><Num className="text-body">{won(computed)}</Num></div>
        <div className="flex items-center gap-3 px-3.5 py-3 rounded-md bg-gray-50"><span className="flex-1 flex flex-col"><span className="text-label text-strong">차이</span><Cap>보정 후 구간 {tierLabel(resolveTier(val, c.tiers))}</Cap></span><Num className={cx(val - computed >= 0 ? "text-amber-700" : "text-blue-700")}>{won(val - computed, true)}</Num></div>
        <div className="flex gap-2">
          <Button variant="secondary" className="flex-1" disabled={!overridden} onClick={() => { updateUserCard(id, { spendTierOverride: undefined, spendTierOverrideYm: undefined }); setAdjust(false); }}>보정 해제</Button>
          <Button className="flex-[2]" onClick={() => { updateUserCard(id, { spendTierOverride: val, spendTierOverrideYm: month }); setAdjust(false); }}>{mLabel(month)}에 보정 저장</Button>
        </div>
      </Sheet>
    </Screen>
  );
}

/* 카드번호 앞 6자리. 입력 중에는 저장하지 않고, 칸을 벗어날 때 정확히 6자리(또는 빈 값 = 해제)일 때만 저장한다.
 * (DB CHECK는 4~6자리지만 영수증 앞자리 대조가 정확하려면 6자리 전체가 필요) 다른 등록 카드와 같은 번호는 막는다 */
function BinField({ uc, others, onSave }: { uc: UserCard; others: string[]; onSave: (bin: string | undefined) => void }) {
  const [v, setV] = useState(uc.bin ?? "");
  const [touched, setTouched] = useState(false);
  const err = !v ? "" : v.length !== 6 ? "6자리를 모두 입력해 주세요" : others.includes(v) ? "다른 등록 카드와 같은 번호예요" : "";
  const blur = () => { setTouched(true); if (!err && v !== (uc.bin ?? "")) onSave(v || undefined); };
  return (
    <Field error={touched && err ? err : undefined} hint="영수증에 찍힌 카드번호 앞자리와 맞춰 결제 카드를 추론 없이 확정해요. 뒷자리는 저장하지 않아요.">
      <Input inputMode="numeric" maxLength={6} placeholder="예: 543210" value={v} error={touched && !!err} className="max-w-50"
        onChange={(e) => { setV(e.target.value.replace(/\D/g, "").slice(0, 6)); setTouched(false); }}
        onBlur={blur} onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} />
    </Field>
  );
}
