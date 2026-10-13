"use client";
import { Suspense, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Screen, TopIconButton } from "@/components/shell";
import { AmountBig, Badge, type BadgeKind, Button, Cap, Card, CardChip, cx, EmptyState, Field, Icon, Input, Note, Num, Select, Seg, Toggle, won } from "@/components/ui";
import { useStore } from "@/lib/store";
import type { Category, CondField, Industry, PayMethod, PayChannel, Transaction, UserCard } from "@/lib/types";
import { categoryForIndustry, categoryPath, classifyMerchant, hintFor, INDUSTRY, resolveIndustry, type IndustryHints } from "@/lib/data/merchants";
import { cardById, cardLabel } from "@/lib/data/cards";
import { approxKrw, COND_LABEL, FX_APPROX, krw, previewTxn, requiredFields } from "@/lib/engine";
import { refundedOf, refundLeft } from "@/lib/data/txn-rules";
import { validCategory } from "@/lib/db";
import { isUnclassified } from "@/lib/stats";
import { aiClassify } from "@/lib/ai/client";
import { PAY_CHANNEL, PAY_METHOD } from "@/lib/labels";
import { fmtMd } from "@/lib/format";

type Draft = Omit<Transaction, "id">;
/* 업종 출처 (TRX-03): 내가 고친 업종(기억·직접 선택) / 사전 분류 / AI 분류 / 미분류. busy·fail은 AI 호출 중·실패 */
type Src = "user" | "dict" | "ai" | "none" | "busy" | "fail";
const SRC: Record<Src, { label: string; kind: BadgeKind }> = {
  user: { label: "내가 고친 업종", kind: "info" }, dict: { label: "사전 분류", kind: "gray" }, ai: { label: "AI 분류", kind: "benefit" },
  none: { label: "미분류", kind: "missed" }, busy: { label: "AI 분류 중…", kind: "benefit" }, fail: { label: "분류 실패 · 직접 골라주세요", kind: "missed" },
};

/** 폼 초기값. 수정이면 저장된 거래 그대로(업종이 비어 있으면 resolveIndustry로 채움), 새 거래면 빈 값 */
/** 새 지출의 기본 결제수단: 첫 보유 카드(체크카드면 "check" — 할부 입력이 열리지 않게), 카드가 없으면 현금 */
const firstPay = (userCards: UserCard[]): Pick<Transaction, "payType" | "cardId"> =>
  userCards[0] ? { payType: cardById(userCards[0].cardId)?.type === "check" ? "check" : "credit", cardId: userCards[0].cardId } : { payType: "cash", cardId: undefined };

function start(editing: Transaction | undefined, type: Transaction["type"], today: string, cats: Category[], userCards: UserCard[], hints: IndustryHints): { d: Draft; src: Src } {
  if (editing) {
    // 예전 데이터의 할부 0·1개월은 일시불(빈 값)로 — 화면에 '0'이 찍히거나 할부 버튼이 하나도 안 눌린 채로 열리지 않게.
    // 무이자도 함께 비운다('일시불' 버튼과 같은 규칙). 남기면 숨은 무이자 표시가 다시 저장돼 혜택이 계속 막힌다
    if ((editing.installmentMonths ?? 0) <= 1) editing = { ...editing, installmentMonths: undefined, isInterestFree: undefined };
    const m = editing.merchantIndustry === "etc" ? undefined : editing.merchantIndustry; // 기타(etc)는 미분류와 같다 (isUnclassified)
    if (editing.type === "income" || editing.originalTxnId) return { d: editing, src: "none" };
    // ponytail: 저장된 업종의 출처는 저장하지 않으므로 추정 (기억과 같으면 내가 고친 업종, 사전과 같으면 사전, 아니면 AI)
    if (m) return { d: editing, src: hintFor(hints, editing.merchant) === m ? "user" : classifyMerchant(editing.merchant) === m ? "dict" : "ai" };
    const r = resolveIndustry(editing.merchant, null, hints);
    return { d: { ...editing, merchantIndustry: r.industry }, src: r.source };
  }
  const exp = type === "expense";
  return { d: { type, amount: 0, currency: "KRW", date: today, merchant: "", categoryId: categoryForIndustry(cats, undefined, type), ...(exp ? firstPay(userCards) : { payType: "transfer" as const, cardId: undefined }) }, src: "none" };
}

