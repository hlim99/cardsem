"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Screen } from "@/components/shell";
import { Badge, Button, Cap, CardChip, cx, Icon, Sheet } from "@/components/ui";
import { useStore } from "@/lib/store";
import { cardSearch, isCustomCardId } from "@/lib/data/cards";
import { CYCLE_DAYS } from "@/lib/engine";
import type { CardProduct } from "@/lib/types";
import { removeCardMessage } from "../card-stats";

export default function AddCardPage() {
  const router = useRouter();
  const { userCards, addUserCard, removeUserCard, removeCustomCard, updateUserCard, today, catalog } = useStore();
  const [q, setQ] = useState("");
  const [pick, setPick] = useState<CardProduct | null>(null); // 옵션 패키지 선택
  const label = (c: CardProduct) => `${c.issuer.replace("카드", "")} ${c.name}`;
  const has = (id: string) => userCards.some((u) => u.cardId === id);
  // 전체 카드(대표 카드 먼저, 직접 추가 카드 포함). 검색하면 카드사·카드명으로 ("신한 Mr" → 신한카드 Mr.Life)
  const list = cardSearch(catalog, q);
  const cycleOf = (id: string) => userCards.find((u) => u.cardId === id)?.statementCycleDay;
  const add = (c: CardProduct, variantId?: string) => { addUserCard({ cardId: c.id, variantId, addedAt: today }); setPick(null); };
  // 해제하면 패키지·사이클·앞 6자리·보정이 모두 지워지므로 확인을 받는다. 직접 추가한 카드는 입력한 혜택까지 지운다
  const remove = (c: CardProduct) => {
    const custom = isCustomCardId(c.id);
    if (!confirm(removeCardMessage(label(c), custom, userCards.find((u) => u.cardId === c.id)))) return;
    if (custom) removeCustomCard(c.id); else removeUserCard(c.id);
  };

  return (
    <Screen title="보유 카드 등록" desc="등록한 카드의 혜택 규칙으로 결제마다 계산해요." back="/cards">
      <div className="max-w-180 w-full mx-auto flex flex-col gap-4">
        <label className="h-12 rounded-md bg-gray-100 flex items-center px-3.5 gap-2.5 focus-within:shadow-focus">
          <Icon name="search" size={20} className="text-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="카드사·카드명 검색" className="flex-1 min-w-0 bg-transparent outline-none focus-visible:shadow-none" autoFocus />
          {q && <button type="button" aria-label="지우기" onClick={() => setQ("")}><Icon name="close" size={18} className="text-muted" /></button>}
        </label>
        <Cap>{q.trim() ? `검색 결과 ${list.length}` : `전체 ${list.length}장`} · 승인 규칙이 있는 카드만 계산돼요</Cap>
        <div className="bg-white border border-line rounded-lg px-4 flex flex-col">
          {list.map((c, i) => (
            <div key={c.id} className={cx("flex items-center gap-3 py-3", i < list.length - 1 && "border-b border-line")}>
              <CardChip color={c.color} w={48} h={30} />
              <span className="flex-1 flex flex-col gap-0.5 min-w-0">
                <span className="text-body font-semibold text-strong truncate">{label(c)}</span>
                <Cap className="truncate">{c.type === "credit" ? "신용" : "체크"} · {isCustomCardId(c.id) ? "직접 추가 · 검수 없이 계산" : <>혜택 규칙 {c.rules.length}개 · {c.checkedAt.slice(5).replace("-", "/")} 확인{c.reviewStatus !== "approved" && " · 검수 대기"}</>}</Cap>
              </span>
              {has(c.id) && c.tiers.length > 1 && (
                <select value={cycleOf(c.id) ?? ""} onChange={(e) => updateUserCard(c.id, { statementCycleDay: e.target.value ? Number(e.target.value) : undefined })}
                  aria-label={`${c.name} 청구 사이클`} className="h-9 px-2 rounded-md border border-line bg-white text-caption text-body outline-none focus-visible:shadow-focus">
                  <option value="">달력 월</option>
                  {CYCLE_DAYS.map((d) => <option key={d} value={d}>매월 {d}일</option>)}
                </select>
              )}
              {has(c.id) ? <Button variant="primary" size="sm" icon="check" aria-pressed aria-label={`${label(c)} 등록됨 · 눌러서 해제`} onClick={() => remove(c)}>등록됨</Button> : <Button variant="tonal" size="sm" onClick={() => (c.variants ? setPick(c) : add(c))}>추가</Button>}
            </div>
          ))}
        </div>
        <div className="sticky bottom-0 md:static bg-page -mx-4 px-4 py-3 md:p-0 border-t md:border-0 border-line flex flex-col gap-3">
          <div className="flex gap-2 flex-wrap">{userCards.map((u) => { const c = catalog.find((x) => x.id === u.cardId); return c && <Badge key={u.cardId}>{label(c)}</Badge>; })}</div>
          <Button onClick={() => router.push("/home")} disabled={userCards.length === 0}>{userCards.length}장 등록하고 시작하기</Button>
        </div>
      </div>

      <Sheet open={!!pick} onClose={() => setPick(null)} title="패키지 선택">
        <Cap>{pick?.name}은 매월 앱에서 고른 패키지의 혜택만 적용돼요. 지금 쓰는 패키지를 골라주세요. 등록한 뒤 카드 상세에서 바꿀 수 있어요.</Cap>
        <div className="flex flex-col gap-2">
          {pick?.variants?.map((v) => (
            <button key={v.id} type="button" onClick={() => add(pick, v.id)} className="text-left flex items-center gap-3 px-4 py-3 rounded-md border border-line hover:border-violet-300 hover:bg-benefit-soft">
              <span className="flex-1 flex flex-col"><span className="text-label text-strong">{v.name}</span><Cap>{v.desc}</Cap></span><Icon name="chevron_right" size={20} className="text-muted" />
            </button>
          ))}
        </div>
      </Sheet>
    </Screen>
  );
}
