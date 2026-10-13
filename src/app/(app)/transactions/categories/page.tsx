"use client";
import { useState } from "react";
import { Screen, TopAction } from "@/components/shell";
import { Button, Cap, cx, Icon, IconTile, Note, Seg } from "@/components/ui";
import { FALLBACK_CATEGORY } from "@/lib/data/merchants";
import { useStore } from "@/lib/store";

/* TRX-13: 카테고리 추가·이름 변경·삭제·순서. 하위 1단계. ponytail: 드래그 대신 위/아래 버튼 */
export default function CategoriesPage() {
  const { categories, setCategories, deleteCategory } = useStore();
  const [type, setType] = useState<"지출" | "수입">("지출");
  const [open, setOpen] = useState<string | null>("food");
  const t = type === "지출" ? "expense" : "income";
  const tops = categories.filter((c) => c.type === t && !c.parentId).sort((a, b) => a.order - b.order);
  const subs = (id: string) => categories.filter((c) => c.parentId === id).sort((a, b) => a.order - b.order);
  const rename = (id: string) => { const c = categories.find((x) => x.id === id)!; const n = prompt("새 이름", c.name); if (n) setCategories(categories.map((x) => (x.id === id ? { ...x, name: n } : x))); };
  const remove = (id: string) => { if (confirm("삭제할까요? 이 카테고리의 거래는 '기타'로 옮기고, 이 카테고리 예산은 지워요.")) deleteCategory(id); };
  const fixed = (id: string) => id === FALLBACK_CATEGORY[t];
  const add = (parentId?: string) => { const n = prompt(parentId ? "하위 카테고리 이름" : "카테고리 이름"); if (n) setCategories([...categories, { id: `${parentId ?? t}.${Date.now().toString(36)}`, type: t, name: n, icon: "label", parentId, order: 99 }]); };
  const move = (id: string, dir: -1 | 1) => { const c = categories.find((x) => x.id === id)!; const sib = categories.filter((x) => x.type === c.type && x.parentId === c.parentId).sort((a, b) => a.order - b.order); const i = sib.findIndex((x) => x.id === id); const j = i + dir; if (j < 0 || j >= sib.length) return; const o = sib.map((x, k) => ({ ...x, order: k })); [o[i].order, o[j].order] = [o[j].order, o[i].order]; setCategories(categories.map((x) => o.find((y) => y.id === x.id) ?? x)); };

  return (
    <Screen title="카테고리 관리" back right={<TopAction href="/settings">완료</TopAction>}>
      <div className="max-w-160 w-full mx-auto flex flex-col gap-3">
        <Seg items={["지출", "수입"] as const} value={type} onChange={setType} />
        <Note>내 카테고리를 바꿔도 혜택 계산엔 영향이 없어요. 혜택은 업종 분류로 따로 매칭해요.</Note>
        <div className="bg-white border border-line rounded-lg px-3 flex flex-col">
          {tops.map((c) => (
            <div key={c.id} className="flex flex-col border-b border-line last:border-0">
              <div className="flex items-center gap-2 min-h-14">
                <span className="flex flex-col"><button type="button" aria-label="위로" onClick={() => move(c.id, -1)} className="text-muted"><Icon name="expand_less" size={16} /></button><button type="button" aria-label="아래로" onClick={() => move(c.id, 1)} className="text-muted"><Icon name="expand_more" size={16} /></button></span>
                <IconTile name={c.icon} />
                <button type="button" onClick={() => rename(c.id)} className="text-body font-semibold text-strong text-left">{c.name}</button>
                <span className="flex-1" /><Cap>{subs(c.id).length ? `하위 ${subs(c.id).length}` : ""}</Cap>
                {!fixed(c.id) && <button type="button" aria-label="삭제" onClick={() => remove(c.id)} className="text-muted p-1"><Icon name="delete" size={18} /></button>}
                <button type="button" aria-label="펼치기" onClick={() => setOpen(open === c.id ? null : c.id)} className="text-muted p-1"><Icon name={open === c.id ? "expand_less" : "expand_more"} /></button>
              </div>
              {open === c.id && (
                <div className="flex flex-col pb-2">
                  {subs(c.id).map((s) => (
                    <div key={s.id} className="flex items-center gap-2 min-h-11 pl-12">
                      <span className="flex flex-col"><button type="button" aria-label="위로" onClick={() => move(s.id, -1)} className="text-muted"><Icon name="expand_less" size={14} /></button><button type="button" aria-label="아래로" onClick={() => move(s.id, 1)} className="text-muted"><Icon name="expand_more" size={14} /></button></span>
                      <button type="button" onClick={() => rename(s.id)} className="text-label text-strong text-left flex-1">{s.name}</button>
                      <button type="button" aria-label="이름 변경" onClick={() => rename(s.id)} className="text-muted p-1"><Icon name="edit" size={18} /></button>
                      <button type="button" aria-label="삭제" onClick={() => remove(s.id)} className="text-muted p-1"><Icon name="delete" size={18} /></button>
                    </div>
                  ))}
                  <button type="button" onClick={() => add(c.id)} className={cx("text-label font-semibold text-link text-left pl-12 min-h-10")}>+ 하위 카테고리 추가</button>
                </div>
              )}
            </div>
          ))}
        </div>
        <Button variant="tonal" size="md" icon="add" onClick={() => add()}>카테고리 추가</Button>
      </div>
    </Screen>
  );
}
