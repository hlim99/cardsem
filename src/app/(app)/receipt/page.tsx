"use client";
import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Screen } from "@/components/shell";
import { Badge, Button, Card, Cap, Chip, cx, Field, Icon, Input, Note, Progress, Select, TextLink, won } from "@/components/ui";
import { useStore } from "@/lib/store";
import { nextOpen, receiptJobs, useReceiptJobs, type Job } from "@/lib/ai/receipt-jobs";
import type { ReceiptResult } from "@/lib/ai/server";
import { categoryForIndustry, categoryPath, INDUSTRY, resolveIndustry } from "@/lib/data/merchants";
import { cardLabel } from "@/lib/data/cards";
import { approvalMatch, duplicateOf, fieldKey, matchCard, matchNote, normDate, normTime, payMethodOf, payTypeHint, refundCandidates, remainingFor } from "@/lib/data/match-card";
import { approxKrw, effectiveAmount, FX_APPROX, krw } from "@/lib/engine";
import { fmtMd, num } from "@/lib/format";
import type { Industry, Transaction } from "@/lib/types";
import { DOC_KIND as KIND, PAY_TYPE } from "@/lib/labels";

/* RCP-01~06 + 문자 캡처·명세서: 파일 → /api/ocr → 파일별 처리 상태 → 거래 1건씩 확인·저장.
 * 영수증 1장이면 확인 화면으로 바로, 문자·명세서는 거래 여러 건이 나오므로 목록에서 골라 열거나 건너뛴다.
 * 작업 목록은 lib/ai/receipt-jobs.ts 모듈에 있어 다른 화면에 갔다 와도 남는다 */
const isPdf = (f: File) => f.type === "application/pdf";
const isHeic = (f: File) => /heic|heif/i.test(f.type) || /\.(heic|heif)$/i.test(f.name); // Safari 밖에서는 <img>로 못 그림
const Thumb = ({ job, w = 44, h = 56 }: { job: Job; w?: number; h?: number }) => isPdf(job.file) || isHeic(job.file)
  ? <span className="rounded-sm border border-line flex-none inline-flex items-center justify-center bg-gray-50 text-muted" style={{ width: w, height: h }}><Icon name={isPdf(job.file) ? "picture_as_pdf" : "image"} size={22} /></span>
  // eslint-disable-next-line @next/next/no-img-element
  : <img src={job.url} alt="" className="rounded-sm border border-line object-cover flex-none" style={{ width: w, height: h }} />;
const docKrw = (t: ReceiptResult) => (t.currency === "KRW" ? t.total : approxKrw(t.total, t.currency));
const money = (n: number, currency: Transaction["currency"]) => (currency === "KRW" ? won(n) : `${num(n)} ${currency}`);

