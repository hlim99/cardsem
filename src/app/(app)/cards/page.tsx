"use client";
import Link from "next/link";
import { Screen, TopIconButton } from "@/components/shell";
import { Badge, Button, Cap, Card, cx, EmptyState, Progress, won } from "@/components/ui";
import { num } from "@/lib/format";
import { CardRow } from "@/components/domain";
import { useStore } from "@/lib/store";
import { tierLabel } from "@/lib/engine";
import { isCustomCardId, spendProgress } from "@/lib/data/cards";

export default function CardsPage() {
  const { userCards, calc, month, catalog, txns, today } = useStore();
  return (
    <Screen title="내 카드" desc="실적은 입력한 결제 기준 근사치예요. 카드사 청구와 다를 수 있어요." nav right={<><TopIconButton icon="download" href="/settings/export" label="엑셀로 내보내기" /><Button size="md" icon="add" href="/cards/add">카드 등록</Button></>}>
      <Cap className="md:hidden">실적은 입력한 결제 기준 근사치예요. 카드사 청구와 다를 수 있어요.</Cap>
      {userCards.length === 0 && <EmptyState icon="credit_card" title="등록된 카드가 없어요" desc="카드를 등록하면 결제마다 혜택을 계산해요." action={<Button size="md" href="/cards/add">카드 등록</Button>} />}
      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3 md:gap-4">
        {userCards.map((uc) => {
          const cm = calc.cards[uc.cardId]; const c = catalog.find((x) => x.id === uc.cardId);
          if (!cm || !c) return null;
          const p = spendProgress(txns, c, uc, month, today); // 사이클 카드는 마감된 창 대신 지금 쌓는 창
          const achieved = !p.nextTier;
          const noTier = c.tiers.length === 1;
          return (
            <Link key={uc.cardId} href={`/cards/${uc.cardId}`} className="block">
              <Card className="hover:border-violet-200 transition-colors h-full">
                <CardRow cardId={uc.cardId} big sub={`${c.type === "credit" ? "신용" : "체크"} · ${noTier ? "실적 조건 없음" : `전월 실적 ${tierLabel(cm.tier)} 구간`}${uc.variantId ? ` · ${c.variants?.find((v) => v.id === uc.variantId)?.name}` : ""}${isCustomCardId(c.id) ? " · 직접 추가" : ""}`}
                  right={noTier ? <Badge>조건 없음</Badge> : achieved ? <Badge kind="success">달성</Badge> : p.closed ? <Badge>마감</Badge> : <Badge kind="warn">{won(p.nextTier!.min - p.spend)} 남음</Badge>} />
                <div className="flex flex-col gap-1.5">
                  <div className="flex justify-between text-caption"><span className="text-muted">{p.label} 실적{noTier ? "" : ` · ${Number(p.forYm.slice(5))}월 구간용`}</span><span className="text-strong font-semibold">{num(p.spend)}{p.nextTier ? ` / ${num(p.nextTier.min)}` : "원"}</span></div>
                  <Progress pct={p.pct} color={noTier ? "bg-gray-300" : achieved ? "bg-success" : "bg-primary"} />
                </div>
                <div className="flex flex-col gap-1.5 pt-2 border-t border-line">
                  {cm.rules.slice(0, 4).map((r) => (
                    <div key={r.rule.id} className="flex justify-between gap-2 text-caption">
                      <span className="text-body truncate">{r.rule.name}</span>
                      <span className={cx("flex-none", r.remain === 0 ? "text-amber-700" : "text-muted")}>
                        {r.cap !== undefined ? (r.remain === 0 ? "소진" : <>잔여 <b className="text-strong">{num(r.remain!)}</b> / {num(r.cap)}</>) : r.limit ? (r.limit.monthlyCount ? `월 ${r.limit.monthlyCount}회 · ${r.monthCount}회` : "한도 없음") : "이 구간 혜택 없음"}
                      </span>
                    </div>
                  ))}
                  {cm.rules.length > 4 && <Cap>외 {cm.rules.length - 4}개 규칙</Cap>}
                </div>
              </Card>
            </Link>
          );
        })}
      </div>
    </Screen>
  );
}
