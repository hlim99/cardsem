"use client";
import { Screen } from "@/components/shell";
import { Card, Cap, ListRow } from "@/components/ui";
import { useStore, DEMO_USER } from "@/lib/store";
import { useRouter } from "next/navigation";

export default function SettingsPage() {
  const router = useRouter();
  const { userCards, categories, recurring, reset, me, demoShared, signOut, exitDemo } = useStore();
  return (
    <Screen title="설정" nav>
      <div className="max-w-[720px] w-full mx-auto flex flex-col gap-3">
        <Card pad="p-4" className="flex-row items-center gap-3">
          <span className="w-12 h-12 rounded-full bg-primary-soft text-violet-800 inline-flex items-center justify-center text-h3">{(me?.name ?? DEMO_USER.name)[0]}</span>
          <span className="flex-1 flex flex-col gap-0.5"><span className="text-body font-semibold text-strong">{me?.name ?? DEMO_USER.name}</span><Cap>{me ? `${me.email || "소셜 계정"} · 로그인 계정` : demoShared ? "공용 데모 계정 · 서버에 저장돼 모든 방문자가 함께 써요" : "데모 계정 (로그인 없음) · 이 브라우저에만 저장돼요"}</Cap></span>
        </Card>
        <Card pad="px-4 py-1" className="gap-0">
          <ListRow icon="credit_card" title="내 카드 관리" sub={`${userCards.length}장 등록`} href="/cards" />
          <ListRow icon="category" title="카테고리 관리" sub={`지출 ${categories.filter((c) => c.type === "expense").length} · 수입 ${categories.filter((c) => c.type === "income").length}`} href="/transactions/categories" />
          <ListRow icon="event_repeat" title="반복 거래" sub={`${recurring.length}건 진행 중`} href="/transactions/recurring" last />
        </Card>
        <Card pad="px-4 py-1" className="gap-0">
          <ListRow icon="notifications" title="알림" sub="실적 달성 직전 · 놓친 혜택" href="/notifications" />
          <ListRow icon="download" title="엑셀 내보내기" sub="기간 선택 · 혜택 금액 열 포함" href="/settings/export" last />
        </Card>
        <Card pad="px-4 py-1" className="gap-0">
          {(!me || me.admin) && <ListRow icon="admin_panel_settings" title="어드민 (팀원 전용)" sub="혜택 원문 입력 · LLM 정규화 검수" href="/admin" />}
          {!me && <ListRow icon="restart_alt" title="데모 데이터 초기화" sub={demoShared ? "모든 방문자가 함께 쓰는 데모 장부를 비워요" : "입력한 거래·카드를 모두 비워요"} onClick={() => { if (confirm("데모 데이터를 초기화할까요?")) reset(); }} />}
          <ListRow icon="shield" title="개인정보 처리방침" sub="준비 중이에요" right={<span />} />
          <ListRow icon="logout" title={me ? "로그아웃" : "로그인"} sub={me ? undefined : demoShared ? "로그인하면 내 계정 장부로 바뀌어요. 데모 장부는 서버에 그대로 남아요" : "로그인하면 계정 장부로 바뀌어요. 데모 데이터는 이 브라우저에만 남아요"} onClick={async () => { if (me) await signOut(); else exitDemo(); router.push("/login"); }} right={<span />} />
          <ListRow icon="person_off" title="회원 탈퇴" sub={me ? "계정에 저장된 장부를 모두 지워요" : demoShared ? "데모 모드에서는 데모 장부를 처음 상태로 되돌려요" : "데모 모드에서는 이 브라우저에 저장된 데이터를 모두 지워요"} href="/settings/withdraw" danger last />
        </Card>
        <Cap className="text-disabled">카드셈 v0.9 데모 · 혜택 금액은 참고용 계산값이에요</Cap>
      </div>
    </Screen>
  );
}
