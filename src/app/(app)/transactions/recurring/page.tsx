"use client";
import { useState } from "react";
import { Screen, TopAction } from "@/components/shell";
import { Button, Card, CardTitle, Cap, cx, EmptyState, Field, Input, ListRow, Note, Seg, Select, Sheet, Toggle, won } from "@/components/ui";
import { useStore } from "@/lib/store";
import { cardById, cardLabel } from "@/lib/data/cards";
import { categoryForIndustry, categoryPath, classifyMerchant } from "@/lib/data/merchants";
import { cycleLabel, dueDates, nextFrom, WEEKDAYS } from "@/lib/recurring";
import type { RecurringRule } from "@/lib/types";

type Draft = Omit<RecurringRule, "id">;
const isCard = (d: Pick<Draft, "payType" | "cardId">) => !!d.cardId && (d.payType === "credit" || d.payType === "check");
// 카드 결제인데 카드가 없으면(직접 추가 카드를 지운 경우) "카드 미지정"
const payLabel = (d: Pick<Draft, "payType" | "cardId">) => (d.payType === "cash" ? "현금" : d.payType === "transfer" ? "계좌이체" : d.cardId ? cardLabel(d.cardId) : "카드 미지정");
const weekday = (s: string) => new Date(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)).getDay();

/* TRX-09 반복 거래. 규칙을 저장하면 시작일~오늘 사이의 회차를 바로 거래로 만들고, 그 뒤로는 앱을 열 때마다 지난 회차를 채운다 (lib/recurring.ts) */
export default function RecurringPage() {
  const { recurring, userCards, categories, today, addRecurring, updateRecurring, deleteRecurring } = useStore();
  // auto: 가맹점 이름으로 카테고리를 골라 줄지 (새 규칙에서 카테고리를 직접 고르기 전까지만)
  const [edit, setEdit] = useState<{ id?: string; d: Draft; auto: boolean } | null>(null);
  const firstCard = userCards[0]?.cardId;
  const cardPay = (id: string) => (cardById(id)?.type === "check" ? "check" : "credit");
  const openNew = () => setEdit({ auto: true, d: {
    type: "expense", amount: 0, merchant: "", categoryId: categoryForIndustry(categories, undefined, "expense"),
    payType: firstCard ? cardPay(firstCard) : "cash", cardId: firstCard, cycle: "monthly", day: +today.slice(8, 10), startDate: today, isAutoPay: true,
  } });
  const set = (p: Partial<Draft>) => setEdit((e) => e && { ...e, d: { ...e.d, ...p } });

  const d = edit?.d;
  const editing = edit?.id ? recurring.find((r) => r.id === edit.id) : undefined;
  const ok = !!d && d.amount > 0 && !!d.merchant.trim() && !!d.startDate && (!d.endDate || d.endDate >= d.startDate)
    && (isCard(d) || (d.payType !== "credit" && d.payType !== "check")); // 카드 결제면 카드를 골라야 저장
  // 저장하면 바로 만들어질 지난 회차 (수정이면 마지막 생성일의 다음 달·주부터 — 스토어와 같은 계산)
  const past = ok ? dueDates(d, nextFrom({ ...d, lastGeneratedAt: editing?.lastGeneratedAt }), today) : [];
  const save = () => {
    if (!edit || !ok) return;
    const v = { ...edit.d, merchant: edit.d.merchant.trim() };
    if (edit.id) updateRecurring(edit.id, v); else addRecurring(v);
    setEdit(null);
  };
  const remove = () => {
    if (edit?.id && confirm("이 반복 거래를 지울까요? 이미 만든 거래는 그대로 남아요.")) { deleteRecurring(edit.id); setEdit(null); }
  };
  const cats = d ? categories.filter((c) => c.type === d.type) : [];

  return (
    <Screen title="반복 거래" desc="월세·구독·급여처럼 정해진 날 반복되는 거래를 자동으로 만들어요." back right={<TopAction onClick={openNew}>추가</TopAction>}>
      <div className="max-w-[720px] w-full mx-auto flex flex-col gap-4">
        <Note icon="event_repeat" tone="blue">앱을 열 때 오늘까지 지난 회차를 거래로 만들어요. 29~31일로 정하면 그 날이 없는 달은 말일에 만들어요. 규칙을 지워도 이미 만든 거래는 남아요.</Note>
        <Card pad="px-4 py-1" className="gap-0">
          {recurring.length === 0 ? (
            <EmptyState icon="event_repeat" title="반복 거래가 없어요" desc="한 번 등록하면 매달·매주 거래를 직접 입력하지 않아도 돼요." action={<Button size="md" icon="add" onClick={openNew}>반복 거래 추가</Button>} />
          ) : (
            <>
              <div className="pt-3 pb-1"><CardTitle>반복 거래 {recurring.length}건</CardTitle></div>
              {recurring.map((r, i) => (
                <ListRow key={r.id} icon={r.type === "income" ? "payments" : "event_repeat"} title={`${r.merchant} · ${won(r.amount)}`}
                  sub={[cycleLabel(r), payLabel(r), r.isAutoPay && "자동납부", r.endDate && (r.endDate < today ? "종료됨" : `${r.endDate}까지`), r.lastGeneratedAt && `마지막 생성 ${r.lastGeneratedAt}`].filter(Boolean).join(" · ")}
                  onClick={() => setEdit({ id: r.id, d: r, auto: false })} last={i === recurring.length - 1} />
              ))}
            </>
          )}
        </Card>
      </div>

      <Sheet open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? "반복 거래 수정" : "반복 거래 추가"}>
        {d && (
          <div className="flex flex-col gap-4">
            <Seg items={["지출", "수입"] as const} value={d.type === "expense" ? "지출" : "수입"} onChange={(v) => {
              const type = v === "지출" ? "expense" : "income";
              set({ type, categoryId: categoryForIndustry(categories, type === "expense" ? classifyMerchant(d.merchant) : undefined, type), ...(type === "expense" ? { payType: firstCard ? cardPay(firstCard) : "cash", cardId: firstCard } : { payType: "transfer", cardId: undefined, isAutoPay: false }) });
            }} />
            <Field label={d.type === "expense" ? "가맹점" : "내용"}>
              <Input value={d.merchant} placeholder={d.type === "expense" ? "넷플릭스" : "급여"} onChange={(e) => {
                const merchant = e.target.value;
                set(edit?.auto ? { merchant, categoryId: categoryForIndustry(categories, d.type === "expense" ? classifyMerchant(merchant) : undefined, d.type) } : { merchant });
              }} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="금액"><Input inputMode="numeric" value={d.amount ? d.amount.toLocaleString("ko-KR") : ""} placeholder="0" suffix="원" onChange={(e) => set({ amount: Number(e.target.value.replace(/[^\d]/g, "")) || 0 })} /></Field>
              <Field label="카테고리">
                <Select value={d.categoryId} onChange={(e) => { setEdit((x) => x && { ...x, auto: false }); set({ categoryId: e.target.value }); }}>
                  {cats.map((c) => <option key={c.id} value={c.id}>{categoryPath(categories, c.id)}</option>)}
                </Select>
              </Field>
            </div>
            <Field label={d.type === "expense" ? "결제수단" : "입금 수단"}>
              <Select value={isCard(d) ? `card:${d.cardId}` : d.payType} onChange={(e) => {
                const v = e.target.value;
                set(v.startsWith("card:") ? { payType: cardPay(v.slice(5)), cardId: v.slice(5) } : { payType: v as Draft["payType"], cardId: undefined });
              }}>
                {d.type === "expense" && userCards.map((u) => <option key={u.cardId} value={`card:${u.cardId}`}>{cardLabel(u.cardId)}</option>)}
                {/* 카드를 지웠거나 보유 목록에서 뺀 규칙: 선택지가 없으면 브라우저가 첫 카드를 고른 것처럼 보여서 지금 상태를 그대로 보여 준다 */}
                {(d.payType === "credit" || d.payType === "check") && !userCards.some((u) => u.cardId === d.cardId) && (
                  <option value={isCard(d) ? `card:${d.cardId}` : d.payType} disabled>{d.cardId ? cardLabel(d.cardId) : "카드 미지정"}</option>
                )}
                {/* 지출 결제수단에는 계좌이체를 두지 않는다 (입금·예전 규칙만) */}
                {(d.type !== "expense" || d.payType === "transfer") && <option value="transfer">계좌이체</option>}<option value="cash">현금</option>
              </Select>
            </Field>

            <div className="flex flex-col gap-2">
              <span className="text-label text-body">주기</span>
              <Seg items={["매월", "매주"] as const} value={d.cycle === "monthly" ? "매월" : "매주"} onChange={(v) => set(v === "매월" ? { cycle: "monthly", day: +d.startDate.slice(8, 10) || 1 } : { cycle: "weekly", day: weekday(d.startDate) || 0 })} />
              {d.cycle === "monthly" ? (
                <div className="flex items-center gap-2 text-label text-body">매월 <Select aria-label="날짜" value={d.day} onChange={(e) => set({ day: Number(e.target.value) })} className="w-24 h-10">{Array.from({ length: 31 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}</Select> 일</div>
              ) : (
                <div className="flex gap-1.5" role="group" aria-label="요일">
                  {WEEKDAYS.split("").map((w, i) => (
                    <button key={w} type="button" aria-pressed={d.day === i} onClick={() => set({ day: i })} className={cx("w-10 h-10 rounded-full text-label font-semibold", d.day === i ? "bg-primary text-white" : "border border-line-strong text-body")}>{w}</button>
                  ))}
                </div>
              )}
              {d.cycle === "monthly" && d.day >= 29 && <Cap>{d.day}일이 없는 달은 말일에 한 번 만들어요 (2월은 28일, 윤년 29일)</Cap>}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="시작일"><Input type="date" value={d.startDate} onChange={(e) => set({ startDate: e.target.value })} /></Field>
              <Field label="종료일" hint="비우면 계속" error={d.endDate && d.endDate < d.startDate ? "시작일보다 뒤여야 해요" : undefined}><Input type="date" value={d.endDate ?? ""} onChange={(e) => set({ endDate: e.target.value || undefined })} /></Field>
            </div>
            {d.type === "expense" && (
              <div className="flex items-center gap-3">
                <span className="flex-1 flex flex-col gap-0.5"><span className="text-label text-strong">자동납부</span><Cap>통신·구독 혜택 규칙의 조건으로 쓰여요</Cap></span>
                <Toggle on={!!d.isAutoPay} onChange={(v) => set({ isAutoPay: v })} label="자동납부" />
              </div>
            )}
            {past.length > 0 && <Note icon="history" tone="violet">저장하면 지난 회차 {past.length}건({past[0]}{past.length > 1 ? ` ~ ${past[past.length - 1]}` : ""})을 거래로 바로 만들어요.</Note>}

            <div className="flex gap-2">
              {edit?.id && <Button variant="danger" className="flex-1" onClick={remove}>삭제</Button>}
              <Button className="flex-[2]" disabled={!ok} onClick={save}>저장</Button>
            </div>
          </div>
        )}
      </Sheet>
    </Screen>
  );
}
