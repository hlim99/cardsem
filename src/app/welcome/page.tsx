"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loading } from "@/components/shell";
import { Button, Cap, CardChip, Check, cx, Icon, Input, PageTitle } from "@/components/ui";
import { useStore } from "@/lib/store";
import { supabase } from "@/lib/supabase";
import { cardSearch } from "@/lib/data/cards";

/* 소셜(카카오) 로그인 가입 절차: 1. 닉네임(필수) → 2. 쓰는 카드(건너뛰기 가능) → 홈.
 * 카카오 인증이 끝나면 Supabase가 이 화면으로 돌려보낸다(login/page.tsx). 이미 닉네임이 있으면(가입을 마친 사용자) 바로 홈으로.
 * 닉네임은 user_metadata.nickname·name에 둔다 — nickname이 있으면 가입을 마친 것으로 본다(store.tsx의 needsProfile) */
const NICK_MAX = 12;

export default function WelcomePage() {
  const router = useRouter();
  const { loading, me, catalog, userCards, addUserCard, today } = useStore();
  const [step, setStep] = useState<1 | 2>(1);
  const [nick, setNick] = useState<string | null>(null); // null = 아직 카카오 닉네임으로 채우기 전
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);

  // 로그인 안 함(데모) → 로그인 화면, 가입을 이미 마침 → 홈
  useEffect(() => {
    if (loading) return;
    if (!me) router.replace("/login");
    else if (!me.needsProfile && step === 1) router.replace("/home");
  }, [loading, me, step, router]);
  if (loading || !me || (!me.needsProfile && step === 1)) return <Loading />;

  const value = nick ?? me.name.slice(0, NICK_MAX); // 카카오 프로필 닉네임을 기본값으로
  const nickOk = value.trim().length >= 2 && value.trim().length <= NICK_MAX;
  const saveNick = async () => {
    setBusy(true); setErr(null);
    const name = value.trim();
    const { error } = await supabase().auth.updateUser({ data: { nickname: name, name } });
    setBusy(false);
    if (error) setErr(error.message); else setStep(2);
  };
  // 전체 카드(대표 카드 먼저), 검색하면 걸러서. 이미 등록한 카드는 뺀다
  const list = cardSearch(catalog, q).filter((c) => !userCards.some((u) => u.cardId === c.id));
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const finish = () => {
    // 패키지를 고르는 카드는 첫 패키지로 등록 (카드 상세에서 바꿀 수 있다)
    for (const id of picked) addUserCard({ cardId: id, variantId: catalog.find((c) => c.id === id)?.variants?.[0]?.id, addedAt: today });
    router.replace("/home");
  };

  return (
    <div className="min-h-screen bg-white md:bg-page flex items-center justify-center">
      <div className="w-full max-w-105 bg-white md:rounded-2xl md:border md:border-line md:shadow-2 flex flex-col min-h-screen md:min-h-190 px-5 pt-4 pb-8 gap-8">
        <div className="flex gap-1.5">{[1, 2].map((i) => <i key={i} className={cx("flex-1 h-1 rounded", i <= step ? "bg-primary" : "bg-gray-200")} />)}</div>
        {step === 1 ? (<>
          <PageTitle title="반가워요! 뭐라고 불러드릴까요?" desc="카드셈에서 쓸 닉네임이에요. 나중에 바꿀 수 있어요." />
          <form className="flex flex-col gap-2" onSubmit={(e) => { e.preventDefault(); if (nickOk && !busy) saveNick(); }}>
            <Input icon="person" placeholder="닉네임 (2~12자)" value={value} maxLength={NICK_MAX} onChange={(e) => setNick(e.target.value)} autoFocus aria-label="닉네임" />
            <Cap className={cx(!nickOk && value.length > 0 && "text-red-700")}>{value.trim().length}/{NICK_MAX}자{!nickOk && value.length > 0 ? " · 2자 이상 써주세요" : ""}</Cap>
            {err && <Cap className="text-red-700">{err}</Cap>}
            <Button type="submit" className="mt-auto" disabled={!nickOk || busy}>{busy ? "저장하는 중…" : "다음 · 쓰는 카드 고르기"}</Button>
          </form>
        </>) : (<>
          <PageTitle title="지금 쓰는 카드를 골라주세요" desc="고른 카드로 결제마다 혜택을 셈해요. 나중에 내 카드에서 추가할 수 있어요." />
          <label className="h-12 rounded-md bg-gray-100 flex items-center px-3.5 gap-2.5 focus-within:shadow-focus">
            <Icon name="search" size={20} className="text-muted" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="카드사·카드명 검색" className="flex-1 min-w-0 bg-transparent outline-none focus-visible:shadow-none" />
          </label>
          <ul className="flex-1 flex flex-col overflow-y-auto -mx-1">
            {list.map((c) => (
              <li key={c.id}>
                {/* 줄 어디를 눌러도 체크박스(버튼)가 눌린다 — label은 안쪽 버튼을 대상으로 삼는다 */}
                <label className="w-full flex items-center gap-3 px-1 py-3 cursor-pointer">
                  <CardChip color={c.color} w={40} h={26} />
                  <span className="flex-1 min-w-0 flex flex-col"><span className="text-body font-semibold text-strong truncate">{c.issuer} {c.name}</span><Cap>{c.type === "check" ? "체크카드" : "신용카드"}</Cap></span>
                  <Check on={picked.includes(c.id)} onChange={() => toggle(c.id)} label={`${c.issuer} ${c.name}`} />
                </label>
              </li>
            ))}
            {list.length === 0 && <Cap className="py-6 text-center">찾는 카드가 없어요. 홈에서 내 카드 → 직접 추가로 만들 수 있어요.</Cap>}
          </ul>
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => router.replace("/home")}>건너뛰기</Button>
            <Button className="flex-[2]" onClick={finish} disabled={picked.length === 0}>{picked.length ? `${picked.length}장 등록하고 시작하기` : "카드를 골라주세요"}</Button>
          </div>
        </>)}
      </div>
    </div>
  );
}
