"use client";
/* 영수증·문자·명세서 인식 작업 목록. 화면(/receipt) 바깥 모듈 변수에 둬서 다른 화면에 갔다 와도 결과가 남고,
 * 화면이 없을 때 끝난 요청도 여기에 기록된다. 새로고침하면 사라진다 (이미지를 서버에 저장하지 않으므로).
 * 응답은 작업 id로만 반영한다 — 처리 중에 '다른 파일 고르기'로 목록을 바꾸면 늦게 온 응답은 버려진다 */
import { useSyncExternalStore } from "react";
import { aiOcr } from "./client";
import type { DocResult, ReceiptResult } from "./server";

/** 거래별 처리 상태: false=아직, saved=저장함, skipped=건너뜀 */
export type TxState = "saved" | "skipped" | false;
export type Job = { id: string; file: File; url: string; status: "processing" | "done" | "failed"; kind?: DocResult["kind"]; txs: ReceiptResult[]; done: TxState[]; error?: string; ms?: number };

let jobs: Job[] = [];
let owner: string | undefined; // 작업을 올린 사용자. 로그아웃은 페이지를 새로 고치지 않아 모듈 변수가 다음 사용자에게 남는다
let seq = 0;
const subs = new Set<() => void>();
const set = (next: Job[]) => { jobs = next; subs.forEach((f) => f()); };
// 없는 id(이미 지운 목록의 응답)면 아무것도 바뀌지 않는다
const patch = (id: string, p: (j: Job) => Partial<Job>) => set(jobs.map((j) => (j.id === id ? { ...j, ...p(j) } : j)));

async function run(id: string) {
  const job = jobs.find((j) => j.id === id);
  if (!job) return;
  patch(id, () => ({ status: "processing", error: undefined }));
  try {
    const { kind, transactions, ms } = await aiOcr(job.file);
    // 음수 금액(명세서의 취소 행)은 여기서 한 번만 양수 + 취소로 바꾼다 — 목록·확인 화면·다음 순서가 같은 값을 보게
    const txs = transactions.map((t) => (t.total < 0 ? { ...t, total: -t.total, isCancel: true } : t));
    patch(id, () => ({ status: "done", kind, txs, done: txs.map(() => false), ms }));
  } catch (e) {
    patch(id, () => ({ status: "failed", error: (e as Error).message }));
  }
}

export const receiptJobs = {
  get: () => jobs,
  /** 새 묶음으로 바꾸고 파일마다 동시에 요청 (NFR-03) */
  start(files: File[]) {
    receiptJobs.clear();
    set(files.map((file) => ({ id: `${Date.now().toString(36)}_${++seq}`, file, url: URL.createObjectURL(file), status: "processing", txs: [], done: [] })));
    jobs.forEach((j) => run(j.id));
  },
  retry: run,
  clear() { jobs.forEach((j) => URL.revokeObjectURL(j.url)); set([]); },
  /** 지금 사용자(로그인 id, 데모는 "demo")를 알린다. 이전 작업이 다른 사용자 것이면 지운다 (남의 영수증이 보이거나 새 계정에 저장되지 않게) */
  own(user: string) { if (owner !== undefined && owner !== user) receiptJobs.clear(); owner = user; },
  mark: (id: string, k: number, v: TxState) => patch(id, (j) => ({ done: j.done.map((x, m) => (m === k ? v : x)) })),
};

const EMPTY: Job[] = [];
const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
export const useReceiptJobs = () => useSyncExternalStore(subscribe, () => jobs, () => EMPTY);

/** 다음에 확인할 거래 [작업 id, 거래 번호]. 취소 건은 맨 뒤로 — 같은 명세서의 원거래를 먼저 저장해야 후보로 보이니까 */
export function nextOpen(js: Job[]): [string, number] | null {
  for (const cancel of [false, true]) for (const j of js) {
    const k = j.txs.findIndex((t, m) => j.done[m] === false && !!t.isCancel === cancel);
    if (k >= 0) return [j.id, k];
  }
  return null;
}
