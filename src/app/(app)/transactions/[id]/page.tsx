"use client";
import { use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Screen, TopAction } from "@/components/shell";
import { Badge, Button, Cap, Card, CardTitle, cx, EmptyState, Field, Icon, Note, Num, RefBadge, Select, won } from "@/components/ui";
import { benefitBadge, CompareList, TxnIcon } from "@/components/domain";
import { PerkJudge } from "@/components/perk-judge";
import { useStore } from "@/lib/store";
import { categoryForIndustry, categoryPath, FALLBACK_CATEGORY, INDUSTRY } from "@/lib/data/merchants";
import { cardLabel } from "@/lib/data/cards";
import { COND_LABEL, industryOf, krw } from "@/lib/engine";
import { refundedOf, refundLeft } from "@/lib/data/txn-rules";
import { isUnclassified } from "@/lib/stats";
import { fmtDateKo, num } from "@/lib/format";
import type { Industry } from "@/lib/types";

export default function TxnDetailPage({ params }: PageProps<"/transactions/[id]">) {
  const { id } = use(params);
  const router = useRouter();
  const { txns, categories, calcFor, deleteTxns, updateTxn, rememberIndustry, loading } = useStore();
  const t = txns.find((x) => x.id === id);
  if (!t && loading) return null; // 로그인 사용자의 DB를 읽는 중에는 '찾을 수 없어요'를 띄우지 않음
  if (!t) return <Screen title="거래 상세" back><EmptyState title="거래를 찾을 수 없어요" action={<Button variant="secondary" size="md" href="/transactions">내역으로</Button>} /></Screen>;
  const r = calcFor(t.date.slice(0, 7)).byTxn[t.id];
  const m = r?.mine;
  const b = benefitBadge(t, r);
  const isIncome = t.type === "income" || !!t.originalTxnId;
  const original = t.originalTxnId ? txns.find((x) => x.id === t.originalTxnId) : undefined;
  const refunds = txns.filter((x) => x.originalTxnId === t.id);
  const isOrigExpense = t.type === "expense" && !t.originalTxnId;
  const left = isOrigExpense ? refundLeft(t, txns) : 0; // 아직 환불할 수 있는 금액 (0이면 환불 버튼 숨김)
  const ind = isOrigExpense ? industryOf(t) : undefined;
  const unc = isUnclassified(t);
  // 업종 바로 고치기: 이 거래에 저장하고 같은 가맹점은 다음부터 이 업종으로. 카테고리가 '기타'면 업종에 맞는 카테고리로
  const fixIndustry = (v: Industry) => {
    updateTxn(t.id, { merchantIndustry: v, ...(t.categoryId === FALLBACK_CATEGORY.expense ? { categoryId: categoryForIndustry(categories, v, "expense") } : {}) });
    rememberIndustry(t.merchant, v);
  };
  const remove = () => {
    if (!confirm(refunds.length ? `이 거래를 삭제할까요? 연결된 환불 ${refunds.length}건도 함께 삭제돼요.` : "이 거래를 삭제할까요?")) return;
    deleteTxns([t.id]);
    router.replace("/transactions");
  };

  return (
    <Screen title="거래 상세" back right={<><TopAction href={`/transactions/new?id=${t.id}`}>수정</TopAction><TopAction onClick={remove}><span className="text-red-700">삭제</span></TopAction></>}>
      <div className="grid md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-5 items-start">
        <div className="flex flex-col gap-4">
          <Card>
            <div className="flex items-center gap-3">
              <TxnIcon t={t} size={44} />
              <span className="flex-1 flex flex-col gap-0.5 min-w-0"><span className="text-h3 text-strong truncate">{t.merchant}</span><Cap>{fmtDateKo(t.date)}{t.paidAt && ` ${t.paidAt}`} · {categoryPath(categories, t.categoryId)}{isOrigExpense && ` · 업종 ${ind ? INDUSTRY[ind].label : "미분류"}`}</Cap></span>
            </div>
            <div className="flex items-end justify-between gap-3">
              <span className={cx("text-display tracking-title", isIncome ? "text-income" : "text-expense")}>{isIncome ? "+" : "-"}{won(krw(t))}</span>
              <span className="flex flex-col items-end gap-0.5">
                <Cap>{t.cardId ? cardLabel(t.cardId) : t.payType === "cash" ? "현금" : "계좌이체"}</Cap>
                {m && <Num className={m.total > 0 ? "text-benefit" : "text-muted"}>혜택 {won(m.total)}</Num>}
              </span>
            </div>
            <div className="flex gap-2 flex-wrap">
              {b && <Badge kind={b.kind}>{b.label}</Badge>}
              {t.receiptId && <Badge kind="info">영수증 있음</Badge>}
              {(t.installmentMonths ?? 0) > 1 && <Badge>할부 {t.installmentMonths}개월{t.isInterestFree ? " · 무이자" : ""}</Badge>}
              {t.isAutoPay && <Badge>자동납부</Badge>}
              {t.recurringId && <Badge>반복 거래</Badge>}
              {m?.skipped.map((s) => <Badge key={s.ruleId} kind="missed">{COND_LABEL[s.field]} 미입력</Badge>)}
            </div>
            {t.currency !== "KRW" && <Cap>{t.currency} {num(t.amount)} · 원화 환산 {won(krw(t))}{t.amountKrw === undefined && " (대략 환율 · 참고값)"}</Cap>}
            {t.memo && <Cap>메모 · {t.memo}</Cap>}
            {t.items?.length ? <Cap>품목 · {t.items.join(", ")}</Cap> : isOrigExpense && <Cap>품목 정보 없음 · <Link href={`/transactions/new?id=${t.id}`} className="text-link font-semibold">추가</Link></Cap>}
            {original && <Cap>원거래 · <Link href={`/transactions/${original.id}`} className="text-link font-semibold">{original.merchant} {won(krw(original))}</Link> — 원거래의 실적·한도·혜택을 다시 계산했어요</Cap>}
            {refunds.length > 0 && <Cap>취소·환불 {won(refundedOf(t.id, txns))} 반영 → 유효 금액 {won(left)} 기준으로 계산했어요</Cap>}
            {left > 0 && <Button variant="secondary" size="md" icon="undo" href={`/transactions/refund?orig=${t.id}`} className="self-start">환불·취소 기록</Button>}
          </Card>

          {unc && (
            <Card className="gap-3">
              <Note icon="help" tone="amber">{t.cardId ? "업종이 미분류라 업종 혜택을 매칭하지 못했어요." : "업종이 미분류예요."} 업종을 고르면 바로 다시 계산하고, 같은 가맹점은 다음부터 이 업종으로 분류해요.</Note>
              <Field label="업종 고르기">
                <Select value="" onChange={(e) => e.target.value && fixIndustry(e.target.value as Industry)}>
                  <option value="">선택</option>
                  {(Object.keys(INDUSTRY) as Industry[]).filter((k) => k !== "etc").map((k) => <option key={k} value={k}>{INDUSTRY[k].label}</option>)}
                </Select>
              </Field>
            </Card>
          )}

          {m && (
            <Card className="gap-3.5">
              <CardTitle right={<RefBadge />}>계산 근거</CardTitle>
              {m.applied.length === 0 && m.skipped.length === 0 && (
                <div className="flex flex-col gap-2">
                  {m.blocked.length === 0 && m.unsupported.length === 0 && <Cap>{unc ? "업종이 미분류라 업종 혜택을 확인하지 못했어요. 위에서 업종을 골라주세요." : `이 카드에 ${t.merchant}에 해당하는 혜택 규칙이 없어요.`}</Cap>}
                  {m.blocked.map((x) => <div key={x.ruleId} className="flex gap-2.5 items-start"><Icon name="block" size={20} className="text-muted" /><span className="flex-1 flex flex-col"><span className="text-label text-strong">{x.name}</span><Cap>{x.reason}</Cap></span></div>)}
                </div>
              )}
              {m.applied.map((a) => (
                <div key={a.ruleId} className="flex flex-col gap-2.5">
                  {a.checks.map((c, i) => (
                    <div key={i} className="flex gap-2.5 items-start"><Icon name="check_circle" size={20} fill className="text-success" /><span className="flex-1 flex flex-col"><span className="text-label text-strong">{c.title}</span>{c.sub && <Cap>{c.sub}</Cap>}</span></div>
                  ))}
                  <div className="flex justify-between items-center pt-3 border-t border-line"><span className="text-label text-body">{a.formula}</span><Num size="md" className="text-benefit">{won(a.amount)}</Num></div>
                </div>
              ))}
              {m.skipped.map((s) => (
                <div key={s.ruleId} className="flex gap-2.5 items-start"><Icon name="help" size={20} fill className="text-amber-500" /><span className="flex-1 flex flex-col"><span className="text-label text-strong">{s.name} · 미계산</span><Cap className="text-amber-700">{COND_LABEL[s.field]}을(를) 채우면 최대 {won(s.maxExtra)} 더 잡혀요</Cap></span><Link href={`/transactions/new?id=${t.id}`} className="text-label font-semibold text-link">입력</Link></div>
              ))}
              {m.applied.length > 0 && m.blocked.filter((x) => x.reason.includes("중복")).map((x) => (
                <div key={x.ruleId} className="flex gap-2.5 items-start"><Icon name="block" size={20} className="text-muted" /><span className="flex-1 flex flex-col"><span className="text-label text-strong">{x.name}</span><Cap>{x.reason}</Cap></span></div>
              ))}
              {m.unsupported.map((u) => (
                <div key={u.ruleId} className="flex gap-2.5 items-start"><Icon name="do_not_disturb_on" size={20} className="text-muted" /><span className="flex-1 flex flex-col"><span className="text-label text-strong">{u.name} · 규칙 미지원</span><Cap>{u.reason} · 조건 미입력과는 달라요</Cap></span></div>
              ))}
              {m.applied.length > 1 && <div className="flex justify-between items-center pt-3 border-t border-line"><span className="text-label text-strong">합계 (중복 허용 규칙 합산)</span><Num size="md" className="text-benefit">{won(m.total)}</Num></div>}
            </Card>
          )}
          {m && <PerkJudge t={t} />}
          {!m && t.type === "expense" && !t.originalTxnId && <Card><Cap>{t.payType === "cash" || t.payType === "transfer" ? "현금·계좌이체 결제는 혜택 계산 대상이 아니에요." : "카드가 등록되어 있지 않아 계산하지 못했어요."}</Cap></Card>}
        </div>

        {r && (
          <Card>
            <CardTitle right={<Cap>카드 {r.compare.length}장 기준</Cap>}>보유 카드 비교</CardTitle>
            <CompareList compare={r.compare} mineId={t.cardId} mineTotal={m?.total} />
            <p className="m-0 text-caption text-body">
              {r.diff > 0 ? <>이 결제엔 <b>{cardLabel(r.bestCardId)}</b>이 최적이었어요. {won(r.diff)} 더 받을 수 있었어요.</> : m && m.total > 0 ? <>이 결제엔 {cardLabel(t.cardId)}이 최적이었어요. 잘 골랐어요!</>
                : !m ? "이 카드는 지금 카드 목록에 없어 받은 혜택은 비교하지 못했어요." : "보유 카드 중 이 결제에 혜택을 주는 카드가 없어요."}
            </p>
          </Card>
        )}
      </div>
    </Screen>
  );
}
