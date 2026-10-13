/* 어드민 공용 — 자동 검증 경고, 원문 대조, 카드 목록 행, LLM 정규화 초안 보관, 승인 카드 만들기.
 * 현황·카드 상품·원문 입력·검수·승인 규칙 화면이 같은 계산을 쓰게 한 곳에 둔다. (vitest가 @/ 별칭을 모르므로 상대 경로) */
import { useMemo, useSyncExternalStore } from "react";
import { tierLabel } from "../../lib/engine";
import { isCustomCardId } from "../../lib/data/cards";
import type { BenefitRule, CardProduct, SpendTier } from "../../lib/types";

/** 목표 카드 수 (DAT-01) */
export const ISSUERS = ["신한카드", "현대카드", "삼성카드", "KB국민카드", "롯데카드", "우리카드", "하나카드", "NH농협카드", "BC카드"] as const;
export const shortName = (c: { issuer: string; name: string }) => `${c.issuer.replace("카드", "")} ${c.name}`;

/* ── 원문 대조 ── */
/** 대조용 정규화: 앞의 글머리표(·, •, -, *, 1. 등)와 모든 공백을 없앤다 (LLM이 띄어쓰기를 바꿔 옮기는 일이 많음).
 * 번호 글머리표는 뒤에 공백이 있을 때만 — "1.5% 적립"의 "1."까지 지우면 0.5%와 1.5%가 같은 조항이 된다 */
export const norm = (s: string) => s.replace(/^\s*(?:[·•\-*]|\d+[.)](?=\s))\s*/, "").replace(/\s+/g, "");
/** 원문 한 줄과 규칙의 근거 문장이 같은 조항인지. LLM은 한 줄을 여러 규칙으로 나누거나 여러 줄을 한 문장으로 합치므로 양방향 포함으로 본다 */
export const sameClause = (line: string, quote: string) => {
  const a = norm(line), b = norm(quote);
  return a.length >= 4 && b.length >= 4 && (a.includes(b) || b.includes(a));
};
/** 원문을 줄로 나누고, 줄마다 그 줄을 근거로 삼은 규칙을 붙인다. 규칙이 하나도 없는 줄 = 규칙으로 바뀌지 않은 조항 */
export const rawLines = (raw: string, rules: BenefitRule[]) =>
  raw.split("\n").filter((l) => l.trim()).map((line) => ({ line, rules: rules.filter((r) => sameClause(line, r.rawText)) }));

/** 자동 검증 경고 (DAT-03). raw(붙여 넣은 원문)를 주면 근거 문장이 원문에 실제로 있는지도 본다 — LLM이 바꿔 쓰거나 지어낸 문장 */
export const warn = (r: BenefitRule, raw?: string) => {
  const w: string[] = [];
  if ((r.rate ?? 0) >= 0.1 && !r.limitsByTier.some((l) => l.monthlyCap !== undefined || l.monthlyCount !== undefined)) w.push("할인율 10% 이상인데 월 한도가 없어요. 원문의 다른 영역에 한도가 있는지 확인해주세요.");
  const tiers = r.limitsByTier.map((l) => l.tier).sort((a, b) => a.min - b.min);
  for (let i = 1; i < tiers.length; i++) if (tiers[i - 1].max !== null && tiers[i - 1].max !== tiers[i].min) w.push(`실적 구간이 불연속이에요 (${tierLabel(tiers[i - 1])} → ${tierLabel(tiers[i])})`);
  if (r.confidence < 0.7) w.push(`LLM 신뢰도 ${Math.round(r.confidence * 100)}% · 원문과 대조 필요`);
  if (raw !== undefined && !raw.split("\n").some((l) => sameClause(l, r.rawText))) w.push("근거 문장을 원문에서 찾지 못했어요. LLM이 문장을 바꿔 쓰거나 지어냈는지 확인해주세요.");
  return w;
};

