"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Cap, Check, Field, Icon, Input, PageTitle } from "@/components/ui";
import { authErrorMessage, SUPABASE_READY, supabase } from "@/lib/supabase";

/* Supabase Auth 이메일 가입. 프로젝트 설정이 "이메일 확인 필요"면 메일 링크를 누른 뒤 로그인하라고 안내 */
export default function SignupPage() {
  const router = useRouter();
  const [agree, setAgree] = useState([false, false, false]); // 동의는 사용자가 직접 표시해야 유효
  const [f, setF] = useState({ name: "", email: "", pw: "", pw2: "" });
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null); const [sent, setSent] = useState(false);
  const pwOk = f.pw.length >= 8 && /[a-zA-Z]/.test(f.pw) && /\d/.test(f.pw);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!SUPABASE_READY) { setErr("Supabase 환경변수가 없어 가입을 쓸 수 없어요"); return; }
    if (!pwOk) { setErr("비밀번호는 8자 이상, 영문과 숫자를 포함해야 해요"); return; }
    if (f.pw !== f.pw2) { setErr("비밀번호 확인이 달라요"); return; }
    setBusy(true); setErr(null);
    const { data, error } = await supabase().auth.signUp({ email: f.email, password: f.pw, options: { data: { name: f.name.trim() || f.email.split("@")[0], notify: agree[2] } } });
    setBusy(false);
    if (error) { setErr(authErrorMessage(error)); return; }
    if (data.session) router.push("/onboarding"); else setSent(true); // 세션이 없으면 이메일 확인 대기
  };
  if (sent) return (
    <div className="min-h-screen bg-white md:bg-page flex items-center justify-center">
      <div className="w-full max-w-[420px] bg-white md:rounded-2xl md:border md:border-line md:shadow-2 px-6 py-16 flex flex-col gap-6 items-center text-center min-h-screen md:min-h-0">
        <span className="w-14 h-14 rounded-full bg-primary-soft text-primary inline-flex items-center justify-center"><Icon name="mark_email_unread" size={28} /></span>
        <PageTitle title="메일을 확인해주세요" desc={`${f.email}로 인증 링크를 보냈어요. 링크를 누른 뒤 로그인하면 돼요.`} />
        <Button variant="tonal" size="md" href="/login">로그인으로</Button>
      </div>
    </div>
  );
  return (
    <div className="min-h-screen bg-white md:bg-page flex items-center justify-center">
      <div className="w-full max-w-[420px] bg-white md:rounded-2xl md:border md:border-line md:shadow-2 flex flex-col min-h-screen md:min-h-0">
        <header className="h-14 flex items-center px-2"><button type="button" aria-label="뒤로" onClick={() => router.back()} className="w-11 h-11 inline-flex items-center justify-center text-strong"><Icon name="chevron_left" size={24} /></button><span className="text-h3 text-strong">회원가입</span></header>
        <form className="flex-1 px-5 pb-8 flex flex-col gap-7" onSubmit={submit}>
          <PageTitle title="이메일로 시작해요" desc="장부는 한 사람당 하나, 공유하지 않아요." />
          <div className="flex flex-col gap-3">
            <Field label="이름"><Input icon="person" placeholder="장부에 표시할 이름" autoComplete="name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
            <Field label="이메일"><Input icon="mail" type="email" autoComplete="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} required /></Field>
            <Field label="비밀번호" hint={f.pw && !pwOk ? "8자 이상, 영문·숫자 포함" : undefined}><Input icon="lock" type={show ? "text" : "password"} placeholder="8자 이상, 영문·숫자 포함" autoComplete="new-password" value={f.pw} onChange={(e) => setF({ ...f, pw: e.target.value })} required suffix={<button type="button" aria-label={show ? "비밀번호 숨기기" : "비밀번호 보기"} onClick={() => setShow((v) => !v)}><Icon name={show ? "visibility" : "visibility_off"} size={20} /></button>} /></Field>
            <Field label="비밀번호 확인" error={f.pw2 && f.pw !== f.pw2 ? "비밀번호가 달라요" : undefined}><Input icon="lock" type={show ? "text" : "password"} autoComplete="new-password" value={f.pw2} onChange={(e) => setF({ ...f, pw2: e.target.value })} required error={!!f.pw2 && f.pw !== f.pw2} /></Field>
          </div>
          <div className="flex flex-col gap-3.5">
            <label className="flex items-center gap-2.5 pb-3.5 border-b border-line"><Check on={agree.every(Boolean)} onChange={(v) => setAgree([v, v, v])} label="전체 동의" /><span className="text-label text-strong font-semibold flex-1">전체 동의</span></label>
            {["[필수] 이용약관 동의", "[필수] 개인정보 처리방침 동의", "[선택] 예산·실적 알림 받기"].map((t, i) => (
              <label key={t} className="flex items-center gap-2.5"><Check on={agree[i]} onChange={(v) => setAgree((a) => a.map((x, j) => (j === i ? v : x)))} label={t} /><span className="text-label text-body flex-1">{t}</span></label>
            ))}
          </div>
          {err && <Cap className="text-red-700">{err}</Cap>}
          <Button type="submit" className="mt-auto" disabled={!agree[0] || !agree[1] || busy}>{busy ? "가입 중…" : "가입하기"}</Button>
        </form>
      </div>
    </div>
  );
}
