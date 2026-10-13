/* 표시용 포맷 — 금액·날짜. 화면과 엔진이 같이 쓴다 (React 의존 없음) */

export const won = (n: number, sign = false) => `${sign && n > 0 ? "+" : ""}${Math.round(n).toLocaleString("ko-KR")}원`;
/** 천 단위 쉼표 (금액이 아닌 개수·글자 수). 로캘을 고정해야 서버(Node 기본 en-US)와 브라우저(de-DE 등)의 첫 렌더가 같다 */
export const num = (n: number) => n.toLocaleString("ko-KR");

export const DOW = ["일", "월", "화", "수", "목", "금", "토"] as const;
/** "2026-09-20" → 0(일)~6(토). 로컬 시간대 기준 */
export const dowOf = (date: string) => { const [y, m, d] = date.split("-").map(Number); return new Date(y, m - 1, d).getDay(); };
export const dowLabel = (date: string) => DOW[dowOf(date)];

/** "2026-09-20" → "9/20" */
export const fmtMd = (date: string) => `${Number(date.slice(5, 7))}/${date.slice(8)}`;
/** "2026-09-20" → "9. 20 (일)" */
export const fmtDateKo = (date: string) => `${Number(date.slice(5, 7))}. ${Number(date.slice(8))} (${dowLabel(date)})`;
/** "2026-09-20" → "9월 20일 일요일" */
export const fmtDateLong = (date: string) => `${Number(date.slice(5, 7))}월 ${Number(date.slice(8))}일 ${dowLabel(date)}요일`;
