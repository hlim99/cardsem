"use client";
import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Screen } from "@/components/shell";
import { Badge, Button, Card, CardTitle, Cap, cx, EmptyState, Note, Select } from "@/components/ui";
import { useStore } from "@/lib/store";
import { isCustomCardId } from "@/lib/data/cards";
import { inputHref, products, shortName, versionsOf, withoutRule } from "../admin";
import { RuleDetail } from "../rule-detail";

/* 승인 규칙 보기. ?id=카드id (모르는 id면 '없어요', id가 없으면 Mr.Life → 첫 승인 카드). 카드를 바꾸면 주소도 바뀐다 */
export default function AdminRulesPage() {
  return <Suspense><Rules /></Suspense>;
}

function Rules() {
  const router = useRouter();
  const id = useSearchParams().get("id");
  const { catalog, removeCustomCard, addCustomCard } = useStore();
  const approved = products(catalog); // 기본 카드 + 원문 입력으로 반영한 카드
  const c = id ? approved.find((x) => x.id === id) : approved.find((x) => x.id === "shinhan_mrlife") ?? approved[0];
  // 주소의 id와 다른 카드를 보여주지 않는다 (이 기기에서 반영한 카드는 마운트 직후 불러와서 잠깐 이 화면이 보일 수 있다)
  if (id && !c) return <Screen title="카드 규칙" back="/admin/cards"><EmptyState icon="rule" title="이 카드의 규칙이 없어요" desc="삭제했거나 이 계정에 없는 카드예요" action={<Button size="md" href="/admin/cards">카드 상품</Button>} /></Screen>;
  if (!c) return <Screen title="카드 규칙"><EmptyState icon="rule" title="카드가 없어요" action={<Button size="md" href="/admin/input">원문 입력</Button>} /></Screen>;
  const versions = versionsOf(c.rules);
  // 원문 입력으로 반영한 카드만 지울 수 있다 (기본 카드는 코드의 카드 데이터). 등록한 사용자의 보유 카드에서도 빠지고, 그 카드로 기록한 거래는 남되 카드만 비워진다
  const remove = (cardId: string, name: string) => {
    if (!confirm(`${name} 카드를 삭제할까요? 승인 규칙이 모두 지워지고, 내 카드에 등록돼 있었다면 함께 빠져요. 이 카드로 기록한 거래는 남아요.`)) return;
    removeCustomCard(cardId);
    router.replace("/admin/cards");
  };
  // 혜택(규칙) 하나 지우기 — 원문 입력으로 반영한 카드만(기본 카드는 코드 데이터). 남은 규칙으로 실적 구간을 다시 잡아 저장한다
  const custom = isCustomCardId(c.id);
  const removeRule = (ruleId: string, name: string) => {
    if (!confirm(`「${name}」 혜택을 삭제할까요? 이 카드로 기록한 거래의 혜택이 다시 계산돼요.`)) return;
    addCustomCard(withoutRule(c, ruleId));
  };
  return (
    <Screen
      title={`카드 규칙 · ${shortName(c)}`} desc={`규칙 ${c.rules.length}개 · 출처 확인 ${c.checkedAt}${isCustomCardId(c.id) ? " · 원문 입력으로 반영한 카드" : " · 기본 카드"}`}
      right={<><Select aria-label="카드 선택" value={c.id} onChange={(e) => router.replace(`/admin/rules?id=${e.target.value}`)} className="h-10 w-44 md:w-56">{approved.map((x) => <option key={x.id} value={x.id}>{shortName(x)}</option>)}</Select><span className="hidden md:flex"><Button size="md" icon="edit_note" href={inputHref(c.issuer, c.name)}>원문 다시 입력</Button></span>{isCustomCardId(c.id) && <Button variant="danger" size="md" icon="delete" onClick={() => remove(c.id, shortName(c))}>카드 삭제</Button>}</>}
    >
      {/* 출처 — 원문을 붙여 넣어 만든 카드도 출처 URL을 함께 저장한다(사용자 카드 상세에도 보인다) */}
      <Cap className="break-all">출처 {c.sourceUrl ? <a href={c.sourceUrl} target="_blank" rel="noreferrer" className="text-link font-semibold">{c.sourceUrl}</a> : "없음"} · 확인 {c.checkedAt}</Cap>
      <div className="grid md:grid-cols-[--spacing(70)_minmax(0,1fr)] gap-4 items-start">
        <Card>
          <CardTitle>버전</CardTitle>
          {/* 버전 = 규칙의 유효 시작일(validFrom)별 묶음. 시작일이 없으면 처음부터 쓰는 한 묶음 */}
          {versions.map(([from, n], i) => (
            <div key={from} className={cx("px-3.5 py-3 rounded-md border flex flex-col gap-1", i === 0 ? "border-violet-200 bg-benefit-soft" : "border-line")}>
              <span className="flex items-center gap-2"><span className="text-body font-semibold text-strong">{from ? `${from}부터` : "처음부터"}</span>{i === 0 && <Badge kind="primary">최신</Badge>}</span>
              <Cap>규칙 {n}개</Cap>
            </div>
          ))}
          {versions.length === 1 && !versions[0][0] && <Cap>아직 나눈 버전이 없어요. 조건이 바뀌면 유효 시작일을 정해 새 버전으로 저장해요.</Cap>}
          <Note>과거 거래는 결제일이 속한 버전으로 계산해요. 버전을 바꿔도 지난 리포트는 변하지 않아요.</Note>
        </Card>
        <div className="bg-card border border-line rounded-lg flex flex-col min-w-0">
          <div className="px-5 py-3 border-b border-line flex items-center justify-between gap-3"><span className="text-label font-semibold text-strong">규칙 {c.rules.length}개</span><Cap>줄을 누르면 조건·한도·원문·JSON 전체가 펼쳐져요</Cap></div>
          {c.rules.length === 0 && <Cap className="px-5 py-4">남은 혜택이 없어요. 원문 다시 입력으로 혜택을 만들어요.</Cap>}
          {c.rules.map((r, i) => (
            <RuleDetail key={r.id} r={r} last={i === c.rules.length - 1}
              onDelete={custom ? () => removeRule(r.id, r.name) : undefined}
              locked="기본 카드의 혜택은 코드의 카드 데이터라 여기서 지울 수 없어요. 「원문 다시 입력」으로 새 카드를 만들어 바꿔요." />
          ))}
        </div>
      </div>
    </Screen>
  );
}
