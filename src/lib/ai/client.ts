"use client";
/* 브라우저 → Route Handler 호출 헬퍼 (AI 키는 서버에만 있다) */
import { useEffect, useState } from "react";
import type { BenefitRule, Industry, PerkJudgment, Transaction } from "../types";
import type { DocResult } from "./server";
import { SUPABASE_READY, supabase } from "../supabase";

async function post<T>(url: string, body: BodyInit, json = true): Promise<T> {
  let res: Response;
  try {
    // 로그인 모드면 세션 토큰을 붙인다 (/api/normalize가 관리자인지 확인)
    const token = SUPABASE_READY ? (await supabase().auth.getSession()).data.session?.access_token : undefined;
    res = await fetch(url, { method: "POST", body, headers: { ...(json && { "content-type": "application/json" }), ...(token && { authorization: `Bearer ${token}` }) } });
  } catch { throw new Error("네트워크 연결을 확인해주세요"); }
  // 플랫폼의 413·504나 HTML 오류 페이지는 JSON이 아니다 → 파싱 오류 대신 상태 코드로 안내
  const data = await res.json().catch(() => null);
  if (!res.ok || !data) throw new Error(data?.error ?? (res.status === 413 ? "파일이 너무 커요" : `요청 실패 (${res.status})`));
  return data as T;
}

export const aiClassify = (merchant: string) => post<{ industry: Industry; confidence: number; source: "dict" | "llm" }>("/api/classify", JSON.stringify({ merchant }));
export const aiOcr = (file: File) => { const f = new FormData(); f.append("file", file); return post<DocResult & { ms: number }>("/api/ocr", f, false); };
export const aiInsight = (aggregates: unknown) => post<{ text: string; actions: string[] }>("/api/insight", JSON.stringify(aggregates));
export const aiJudge = (txn: Transaction, cardId: string, today: string) => post<{ judgments: PerkJudgment[]; engine: PerkJudgment["engine"]; model: string }>("/api/judge", JSON.stringify({ txn, cardId, today }));
export const aiNormalize = (rawText: string, cardId: string, cardName: string, sourceUrl?: string) => post<{ rules: BenefitRule[]; page?: { name: string; issuer: string; text: string }; sourceRead?: boolean }>("/api/normalize", JSON.stringify({ rawText, cardId, cardName, sourceUrl }));

/** 인사이트: 집계값이 같으면 localStorage 캐시, 아니면 한 번만 호출. 실패하면 fallback 문장 */
export function useInsight(key: string, aggregates: unknown, fallback: string) {
  const [state, setState] = useState<{ text: string; actions: string[]; status: "loading" | "ai" | "fallback"; error?: string }>({ text: fallback, actions: [], status: "loading" });
  const body = JSON.stringify(aggregates);
  useEffect(() => {
    const ck = `cardsem-insight:${key}:${hash(body)}`;
    let alive = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    try { const c = localStorage.getItem(ck); if (c) { setState({ ...JSON.parse(c), status: "ai" }); return; } } catch { /* 무시 */ }
    setState({ text: fallback, actions: [], status: "loading" }); // 달이 바뀌면 이전 달 문장을 지운다
    aiInsight(JSON.parse(body)).then((r) => { if (!alive) return; try { localStorage.setItem(ck, JSON.stringify(r)); } catch { /* 무시 */ } setState({ ...r, status: "ai" }); })
      .catch((e: Error) => alive && setState({ text: fallback, actions: [], status: "fallback", error: e.message }));
    return () => { alive = false; };
  }, [key, body, fallback]);
  return state;
}
/** 정성 혜택 판단: 거래 내용이 같으면 sessionStorage 캐시 */
export function usePerkJudgment(txn: Transaction | null, cardId: string | undefined, today: string) {
  const [state, setState] = useState<{ status: "idle" | "loading" | "done" | "error"; judgments: PerkJudgment[]; engine?: PerkJudgment["engine"]; model?: string; error?: string }>({ status: "idle", judgments: [] });
  const body = txn && cardId ? JSON.stringify({ txn, cardId, today }) : "";
  useEffect(() => {
    if (!body) return;
    const ck = `cardsem-judge:${hash(body)}`;
    let alive = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    try { const c = sessionStorage.getItem(ck); if (c) { setState({ status: "done", ...JSON.parse(c) }); return; } } catch { /* 무시 */ }
    setState({ status: "loading", judgments: [] });
    const { txn: t, cardId: id, today: d } = JSON.parse(body);
    aiJudge(t, id, d).then((r) => { if (!alive) return; try { sessionStorage.setItem(ck, JSON.stringify(r)); } catch { /* 무시 */ } setState({ status: "done", ...r }); })
      .catch((e: Error) => alive && setState({ status: "error", judgments: [], error: e.message }));
    return () => { alive = false; };
  }, [body]);
  return state;
}
const hash = (s: string) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); };