/* ── 카드 목록 (현황·카드 상품 공통) ── */
export const inputHref = (issuer: string, name: string) => `/admin/input?${new URLSearchParams({ issuer, name })}`;
export type AdminRow = { id?: string; name: string; issuer: string; color: string; grade: CardProduct["grade"]; n: number; warns: number; st: CardProduct["reviewStatus"]; d: string; href: string };
/** 어드민이 다루는 카드 상품. 사용자가 /cards/custom에서 만든 개인 카드(검수 없음)는 카드 상품이 아니라서 뺀다 */
export const products = (catalog: CardProduct[]) => catalog.filter((c) => !(isCustomCardId(c.id) && c.reviewStatus === "none"));
/** 카탈로그(기본 카드 + 검수해 반영한 카드). href는 상태에 맞는 화면: 승인 → 규칙 보기, 대기 → 그 카드 검수, 미입력 → 원문 입력 */
export const adminRows = (catalog: CardProduct[]): AdminRow[] => [
  ...products(catalog).map((c) => ({
    id: c.id, name: shortName(c), issuer: c.issuer, color: c.color, grade: c.grade, n: c.rules.length, warns: c.rules.filter((r) => warn(r).length).length, st: c.reviewStatus, d: c.checkedAt,
    href: `/admin/rules?id=${c.id}`, // 검수 단계가 없어져 모든 카드가 규칙 화면으로
  })),
];
export const countSt = (rows: AdminRow[]) => ({
  approved: rows.filter((r) => r.st === "approved").length, pending: rows.filter((r) => r.st === "pending").length, none: rows.filter((r) => r.st === "none").length,
});

/* ── LLM 정규화 초안: 원문 입력 → 검수. sessionStorage(탭을 닫으면 사라짐)에 두고, 반영하거나 버리면 지운다 ── */
export type Draft = { id: string; issuer: string; name: string; grade?: CardProduct["grade"]; sourceUrl: string; checkedAt: string; validFrom: string; text: string; rules: BenefitRule[]; at: number };
export const DRAFT_KEY = "cardsem-normalized";
/** 원문 입력 폼 임시 저장 (이 기기 localStorage). 정규화를 돌릴 때도 저장해 두고, 검수에서 반영하면 지운다 */
export const FORM_KEY = "cardsem-admin-draft";
/** 예전 형식({cardName, rawText})이나 깨진 값은 버린다 */
export const parseDraft = (raw: string | null): Draft | null => {
  try { const d = JSON.parse(raw ?? "null"); return d && typeof d.id === "string" && typeof d.text === "string" && Array.isArray(d.rules) ? d : null; } catch { return null; }
};
const noSubscribe = () => () => {};
const draftSnapshot = () => { try { return sessionStorage.getItem(DRAFT_KEY); } catch { return null; } };
/** 초안 읽기. 서버 렌더에서는 null이고 브라우저에서 실제 값으로 다시 그린다 (하이드레이션 불일치 없음) */
export const useDraft = () => {
  const raw = useSyncExternalStore(noSubscribe, draftSnapshot, () => null);
  return useMemo(() => parseDraft(raw), [raw]);
};
export const clearDraft = () => { try { sessionStorage.removeItem(DRAFT_KEY); } catch { /* 무시 */ } };

/** 카드의 실적 구간: 규칙들이 쓰는 모든 경계값(0 포함)으로 겹치지 않게 자른다.
 * 엔진(resolveTier)은 처음 맞는 구간 하나만 고르므로 {0,null}과 {30만,null}처럼 겹치면 30만 이상 규칙이 막힌다.
 * 잘린 구간은 엔진의 limitsFor가 '그 구간을 품은 규칙 구간'으로 찾아 준다 */
