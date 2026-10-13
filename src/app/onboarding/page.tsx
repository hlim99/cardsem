"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loading } from "@/components/shell";
import { Badge, Button, Card, CardChip, Cap, Chip, cx, Note, Num, PageTitle } from "@/components/ui";
import { num } from "@/lib/format";
import { useStore } from "@/lib/store";
import { cardById } from "@/lib/data/cards";

/* 온보딩 1(소개) → 2(예산) → 3(카드 등록 = /cards/add, 하단 'N장 등록하고 시작하기'로 홈).
 * 카드 등록은 별도 화면이라 마지막에 둔다 — 예산 단계가 실제 흐름 안에 들어오게 */
export default function OnboardingPage() {
  const router = useRouter();
  const { budgets, setBudgets, loading, me, demoOn } = useStore();
  const out = !loading && !me && !demoOn; // 로그인도 데모 선택도 안 했으면 로그인 화면으로 (AppShell과 같은 규칙)
  useEffect(() => { if (out) router.replace("/login"); }, [out, router]);
  const [step, setStep] = useState<1 | 2>(1);
  const [budget, setBudget] = useState(1500000);
  const ml = cardById("shinhan_mrlife")!, hz = cardById("hyundai_zero3")!, pp = cardById("shinhan_pointplan")!;
  // 예산 단계에 들어갈 때 현재 총예산으로 채운다
  const toBudget = () => { setBudget(budgets.find((b) => !b.categoryId)?.amount ?? 1500000); setStep(2); };
  // 총예산 행이 없어도 저장되게: 카테고리 예산은 그대로 두고 총예산만 바꾼다
  const saveBudget = () => { setBudgets([...budgets.filter((b) => b.categoryId), { amount: budget }]); router.push("/cards/add"); };
  // AppShell 밖이라 직접 막는다: 로그인 장부를 읽는 동안 데모 시드가 비치거나, 이때 저장한 예산이 읽기가 끝나며 덮여 사라지지 않게
  if (loading || out) return <Loading />;
  return (
    <div className="min-h-screen bg-white md:bg-page flex items-center justify-center">
      <div className="w-full max-w-105 bg-white md:rounded-2xl md:border md:border-line md:shadow-2 flex flex-col min-h-screen md:min-h-190 px-5 pt-4 pb-8 gap-8">
        <div className="flex gap-1.5">{[1, 2, 3].map((i) => <i key={i} className={cx("flex-1 h-1 rounded", i <= step ? "bg-primary" : "bg-gray-200")} />)}</div>
        {step === 1 ? (<>
          <PageTitle title="카드사 앱은 자기 카드만 보여줘요" desc="카드셈은 가진 카드 전부를 한 화면에 놓고, 결제마다 어떤 카드가 얼마를 더 주는지 셈해요." />
          <div className="flex-1 flex flex-col gap-3 justify-center">
            <Card className="border-violet-200 bg-benefit-soft flex-row items-center"><CardChip color={ml.color} w={40} h={26} /><span className="flex-1 flex flex-col"><span className="text-body font-semibold text-strong">신한 Mr.Life</span><Cap>Time 할인 Night 10% · 잔여 9,200원</Cap></span><Badge kind="primary">최적</Badge><Num className="text-benefit">610원</Num></Card>
            <Card className="flex-row items-center"><CardChip color={hz.color} w={40} h={26} /><span className="flex-1 flex flex-col"><span className="text-body font-semibold text-strong">현대 ZERO Edition3</span><Cap>M포인트 1.2%</Cap></span><Num className="text-body">73원</Num></Card>
            <Card className="flex-row items-center"><CardChip color={pp.color} w={40} h={26} /><span className="flex-1 flex flex-col"><span className="text-body font-semibold text-strong">신한 Point Plan</span><Cap>건당 0.5%</Cap></span><Num className="text-muted">30원</Num></Card>
          </div>
          <div className="flex gap-2"><Button variant="secondary" className="flex-1" href="/home">건너뛰기</Button><Button className="flex-[2]" onClick={toBudget}>다음 · 예산 정하기</Button></div>
        </>) : (<>
          <PageTitle title="이번 달 예산을 정해볼까요?" desc="나중에 예산 화면에서 바꿀 수 있어요." />
          <div className="flex flex-col gap-4">
            <label className="flex flex-col gap-1 py-2"><Cap>총 예산</Cap><span className="flex items-baseline gap-1 border-b-2 border-primary pb-2"><input inputMode="numeric" value={num(budget)} onChange={(e) => setBudget(Number(e.target.value.replace(/[^\d]/g, "")) || 0)} className="flex-1 min-w-0 text-display tracking-title text-strong outline-none focus-visible:shadow-none" /><span className="text-h3 text-muted">원</span></span></label>
            <div className="flex gap-2 flex-wrap">{[1000000, 1500000, 2000000].map((v) => <Chip key={v} on={budget === v} onClick={() => setBudget(v)}>{v / 10000}만</Chip>)}</div>
          </div>
          <Note icon="notifications">예산의 80%·100%에 닿으면 알림 화면에서 알려드려요.</Note>
          <div className="mt-auto flex gap-2"><Button variant="secondary" className="flex-1" onClick={() => setStep(1)}>이전</Button><Button className="flex-[2]" onClick={saveBudget} disabled={budget <= 0}>다음 · 카드 등록</Button></div>
        </>)}
      </div>
    </div>
  );
}
