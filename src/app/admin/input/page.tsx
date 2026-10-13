"use client";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Screen } from "@/components/shell";
import { Badge, Button, Card, CardTitle, Cap, Field, Input, Note, Select } from "@/components/ui";
import { useStore } from "@/lib/store";
import { num } from "@/lib/format";
import { aiNormalize } from "@/lib/ai/client";
import { SUPABASE_READY } from "@/lib/supabase";
import { approvedCard, FORM_KEY, ISSUERS, shortName, type Draft } from "../admin";
import { AdminSteps } from "../steps";

type Form = Omit<Draft, "id" | "rules" | "at">;
/* 요구사항: CARD-05 출처 표시. 수집은 관리자가 고른 URL 한 장씩만 (사이트 전체 크롤링은 안 함) */
const GUIDE = ["출처 URL만 넣고 실행하면 AI가 그 페이지를 읽어 카드명 · 카드사 · 혜택 원문까지 채워요.", "페이지를 못 읽으면 혜택 · 유의사항 영역을 직접 복사해 붙여 넣어요. 요약하지 않아요.", "원문과 출처 URL을 같이 넣으면 둘 다 읽어요 — 원문을 우선하고, 원문에 없는 혜택은 출처 페이지에서 보충해요. 출처 URL은 함께 저장돼요. 출처 URL과 확인일은 카드 규칙 · 카드 상세 화면에 보여요.", "AI가 만든 규칙은 바로 카드 상품에 반영돼요. 틀린 혜택은 카드 규칙 화면에서 그 혜택만 삭제하거나, 카드를 삭제하고 다시 만들어요."];
const hhmm = (t: number) => new Date(t).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });

/* DAT-01 원문 붙여넣기 → DAT-02 AI 규칙 만들기 (/api/normalize) → 바로 반영하고 카드 규칙 화면으로.
 * ?issuer=&name= 으로 오면 그 카드의 빈 폼, 아니면 임시 저장한 폼, 그것도 없으면 빈 폼 */
export default function AdminInputPage() {
  return <Suspense><InputForm /></Suspense>;
}

