"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Screen } from "@/components/shell";
import { Button, Cap, Card, Check, ListRow, Note, PageTitle } from "@/components/ui";
import { useStore } from "@/lib/store";

/* ACC-02 회원 탈퇴. 로그인 모드: 본인 장부를 DB에서 지우고 로그아웃. 데모 모드: 데모 장부를 비움 (공용 데모 계정이면 서버 장부, 아니면 이 브라우저) */
export default function WithdrawPage() {
  const router = useRouter();
  const { txns, userCards, recurring, categories, me, demoShared, deleteAccount } = useStore();
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  const run = async () => {
    setBusy(true); setErr(null);
    try { await deleteAccount(); router.push("/login"); }
    catch (e) { setErr(`삭제하지 못했어요: ${(e as Error).message}`); setBusy(false); }
  };
  return (
    <Screen title="회원 탈퇴" back>
      <div className="max-w-[560px] w-full mx-auto flex flex-col gap-6">
        <PageTitle title="정말 떠나시나요?" desc={me ? "탈퇴하면 계정에 저장된 아래 데이터가 모두 삭제되고 되돌릴 수 없어요." : demoShared ? "데모 모드라 공용 데모 장부를 빈 장부로 되돌려요. 다른 방문자에게도 똑같이 바뀌어요." : "데모 모드라 이 브라우저에 저장된 데이터만 지워요. 지우면 빈 장부로 돌아가요."} />
        <Card pad="px-4 py-1" className="gap-0">
          <ListRow icon="receipt_long" title={`거래 ${txns.length.toLocaleString()}건`} sub="수입·지출·환불, 영수증 인식 기록 포함" right={<span />} />
          <ListRow icon="event_repeat" title={`반복 거래 ${recurring.length}건`} sub="이미 만든 거래도 함께 삭제" right={<span />} />
          <ListRow icon="credit_card" title={`카드 ${userCards.length}장`} sub="실적 보정·청구 사이클 설정" right={<span />} />
          <ListRow icon="category" title={`카테고리 ${categories.length}개와 예산`} sub="직접 추가한 카드·업종 기억 포함" right={<span />} last />
        </Card>
        {me && <Note icon="info" tone="amber">로그인 계정({me.email}) 자체는 앱에서 지울 수 없어요. 계정 삭제에는 서버 관리자 키가 필요해서, 장부를 지운 뒤 로그아웃만 해요. 계정까지 지우려면 운영자에게 요청해주세요.</Note>}
        <label className="flex items-center gap-2.5"><Check on={ok} onChange={setOk} label="동의" /><span className="text-label text-strong">위 내용을 확인했고 삭제에 동의해요</span></label>
        {err && <Cap className="text-red-700">{err}</Cap>}
        <div className="flex gap-2"><Button variant="secondary" className="flex-1" href="/settings">취소</Button><Button variant="dangerSolid" className="flex-[2]" disabled={!ok || busy} onClick={run}>{busy ? "삭제하는 중…" : me ? "탈퇴하기" : "데모 데이터 지우기"}</Button></div>
      </div>
    </Screen>
  );
}