export default function ReceiptPage() {
  const router = useRouter();
  const { txns, addTxn, me, loading } = useStore();
  const jobs = useReceiptJobs();
  // 다른 계정으로 바뀌었으면(로그아웃·계정 전환·데모 복귀) 이전 사용자의 작업을 지운다
  useEffect(() => { if (!loading) receiptJobs.own(me?.id ?? "demo"); }, [loading, me?.id]);
  const [cur, setCur] = useState<[string, number] | null>(null); // [작업 id, 거래 번호] 확인 중
  const [dismissed, setDismissed] = useState<string | null>(null); // '목록으로' 닫은 1건짜리 작업 — 다시 자동으로 열지 않는다
  // 지난 목록을 모두 처리했으면 새로 시작 (남은 건이 있으면 이어서 확인). 하단 + 메뉴는 receiptJobs.start로 바로 넘긴다
  useEffect(() => {
    if (receiptJobs.get().every((j) => j.status === "done" && !nextOpen([j]))) receiptJobs.clear();
  }, []);

  // 파일 1개에 거래 1건이면 확인 화면으로 바로. 한 번 닫으면 목록에 머문다 (예전에는 닫자마자 다시 열려 못 나갔음)
  const single = jobs.length === 1 && jobs[0].status === "done" && jobs[0].txs.length === 1 && jobs[0].done[0] === false ? jobs[0].id : null;
  const view: [string, number] | null = cur ?? (single && single !== dismissed ? [single, 0] : null);
  const job = view ? jobs.find((j) => j.id === view[0]) : undefined, tx = view ? job?.txs[view[1]] : undefined;
  const step = job && tx ? 2 : jobs.length ? 1 : 0;

  const start = (files: File[]) => { setCur(null); receiptJobs.start(files); };
  const pick = (e: React.ChangeEvent<HTMLInputElement>) => { const f = Array.from(e.target.files ?? []); e.target.value = ""; if (f.length) start(f); };
  const finished = jobs.filter((j) => j.status !== "processing").length;
  const totalTx = jobs.reduce((s, j) => s + j.txs.length, 0), savedTx = jobs.reduce((s, j) => s + j.done.filter((v) => v === "saved").length, 0);
  // 저장·건너뛰기 뒤: 다음 미확인 건 → 없으면 (1건뿐이었고 저장했으면) 거래 상세 → 아니면 목록
  const finish = (at: [string, number], state: "saved" | "skipped", savedId?: string) => {
    receiptJobs.mark(at[0], at[1], state);
    const next = nextOpen(receiptJobs.get());
    if (next) setCur(next);
    else if (savedId && totalTx === 1) router.push(`/transactions/${savedId}`);
    else { setCur(null); setDismissed(at[0]); }
  };

  return (
    <Screen title={["영수증·문자·명세서로 등록", finished === jobs.length ? "읽은 거래 확인" : `${jobs.length}개 파일 처리 중`, `${job?.kind ? KIND[job.kind] : "거래"} 확인`][step]} back={step === 0 ? true : undefined}
      right={step === 2 && view && job && job.txs.length > 1 ? <Badge>{view[1] + 1} / {job.txs.length}건</Badge> : step === 2 ? <Badge kind="success" icon="check">인식 완료</Badge> : undefined}>
      <div className="max-w-[640px] w-full mx-auto flex flex-col gap-5">
        {step === 0 && (<>
          <div className="grid grid-cols-2 gap-2">
            {[["photo_camera", "촬영", "영수증·문자 화면", { capture: "environment" as const, accept: "image/*" }], ["photo_library", "앨범·파일", "캡처·명세서 PDF, 여러 개 가능", { multiple: true, accept: "image/*,.heic,.heif,application/pdf" }]].map(([i, t, s, attrs]) => (
              <label key={t as string} className="border border-line bg-white rounded-lg p-4 flex flex-col items-center gap-2 text-center hover:border-violet-300 cursor-pointer focus-within:border-line-focus focus-within:shadow-focus">
                <span className="w-11 h-11 rounded-[14px] bg-primary-soft text-primary inline-flex items-center justify-center"><Icon name={i as string} size={24} /></span><span className="text-label text-strong">{t as string}</span><Cap>{s as string}</Cap>
                <input type="file" className="sr-only" onChange={pick} {...(attrs as object)} />
              </label>
            ))}
          </div>
          <Link href="/transactions/new" className="flex items-center gap-3 px-4 py-3.5 border border-dashed border-line-strong rounded-md hover:bg-white"><Icon name="edit" size={20} className="text-muted" /><span className="flex-1 flex flex-col gap-0.5"><span className="text-label text-strong">직접 입력</span><Cap>사진 없이 금액·가맹점을 입력해요</Cap></span><Icon name="chevron_right" size={20} className="text-muted" /></Link>
          <div className="flex flex-col gap-1.5 text-caption text-muted"><span>· 영수증은 1건, 결제 승인 문자 캡처와 카드 명세서는 보이는 거래 전부를 읽어요.</span><span>· 이미지는 인식에만 쓰고 저장하지 않아요. 카드번호는 앞 6자리만 카드 확인에 쓰고 뒷자리는 읽지 않아요. 승인번호는 환불을 원결제에 붙이는 데만 쓰고 화면에 보여주지 않아요 (NFR-05).</span><span>· AI가 읽는 동안 다른 화면에 다녀와도 돼요. 새로고침하면 읽은 결과가 사라져요.</span></div>
        </>)}

        {step === 1 && (<>
          <div className="flex items-center gap-3 px-4 py-3.5 rounded-lg bg-benefit-soft"><Icon name={finished === jobs.length ? "check_circle" : "hourglass_top"} size={22} className="text-primary" /><span className="flex-1 flex flex-col gap-0.5"><span className="text-label text-violet-800">{finished === jobs.length ? `모두 읽었어요 · 거래 ${totalTx}건` : "AI가 읽고 있어요"}</span><Cap className="text-violet-700">읽기가 끝난 파일부터 거래를 골라 확인하거나 건너뛸 수 있어요.</Cap></span></div>
          <Progress pct={jobs.length ? (finished / jobs.length) * 100 : 0} h={6} />
          <Card pad="px-4 py-1" className="gap-0">
            {jobs.map((j, i) => {
              const open = nextOpen([j]);
              const saved = j.done.filter((v) => v === "saved").length, skipped = j.done.filter((v) => v === "skipped").length;
              return (
                <div key={j.id} className={cx("flex flex-col gap-1 py-3", i < jobs.length - 1 && "border-b border-line")}>
                  <div className="flex items-center gap-3">
                    <Thumb job={j} />
                    <span className="flex-1 flex flex-col gap-0.5 min-w-0"><span className="text-label text-strong truncate">{j.kind ? `${KIND[j.kind]} · ${j.txs[0]?.merchant ?? ""}${j.txs.length > 1 ? ` 외 ${j.txs.length - 1}건` : ""}` : j.file.name}</span>
                      <Cap className={j.status === "failed" ? "text-red-700" : ""}>{j.status === "processing" ? "구조화 중…" : j.status === "failed" ? `실패 · ${j.error}` : j.txs.length === 0 ? "거래 정보를 찾지 못했어요" : `거래 ${j.txs.length}건${saved ? ` · ${saved}건 저장` : ""}${skipped ? ` · ${skipped}건 건너뜀` : ""}`}</Cap></span>
                    {j.status === "processing" && <span className="w-5 h-5 rounded-full border-2 border-violet-200 border-t-primary animate-spin" />}
                    {j.status === "done" && open && <Button size="sm" onClick={() => setCur(open)}>{j.txs.length > 1 ? `${j.done.filter((v) => v === false).length}건 확인` : "확인하기"}</Button>}
                    {j.status === "done" && !open && j.txs.length === 1 && j.done[0] === "skipped" && <Button size="sm" variant="secondary" onClick={() => setCur([j.id, 0])}>다시 확인</Button>}
                    {j.status === "done" && !open && j.txs.length > 0 && !(j.txs.length === 1 && j.done[0] === "skipped") && <Badge kind="success" icon="check">{saved ? "저장" : "완료"}</Badge>}
                    {j.status === "failed" && <Button size="sm" variant="secondary" onClick={() => receiptJobs.retry(j.id)}>재시도</Button>}
                  </div>
                  {/* 여러 건이면 거래마다 골라 열기 (저장한 건은 다시 열지 않음, 건너뛴 건은 다시 열 수 있음) */}
                  {j.txs.length > 1 && j.txs.map((t, k) => {
                    const st = j.done[k], date = normDate(t.date);
                    const dup = st === false && date && duplicateOf(txns, { merchant: t.merchant, krw: docKrw(t), amount: t.total, currency: t.currency, date, isCancel: t.isCancel });
                    return (
                      <button key={k} type="button" disabled={st === "saved"} onClick={() => setCur([j.id, k])} className="ml-14 flex items-center gap-2 min-h-10 px-2 rounded-sm text-left text-label hover:bg-gray-50 disabled:opacity-60">
                        <span className="flex-1 min-w-0 truncate text-strong">{t.merchant}</span>
                        <Cap>{date ? fmtMd(date) : "날짜 없음"}</Cap>
                        <span className="text-body whitespace-nowrap">{t.isCancel ? "-" : ""}{money(t.total, t.currency)}</span>
                        {st === "saved" ? <Badge kind="success">저장</Badge> : st === "skipped" ? <Badge>건너뜀</Badge> : dup ? <Badge kind="warn">중복 의심</Badge> : t.isCancel ? <Badge kind="warn">취소</Badge> : <Icon name="chevron_right" size={18} className="text-muted" />}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </Card>
          <div className="flex gap-2 flex-wrap">
            <Button variant="secondary" size="md" onClick={() => { receiptJobs.clear(); setCur(null); }}>다른 파일 고르기</Button>
            {jobs.some((j) => j.status === "failed") && <Button variant="secondary" size="md" href="/transactions/new">직접 입력</Button>}
            {savedTx > 0 && <Button size="md" href="/transactions">거래 내역 보기 ({savedTx}건 저장)</Button>}
          </div>
        </>)}

        {step === 2 && view && job && tx && (
          <Confirm key={`${job.id}-${view[1]}`} job={job} r={tx}
            onBack={() => { setCur(null); setDismissed(job.id); }}
            onSkip={() => finish(view, "skipped")}
            onSave={(t) => finish(view, "saved", addTxn(t).id)} />
        )}
      </div>
    </Screen>
  );
}

/* 업종 출처 → 배지·설명 (업종 분류 3단계: 내가 고친 기록 → AI → 사전) */
const IND_SRC = {
  user: { label: "내가 고친 업종", kind: "info", hint: "전에 이 가맹점의 업종을 직접 고친 기록을 따랐어요" },
  picked: { label: "내가 고친 업종", kind: "info", hint: "직접 고른 업종이에요" },
  ai: { label: "AI 분류", kind: "benefit", hint: "AI가 문서의 가맹점명·품목을 보고 분류했어요" },
  dict: { label: "사전 분류", kind: "gray", hint: "가맹점 이름을 업종 사전에서 찾아 분류했어요" },
  none: { label: "미분류 · 골라주세요", kind: "warn", hint: "AI와 업종 사전 모두 업종을 찾지 못했어요. 카드 혜택 계산에 쓰이니 골라주세요" },
} as const;
const decimal = (v: string) => { const [i, ...d] = v.replace(/[^\d.]/g, "").split("."); return d.length ? `${i}.${d.join("")}` : i; };
type Item = { name: string; qty?: number; price?: number };

/* 확인·수정 화면 (RCP-05): 신뢰도 낮은 필드는 붉게, 추론 필드는 푸른 점선, 고친 필드는 '수정함' */
function Confirm({ job, r, onBack, onSkip, onSave }: { job: Job; r: ReceiptResult; onBack: () => void; onSkip: () => void; onSave: (t: Omit<Transaction, "id">) => void }) {
  const { userCards, catalog, categories, txns, today, industryHints, rememberIndustry, updateUserCard } = useStore();
  const foreign = r.currency !== "KRW";
  const aiInd = r.industry === "etc" ? null : r.industry; // '기타'는 판단 못 한 것과 같다 → 사전으로 다시 찾는다
  const match = matchCard(userCards, r); // BIN까지 있는 보유 카드 그대로 넘겨야 '번호 일치'가 동작한다
  const [init] = useState(() => {
    const date = normDate(r.date);
    return {
      merchant: r.merchant, date: date ?? today, dateMissing: !date, paidAt: normTime(r.paidAt) ?? "",
      amt: foreign ? String(r.total) : String(Math.round(r.total)), // 음수는 receipt-jobs에서 양수 + 취소로 바꿔 둠
      // 카드 정보가 없거나 현금이면 첫 카드를 고르지 않는다
      pay: match.cardId ? `card:${match.cardId}` : "cash", // 지출 결제수단에 계좌이체는 없다 → 카드가 아니면 현금
      industry: resolveIndustry(r.merchant, aiInd, industryHints).industry,
      items: r.items.map((i): Item => ({ ...i })),
    };
  });
  const [f, setF] = useState({ merchant: init.merchant, date: init.date, paidAt: init.paidAt, amt: init.amt, pay: init.pay, items: init.items, krwText: null as string | null, inst: r.installmentMonths ?? 0, fuel: r.fuelLiters ? String(r.fuelLiters) : "", ind: null as Industry | "" | null, cat: null as string | null, orig: "" });
  const up = (p: Partial<typeof f>) => setF((s) => ({ ...s, ...p }));

  // 업종: 직접 고르면 그 값, 아니면 3단계로 다시 판단. AI 업종은 AI가 읽은 가맹점 이름일 때만 쓴다 (이름을 바꾸면 사전으로)
  const resolved = f.ind !== null ? { industry: f.ind || undefined, source: "picked" as const } : resolveIndustry(f.merchant, f.merchant.trim() === r.merchant.trim() ? aiInd : null, industryHints);
  const industry = resolved.industry, src = IND_SRC[industry ? resolved.source : "none"];
  const expenseCats = categories.filter((c) => c.type === "expense");
  const cat = f.cat && expenseCats.some((c) => c.id === f.cat) ? f.cat : categoryForIndustry(categories, industry);
  const total = Number(f.amt) || 0;
  const typedKrw = !foreign ? total : f.krwText !== null ? Number(f.krwText) || 0 : approxKrw(total, r.currency);
  const cardId = f.pay.startsWith("card:") ? f.pay.slice(5) : undefined;
  const payType: Transaction["payType"] = cardId ? (catalog.find((c) => c.id === cardId)?.type === "check" ? "check" : "credit") : (f.pay as "cash");
  const validDate = normDate(f.date) === f.date;
  // 취소·환불: 원거래 후보(비슷한 가맹점·남은 금액 ≥ 취소액·90일 이내)를 고르면 환불, 없으면 수입 '환급'으로. 지출(+)로는 저장하지 않는다.
  // 같은 외화끼리는 원래 통화 금액으로 비교한다 (원거래 원화를 명세서 청구액으로 고쳐 뒀을 수 있어서)
  const doc = { merchant: f.merchant, date: f.date, amount: total, currency: r.currency, krw: typedKrw, approvalNo: r.approvalNo };
  const origs = r.isCancel && validDate ? refundCandidates(txns, doc) : [];
  // 승인번호가 같은 결제가 있으면 그 결제로 확정하고 미리 골라 둔다 (가맹점 표기가 달라도 같은 결제다)
  const byApproval = origs.length === 1 && !!approvalMatch(txns, doc);
  const orig = origs.find((t) => t.id === f.orig) ?? (f.orig === "" && byApproval ? origs[0] : undefined);
  // 같은 외화 원거래를 고르면 원화는 원거래의 실제 청구액 비율로 (남은 금액 전부면 남은 원화 그대로). 직접 고치면 그 값
  const fxOrig = foreign && f.krwText === null && orig?.currency === r.currency ? orig : undefined;
  const krwAmt = !fxOrig ? typedKrw : total >= remainingFor(fxOrig, txns, doc) ? effectiveAmount(fxOrig, txns) : Math.round((krw(fxOrig) * total) / fxOrig.amount);
  const dup = validDate && krwAmt ? duplicateOf(txns, { ...doc, krw: krwAmt, isCancel: r.isCancel }) : undefined;
  const refundTo = !r.isCancel ? null : orig ? "orig" : origs.length === 0 || f.orig === "income" ? "income" : null;
  const refundCat = categories.some((c) => c.id === "refund" && c.type === "income") ? "refund" : categoryForIndustry(categories, undefined, "income");

  const low = new Set(r.lowConfidence.map(fieldKey)), inf = new Set(r.inferred.map(fieldKey));
  const tag = (k: string, edited: boolean, missing = false) => edited ? <Badge kind="benefit">수정함</Badge>
    : missing ? <span className="text-overline text-red-700">읽지 못함 · 확인 필요</span>
    : low.has(k) ? <span className="text-overline text-red-700">신뢰도 낮음 · 확인 필요</span>
    : inf.has(k) ? <Badge kind="info">추론</Badge> : <span className="text-overline text-green-700">신뢰도 높음</span>;
  const cls = (k: string, edited: boolean, missing = false) => edited ? "" : missing || low.has(k) ? "border-danger bg-danger-soft" : inf.has(k) ? "border-dashed border-blue-500 bg-info-soft" : "";
  const label = (name: string, t: ReactNode) => <span className="flex justify-between items-center gap-2">{name}{t}</span>;
  const dateEdited = f.date !== init.date, timeEdited = f.paidAt !== init.paidAt, amtEdited = f.amt !== init.amt, itemsEdited = JSON.stringify(f.items) !== JSON.stringify(init.items);
  const cardTag = f.pay !== init.pay ? <Badge kind="benefit">수정함</Badge> : match.level === "bin" ? <span className="text-overline text-green-700">번호 일치</span>
    : match.byBin ? <span className="text-overline text-red-700">확인 필요</span> : match.cardId ? <Badge kind="info">AI 추론</Badge> : payTypeHint(r.payMethodText) ? <span className="text-overline text-green-700">신뢰도 높음</span> : <span className="text-overline text-red-700">확인 필요</span>;
  const itemSum = f.items.reduce((s, it) => s + (it.qty ?? 0) * (it.price ?? 0), 0);
  /* 영수증 앞 6자리를 고른 카드에 기억해 둘지. 카드사 표기가 달라도(발급사 '우리카드' ↔ 매입사 '비씨카드')
   * 다음 영수증부터 번호로 같은 카드에 붙는다. 이미 번호를 적어 둔 카드는 건드리지 않는다 */
  const learnBin = (id?: string) => (match.prefix?.length === 6 && id && !userCards.find((u) => u.cardId === id)?.bin ? match.prefix : undefined);
  const willLearn = learnBin(refundTo === "orig" ? orig?.cardId : cardId);

  const save = () => {
    const learnFor = refundTo === "orig" ? orig?.cardId : cardId;
    const bin = learnBin(learnFor);
    if (bin && learnFor) updateUserCard(learnFor, { bin });
    const base = { amount: total, currency: r.currency, ...(foreign && { amountKrw: krwAmt }), date: f.date, paidAt: f.paidAt || undefined, receiptId: `doc_${job.id}` }; // 같은 파일에서 나온 거래는 같은 문서 id
    if (refundTo === "orig" && orig) return onSave({ ...base, type: "expense", merchant: `${orig.merchant} · ${(orig.currency === r.currency ? total : krwAmt) >= remainingFor(orig, txns, { ...doc, krw: krwAmt }) ? "취소" : "부분 환불"}`, categoryId: categories.some((c) => c.id === orig.categoryId) ? orig.categoryId : categoryForIndustry(categories, orig.merchantIndustry), merchantIndustry: orig.merchantIndustry, payType: orig.payType, cardId: orig.cardId, originalTxnId: orig.id });
    if (refundTo === "income") return onSave({ ...base, type: "income", merchant: `${f.merchant.trim()} 환불`, categoryId: refundCat, payType: "transfer" });
    if (f.ind !== null && industry && industry !== init.industry) rememberIndustry(f.merchant, industry); // 다음에 같은 가맹점이면 1순위로
    const names = f.items.map((i) => i.name.trim()).filter(Boolean);
    onSave({
      ...base, type: "expense", merchant: f.merchant.trim(), merchantIndustry: industry, categoryId: cat, payType, cardId,
      items: names.length ? names : undefined, payMethod: cardId ? payMethodOf(r.payMethodText) : undefined,
      approvalNo: cardId ? r.approvalNo?.replace(/\D/g, "") || undefined : undefined, // 환불 영수증을 이 결제에 붙이는 단서. 화면에는 쓰지 않는다
      fuelLiters: industry === "fuel" && Number(f.fuel) ? Number(f.fuel) : undefined, installmentMonths: payType === "credit" && f.inst > 1 ? f.inst : undefined,
    });
  };
  const disabled = !f.merchant.trim() || !total || !validDate || !krwAmt || (r.isCancel && !refundTo);

  return (
    <>
      <div className="flex gap-3 p-3 rounded-lg bg-gray-50 border border-line"><Thumb job={job} w={64} h={84} /><span className="flex-1 flex flex-col gap-1.5 justify-center min-w-0"><span className="text-label text-strong truncate">{job.file.name}</span><Cap>{job.kind ? KIND[job.kind] : ""} · {r.lowConfidence.length ? `낮은 신뢰도 ${r.lowConfidence.length}개` : "신뢰도 높음"} · {r.inferred.length ? `추론 ${r.inferred.length}개를 확인해주세요` : "추론한 값 없음"}</Cap><a href={job.url} target="_blank" rel="noreferrer" className="text-label font-semibold text-link">원본 크게 보기</a></span></div>
      {dup && <Note icon="content_copy" tone="amber">이미 같은 거래가 있어요 · {fmtMd(dup.date)} {dup.merchant} {won(krw(dup))}. 같은 문서를 다시 올렸다면 건너뛰어 주세요. <Link href={`/transactions/${dup.id}`} className="font-semibold underline">거래 보기</Link></Note>}
      {r.isCancel && <Note icon="undo" tone="amber">취소·환불 건으로 읽었어요. 원래 결제를 고르면 그 결제에서 빼는 환불로 저장해요. 지출로는 저장하지 않아요.</Note>}

      <Field label={label("가맹점", tag("merchant", f.merchant !== init.merchant))}><Input value={f.merchant} onChange={(e) => up({ merchant: e.target.value })} className={cls("merchant", f.merchant !== init.merchant)} /></Field>
      {!r.isCancel && (<>
        <Field label={label("업종 (혜택 매칭용)", <Badge kind={src.kind}>{src.label}</Badge>)} hint={src.hint + (f.ind && industry !== init.industry ? " · 저장하면 이 가맹점에 기억해요" : "")}>
          <Select value={industry ?? ""} onChange={(e) => up({ ind: e.target.value as Industry | "" })}><option value="">미분류</option>{(Object.keys(INDUSTRY) as Industry[]).filter((k) => k !== "etc").map((k) => <option key={k} value={k}>{INDUSTRY[k].label}</option>)}</Select>
        </Field>
        <Field label={label("카테고리", f.cat ? <Badge kind="benefit">수정함</Badge> : <Cap>업종 기본값</Cap>)} hint="가계부 통계에 쓰여요. 업종과 따로 고를 수 있어요">
          <Select value={cat} onChange={(e) => up({ cat: e.target.value })}>{expenseCats.map((c) => <option key={c.id} value={c.id}>{categoryPath(categories, c.id)}</option>)}</Select>
        </Field>
      </>)}
      <div className="grid grid-cols-2 gap-2">
        <Field label={label("결제일", tag("date", dateEdited, init.dateMissing))} error={validDate ? undefined : "날짜를 입력해주세요"}><Input type="date" value={f.date} onChange={(e) => up({ date: e.target.value })} className={cls("date", dateEdited, init.dateMissing)} /></Field>
        <Field label={label("결제 시각", !init.paidAt && !timeEdited ? <span className="text-overline text-muted">읽지 못함</span> : tag("paidAt", timeEdited))}><Input type="time" value={f.paidAt} onChange={(e) => up({ paidAt: e.target.value })} className={cls("paidAt", timeEdited)} /></Field>
      </div>
      <Field label={label("금액", tag("total", amtEdited))} hint={itemSum ? `품목 합계 ${money(itemSum, r.currency)} · ${Math.abs(itemSum - total) < 0.01 ? "금액과 같아요" : "금액과 달라요, 확인해주세요"}` : undefined}>
        <Input inputMode={foreign ? "decimal" : "numeric"} value={foreign ? f.amt : total ? num(total) : ""} onChange={(e) => up({ amt: foreign ? decimal(e.target.value) : e.target.value.replace(/[^\d]/g, "") })} suffix={foreign ? r.currency : "원"} className={cls("total", amtEdited)} />
      </Field>
      {foreign && (
        <Field label={label("원화 환산액", f.krwText !== null ? <Badge kind="benefit">수정함</Badge> : <Badge kind="info">참고값</Badge>)} hint={fxOrig ? "원래 결제의 원화 청구액에 맞춰 채웠어요. 다르면 고쳐주세요" : `1 ${r.currency} ≈ ${num(FX_APPROX[r.currency])}원으로 미리 채웠어요. 카드 명세서의 원화 청구액으로 고쳐주세요`}>
          <Input inputMode="numeric" value={krwAmt ? num(krwAmt) : ""} onChange={(e) => up({ krwText: e.target.value.replace(/[^\d]/g, "") })} suffix="원" className={f.krwText === null ? "border-dashed border-blue-500 bg-info-soft" : ""} />
        </Field>
      )}

      {!r.isCancel && (<>
        <div className="flex flex-col gap-2">
          <span className="flex justify-between items-center gap-2 text-label text-body">품목{init.items.length > 0 && tag("items", itemsEdited)}</span>
          {f.items.length === 0 && <Cap>{job.kind === "sms" || job.kind === "statement" ? "결제 문자·명세서에는 품목이 없어요" : "영수증에서 품목을 읽지 못했어요. 필요하면 직접 적어주세요"}</Cap>}
          {f.items.map((it, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input aria-label={`품목 ${i + 1}`} value={it.name} placeholder="품목 이름" onChange={(e) => up({ items: f.items.map((x, m) => (m === i ? { ...x, name: e.target.value } : x)) })} suffix={it.qty !== undefined && it.price !== undefined ? `${it.qty} × ${money(it.price, r.currency)}` : undefined} />
              <button type="button" aria-label={`품목 ${i + 1} 지우기`} onClick={() => up({ items: f.items.filter((_, m) => m !== i) })} className="w-10 h-10 flex-none inline-flex items-center justify-center text-muted rounded-md hover:bg-gray-100"><Icon name="close" size={20} /></button>
            </div>
          ))}
          <TextLink onClick={() => up({ items: [...f.items, { name: "" }] })} className="self-start">품목 추가</TextLink>
        </div>

        <Field label={label("결제 카드", cardTag)} hint={matchNote(match, r)}>
          <Select value={f.pay} onChange={(e) => up({ pay: e.target.value })}>
            {match.candidates.map((id) => <option key={id} value={`card:${id}`}>{cardLabel(id)}{id === match.cardId && match.level !== "bin" ? " · 추천" : ""}</option>)}
            <option value="cash">카드 선택 안 함 (현금)</option>
          </Select>
        </Field>
        {willLearn && <Cap>저장하면 카드번호 앞자리 {willLearn}를 이 카드에 기억해요. 다음부터 카드사 표기가 달라도 번호로 바로 골라요.</Cap>}
        {/* 카드가 2장 이상이고 AI가 추론했으면 후보를 바로 고를 수 있게 (추천 → 같은 카드사 → 나머지) */}
        {userCards.length > 1 && (match.level === "card" || match.level === "issuer" || match.level === "issuer_ambiguous") && (
          <div className="flex flex-col gap-1.5"><Cap>후보 카드</Cap><div className="flex gap-2 flex-wrap">{match.candidates.map((id) => <Chip key={id} on={f.pay === `card:${id}`} onClick={() => up({ pay: `card:${id}` })}>{cardLabel(id)}{id === match.cardId ? " · 추천" : ""}</Chip>)}</div></div>
        )}
        {payType === "credit" && f.inst > 1 && <Note>할부 {f.inst}개월로 읽었어요. 무이자 여부는 저장 후 거래 수정에서 바꿀 수 있어요.</Note>}
        {industry === "fuel" && <Field label="주유량"><Input inputMode="decimal" value={f.fuel} onChange={(e) => up({ fuel: decimal(e.target.value) })} suffix="L" /></Field>}
      </>)}

      {r.isCancel && (origs.length > 0 ? (
        <div className="flex flex-col gap-2"><span className="text-label text-body">{byApproval ? "원래 결제 (승인번호가 같은 결제)" : `원래 결제 (최근 90일 · 비슷한 가맹점 · ${money(total, r.currency)} 이상)`}</span>
          <Card pad="px-4 py-1" className="gap-0" role="radiogroup" aria-label="원래 결제">
            {[...origs, undefined].map((t, i) => {
              const id = t?.id ?? "income", on = f.orig === id || (f.orig === "" && byApproval && t?.id === origs[0].id);
              return (
                <button key={id} type="button" role="radio" aria-checked={on} onClick={() => up({ orig: id })} className={cx("flex items-center gap-3 py-3 text-left", i < origs.length && "border-b border-line")}>
                  <Icon name={on ? "radio_button_checked" : "radio_button_unchecked"} size={20} className={on ? "text-primary" : "text-muted"} />
                  <span className="flex-1 min-w-0 flex flex-col gap-0.5"><span className="text-label text-strong truncate">{t ? t.merchant : "목록에 없어요"}</span><Cap>{t ? `${fmtMd(t.date)} · ${t.cardId ? cardLabel(t.cardId) : PAY_TYPE[t.payType]}` : `수입 '${categoryPath(categories, refundCat)}' 카테고리로 저장해요`}</Cap></span>
                  {t && byApproval && <Badge kind="success">승인번호 일치</Badge>}
                  {t && <span className="text-label text-strong whitespace-nowrap">{money(remainingFor(t, txns, doc), t.currency === r.currency ? t.currency : "KRW")}</span>}
                </button>
              );
            })}
          </Card>
        </div>
      ) : <Note>최근 90일 안에 이 가맹점에서 {money(total, r.currency)} 이상 결제한 기록이 없어요. 수입 &apos;{categoryPath(categories, refundCat)}&apos; 카테고리로 저장할까요? 아니면 건너뛰어 주세요.</Note>)}

      {/* 교수님 질문 대비: 각 값이 어디서 왔는지 화면에서 바로 설명 */}
      <details className="rounded-md border border-line px-3.5 py-3 text-caption text-muted">
        <summary className="text-label text-strong cursor-pointer">이 값들은 어떻게 나왔나요?</summary>
        <ol className="mt-2 pl-4 list-decimal flex flex-col gap-1.5">
          <li>AI(OpenAI)가 이미지·PDF를 직접 읽어 문서 종류(영수증·결제 문자·명세서)를 가리고, 가맹점·결제일·시각·금액·품목·카드 정보를 정해진 형식으로 꺼내요. 글자만 뽑는 OCR 단계를 따로 거치지 않아요.</li>
          <li>문서에 없어 앞뒤 내용으로 채운 값은 &apos;추론&apos;, AI가 확실하지 않다고 한 값은 &apos;확인 필요&apos;, 직접 고친 값은 &apos;수정함&apos;으로 보여요.</li>
          <li>업종은 ① 내가 전에 고친 기록 ② AI 분류 ③ 가맹점 사전(예: 스타벅스 → 카페) 순서로 정해요. 셋 다 없으면 미분류로 두고 골라달라고 해요. 업종은 카드 혜택 계산에, 카테고리는 가계부 통계에 쓰여요.</li>
          <li>품목은 영수증에서만 읽어요. 결제 문자·명세서에는 품목이 없어 비워 두고, 필요하면 직접 적을 수 있어요.</li>
          <li>카드는 카드번호 앞자리가 등록한 카드와 같으면 확정하고, 아니면 카드사·카드명으로 추론해요. 혜택 금액은 AI가 아니라 계산 엔진이 셈해요.</li>
        </ol>
      </details>

      <div className="flex gap-2">
        <Button variant="secondary" className="flex-1 px-3" onClick={onBack}>목록으로</Button>
        <Button variant="secondary" className="flex-1 px-3" onClick={onSkip}>건너뛰기</Button>
        <Button className="flex-[2] px-3" disabled={disabled} onClick={save}>{r.isCancel ? (refundTo === "orig" ? "환불로 저장" : refundTo === "income" ? "수입으로 저장" : "원거래 선택") : dup ? "그래도 저장" : "확인하고 저장"}</Button>
      </div>
    </>
  );
}
