"use client";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Screen } from "@/components/shell";
import { AmountBig, Badge, Button, Card, CardTitle, Cap, Field, Input, Seg, Select, won } from "@/components/ui";
import { TxnRow } from "@/components/domain";
import { useStore } from "@/lib/store";
import { computeMonth, isCardExpense, krw, monthSpend, spendWindowLabel, ymOf } from "@/lib/engine";
import { matches, refundLeft, spendYmOf } from "@/lib/data/txn-rules";
import { cardLabel } from "@/lib/data/cards";
import { fmtMd, num } from "@/lib/format";
import type { Transaction } from "@/lib/types";

type Mode = "전체 취소" | "부분 환불";

/* TRX-11 취소·부분 환불 — 원거래에 연결해 저장하면 실적·한도·통계를 다시 계산. 환불 합은 원금을 넘을 수 없다 */
function Refund() {
  const router = useRouter();
  const sp = useSearchParams();
  const { txns, userCards, catalog, calcFor, addTxn, today } = useStore();
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("부분 환불");
  const [amount, setAmount] = useState(0);
  const [date, setDate] = useState(today);

  // 후보: 환불이 아닌 지출 중 아직 환불할 금액이 남은 것. 달 제한 없이 최근 순, 가맹점으로 찾는다
  const candidates = txns.filter((t) => t.type === "expense" && !t.originalTxnId && refundLeft(t, txns) > 0).sort((a, b) => b.date.localeCompare(a.date));
  // 원거래는 고른 값 → 주소(?orig=) → 가장 최근 순. 상태에 복사하지 않아 DB가 늦게 읽혀도 맞는 거래를 가리킨다
  const want = picked ?? sp.get("orig");
  const orig = txns.find((t) => t.id === want && t.type === "expense" && !t.originalTxnId) ?? candidates[0];
  // ponytail: 목록은 검색 결과 최근 100건까지. 더 오래된 거래는 검색어로 좁힌다
  const options = candidates.filter((t) => matches(t.merchant, q) || !q.trim()).slice(0, 100);
  if (orig && !options.includes(orig)) options.unshift(orig);

  const left = orig ? refundLeft(orig, txns) : 0; // 남은 환불 가능액 = 원금 − 기존 환불 합
  const refundAmt = mode === "전체 취소" ? left : amount;
  const err = !orig ? "환불할 원거래가 없어요" : left <= 0 ? "이미 전액 환불된 거래예요" : refundAmt <= 0 ? "환불 금액을 입력해주세요"
    : refundAmt > left ? `남은 환불 가능 금액 ${won(left)}보다 클 수 없어요` : !date || date < orig.date ? `환불일은 원거래일(${fmtMd(orig.date)}) 이후여야 해요` : "";

  const draft = (o: Transaction): Omit<Transaction, "id"> => ({
    type: "expense", amount: refundAmt, currency: "KRW", date, merchant: `${o.merchant} · ${mode}`,
    categoryId: o.categoryId, merchantIndustry: o.merchantIndustry, payType: o.payType, cardId: o.cardId, originalTxnId: o.id,
  });

  // 재계산 미리보기 (카드 결제만): 원거래가 속한 달의 혜택과, 환불일이 속한 실적 창(청구 사이클 반영)의 실적.
  // 엔진(monthSpend)이 환불을 원결제 창이 아니라 환불한 날의 창에서 빼기 때문에 같은 기준으로 보여준다
  const preview = (() => {
    if (err || !orig || !isCardExpense(orig)) return null;
    const next = [...txns, { ...draft(orig), id: "draft" }];
    const oym = ymOf(orig.date);
    const card = catalog.find((c) => c.id === orig.cardId);
    const cycle = userCards.find((u) => u.cardId === orig.cardId)?.statementCycleDay;
    const sy = spendYmOf(date, cycle);
    return {
      before: calcFor(oym).byTxn[orig.id]?.mine?.total ?? 0, after: computeMonth(oym, next, userCards, catalog).byTxn[orig.id]?.mine?.total ?? 0,
      spendLabel: spendWindowLabel(sy, cycle), spendBefore: monthSpend(txns, orig.cardId!, sy, card, cycle), spendAfter: monthSpend(next, orig.cardId!, sy, card, cycle),
    };
  })();

  const save = () => { if (err || !orig) return; const n = addTxn(draft(orig)); router.replace(`/transactions/${n.id}`); };

  return (
    <Screen title="환불 기록" back>
      <div className="max-w-160 w-full mx-auto flex flex-col gap-5">
        <Seg items={["전체 취소", "부분 환불"] as const} value={mode} onChange={setMode} />
        <div className="flex flex-col gap-2"><Cap>원거래</Cap>
          <Input icon="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="가맹점으로 찾기 (모든 달)" aria-label="원거래 검색" />
          <Select aria-label="원거래" value={orig?.id ?? ""} onChange={(e) => { setPicked(e.target.value); setAmount(0); }}>
            {options.length === 0 && <option value="">환불할 수 있는 거래가 없어요</option>}
            {options.map((t) => { const l = refundLeft(t, txns); return <option key={t.id} value={t.id}>{t.date} · {t.merchant} · {won(krw(t))}{l < krw(t) ? ` (남은 ${won(l)})` : ""}</option>; })}
          </Select>
          {orig && <Card pad="px-4 py-1"><TxnRow t={orig} result={calcFor(ymOf(orig.date)).byTxn[orig.id]} showDate last /></Card>}
          {orig && left < krw(orig) && <Cap>이미 환불 {won(krw(orig) - left)} · 남은 환불 가능 금액 {won(left)}</Cap>}
        </div>
        {mode === "부분 환불" ? <AmountBig label={`환불 금액 (최대 ${won(left)})`} value={amount} onChange={setAmount} color="border-income" /> : <Cap>전체 취소 · 남은 금액 {won(left)}을 환불해요</Cap>}
        <div className="grid grid-cols-2 gap-2">
          <Field label="환불일"><Input type="date" min={orig?.date} value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          <Field label="환불 수단"><Input value={orig?.cardId ? "원결제 카드 취소" : "현금·계좌 환불"} readOnly /></Field>
        </div>
        {preview && orig && (
          <Card>
            <CardTitle right={<Badge>참고값</Badge>}>재계산 미리보기</CardTitle>
            <div className="flex flex-col gap-2 text-label">
              <div className="flex justify-between gap-3"><span className="text-muted">{cardLabel(orig.cardId)} {preview.spendLabel} 실적 (환불일 기준)</span><span className="text-strong">{num(preview.spendBefore)} → <b>{won(preview.spendAfter)}</b></span></div>
              <div className="flex justify-between gap-3"><span className="text-muted">원거래 혜택</span><span className="text-strong">{num(preview.before)} → <b>{won(preview.after)}</b></span></div>
              <div className="flex justify-between gap-3"><span className="text-muted">{Number(date.slice(5, 7))}월 통계 (환불한 달)</span><span className="text-strong">지출 -{won(refundAmt)}</span></div>
            </div>
          </Card>
        )}
        {err && <Cap className="text-red-700">{err}</Cap>}
        <Button onClick={save} disabled={!!err} className="w-full">저장하기</Button>
      </div>
    </Screen>
  );
}

/* ?orig=<거래id>로 원거래를 미리 고른다 (거래 상세의 '환불·취소 기록'). useSearchParams는 Suspense 안에서 */
export default function RefundPage() {
  return <Suspense><Refund /></Suspense>;
}
