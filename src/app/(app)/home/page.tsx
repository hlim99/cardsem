"use client";
import Link from "next/link";
import { MonthPicker, Screen, TopIconButton } from "@/components/shell";
import { AiTitle, Badge, Button, Card, CardTitle, Cap, cx, Num, Progress, RefBadge, StatTile, TextLink, won } from "@/components/ui";
import { CardRow, TxnIcon, TxnRow } from "@/components/domain";
import { useStore } from "@/lib/store";
import { industryOf, prevYm, tierLabel, krw } from "@/lib/engine";
import { fmtPct, monthSummary, pctChange, deltaTone } from "@/lib/stats";
import { cardLabel, spendProgress } from "@/lib/data/cards";
import { fmtMd, num } from "@/lib/format";
import { useInsight } from "@/lib/ai/client";
import { deriveNotifications, useReadNotices } from "@/lib/notify";

export default function HomePage() {
  const { txns, categories, month, calc, calcFor, userCards, today, me, catalog } = useStore();
  const s = monthSummary(txns, month, categories);
  const p = monthSummary(txns, prevYm(month), categories);
  const prevCalc = calcFor(prevYm(month));
  const missedTop = calc.missedTop.slice(0, 3).map((m) => ({ ...m, t: txns.find((t) => t.id === m.txnId)! }));
  const recent = txns.filter((t) => t.date.startsWith(month)).sort((a, b) => (b.date + (b.paidAt ?? "")).localeCompare(a.date + (a.paidAt ?? ""))).slice(0, 4);
  // 알림은 보고 있는 달이 아니라 오늘이 속한 달 기준 (알림 화면과 같은 목록)
  const nowYm = today.slice(0, 7);
  const { read } = useReadNotices(me?.id);
  const unread = deriveNotifications({ calc: calcFor(nowYm), userCards, txns, month: nowYm, today }).some((n) => !read.has(n.id));
  const ml = month === nowYm ? "이번 달" : `${Number(month.slice(5))}월`;
  const expDiff = s.expense - p.expense;
  // 카페 판정은 엔진과 같은 업종 기준 (가맹점 업종이 없으면 이름 사전으로)
  const cafe = Object.entries(s.byMerchant).filter(([, v]) => industryOf(v.t) === "cafe");
  const cafeSum = cafe.reduce((a, [, v]) => a + v.sum, 0);
  const cafePrev = Object.entries(p.byMerchant).filter(([, v]) => industryOf(v.t) === "cafe").reduce((a, [, v]) => a + v.sum, 0);
  const bestMissed = calc.missedTop[0];
  // RPT-03: 집계값만 LLM에 보낸다. 실패하면 템플릿 문장
  // 반올림해 0%가 되면 "0% 줄었어요" 대신 "거의 같아요"
  const cafePct = Math.round(Math.abs(pctChange(cafeSum, cafePrev) ?? 0));
  const fallback = (cafePrev > 0 ? (cafePct === 0 ? `카페 지출이 지난달과 ${cafeSum === cafePrev ? "" : "거의 "}같아요. ` : `카페 지출이 지난달보다 ${cafePct}% ${cafeSum > cafePrev ? "늘었어요" : "줄었어요"}. `) : `${ml} 카페에 ${won(cafeSum)} 썼어요. `)
    + (calc.missedTop.length > 0 && bestMissed ? `결제 ${calc.missedTop.length}건은 다른 카드가 더 유리했어요. 가장 큰 건은 ${txns.find((t) => t.id === bestMissed.txnId)?.merchant}으로, ${cardLabel(bestMissed.bestCardId)}였다면 ${won(bestMissed.diff)} 더 받았어요.` : `${ml}은 모든 결제에서 최적 카드를 골랐어요.`);
  const insight = useInsight(`home:${month}`, {
    month, income: s.income, expense: s.expense, prevExpense: p.expense, net: s.net, receivedBenefit: calc.received, prevReceivedBenefit: prevCalc.received, missedBenefit: calc.missed,
    topCategories: Object.entries(s.byCategory).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, v]) => ({ name: categories.find((c) => c.id === k)?.name ?? k, amount: v })),
    missedTop: calc.missedTop.slice(0, 3).map((m) => { const t = txns.find((x) => x.id === m.txnId)!; return { merchant: t.merchant, amount: krw(t), usedCard: cardLabel(t.cardId), bestCard: cardLabel(m.bestCardId), diff: m.diff }; }),
    cafe: { count: cafe.reduce((a, [, v]) => a + v.count, 0), sum: cafeSum, prevSum: cafePrev },
    cardsExhausted: userCards.flatMap((uc) => (calc.cards[uc.cardId]?.rules ?? []).filter((r) => r.remain === 0).map((r) => `${cardLabel(uc.cardId)} ${r.rule.name}`)),
  }, fallback);

  return (
    <Screen
      title={<MonthPicker />} desc={`${Number(today.slice(5, 7))}월 ${Number(today.slice(8))}일 기준 · 혜택 금액은 참고값`} nav
      right={<>
        <span className="hidden md:flex gap-2"><Button variant="secondary" size="md" icon="photo_camera" href="/receipt">영수증 등록</Button><Button size="md" icon="add" href="/transactions/new">거래 추가</Button></span>
        <TopIconButton icon="notifications" href="/notifications" label="알림" dot={unread} />
      </>}
    >
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 md:gap-4">
        {/* 지출은 줄면 좋음(초록)·늘면 나쁨(빨강), 같거나 비교 불가면 회색 — 월간 요약과 같은 규칙 */}
        <StatTile label={`${ml} 지출`} value={won(s.expense)} sub={p.expense ? `전월 대비 ${fmtPct(pctChange(s.expense, p.expense))} · ${won(Math.abs(expDiff))}` : "전월 기록 없음"} subTone={!p.expense ? "text-muted" : deltaTone(expDiff, false)} />
        <StatTile label={`${ml} 수입`} value={won(s.income)} sub={`순수입 ${won(s.net)}`} />
        <StatTile label="받은 혜택" value={won(calc.received)} sub={`전월 대비 ${won(calc.received - prevCalc.received, true)} · 참고값`} tone="primary" />
        <StatTile label="놓친 혜택" value={won(calc.missed)} sub={calc.missed > 0 ? `결제 ${calc.missedTop.length}건 · 다른 카드였다면 더 받았어요` : "이번 달 카드 조합이 최적이에요"} tone="missed" />
      </div>

      <div className="grid md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] gap-4 md:gap-5 items-start">
        <div className="flex flex-col gap-4 md:gap-5 min-w-0">
          <Card>
            <CardTitle right={<><Cap className="hidden md:inline">실적은 근사치예요</Cap><TextLink href="/cards">내 카드</TextLink></>}>카드별 실적 · 한도</CardTitle>
            {userCards.length === 0 && <Cap>등록된 카드가 없어요. <TextLink href="/cards/add">카드를 등록</TextLink>하면 결제마다 혜택을 계산해요.</Cap>}
            {/* 메인 열이 좁아(max-w-content의 1.5fr) 여러 열로 나누면 카드 이름이 가려진다 → 한 줄에 카드 하나 */}
            <div className="grid gap-3">
              {userCards.map((uc) => {
                const cm = calc.cards[uc.cardId]; const c = catalog.find((x) => x.id === uc.cardId);
                if (!cm || !c) return null;
                // 카드 목록·상세·알림과 같은 실적 창: 사이클 카드는 이미 마감된 창 대신 오늘 결제가 들어가는 창, 지난달은 마감
                const p = spendProgress(txns, c, uc, month, today);
                const achieved = !p.nextTier;
                const noTier = c.tiers.length === 1;
                return (
                  <div key={uc.cardId} className="flex flex-col gap-2.5 lg:p-3.5 lg:rounded-md lg:border lg:border-line">
                    <CardRow cardId={uc.cardId} sub={noTier ? "실적 조건 없음" : `전월 실적 ${tierLabel(cm.tier)} 구간`}
                      right={noTier ? <Badge>조건 없음</Badge> : achieved ? <Badge kind="success">달성</Badge> : p.closed ? <Badge>마감</Badge> : <Badge kind="warn">{won(p.nextTier!.min - p.spend)} 남음</Badge>} />
                    <div className="flex flex-col gap-1.5">
                      <div className="flex justify-between gap-2 text-caption"><span className="text-muted">{p.label} 실적{noTier ? "" : ` · ${Number(p.forYm.slice(5))}월 구간용`}</span><span className="text-strong font-semibold">{num(p.spend)}{p.nextTier ? ` / ${num(p.nextTier.min)}` : "원"}</span></div>
                      <Progress pct={p.pct} color={noTier ? "bg-gray-300" : achieved ? "bg-success" : "bg-primary"} h={6} />
                    </div>
                    <div className="flex flex-col gap-1 pt-2 border-t border-line">
                      {cm.rules.filter((r) => r.cap !== undefined || r.limit?.monthlyCount).slice(0, 3).map((r) => (
                        <div key={r.rule.id} className="flex justify-between gap-2 text-caption"><span className="text-body truncate">{r.rule.name}</span>
                          <span className={cx("flex-none", r.remain === 0 ? "text-amber-700" : "text-muted")}>{r.cap !== undefined ? (r.remain === 0 ? "소진" : <>잔여 <b className="text-strong">{num(r.remain!)}</b>/{num(r.cap)}</>) : `월 ${r.limit?.monthlyCount}회 · ${r.monthCount}회 사용`}</span></div>
                      ))}
                      {cm.rules.every((r) => r.cap === undefined && !r.limit?.monthlyCount) && <Cap>한도 없음</Cap>}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          <Card>
            <CardTitle>놓친 혜택이 큰 결제</CardTitle>
            {missedTop.length === 0 ? <Cap>이번 달은 모든 결제에서 최적 카드를 썼어요.</Cap> : (
              <div className="flex flex-col">
                {missedTop.map(({ t, diff, bestCardId }, i) => (
                  <Link key={t.id} href={`/transactions/${t.id}`} className={cx("flex items-center gap-3 py-3 hover:bg-gray-50 -mx-2 px-2 rounded-md", i < missedTop.length - 1 && "border-b border-line")}>
                    <TxnIcon t={t} />
                    <span className="flex-1 flex flex-col gap-0.5 min-w-0"><span className="text-body font-semibold text-strong truncate">{t.merchant} · {won(krw(t))}</span><span className="text-caption text-muted truncate">{fmtMd(t.date)} · {cardLabel(t.cardId)} 사용 → {cardLabel(bestCardId)}이었다면</span></span>
                    <Num className="text-missed">{won(diff, true)}</Num>
                  </Link>
                ))}
              </div>
            )}
          </Card>
        </div>

        <div className="flex flex-col gap-4 md:gap-5 min-w-0">
          <Card>
            <AiTitle note={insight.status === "loading" ? "생성 중…" : insight.status === "ai" ? "집계값만 사용" : "템플릿 문장"}>AI 인사이트</AiTitle>
            <p className={cx("m-0 text-body", insight.status === "loading" && "opacity-60")}>{insight.text}</p>
            {insight.error && <Cap className="text-amber-700">{insight.error}</Cap>}
            <div className="flex gap-2 flex-wrap">{insight.actions.map((a) => <Badge key={a} kind="benefit">{a}</Badge>)}</div>
          </Card>

          <Card>
            <CardTitle right={<TextLink href="/transactions">전체</TextLink>}>최근 거래</CardTitle>
            <div className="flex flex-col">
              {recent.length === 0 && <Cap className="py-4">{ml}은 거래가 없어요. <TextLink href="/transactions/new">거래를 추가</TextLink>해 보세요.</Cap>}
              {recent.map((t, i) => <TxnRow key={t.id} t={t} result={calc.byTxn[t.id]} showDate last={i === recent.length - 1} href={`/transactions/${t.id}`} />)}
            </div>
          </Card>
          <div className="flex items-center gap-2 text-caption text-muted px-1"><RefBadge />혜택 금액은 참고용 계산값이에요. 실제 청구 할인액과 다를 수 있어요.</div>
        </div>
      </div>
    </Screen>
  );
}