function InputForm() {
  const router = useRouter();
  const sp = useSearchParams();
  const { today, catalog, me, addCustomCard } = useStore();
  // Supabase가 켜진 배포에서는 /api/normalize가 관리자 토큰만 받는다 → 로그인 안 한 데모 사용자는 미리 안내하고 버튼을 막는다
  const needAdmin = SUPABASE_READY && !me?.admin;
  const fromQuery = sp.has("issuer") || sp.has("name");
  const [form, setForm] = useState<Form>(() => {
    return { issuer: sp.get("issuer") ?? ISSUERS[0], name: sp.get("name") ?? "", sourceUrl: "", checkedAt: today, validFrom: "", text: "" };
  });
  const [saved, setSaved] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  // 임시 저장한 폼 복원 (localStorage는 마운트 후에만 읽을 수 있다). 특정 카드를 고르고 들어왔으면 복원하지 않음
  useEffect(() => {
    if (fromQuery) return;
    try {
      const s = JSON.parse(localStorage.getItem(FORM_KEY) ?? "null");
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (s && typeof s.text === "string") { const { savedAt, ...f } = s; setForm((cur) => ({ ...cur, ...f })); setSaved(savedAt ?? null); }
    } catch { /* 무시 */ }
  }, [fromQuery]);

  const save = () => {
    try { const at = Date.now(); localStorage.setItem(FORM_KEY, JSON.stringify({ ...form, savedAt: at })); setSaved(at); setErr(""); }
    catch { setErr("이 브라우저에서는 임시 저장을 쓸 수 없어요"); }
  };
  // DAT-02: /api/normalize → 규칙을 카드로 바로 반영 (검수 단계 없음)
  const run = async () => {
    // 출처·확인일은 카드 상세에 사용자에게 보이므로 비운 채 반영하지 않게 (CARD-05). 원문이 비면 URL만으로 AI가 페이지를 읽는다
    if (!form.sourceUrl.trim() || !form.checkedAt) { setErr("출처 URL과 확인일을 채워주세요"); return; }
    const byUrl = !form.text.trim();
    if (!byUrl && !form.name.trim()) { setErr("카드명을 채워주세요 (원문을 비우면 URL만으로 카드명까지 채워요)"); return; }
    // 반영은 항상 새 카드(custom_…)라서, 같은 이름이 있으면 카드 추가 목록에 두 장이 생긴다
    if (form.name.trim() && catalog.some((c) => c.issuer === form.issuer && c.name.trim() === form.name.trim()) && !confirm("같은 이름의 카드가 이미 있어요. 별도 카드로 추가할까요?")) return;
    setBusy(true); setErr(""); save();
    try {
      const id = `custom_${Date.now().toString(36)}`;
      // URL은 늘 보낸다 — 원문이 있어도 서버가 출처 페이지를 함께 읽어 원문에 없는 조항을 보충한다
      const { rules, page, sourceRead } = await aiNormalize(form.text, id, form.name.trim() ? shortName(form) : "", form.sourceUrl.trim());
      // URL만으로 만들었으면 비어 있던 카드명은 페이지에서 읽은 값, 카드사도 페이지 값으로 (원문은 rawText로 남긴다)
      const filled = page ? { ...form, name: form.name.trim() || page.name, issuer: page.issuer || form.issuer, text: page.text } : form;
      // 검수 단계 없이 바로 반영한다 (시연 흐름을 단순하게). 결과는 카드 규칙 화면에서 펼쳐 보고, 틀리면 카드 삭제 후 다시 만든다
      addCustomCard(approvedCard({ ...filled, id }, rules));
      try { localStorage.removeItem(FORM_KEY); } catch { /* 무시 */ }
      if (sourceRead === false) alert("출처 페이지를 읽지 못해 붙여 넣은 원문만으로 규칙을 만들었어요. 출처 URL은 함께 저장됐어요.");
      router.push(`/admin/rules?id=${id}`);
    } catch (e) { setErr((e as Error).message); setBusy(false); }
  };
  const actions = (
    <>
      {saved && <Cap>임시 저장 {hhmm(saved)}</Cap>}
      <Button variant="secondary" size="md" onClick={save}>임시 저장</Button>
      <Button size="md" icon="auto_awesome" onClick={run} disabled={busy || needAdmin} title={needAdmin ? "관리자 계정으로 로그인해야 실행할 수 있어요" : undefined}>{busy ? "규칙 만드는 중… (1~2분)" : "AI로 규칙 만들기"}</Button>
    </>
  );
  return (
    <Screen title="카드 원문 입력" desc="카드사 페이지 주소만 넣거나 혜택 문구를 붙여 넣으면 AI가 계산 규칙으로 정리해요" right={<span className="hidden md:flex items-center gap-2">{actions}</span>}>
      <AdminSteps />
      <div className="grid md:grid-cols-[minmax(0,1fr)_--spacing(90)] gap-4 items-start">
        <Card className="gap-4">
          {needAdmin && <Note icon="lock" tone="amber">AI로 규칙 만들기는 관리자 계정으로 로그인해야 실행할 수 있어요 (서버의 OpenAI 키를 쓰기 때문). 원문 입력과 임시 저장은 그대로 돼요.</Note>}
          {err && <Note icon="error" tone="amber">{err}</Note>}
          <div className="grid md:grid-cols-2 gap-3">
            <Field label="카드명" hint="원문을 비우면 페이지에서 읽어 채워요"><Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="예: Mr.Life" /></Field>
            <Field label="카드사" hint="목록에 없으면 기타"><Select value={form.issuer} onChange={(e) => set("issuer", e.target.value)}>{[...new Set([...ISSUERS, form.issuer])].map((i) => <option key={i}>{i}</option>)}</Select></Field>
          </div>
          <div className="grid md:grid-cols-[1fr_--spacing(50)] gap-3">
            <Field label="출처 URL" hint="이것만 넣고 실행해도 돼요. 카드 상세에 표시돼요"><Input icon="link" type="url" value={form.sourceUrl} onChange={(e) => set("sourceUrl", e.target.value)} placeholder="https://" /></Field>
            <Field label="확인일" hint="그 페이지를 확인한 날"><Input type="date" value={form.checkedAt} onChange={(e) => set("checkedAt", e.target.value)} /></Field>
          </div>
          <Field label={<span className="flex justify-between">혜택 원문<Cap>rawText로 규칙에 함께 저장돼요 · {num(form.text.length)}자</Cap></span>}>
            <textarea value={form.text} onChange={(e) => set("text", e.target.value)} rows={16} placeholder="비워 두면 출처 URL 페이지를 AI가 읽어요. 못 읽으면 혜택·유의사항을 그대로 붙여 넣어요" className="w-full rounded-md border border-line-strong px-4 py-3.5 leading-relaxed outline-none focus:border-line-focus focus:shadow-focus" />
          </Field>
          <div className="md:hidden flex flex-wrap items-center justify-end gap-2">{actions}</div>
        </Card>
        <div className="flex flex-col gap-4">
          <Card>
            <CardTitle>입력 가이드</CardTitle>
            {GUIDE.map((t, i) => <div key={i} className="flex gap-2.5 text-caption text-body"><span className="w-5 h-5 rounded-full bg-gray-100 text-muted inline-flex items-center justify-center text-overline flex-none">{i + 1}</span><span>{t}</span></div>)}
          </Card>
          <Card>
            <CardTitle>AI 규칙 만들기 설정</CardTitle>
            <div className="flex items-center gap-3"><span className="flex-1 flex flex-col"><span className="text-label text-strong">출력 스키마</span><Cap>BenefitRule (src/lib/types.ts)</Cap></span><Badge kind="info">고정</Badge></div>
            <div className="flex items-center gap-3"><span className="flex-1 flex flex-col"><span className="text-label text-strong">rawText 함께 저장</span><Cap>규칙마다 근거가 된 원문 문장을 붙여요</Cap></span><Badge kind="info">고정</Badge></div>
            <label className="flex items-center gap-3"><span className="flex-1 flex flex-col"><span className="text-label text-strong">유효 시작일</span><Cap>결제일 기준 · 비우면 처음부터 적용</Cap></span><Input type="date" value={form.validFrom} onChange={(e) => set("validFrom", e.target.value)} className="w-40 h-9" /></label>
          </Card>
        </div>
      </div>
    </Screen>
  );
}
