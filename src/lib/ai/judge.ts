/* 정성 혜택 판단 — OpenAI 구조화 출력으로 "이번 결제로 이 혜택을 받을 수 있는가 / 돈인가 아닌가"만 정한다.
 * 모델은 글을 쓰지 않고 값만 낸다. 돈이면 금액은 카드 데이터(perk.value)가, 돈이 아니면 설명은 검수된 perk.detail(2줄)이 맡는다.
 * 키는 OPENAI_API_KEY (.env.local), 모델은 OPENAI_MODEL로 바꿀 수 있다 (기본 gpt-5.5). */
import "server-only";
import { z } from "zod";
import type { CardProduct, PerkJudgment, Transaction } from "../types";
import { parse } from "./server";
import { buildState, FORM_CRITERIA, toJudgments, type PerkAnswer } from "./judge.core";

const JudgeSchema = z.object({
  results: z.array(z.object({
    perkId: z.string(),
    eligible: z.number().describe("이 결제로 받을 수 있을 확률 0~1"),
    form: z.enum(["money", "goods", "service", "none"]),
    confidence: z.number().describe("form 선택의 신뢰도 0~1"),
  })),
});

export async function judgePerks(t: Transaction, card: CardProduct, today: string): Promise<{ judgments: PerkJudgment[]; engine: PerkJudgment["engine"]; model: string }> {
  const perks = card.perks ?? [];
  const model = process.env.OPENAI_MODEL ?? "gpt-5.5";
  if (perks.length === 0) return { judgments: [], engine: "openai", model: "" };

  const out = await parse(JudgeSchema, "perk_judgment",
    `카드 혜택 판단기. state.perks의 혜택마다 (1) state.transaction 결제로 실제로 받을 수 있는지 확률(eligible 0~1) — 결제의 가맹점·업종·금액·날짜·결제수단이 detail·terms 조건과 맞고 이 결제가 그 혜택을 발생시키는 종류일 때만 높게, 연회비·등급·적금처럼 결제와 무관한 혜택은 낮게 — 과 (2) 받는다면 어떤 형태인지(form)를 판단한다. form 기준: ${Object.entries(FORM_CRITERIA).map(([k, v]) => `${k}=${v}`).join(" / ")}. 글을 쓰지 말고 값만 낸다. perkId는 state.perks의 id 그대로, 혜택 전부에 대해 하나씩 낸다.`,
    [{ type: "input_text", text: JSON.stringify(buildState(t, card, perks, today)) }]);

  return { judgments: toJudgments(perks, (out?.results ?? []) as PerkAnswer[], model), engine: "openai", model };
}
