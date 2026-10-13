"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Screen, TopAction } from "@/components/shell";
import { Card, CardChip, CardTitle, Cap, cx, Field, Input, Note, Select, Seg } from "@/components/ui";
import { num } from "@/lib/format";
import { useStore } from "@/lib/store";
import { CARDS } from "@/lib/data/cards";
import { customCardProduct } from "../card-stats";

const ISSUERS = ["신한카드", "삼성카드", "현대카드", "KB국민카드", "롯데카드", "우리카드", "하나카드", "NH농협카드", "BC카드", "IBK기업은행", "카카오뱅크", "토스뱅크", "기타"];
const COLORS = [...new Set(CARDS.map((c) => c.color))]; // 카드 아트 단색은 기본 카드들의 색에서 고른다
const digits = (s: string) => Number(s.replace(/[^\d]/g, "")) || 0;

/* CARD-02 · DAT-06: 목록에 없는 카드 직접 추가. 전 가맹점 정률 기본 혜택 하나(+ 월 한도·전월 실적 조건)만 받는다.
 * 저장은 스토어가 맡는다: 로그인하면 계정(card_products)에, 데모 모드는 이 기기(localStorage)에만.
 * ponytail: 업종별 혜택이 필요해지면 규칙 행을 늘린다 */
export default function CustomCardPage() {
  const router = useRouter();
  const { addCustomCard, addUserCard, today, loading } = useStore();
  const [issuer, setIssuer] = useState(ISSUERS[0]);
  const [name, setName] = useState("");
  const [type, setType] = useState<"신용" | "체크">("신용");
  const [color, setColor] = useState(COLORS[0]);
  const [kind, setKind] = useState<"할인" | "적립">("할인");
  const [rate, setRate] = useState(""); // 소수 입력 중("1.")을 지우지 않게 문자열로
  const [cap, setCap] = useState(0);
  const [minSpend, setMinSpend] = useState(0);
  const [desc, setDesc] = useState("");
  const [tried, setTried] = useState(false);

  const ratePct = Number(rate);
  const err = {
    name: !name.trim() ? "카드 이름을 입력해 주세요" : "",
    rate: !(ratePct > 0 && ratePct <= 100) ? "0보다 크고 100 이하인 비율을 입력해 주세요" : "",
  };
  const save = () => {
    if (loading) return;
    if (err.name || err.rate) { setTried(true); return; }
    const id = `custom_${globalThis.crypto?.randomUUID?.() ?? Date.now().toString(36)}`;
    addCustomCard(customCardProduct({ issuer, name, type: type === "신용" ? "credit" : "check", color, kind: kind === "할인" ? "discount" : "point", ratePct, cap: cap || undefined, minSpend: minSpend || undefined, desc }, id, today));
    addUserCard({ cardId: id, addedAt: today });
    router.back(); // 보통 카드 등록 화면에서 들어오므로, 돌아가면 '등록됨'으로 보인다
  };

  return (
    <Screen title="카드 직접 추가" back right={loading ? undefined : <TopAction onClick={save}>저장</TopAction>}>
      <div className="max-w-160 w-full mx-auto flex flex-col gap-5">
        <Note>입력한 혜택은 <b className="text-body">사용자 입력</b>으로 표시되고, 검수 없이 계산에 써요. <b className="text-body">로그인하면 계정에 저장돼요</b>. 데모 모드에서는 이 기기에만 남아요.</Note>
        <div className="flex flex-col gap-3">
          <Field label="카드 이름" error={tried ? err.name || undefined : undefined}><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 카드의정석 EVERY" error={tried && !!err.name} maxLength={40} autoFocus /></Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="카드사"><Select value={issuer} onChange={(e) => setIssuer(e.target.value)}>{ISSUERS.map((i) => <option key={i}>{i}</option>)}</Select></Field>
            <Field label="종류" group><Seg items={["신용", "체크"] as const} value={type} onChange={setType} className="h-12" /></Field>
          </div>
          <Field label="카드 색" group>
            <div className="flex gap-1.5 flex-wrap">
              {COLORS.map((c, i) => (
                <button key={c} type="button" aria-label={`색 ${i + 1}`} aria-pressed={c === color} onClick={() => setColor(c)} className={cx("p-1.5 rounded-md", c === color ? "bg-primary-soft ring-2 ring-primary" : "hover:bg-gray-100")}>
                  <CardChip color={c} w={40} h={26} />
                </button>
              ))}
            </div>
          </Field>
        </div>

        <Card>
          <CardTitle>기본 혜택</CardTitle>
          <Cap>모든 가맹점 결제에 같은 비율로 계산해요.</Cap>
          <div className="grid grid-cols-2 gap-2">
            <Field label="종류" group><Seg items={["할인", "적립"] as const} value={kind} onChange={setKind} className="h-12" /></Field>
            <Field label={`${kind}율`} error={tried ? err.rate || undefined : undefined}>
              <Input inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value.replace(/[^\d.]/g, ""))} placeholder="예: 1.5" suffix="%" error={tried && !!err.rate} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="월 한도 (선택)" hint="없으면 한도 없이 계산해요"><Input inputMode="numeric" value={cap ? num(cap) : ""} onChange={(e) => setCap(digits(e.target.value))} placeholder="없음" suffix="원" /></Field>
            <Field label="전월 실적 조건 (선택)" hint="이 금액 이상 쓴 다음 달에만 혜택을 줘요"><Input inputMode="numeric" value={minSpend ? num(minSpend) : ""} onChange={(e) => setMinSpend(digits(e.target.value))} placeholder="없음" suffix="원" /></Field>
          </div>
          <Field label="혜택 설명 (선택)" hint="약관 문구를 붙여 넣으면 규칙 원문으로 보여줘요"><Input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="예: 국내 가맹점 1.5% 청구할인" maxLength={200} /></Field>
        </Card>

        <Card className="flex-row items-center">
          <CardChip color={color} w={48} h={30} />
          <span className="flex-1 flex flex-col gap-0.5 min-w-0">
            <span className="text-body font-semibold text-strong truncate">{issuer.replace("카드", "")} {name.trim() || "카드 이름"}</span>
            <Cap>{type} · {ratePct > 0 ? `전 가맹점 ${ratePct}% ${kind}` : `${kind}율을 입력해 주세요`}{cap ? ` · 월 ${num(cap)}원 한도` : ""}{minSpend ? ` · 전월 ${num(minSpend)}원 이상` : ""}</Cap>
          </span>
        </Card>
      </div>
    </Screen>
  );
}
