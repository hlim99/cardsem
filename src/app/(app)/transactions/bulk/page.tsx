"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Screen, TopAction } from "@/components/shell";
import { Button, Cap, Num, Select, Sheet, won } from "@/components/ui";
import { TxnRow } from "@/components/domain";
import { useStore } from "@/lib/store";
import { categoryPath } from "@/lib/data/merchants";
import { signedSum } from "@/lib/data/txn-rules";

export default function BulkPage() {
  const router = useRouter();
  const { txns, month, calc, categories, deleteTxns, updateTxn } = useStore();
  const list = txns.filter((t) => t.date.startsWith(month)).sort((a, b) => b.date.localeCompare(a.date));
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState(false);
  const [cat, setCat] = useState("");
  const picked = list.filter((t) => sel.has(t.id));
  const sum = signedSum(picked); // 행에 보이는 부호 그대로 (수입·환불 +, 지출 −, 외화는 원화 환산)
  // 카테고리는 수입·지출이 따로라, 섞인 선택은 한 번에 못 바꾼다
  const mixed = new Set(picked.map((t) => t.type)).size > 1;
  const type = picked[0]?.type ?? "expense";
  const linked = txns.filter((t) => t.originalTxnId && sel.has(t.originalTxnId) && !sel.has(t.id)).length; // 원거래와 함께 지워지는 환불
  const toggle = (id: string, v: boolean) => setSel((s) => { const n = new Set(s); if (v) n.add(id); else n.delete(id); return n; });
  const apply = () => { picked.forEach((t) => updateTxn(t.id, { categoryId: cat })); setOpen(false); setCat(""); setSel(new Set()); };
  const remove = () => {
    if (!confirm(`${sel.size}건 (합계 ${won(Math.abs(sum))})을 삭제할까요?${linked ? ` 연결된 환불 ${linked}건도 함께 삭제돼요.` : ""}`)) return;
    deleteTxns([...sel]); setSel(new Set()); router.replace("/transactions");
  };
  return (
    <Screen title={`${sel.size}건 선택`} back right={<TopAction onClick={() => setSel(sel.size === list.length ? new Set() : new Set(list.map((t) => t.id)))}>{sel.size === list.length ? "선택 해제" : "전체 선택"}</TopAction>}>
      <div className="bg-white border border-line rounded-lg px-4 md:px-5 py-2 flex flex-col pb-28">
        {list.map((t, i) => <TxnRow key={t.id} t={t} result={calc.byTxn[t.id]} showDate last={i === list.length - 1} checked={sel.has(t.id)} onCheck={(v) => toggle(t.id, v)} />)}
      </div>
      <div className="fixed bottom-0 inset-x-0 md:left-60 z-30 bg-white border-t border-line px-4 py-3 pb-safe flex flex-col gap-3">
        <div className="flex items-center"><Cap>선택 {sel.size}건 · 합계</Cap><span className="flex-1" /><Num className="text-strong">{won(sum, true)}</Num></div>
        {mixed && <Cap className="text-amber-700">수입과 지출이 섞여 있어 카테고리를 한 번에 바꿀 수 없어요. 한 종류만 골라주세요.</Cap>}
        <div className="flex gap-2 max-w-160"><Button variant="secondary" size="md" icon="folder" className="flex-1" disabled={!sel.size || mixed} onClick={() => setOpen(true)}>카테고리 변경</Button><Button variant="danger" size="md" icon="delete" className="flex-1" disabled={!sel.size} onClick={remove}>삭제</Button></div>
      </div>
      <Sheet open={open} onClose={() => setOpen(false)} title="카테고리 변경">
        <Cap>선택한 {sel.size}건({type === "income" ? "수입" : "지출"})의 사용자 카테고리를 바꿔요. 혜택 계산은 업종 분류로 하니 결과가 바뀌지 않아요.</Cap>
        <Select aria-label="바꿀 카테고리" value={cat} onChange={(e) => setCat(e.target.value)}>
          <option value="">카테고리 선택</option>
          {categories.filter((c) => c.type === type).map((c) => <option key={c.id} value={c.id}>{categoryPath(categories, c.id)}</option>)}
        </Select>
        <Button disabled={!cat || mixed} onClick={apply}>변경</Button>
      </Sheet>
    </Screen>
  );
}
