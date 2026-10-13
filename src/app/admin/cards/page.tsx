"use client";
import { useState } from "react";
import { Screen } from "@/components/shell";
import { Button, CardChip, Cap, EmptyState, Input, Table, TRow } from "@/components/ui";
import { useStore } from "@/lib/store";
import { adminRows } from "../admin";


export default function AdminCardsPage() {
  const { catalog } = useStore();
  const [q, setQ] = useState("");
  const all = adminRows(catalog);
  const rows = all.filter((r) => !q || r.name.includes(q) || r.issuer.includes(q));
  return (
    <Screen title={`카드 상품 · ${all.length}종`} desc="줄을 누르면 그 카드의 규칙을 모두 펼쳐 볼 수 있어요" right={<Button size="md" icon="add" href="/admin/input">원문 입력</Button>}>
      <Input icon="search" aria-label="카드 검색" value={q} onChange={(e) => setQ(e.target.value)} placeholder="카드명·카드사 검색" className="h-10 md:w-70" />
      {rows.length === 0 ? <EmptyState icon="search_off" title="검색 결과가 없어요" desc="카드명이나 카드사 이름의 일부로 찾아보세요" /> : (
        <Table cols={[{ label: "카드", w: "minmax(0,1.6fr)" }, { label: "카드사", w: "120px" }, { label: "규칙", w: "60px", align: "right" }, { label: "확인일", w: "110px" }, { label: "", w: "80px", align: "right" }]}>
          {rows.map((r) => (
            <TRow key={r.id ?? r.name}>
              <span className="flex items-center gap-2 min-w-0"><CardChip color={r.color} w={36} h={24} /><span className="text-label text-strong truncate">{r.name}</span></span>
              <Cap>{r.issuer}</Cap><span className="text-num-sm text-body text-right">{r.n}</span><Cap>{r.d}</Cap>
              <span className="flex justify-end"><Button variant="ghost" size="sm" href={r.href}>보기</Button></span>
            </TRow>
          ))}
        </Table>
      )}
      <Cap>기본 카드와 원문 입력으로 반영한 카드예요. 원문 입력으로 반영한 카드는 규칙 화면에서 삭제할 수 있어요.</Cap>
    </Screen>
  );
}
