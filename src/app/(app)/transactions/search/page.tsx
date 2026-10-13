"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Screen } from "@/components/shell";
import { Cap, Chip, Icon, won } from "@/components/ui";
import { TxnRow } from "@/components/domain";
import { useStore } from "@/lib/store";
import { matches, netExpense, searchTxns, splitMatch } from "@/lib/data/txn-rules";

export default function SearchPage() {
  const router = useRouter();
  const { txns, calcFor } = useStore();
  const [q, setQ] = useState("");
  const [f, setF] = useState({ merchant: true, memo: true, items: true });
  const k = q.trim();
  const hit = useMemo(() => searchTxns(txns, q, f), [txns, q, f]);
  // 일치 부분 강조 (대소문자 무시, 원래 글자 그대로)
  const mark = (s?: string) => s && matches(s, q) ? <>{splitMatch(s, q).map((p, i) => (i % 2 ? <b key={i} className="text-primary">{p}</b> : <span key={i}>{p}</span>))}</> : null;
  return (
    <Screen title={<label className="flex h-11 rounded-md bg-gray-100 items-center px-3.5 gap-2.5 w-full max-w-130"><Icon name="search" size={20} className="text-muted" /><input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="가맹점명, 메모, 품목명" aria-label="거래 검색" className="flex-1 min-w-0 bg-transparent outline-none text-body font-normal focus-visible:shadow-none" />{q && <button type="button" aria-label="지우기" onClick={() => setQ("")}><Icon name="close" size={18} className="text-muted" /></button>}</label>}
      right={<button type="button" onClick={() => router.back()} className="font-semibold text-body px-2 h-11">취소</button>}>
      <h1 className="sr-only">거래 검색</h1>
      <div className="flex gap-2 overflow-x-auto no-scrollbar md:flex-wrap -mx-4 px-4 md:mx-0 md:px-0">
        {(["merchant", "memo", "items"] as const).map((key) => <Chip key={key} on={f[key]} onClick={() => setF((x) => ({ ...x, [key]: !x[key] }))}>{{ merchant: "가맹점명", memo: "메모", items: "품목명" }[key]}</Chip>)}
      </div>
      {k && <Cap>{hit.length}건 · 지출 합계 {won(netExpense(hit))} (환불 차감, 수입 제외)</Cap>}
      <div className="bg-white border border-line rounded-lg px-4 md:px-5 py-2 flex flex-col">
        {!k && <Cap className="py-8 text-center">검색어를 입력하면 가맹점·메모·품목에서 찾아요 (TRX-12).</Cap>}
        {k && hit.length === 0 && <Cap className="py-8 text-center">‘{k}’와 일치하는 거래가 없어요.</Cap>}
        {hit.map((t, i) => (
          <div key={t.id} className="flex flex-col">
            <TxnRow t={t} result={calcFor(t.date.slice(0, 7)).byTxn[t.id]} showDate last href={`/transactions/${t.id}`} />
            <div className={`text-caption text-muted -mt-2 pb-2 pl-13 ${i < hit.length - 1 ? "border-b border-line" : ""}`}>{mark(t.memo) && <>메모: {mark(t.memo)} </>}{t.items?.some((x) => matches(x, q)) && <>품목: {t.items.filter((x) => matches(x, q)).map((x, j) => <span key={j}>{mark(x)} </span>)}</>}</div>
          </div>
        ))}
      </div>
    </Screen>
  );
}
