/* 앱 안 알림 (RPT-10). 알림을 저장하지 않고 그 달 데이터에서 매번 만든다 → 카드 화면 숫자와 어긋날 수 없다.
 * 데모·로그인 모드 모두 store 데이터에서 만들기 때문에 둘 다 똑같이 보인다.
 * id는 "종류:대상:단계:달"이라 같은 상황이면 늘 같은 id → 읽음 여부는 이 기기 localStorage에 사용자별 id 목록으로만 둔다 */
import { useMemo, useSyncExternalStore } from "react";
import type { Transaction, UserCard } from "./types";
import { tierLabel, type MonthCalc } from "./engine";
import { cardById, cardLabel, spendProgress } from "./data/cards";
import { fmtMd, won } from "./format";

export type NoticeKind = "tierSoon" | "missed"; // 예산 알림은 뺐다 (예산 기능 제외)
export type Notice = { id: string; kind: NoticeKind; title: string; sub: string; href: string };

/** 다음 실적 구간 목표의 이 비율 이상 채우면 알린다 */
export const TIER_SOON = 0.9;
/** 결제 1건 차액이 이 금액 이상일 때만 놓친 혜택 알림 (상위 3건까지) */
export const MISSED_MIN = 1000;
const RANK: Record<NoticeKind, number> = { tierSoon: 0, missed: 1 };

/** month의 summary·calc를 넘겨야 한다 (보통 오늘이 속한 달 — 보고 있는 달이 아니라) */
export function deriveNotifications({ calc, userCards, txns, month, today }: {
  calc: MonthCalc; userCards: UserCard[]; txns: Transaction[]; month: string; today: string;
}): Notice[] {
  const out: Notice[] = [];

  // 카드 실적: 지금 쌓고 있는 실적 창(카드 목록·상세와 같은 spendProgress)이 다음 구간 목표의 90% 이상 (아직 못 채움).
  // 사이클 카드는 이미 마감된 창이 아니라 오늘 결제가 들어가는 창. id에 구간이 정해지는 달(forYm)을 넣어 같은 창이면 달이 바뀌어도 같은 id
  for (const uc of userCards) {
    const card = cardById(uc.cardId);
    if (!card) continue;
    const p = spendProgress(txns, card, uc, month, today);
    if (p.closed || !p.nextTier || p.spend < p.nextTier.min * TIER_SOON) continue;
    out.push({
      id: `tierSoon:${uc.cardId}:${p.nextTier.min}:${p.forYm}`, kind: "tierSoon",
      title: `${cardLabel(uc.cardId)} 실적 구간까지 ${won(p.nextTier.min - p.spend)} 남았어요`,
      sub: `${Number(p.forYm.slice(5))}월 ${tierLabel(p.nextTier)} 구간 · ${p.label} 실적 ${won(p.spend)}`, href: `/cards/${uc.cardId}`,
    });
  }

  // 놓친 혜택이 큰 결제 (결제 1건씩 비교한 차액)
  for (const m of calc.missedTop.filter((x) => x.diff >= MISSED_MIN).slice(0, 3)) {
    const t = txns.find((x) => x.id === m.txnId);
    if (!t) continue;
    out.push({ id: `missed:${t.id}`, kind: "missed", title: `${t.merchant} 결제에서 혜택 ${won(m.diff)}을 놓쳤어요`, sub: `${fmtMd(t.date)} · 더 유리한 카드: ${cardLabel(m.bestCardId)}`, href: `/transactions/${t.id}` });
  }
  return out.sort((a, b) => RANK[a.kind] - RANK[b.kind]);
}

/* ── 읽음 표시: localStorage에 읽은 id 목록. 홈(빨간 점)과 알림 화면이 같은 값을 본다.
 * 알림 id에는 사용자가 없어서(기본 카테고리 id가 모두 같음) 키를 사용자별로 나눈다 — 같은 기기의 다른 계정·데모끼리 읽음이 섞이지 않게 ── */
export const readKey = (uid?: string) => `cardsem-read-notices:${uid ?? "demo"}`;
const listeners = new Set<() => void>();
const subscribe = (cb: () => void) => {
  listeners.add(cb);
  window.addEventListener("storage", cb); // 다른 탭에서 읽음 처리한 것도 반영
  return () => { listeners.delete(cb); window.removeEventListener("storage", cb); };
};
const snapshot = (key: string) => { try { return localStorage.getItem(key) ?? "[]"; } catch { return "[]"; } };

/** uid: 로그인 사용자 id (store의 me?.id). 없으면 데모 */
export function useReadNotices(uid?: string) {
  const key = readKey(uid);
  const raw = useSyncExternalStore(subscribe, () => snapshot(key), () => "[]");
  const read = useMemo(() => { try { const a = JSON.parse(raw); return new Set<string>(Array.isArray(a) ? a : []); } catch { return new Set<string>(); } }, [raw]);
  const markRead = (ids: string[]) => {
    // ponytail: 오래된 id는 최근 300개만 남기고 버린다 (지난달 알림 id는 다시 나오지 않음)
    const next = [...new Set([...read, ...ids])].slice(-300);
    try { localStorage.setItem(key, JSON.stringify(next)); } catch { /* 저장 못 하면 이번 화면에서만 */ }
    listeners.forEach((l) => l());
  };
  return { read, markRead };
}
