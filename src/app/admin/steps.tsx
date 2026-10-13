/* 어드민 카드 등록 흐름 안내 — 원문 입력 화면 맨 위에. 지금 단계를 강조해 "어디까지 왔고 다음에 뭘 하는지" 보이게 */
import { cx } from "@/components/ui";

const STEPS = [
  ["출처 URL 넣기", "카드사 상품 페이지 주소만 넣거나, 혜택 문구를 복사해 붙여 넣어요"],
  ["AI로 규칙 만들기", "AI가 원문을 할인율·대상·한도 규칙으로 정리해 바로 카드 상품에 반영해요 (1~2분)"],
  ["내 카드에 등록", "사용자 화면 → 내 카드 → 카드 등록에서 추가하면 결제마다 계산돼요"],
] as const;

export function AdminSteps() {
  return (
    <ol className="grid grid-cols-1 md:grid-cols-3 gap-2" aria-label="카드 등록 순서">
      {STEPS.map(([t, d], i) => {
        const now = i < 2; // 원문 입력 화면에서 하는 일은 1·2단계
        return (
          <li key={t} aria-current={i === 0 ? "step" : undefined} className={cx("rounded-md border px-3 py-2.5 flex gap-2.5", now ? "border-violet-300 bg-benefit-soft" : "border-line bg-card")}>
            <span className={cx("w-6 h-6 rounded-full inline-flex items-center justify-center text-caption font-bold flex-none", now ? "bg-violet-200 text-violet-800" : "bg-gray-100 text-muted")}>{i + 1}</span>
            <span className="flex flex-col gap-0.5 min-w-0"><span className="text-label font-semibold text-strong">{t}</span><span className="text-caption text-muted">{d}</span></span>
          </li>
        );
      })}
    </ol>
  );
}