export const tiersOf = (rules: BenefitRule[]): SpendTier[] => {
  const b = [...new Set([0, ...rules.flatMap((r) => r.limitsByTier.flatMap((l) => [l.tier.min, l.tier.max ?? 0]))])].sort((x, y) => x - y);
  return b.map((min, i) => ({ min, max: b[i + 1] ?? null }));
};
/** 구조 등급(계산 난이도)은 화면에서 받지 않고 규칙 모양으로 정한다. 계산에는 쓰지 않는 분류값이다 */
export const gradeOf = (rules: BenefitRule[]): CardProduct["grade"] => {
  if (rules.some((r) => r.capGroupId || r.countGroupId || r.rateBands || r.stacking?.length)) return "D";
  const tiers = new Set(rules.flatMap((r) => r.limitsByTier.map((l) => l.tier.min)));
  if (tiers.size > 1 || rules.some((r) => r.target.daysOfWeek || r.target.timeRange)) return "C";
  return rules.some((r) => [...tiers][0] > 0 || r.limitsByTier.some((l) => l.monthlyCap !== undefined)) ? "B" : "A";
};
/** AI가 만든 규칙으로 카탈로그에 넣을 카드를 만든다 (원문 입력에서 바로 반영). 유효 시작일은 규칙에 없을 때만 입력 화면 값으로 채운다 */
export const approvedCard = (d: Omit<Draft, "text" | "rules" | "at">, rules: BenefitRule[]): CardProduct => ({
  id: d.id, issuer: d.issuer, name: d.name, type: "credit", color: "var(--color-violet-500)", grade: d.grade ?? gradeOf(rules), tiers: tiersOf(rules), spendExcludes: [],
  sourceUrl: d.sourceUrl, checkedAt: d.checkedAt, reviewStatus: "approved",
  rules: rules.map((r) => ({ ...r, cardId: d.id, ...(d.validFrom && !r.validFrom && { validFrom: d.validFrom }) })),
});

/** 혜택(규칙) 하나를 뺀 카드 — 실적 구간 · 구조 등급은 남은 규칙으로 다시 정한다(어드민 규칙 화면의 삭제).
 * 원문 입력으로 반영한 카드(custom_)만 쓴다 — 기본 카드는 코드의 카드 데이터라 저장할 곳이 없다 */
export const withoutRule = (c: CardProduct, ruleId: string): CardProduct => {
  const rules = c.rules.filter((r) => r.id !== ruleId);
  return { ...c, rules, tiers: tiersOf(rules), grade: gradeOf(rules) };
};

/** 승인 규칙의 버전 = 유효 시작일(validFrom)별 묶음, 최근 것부터. ""는 시작일 없이 처음부터 쓰는 규칙 */
export const versionsOf = (rules: BenefitRule[]) => {
  const m = new Map<string, number>();
  for (const r of rules) m.set(r.validFrom ?? "", (m.get(r.validFrom ?? "") ?? 0) + 1);
  return [...m].sort((a, b) => b[0].localeCompare(a[0]));
};

/** 검수 화면 '수정': 고쳐 붙인 JSON을 규칙으로. id·cardId는 원래 값으로 고정하고, 화면과 엔진이 꼭 읽는 필드만 확인한다. 실패하면 안내 문구 */
export const parseRule = (text: string, prev: BenefitRule): BenefitRule | string => {
  let r: BenefitRule;
  try { r = JSON.parse(text); } catch { return "JSON 형식이 맞지 않아요. 따옴표와 쉼표를 확인해주세요."; }
  if (!r || typeof r !== "object" || typeof r.name !== "string" || typeof r.rawText !== "string" || !["discount", "cashback", "point"].includes(r.kind)
    || !r.target || typeof r.target !== "object" || !Array.isArray(r.limitsByTier) || !r.limitsByTier.every((l) => typeof l?.tier?.min === "number")) {
    return "name·kind·rawText·target·limitsByTier(구간 tier 포함)는 꼭 있어야 해요.";
  }
  return { ...r, confidence: r.confidence ?? prev.confidence, supported: r.supported ?? prev.supported, id: prev.id, cardId: prev.cardId };
};
