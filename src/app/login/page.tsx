"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Cap, Input, PageTitle } from "@/components/ui";
import { authErrorMessage, SUPABASE_READY, supabase } from "@/lib/supabase";
import { useStore } from "@/lib/store";

/* ACC-01 — Supabase Auth 이메일·카카오 로그인. 환경변수가 없으면 데모 모드 안내만. 소셜 로그인은 카카오만 둔다.
 * 카카오: Supabase가 카카오 인증을 대신 받고 /welcome(가입 절차)으로 돌려보낸다. 이미 가입을 마친 사용자는 /welcome이 바로 홈으로 보낸다.
 * 비밀번호 찾기: 재설정 메일 → 링크가 이 화면(#…type=recovery)으로 돌아오면 새 비밀번호를 받는다.
 * Supabase 대시보드 Auth → URL Configuration의 Redirect URLs에 <사이트>/login 이 있어야 이 화면으로 돌아온다 */
export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState(""); const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null); const [info, setInfo] = useState<string | null>(null);
  const [recovery, setRecovery] = useState(false);
  const { me, loading, enterDemo } = useStore();
  // 이미 로그인했으면 홈으로 (비밀번호 재설정 링크로 들어온 경우는 새 비밀번호를 받아야 하니 그대로)
  useEffect(() => { if (!loading && me && !recovery) router.replace("/home"); }, [loading, me, recovery, router]);
  const demo = () => { enterDemo(); router.push("/home"); };
  // 재설정 링크로 들어왔는지. 스토어(부모)가 Supabase 클라이언트를 만들며 주소의 토큰을 지우기 전에 자식인 이 효과가 먼저 돈다.
  // 만료됐거나 이미 쓴 링크는 type=recovery 없이 #error=access_denied&error_code=otp_expired… 로 돌아온다
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { const h = window.location.hash; if (h.includes("type=recovery")) setRecovery(true); else if (h.includes("error_code=")) setErr("재설정 링크가 만료됐거나 이미 쓰였어요. 비밀번호 찾기를 다시 눌러주세요"); }, []);
  const forgot = async () => {
    if (!SUPABASE_READY) { setErr("Supabase 환경변수가 없어 비밀번호 찾기를 쓸 수 없어요"); return; }
    if (!email) { setErr("가입한 이메일을 먼저 입력해주세요"); return; }
    setBusy(true); setErr(null); setInfo(null);
    const { error } = await supabase().auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/login` });
    setBusy(false);
    if (error) setErr(authErrorMessage(error)); else setInfo(`${email}로 재설정 메일을 보냈어요. 메일의 링크를 누르면 새 비밀번호를 정할 수 있어요.`);
  };
  const setNewPw = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pw.length < 8 || !/[a-zA-Z]/.test(pw) || !/\d/.test(pw)) { setErr("비밀번호는 8자 이상, 영문과 숫자를 포함해야 해요"); return; }
    setBusy(true); setErr(null);
    const { error } = await supabase().auth.updateUser({ password: pw });
    setBusy(false);
    if (error) setErr(authErrorMessage(error)); else router.push("/home");
  };
  const kakao = async () => {
    if (!SUPABASE_READY) { setErr("Supabase 환경변수가 없어 로그인을 쓸 수 없어요. 데모로 보기를 눌러주세요"); return; }
    setBusy(true); setErr(null);
    // 성공하면 카카오 화면으로 이동하므로 여기로 돌아오지 않는다. 돌아올 주소는 Supabase Redirect URLs에 있어야 한다
    const { error } = await supabase().auth.signInWithOAuth({ provider: "kakao", options: { redirectTo: `${window.location.origin}/welcome` } });
    if (error) { setBusy(false); setErr(authErrorMessage(error)); }
  };
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); if (!SUPABASE_READY) { setErr("Supabase 환경변수가 없어 로그인을 쓸 수 없어요. 데모로 보기를 눌러주세요"); return; }
    setBusy(true); setErr(null);
    const { error } = await supabase().auth.signInWithPassword({ email, password: pw });
    setBusy(false);
    if (error) setErr(authErrorMessage(error)); else router.push("/home");
  };
  return (
    <div className="min-h-screen bg-white md:bg-page flex items-center justify-center">
      <div className="w-full max-w-[420px] bg-white md:rounded-2xl md:border md:border-line md:shadow-2 px-6 py-16 md:py-12 flex flex-col gap-10 min-h-screen md:min-h-0">
        <div className="flex flex-col gap-5">
          <span className="w-14 h-14 rounded-lg bg-primary text-white inline-flex items-center justify-center font-bold text-h1">셈</span>
          <PageTitle title={<>카드 혜택,<br />결제마다 셈해드려요</>} desc="가진 카드로 받은 혜택과 놓친 혜택을 한눈에 봐요." />
        </div>
        {recovery ? (
          <form className="flex flex-col gap-3" onSubmit={setNewPw}>
            <span className="text-h3 text-strong">새 비밀번호 정하기</span>
            <Input icon="lock" type="password" placeholder="8자 이상, 영문·숫자 포함" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} required />
            {err && <Cap className="text-red-700">{err}</Cap>}
            <Button type="submit" disabled={busy}>{busy ? "바꾸는 중…" : "비밀번호 바꾸기"}</Button>
          </form>
        ) : (
        <form className="flex flex-col gap-3" onSubmit={submit}>
          <Input icon="mail" type="email" placeholder="이메일" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <Input icon="lock" type="password" placeholder="비밀번호" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} required />
          {err && <Cap className="text-red-700">{err}</Cap>}
          {info && <Cap className="text-blue-700">{info}</Cap>}
          <Button type="submit" disabled={busy}>{busy ? "처리 중…" : "로그인"}</Button>
          <div className="flex justify-center gap-4 text-caption"><button type="button" onClick={forgot} disabled={busy} className="text-muted">비밀번호 찾기</button><span className="text-line-strong">|</span><Link href="/signup" className="text-link font-semibold">회원가입</Link></div>
        </form>
        )}
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3 text-caption text-muted"><i className="flex-1 h-px bg-line" />소셜 계정으로 계속<i className="flex-1 h-px bg-line" /></div>
          <div className="flex gap-2">
            <button type="button" onClick={kakao} disabled={busy} className="flex-1 h-12 rounded-md bg-[#FEE500] text-[#191919] font-semibold text-label disabled:opacity-50">카카오</button>
          </div>
        </div>
        <div className="mt-auto flex flex-col gap-3 items-center">
          <Button variant="tonal" size="md" onClick={demo}>로그인 없이 데모 보기</Button>
          <Cap className="text-center">혜택 금액은 참고용 계산값이에요. 실제 청구 할인액과 다를 수 있어요.</Cap>
        </div>
      </div>
    </div>
  );
}
