"use client";
import { Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { MonthPicker, Screen, TopIconButton, ViewSwitch } from "@/components/shell";
import { Button, Cap, Chip, Icon, Note, Sheet, won } from "@/components/ui";
import { DayHead, TxnRow } from "@/components/domain";
import { useStore } from "@/lib/store";
import { cardLabel } from "@/lib/data/cards";
import { categoryPath } from "@/lib/data/merchants";
import { netExpense, signedSum } from "@/lib/data/txn-rules";
import { isUnclassified, topCategory } from "@/lib/stats";
import { PAY_TYPE as PAY } from "@/lib/labels";

type Kind = "전체" | "지출" | "수입";

function TransactionList() {
  const router = useRouter();
  const sp = useSearchParams();
  const { txns, month, calc, categories, userCards } = useStore();
  const [kind, setKind] = useState<Kind>("전체");
  const [pay, setPay] = useState<keyof typeof PAY | null>(null);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);

  // 카테고리·카드·업종 미분류 필터는 주소(?cat=, ?card=a,b, ?unclassified=1)에 둔다 — 월간 요약·통계·카드 상세에서 링크로 들어오고, 새로고침해도 유지
  const cat = sp.get("cat");
  // 카드는 여러 장 고를 수 있다 (?card=a,b). 다른 화면 링크는 한 장만 넘긴다
  const cards = useMemo(() => sp.get("card")?.split(",").filter(Boolean) ?? [], [sp]);
  const toggleCard = (id: string) => setQuery("card", (cards.includes(id) ? cards.filter((c) => c !== id) : [...cards, id]).join(",") || null);
  const unc = sp.get("unclassified") === "1";
  const setQuery = (k: "cat" | "card" | "unclassified", v: string | null) => {
    const p = new URLSearchParams(sp.toString());
    if (v) p.set(k, v); else p.delete(k);
    const s = p.toString();
    router.replace(s ? `/transactions?${s}` : "/transactions", { scroll: false });
  };
  // 수입에는 결제 카드가 없다 → 수입을 고르면 카드 필터를 풀고 카드 칩을 끈다
  const pickKind = (k: Kind) => { setKind(k); if (k === "수입" && cards.length) setQuery("card", null); };
  const noCard = kind === "수입";
  const reset = () => { setKind("전체"); setPay(null); router.replace("/transactions", { scroll: false }); };

  const monthTxns = useMemo(() => txns.filter((t) => t.date.startsWith(month)), [txns, month]);
  const uncCount = monthTxns.filter(isUnclassified).length;
  const list = useMemo(() => monthTxns
    .filter((t) => kind === "전체" || (kind === "지출" ? t.type === "expense" : t.type === "income"))
    .filter((t) => !cards.length || (!!t.cardId && cards.includes(t.cardId)))
    // 상위 카테고리면 하위까지, 하위 카테고리 id가 오면 그 카테고리만
    .filter((t) => !cat || t.categoryId === cat || topCategory(categories, t.categoryId) === cat)
    .filter((t) => !pay || t.payType === pay)
    .filter((t) => !unc || isUnclassified(t))
    .filter((t) => !q || [t.merchant, t.memo, ...(t.items ?? [])].some((s) => s?.toLowerCase().includes(q.trim().toLowerCase())))
    .sort((a, b) => (b.date + (b.paidAt ?? "")).localeCompare(a.date + (a.paidAt ?? ""))), [monthTxns, kind, cards, cat, pay, unc, q, categories]);

  const byDay = list.reduce<Record<string, typeof list>>((m, t) => ((m[t.date] ??= []).push(t), m), {});
  const benefit = list.reduce((s, t) => s + (calc.byTxn[t.id]?.mine?.total ?? 0), 0);
  const missed = list.reduce((s, t) => s + (calc.byTxn[t.id]?.diff ?? 0), 0);
  const tops = categories.filter((c) => !c.parentId && c.type === "expense");

  const chips = (
    <>
      <Chip icon="tune" onClick={() => setOpen(true)}>필터</Chip>
      {(["지출", "수입"] as Kind[]).map((k) => <Chip key={k} on={kind === k} x={kind === k} onClick={() => pickKind(kind === k ? "전체" : k)}>{k}</Chip>)}
      {(unc || uncCount > 0) && <Chip on={unc} x={unc} icon={unc ? undefined : "help"} onClick={() => setQuery("unclassified", unc ? null : "1")}>업종 미분류 {uncCount}건</Chip>}
      {userCards.map((uc) => <Chip key={uc.cardId} disabled={noCard} on={cards.includes(uc.cardId)} x={cards.includes(uc.cardId)} onClick={() => toggleCard(uc.cardId)}>{cardLabel(uc.cardId)}</Chip>)}
      {cards.filter((c) => !userCards.some((uc) => uc.cardId === c)).map((c) => <Chip key={c} on x onClick={() => toggleCard(c)}>{cardLabel(c)}</Chip>)}
      {cat && <Chip on x onClick={() => setQuery("cat", null)}>{categoryPath(categories, cat)}</Chip>}
      {pay && <Chip on x onClick={() => setPay(null)}>{PAY[pay]}</Chip>}
    </>
  );

  return (
    <Screen title={<MonthPicker />} nav
      right={<>
        <TopIconButton icon="search" href="/transactions/search" label="검색" />
        <TopIconButton icon="checklist" href="/transactions/bulk" label="일괄 편집" />
        <span className="hidden md:flex gap-2"><Button variant="secondary" size="md" icon="download" href="/settings/export">엑셀 내보내기</Button><Button size="md" icon="add" href="/transactions/new">거래 추가</Button></span>
      </>}>
      <ViewSwitch value="내역" />
      <div className="flex items-center gap-2 -mx-4 px-4 md:mx-0 md:px-0 overflow-x-auto no-scrollbar md:flex-wrap">
        <label className="hidden md:flex h-11 w-75 flex-none rounded-md bg-white border border-line-strong items-center px-3.5 gap-2.5 focus-within:border-line-focus focus-within:shadow-focus">
          <Icon name="search" size={20} className="text-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="가맹점·메모·품목 검색" className="flex-1 min-w-0 outline-none bg-transparent focus-visible:shadow-none" />
        </label>
        {chips}
      </div>
      {unc && <Note icon="help" tone="amber">업종을 알 수 없는 지출이에요. 카드 결제라면 업종 혜택을 매칭하지 못해요. 거래를 눌러 업종을 고르면 바로 다시 계산하고, 같은 가맹점은 다음부터 그 업종으로 분류해요.</Note>}
      <div className="flex justify-between text-caption text-muted flex-wrap gap-x-3">
        <span>{kind === "전체" ? "거래" : kind} {list.length}건{cards.length > 0 && ` · ${cards.map(cardLabel).join(", ")}`}</span>
        <span>지출 <b className="text-strong">{won(netExpense(list))}</b> · 혜택 <b className="text-benefit">{won(benefit)}</b> · 놓침 <b className="text-missed">{won(missed)}</b></span>
      </div>
      <div className="bg-white border border-line rounded-lg px-4 md:px-5 py-2 flex flex-col">
        {list.length === 0 && <Cap className="py-8 text-center">조건에 맞는 거래가 없어요.</Cap>}
        {Object.entries(byDay).map(([date, items]) => (
          <div key={date} className="flex flex-col">
            <DayHead date={date} sum={signedSum(items)} />
            {items.map((t, i) => <TxnRow key={t.id} t={t} result={calc.byTxn[t.id]} last={i === items.length - 1} href={`/transactions/${t.id}`} />)}
          </div>
        ))}
      </div>

      <Sheet open={open} onClose={() => setOpen(false)} title="필터">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2"><Cap>구분</Cap><div className="flex gap-2 flex-wrap">{(["전체", "지출", "수입"] as Kind[]).map((k) => <Chip key={k} on={kind === k} onClick={() => pickKind(k)}>{k}</Chip>)}</div></div>
          <div className="flex flex-col gap-2"><Cap>카테고리</Cap><div className="flex gap-2 flex-wrap">{tops.map((c) => <Chip key={c.id} on={cat === c.id} onClick={() => setQuery("cat", cat === c.id ? null : c.id)}>{c.name}</Chip>)}</div></div>
          <div className="flex flex-col gap-2"><Cap>확인 필요</Cap><div className="flex gap-2 flex-wrap"><Chip on={unc} onClick={() => setQuery("unclassified", unc ? null : "1")}>업종 미분류 {uncCount}건</Chip></div></div>
          <div className="flex flex-col gap-2"><Cap>카드</Cap><div className="flex gap-2 flex-wrap">{userCards.map((uc) => <Chip key={uc.cardId} disabled={noCard} on={cards.includes(uc.cardId)} onClick={() => toggleCard(uc.cardId)}>{cardLabel(uc.cardId)}</Chip>)}</div></div>
          <div className="flex flex-col gap-2"><Cap>결제수단</Cap><div className="flex gap-2 flex-wrap">{(Object.keys(PAY) as (keyof typeof PAY)[]).filter((k) => k !== "transfer").map((k) => <Chip key={k} on={pay === k} onClick={() => setPay(pay === k ? null : k)}>{PAY[k]}</Chip>)}</div></div>
          <div className="flex gap-2"><Button variant="secondary" className="flex-1" onClick={reset}>초기화</Button><Button className="flex-[2]" onClick={() => setOpen(false)}>{list.length}건 보기</Button></div>
        </div>
      </Sheet>
    </Screen>
  );
}

/* useSearchParams는 Suspense 안에서 (없으면 next build의 정적 렌더가 실패) */
export default function TransactionsPage() {
  return <Suspense><TransactionList /></Suspense>;
}