function Form({ editing }: { editing?: Transaction }) {
  const router = useRouter();
  const sp = useSearchParams();
  const { txns, categories, userCards, catalog, today, calc, calcFor, addTxn, updateTxn, industryHints, rememberIndustry } = useStore();
  const editId = editing?.id;
  const [init] = useState(() => start(editing, sp.get("type") === "income" ? "income" : "expense", today, categories, userCards, industryHints));
  const [d, setD] = useState<Draft>(init.d);
  const [src, setSrc] = useState<Src>(init.src);
  const [itemsText, setItemsText] = useState(editing?.items?.join(", ") ?? "");
  const lock = useRef(!!editing?.merchantIndustry && editing.merchantIndustry !== "etc"); // 자동 분류 멈춤: 저장된 업종이 있거나 사용자가 직접 고름
  const picked = useRef(false); // 사용자가 업종을 직접 골랐으면 저장할 때 기억 (다음 같은 가맹점에 적용)
  const catTouched = useRef(!!editing); // 사용자가 카테고리를 골랐으면(수정 포함) 업종을 따라 바꾸지 않음
  const req = useRef(0); // 늦게 온 AI 응답 무시용 순번
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((s) => ({ ...s, [k]: v }));

  const isExpense = d.type === "expense";
  const isRefund = !!d.originalTxnId;
  const hasCard = isExpense && (d.payType === "credit" || d.payType === "check") && !!d.cardId;
  const isCard = hasCard && !isRefund; // 혜택 계산 대상 (환불은 원거래를 다시 계산할 뿐)
  const uc = userCards.find((u) => u.cardId === d.cardId);
  const card = catalog.find((c) => c.id === d.cardId);
  // 주유량은 주유 업종일 때만 묻는다
  const fields: CondField[] = (isCard && card ? requiredFields(card, uc?.variantId) : []).filter((f) => f !== "fuelLiters" || d.merchantIndustry === "fuel");
  const cats = categories.filter((c) => c.type === d.type);
  const amountKrw = d.currency === "KRW" ? undefined : (d.amountKrw ?? approxKrw(d.amount, d.currency));
  const items = itemsText.split(",").map((s) => s.trim()).filter(Boolean);
  // 화면에 보이는 값 = 저장되는 값 (지워진 카테고리면 업종 기준 기본값으로)
  // 원화 환산액은 사용자가 입력한 값만 저장한다. 비워 두면 krw()가 대략 환율로 채워서, 외화 금액을 고치면 환산도 따라간다
  const out: Draft = { ...d, amountKrw: d.currency === "KRW" ? undefined : d.amountKrw, categoryId: validCategory(categories, d), items: items.length ? items : undefined };
  const draft = { ...out, id: editId ?? "draft" } as Transaction;
  const amt = krw(draft);

  // 환불은 원거래에 남은 금액까지, 원거래는 이미 환불된 금액 아래로 못 줄인다 (환불 합 > 원금이면 통계가 원거래보다 더 깎임)
  const orig = isRefund ? txns.find((t) => t.id === d.originalTxnId) : undefined;
  const maxRefund = orig ? refundLeft(orig, txns, editId) : Infinity;
  const refunded = editId && !isRefund ? refundedOf(editId, txns) : 0;
  const err = orig && d.date < orig.date ? `환불일은 원거래일(${fmtMd(orig.date)}) 이후여야 해요` : amt > maxRefund ? `원거래에서 환불할 수 있는 금액은 ${won(maxRefund)}까지예요` : amt < refunded ? `이미 환불된 ${won(refunded)}보다 작게 고칠 수 없어요` : "";
  const ok = d.amount > 0 && !!d.merchant.trim() && /^\d{4}-\d{2}-\d{2}$/.test(d.date) && !err; // 날짜를 비우면 저장 안 됨

  // 예상 혜택: 그 달 원장 기준. 수정이면 이 거래가 이미 쓴 한도·횟수를 빼고 계산 (자기 자신에게 막히지 않게)
  const ym = d.date.slice(0, 7);
  const preview = isCard && d.amount > 0 && d.merchant ? previewTxn(draft, ym === calc.ym ? calc : calcFor(ym), userCards, catalog, txns, { excludeId: editId }) : [];
  const mine = preview.find((p) => p.cardId === d.cardId)?.calc;
  const best = [...preview].sort((a, b) => b.calc.total - a.calc.total)[0];
  const bestCard = best && catalog.find((c) => c.id === best.cardId);

  // 업종이 바뀌면 카테고리도 따라간다 (사용자가 카테고리를 직접 고르기 전까지)
  const applyInd = (ind: Industry | undefined, s: Src) => {
    const keepCat = catTouched.current;
    setSrc(s);
    setD((x) => ({ ...x, merchantIndustry: ind, ...(keepCat ? {} : { categoryId: categoryForIndustry(categories, ind, x.type) }) }));
  };
  // 업종 분류: ① 내가 고친 기록 → ② 가맹점 사전 (resolveIndustry) → 없으면 0.7초 뒤 AI(/api/classify). 수입·환불은 분류하지 않음
  const onMerchant = (v: string) => {
    set("merchant", v);
    if (timer.current) clearTimeout(timer.current);
    const n = ++req.current;
    if (!isExpense || isRefund || lock.current) return;
    const r = resolveIndustry(v, null, industryHints);
    applyInd(r.industry, r.source);
    if (r.industry || v.trim().length < 2) return;
    timer.current = setTimeout(() => {
      setSrc("busy");
      aiClassify(v)
        .then((a) => {
          if (n !== req.current || lock.current) return;
          const ind = a.industry === "etc" ? undefined : a.industry; // AI의 '모름'(etc)은 미분류로 둔다
          applyInd(ind, !ind ? "none" : a.source === "llm" ? "ai" : "dict");
        })
        .catch(() => { if (n === req.current && !lock.current) setSrc("fail"); });
    }, 700);
  };
  const onIndustry = (v: string) => {
    if (timer.current) clearTimeout(timer.current);
    req.current++; lock.current = true; picked.current = true; applyInd((v || undefined) as Industry | undefined, v ? "user" : "none");
  };
  // 수입↔지출 전환: 지출 전용 필드(업종·카드·할부·혜택 조건·품목)는 비우고 분류를 처음부터
  const setType = (type: Transaction["type"]) => {
    if (timer.current) clearTimeout(timer.current);
    req.current++; lock.current = false; picked.current = false; catTouched.current = false;
    setItemsText("");
    const exp = type === "expense";
    const r = exp ? resolveIndustry(d.merchant, null, industryHints) : { industry: undefined, source: "none" as const };
    setSrc(r.source);
    setD((s) => ({
      type, amount: s.amount, currency: s.currency, amountKrw: s.amountKrw, date: s.date, merchant: s.merchant, memo: s.memo,
      merchantIndustry: r.industry, categoryId: categoryForIndustry(categories, r.industry, type),
      ...(exp ? firstPay(userCards) : { payType: "transfer" as const, cardId: undefined }),
    }));
  };
  // 할부는 신용카드만
  const onPay = (v: string) => {
    if (v.startsWith("card:")) {
      const id = v.slice(5);
      const check = catalog.find((c) => c.id === id)?.type === "check";
      setD((s) => ({ ...s, payType: check ? "check" : "credit", cardId: id, ...(check ? { installmentMonths: undefined, isInterestFree: undefined } : {}) }));
    } else setD((s) => ({ ...s, payType: v as Transaction["payType"], cardId: undefined, installmentMonths: undefined, isInterestFree: undefined }));
  };

  const save = () => {
    if (!ok) return;
    if (picked.current && isExpense && d.merchantIndustry) rememberIndustry(d.merchant, d.merchantIndustry);
    // replace: 저장 후 뒤로 가기로 이미 저장한 폼이 다시 열리지 않게
    if (editId) { updateTxn(editId, out); router.replace(`/transactions/${editId}`); }
    else { const n = addTxn(out); router.replace(`/transactions/${n.id}`); }
  };

  return (
    <Screen title={editing ? (isRefund ? "환불 수정" : "거래 수정") : isExpense ? "지출 등록" : "수입 등록"} back right={isExpense && !editing && <TopIconButton icon="photo_camera" href="/receipt" label="영수증으로 등록" />}>
      <div className="grid md:grid-cols-[minmax(0,1fr)_--spacing(95)] gap-5 items-start">
        <div className="flex flex-col gap-5">
          {!editing && <Seg items={["지출", "수입"] as const} value={isExpense ? "지출" : "수입"} onChange={(v) => setType(v === "지출" ? "expense" : "income")} />}
          {isRefund && (
            <Note icon="undo" tone="blue">
              환불 기록이에요 · 원거래 {orig ? <Link href={`/transactions/${orig.id}`} className="font-semibold underline">{orig.merchant} {won(krw(orig))}</Link> : "없음"}.
              {orig && ` 금액은 원거래에 남은 ${won(maxRefund)}까지 고칠 수 있어요.`}
            </Note>
          )}
          <div className="flex items-end gap-3">
            <div className="flex-1 min-w-0">
              {d.currency === "KRW"
                ? <AmountBig label={isRefund ? "환불 금액" : "금액"} value={d.amount} onChange={(v) => set("amount", v)} color={isExpense && !isRefund ? "border-primary" : "border-income"} />
                : <Field label={`금액 (${d.currency})`}><Input type="number" inputMode="decimal" min={0} step="0.01" value={d.amount || ""} onChange={(e) => set("amount", Number(e.target.value) || 0)} suffix={d.currency} /></Field>}
            </div>
            {/* 통화는 고르지 않는다 — 원화(KRW) 고정 표기. 영수증 인식으로 들어온 외화 거래만 그 통화를 그대로 보인다(원화 환산 칸과 함께). */}
            {!isRefund && <span aria-label="통화" className="h-12 px-4 flex-none inline-flex items-center rounded-md border border-line bg-gray-50 text-label font-semibold text-muted">{d.currency}</span>}
          </div>
          {d.currency !== "KRW" && (
            <Field label={<span className="flex items-center gap-1.5">원화 환산액 {d.amountKrw === undefined && <Badge>참고값</Badge>}</span>}
              hint={d.amountKrw === undefined ? `대략 환율(1 ${d.currency} ≈ ${FX_APPROX[d.currency]}원)로 채웠어요. 카드 명세서의 원화 금액으로 고쳐주세요.` : "통계·실적·혜택은 이 원화 금액으로 계산해요."}>
              <Input type="number" inputMode="numeric" min={0} value={amountKrw || ""} onChange={(e) => set("amountKrw", Number(e.target.value) || undefined)} suffix="원" />
            </Field>
          )}

          <div className="flex flex-col gap-3">
            <Field label={isExpense ? "가맹점" : "내용"}>
              <Input value={d.merchant} onChange={(e) => onMerchant(e.target.value)} placeholder={isExpense ? "스타벅스 강남역점" : "9월 급여"} autoFocus={!editing} />
            </Field>
            {isExpense && !isRefund && (
              <Field label={<span className="flex items-center gap-1.5">업종 (혜택 매칭용){d.merchant.trim() && <Badge kind={SRC[src].kind}>{SRC[src].label}</Badge>}</span>}
                hint="사용자 카테고리와 별개예요. 잘못 잡혔으면 고쳐주세요. 고친 업종은 같은 가맹점에 다음부터 먼저 적용돼요.">
                <Select value={d.merchantIndustry ?? ""} onChange={(e) => onIndustry(e.target.value)}>
                  <option value="">미분류</option>
                  {(Object.keys(INDUSTRY) as Industry[]).filter((k) => k !== "etc").map((k) => <option key={k} value={k}>{INDUSTRY[k].label}</option>)}
                </Select>
              </Field>
            )}
            <div className="grid grid-cols-2 gap-3">
              <Field label="카테고리">
                <Select value={out.categoryId} onChange={(e) => { catTouched.current = true; set("categoryId", e.target.value); }}>
                  {cats.map((c) => <option key={c.id} value={c.id}>{categoryPath(categories, c.id)}</option>)}
                </Select>
              </Field>
              <Field label={isRefund ? "환불일" : isExpense ? "결제일" : "입금일"}><Input type="date" min={orig?.date} value={d.date} onChange={(e) => set("date", e.target.value)} /></Field>
            </div>
            {!isRefund && (
              <Field label={isExpense ? "결제수단" : "입금 수단"}>
                <Select value={hasCard ? `card:${d.cardId}` : d.payType} onChange={(e) => onPay(e.target.value)}>
                  {isExpense && userCards.map((u) => <option key={u.cardId} value={`card:${u.cardId}`}>{cardLabel(u.cardId)}</option>)}
                  {/* 지금 보유하지 않은 카드로 결제한 예전 거래: 다른 카드로 바뀌어 보이지 않게 그 값을 따로 둔다 */}
                  {isExpense && hasCard && !userCards.some((u) => u.cardId === d.cardId) && <option value={`card:${d.cardId}`}>{cardById(d.cardId) ? `${cardLabel(d.cardId)} (해제한 카드)` : "목록에 없는 카드 (해제·삭제됨)"}</option>}
                  <option value="cash">현금</option>
                  {/* 지출 결제수단에는 계좌이체를 두지 않는다 (입금 수단·예전 거래만) */}
                  {(!isExpense || d.payType === "transfer") && <option value="transfer">계좌이체</option>}
                </Select>
              </Field>
            )}
            <Field label="메모"><Input value={d.memo ?? ""} onChange={(e) => set("memo", e.target.value)} placeholder="메모 추가" /></Field>
            {isExpense && !isRefund && <Field label="품목" hint="쉼표로 나눠 적어요. 영수증에서 잘못 읽힌 품목도 여기서 고쳐요."><Input value={itemsText} onChange={(e) => setItemsText(e.target.value)} placeholder="아메리카노, 베이글" /></Field>}
          </div>

          {isCard && fields.length > 0 && (
            <Card className="bg-gray-50" pad="p-4">
              <div className="flex items-center gap-2"><span className="text-label text-strong">혜택 조건</span><span className="flex-1" /><Cap>이 카드가 필요로 하는 항목만</Cap></div>
              <div className="grid grid-cols-2 gap-2">
                {fields.includes("paidAt") && <Field label={COND_LABEL.paidAt}><Input type="time" icon="schedule" value={d.paidAt ?? ""} onChange={(e) => set("paidAt", e.target.value || undefined)} className="bg-white" /></Field>}
                {fields.includes("isAutoPay") && <Field label={COND_LABEL.isAutoPay}><span className="h-12 flex items-center gap-3 px-3.5 rounded-md border border-line-strong bg-white"><Toggle on={!!d.isAutoPay} onChange={(v) => set("isAutoPay", v)} label="자동납부" /><span className="text-label text-body">{d.isAutoPay ? "자동납부 건" : "아니요"}</span></span></Field>}
                {fields.includes("payMethod") && <Field label={COND_LABEL.payMethod}><Select value={d.payMethod ?? ""} onChange={(e) => set("payMethod", (e.target.value || undefined) as PayMethod | undefined)} className="bg-white"><option value="">선택</option>{(Object.keys(PAY_METHOD) as PayMethod[]).map((k) => <option key={k} value={k}>{PAY_METHOD[k]}</option>)}</Select></Field>}
                {fields.includes("payChannel") && <Field label={COND_LABEL.payChannel}><Select value={d.payChannel ?? ""} onChange={(e) => set("payChannel", (e.target.value || undefined) as PayChannel | undefined)} className="bg-white"><option value="">선택</option>{(Object.keys(PAY_CHANNEL) as PayChannel[]).map((k) => <option key={k} value={k}>{PAY_CHANNEL[k]}</option>)}</Select></Field>}
                {fields.includes("fuelLiters") && <Field label={COND_LABEL.fuelLiters}><Input type="number" inputMode="decimal" icon="local_gas_station" value={d.fuelLiters ?? ""} onChange={(e) => set("fuelLiters", e.target.value ? Number(e.target.value) : undefined)} suffix="L" className="bg-white" /></Field>}
              </div>
              {mine?.skipped[0] && <Cap className="text-amber-700">{COND_LABEL[mine.skipped[0].field]}을(를) 채우면 최대 {won(mine.skipped[0].maxExtra)} 더 잡혀요</Cap>}
            </Card>
          )}

          {isCard && d.payType === "credit" && (
            <Card pad="p-4">
              <div className="flex items-center gap-2"><span className="text-label text-strong">할부</span><span className="flex-1" /><Cap>목록·통계 모두 결제한 달에 총액으로 잡혀요</Cap></div>
              {/* 저장된 2·10·24개월 같은 값도 버튼으로 둔다 — 눌린 버튼이 없거나, 다른 걸 누르면 되돌릴 수 없는 일이 없게 */}
              <div className="flex gap-2">{[undefined, ...[...new Set([3, 6, 12, init.d.installmentMonths ?? 3])].sort((a, b) => a - b)].map((m) => <button key={m ?? 0} type="button" aria-pressed={d.installmentMonths === m} onClick={() => setD((s) => ({ ...s, installmentMonths: m, isInterestFree: m ? s.isInterestFree : undefined }))} className={cx("flex-1 h-11 rounded-md text-label font-semibold", d.installmentMonths === m ? "bg-primary text-white" : "border border-line-strong text-body")}>{m ? `${m}개월` : "일시불"}</button>)}</div>
              {d.installmentMonths && (
                <div className="flex items-center gap-3"><span className="flex-1 flex flex-col"><span className="text-label text-strong">무이자 할부</span><Cap>무이자 할부는 약관에 따라 혜택 계산에서 제외돼요</Cap></span><Toggle on={!!d.isInterestFree} onChange={(v) => set("isInterestFree", v)} label="무이자" /></div>
              )}
              {d.installmentMonths && amt > 0 && <Cap>카드사 월 청구액 {won(Math.round(amt / d.installmentMonths))} × {d.installmentMonths}회 · 참고</Cap>}
            </Card>
          )}
          {!isExpense && <Note>수입은 혜택 계산 대상이 아니에요.</Note>}
          {isExpense && !isRefund && !isCard && <Note>현금·계좌이체는 혜택 계산 대상이 아니에요 (TRX-02).</Note>}
        </div>

        <div className="flex flex-col gap-4 md:sticky md:top-24">
          {isCard && (
            <div className="flex items-center gap-3 px-4 py-3.5 rounded-lg bg-benefit-soft">
              <span className="w-10 h-10 rounded-md bg-white inline-flex items-center justify-center text-primary flex-none"><Icon name="savings" size={22} /></span>
              <span className="flex-1 flex flex-col gap-0.5 min-w-0">
                <Cap className="text-violet-700">예상 혜택{mine?.applied.length ? ` · ${mine.applied.map((a) => a.name).join(" + ")}` : mine ? ` · ${mine.skipped[0] ? "조건 미입력" : mine.blocked[0]?.reason ?? (isUnclassified(draft) ? "업종 미분류 · 업종을 골라주세요" : "대상 아님")}` : ""}</Cap>
                <Num size="md" className="text-violet-800">{won(mine?.total ?? 0)} <Badge className="bg-white text-violet-700 align-middle">참고값</Badge></Num>
              </span>
            </div>
          )}
          {isCard && best && bestCard && best.calc.total > (mine?.total ?? 0) && (
            <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-missed-soft">
              <CardChip color={bestCard.color} />
              <span className="flex-1 text-caption text-amber-700"><b>{cardLabel(best.cardId)}</b>로 결제하면 {won(best.calc.total)} · {won(best.calc.total - (mine?.total ?? 0))} 더 받아요</span>
            </div>
          )}
          {err && <Cap className="text-red-700">{err}</Cap>}
          <Button onClick={save} disabled={!ok} className="w-full">{editing ? "수정 저장" : "저장하기"}</Button>
          <Cap className="text-center">혜택 금액은 참고용 계산값이에요.</Cap>
        </div>
      </div>
    </Screen>
  );
}

/* 수정할 거래가 정해진 뒤에 폼을 만든다. 첫 렌더는 데모 시드라서, 로그인 사용자의 DB(loading)나
 * 데모 사용자의 로컬 저장 값이 늦게 들어오면 폼을 그 값으로 다시 시작해야 한다 (새로고침·주소 직접 입력) */
function Gate() {
  const sp = useSearchParams();
  const { txns, userCards, loading } = useStore();
  const id = sp.get("id");
  const editing = id ? txns.find((t) => t.id === id) : undefined;
  if (loading) return null;
  if (id && !editing) return <Screen title="거래 수정" back><EmptyState title="거래를 찾을 수 없어요" action={<Button variant="secondary" size="md" href="/transactions">내역으로</Button>} /></Screen>;
  // 저장된 값이 바뀌면 key가 바뀌어 폼을 새로 만든다. 편집하는 동안에는 이 거래가 바뀔 일이 없어 입력을 잃지 않는다
  return <Form key={`${sp}|${editing ? JSON.stringify(editing) : (userCards[0]?.cardId ?? "")}`} editing={editing} />;
}

export default function NewTransactionPage() {
  return <Suspense><Gate /></Suspense>;
}
