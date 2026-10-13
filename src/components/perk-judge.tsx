"use client";
/* 거래 상세의 "정성 혜택 판단" — 모델이 결제마다 (1) 받을 수 있는지 (2) 돈인지 상품·서비스인지 정하고, (3) 돈이면 금액·아니면 2줄 설명 */
import { Badge, Card, CardTitle, Cap, cx, Icon, Num, won } from "./ui";
import { useStore } from "@/lib/store";
import { usePerkJudgment } from "@/lib/ai/client";
import { cardById, PERK_KIND } from "@/lib/data/cards";
import type { PerkForm, Transaction } from "@/lib/types";

const FORM: Record<PerkForm, { label: string; kind: "benefit" | "info" | "success" | "gray" }> = {
  money: { label: "돈", kind: "benefit" }, goods: { label: "상품·이용권", kind: "info" }, service: { label: "서비스·자격", kind: "success" }, none: { label: "해당 없음", kind: "gray" },
};

export function PerkJudge({ t }: { t: Transaction }) {
  const { today } = useStore();
  const card = cardById(t.cardId);
  const perks = card?.perks ?? [];
  const j = usePerkJudgment(perks.length ? t : null, t.cardId, today);
  if (!card || perks.length === 0) return null;
  return (
    <Card className="gap-3.5">
      <CardTitle right={<Badge>{j.status === "error" ? "판단 실패" : j.status === "done" ? `OpenAI · ${j.model}` : "판단 중…"}</Badge>}>정성 혜택 판단</CardTitle>
      <Cap>금액으로 셈할 수 없는 혜택 {perks.length}개를 이 결제 기준으로 판단해요. 확률은 참고값이에요.</Cap>
      {j.error && <Cap className="text-amber-700">{j.error}</Cap>}
      <div className="flex flex-col">
        {perks.map((p, i) => {
          const r = j.judgments.find((x) => x.perkId === p.id);
          const ok = r ? r.eligible >= 0.5 : undefined;
          return (
            <div key={p.id} className={cx("flex items-start gap-3 py-3", i < perks.length - 1 && "border-b border-line", (j.status === "loading" || j.status === "idle") && "opacity-60")}>
              <span className={cx("w-9 h-9 rounded-md inline-flex items-center justify-center flex-none", ok ? "bg-success-soft text-green-700" : "bg-gray-100 text-muted")}><Icon name={PERK_KIND[p.kind].icon} size={20} /></span>
              <span className="flex-1 flex flex-col gap-1 min-w-0">
                <span className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-label text-strong">{p.name}</span>
                  {r && <Badge kind={ok ? "success" : "gray"} icon={ok ? "check" : "block"}>{ok ? "받을 수 있어요" : "이 결제로는 못 받아요"} · {Math.round(r.eligible * 100)}%</Badge>}
                  {r && ok && <Badge kind={FORM[r.form].kind}>{FORM[r.form].label}</Badge>}
                </span>
                {r && ok && r.form === "money" && (r.amount !== undefined ? <Num className="text-benefit">{won(r.amount)}</Num> : <Cap>금액은 카드사 기준으로 정해져요 (카드 데이터에 가치 없음)</Cap>)}
                {r && ok && r.form !== "money" && <Cap className="line-clamp-2">{r.summary}</Cap>}
                {(!r || !ok) && <Cap className="line-clamp-2">{p.detail}</Cap>}
              </span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
