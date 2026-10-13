/* 화면 라벨 — 코드 값을 사람이 읽는 한국어로. 한 곳에서만 정의한다 */
import type { BadgeKind } from "@/components/ui";
import type { BenefitRule, PayChannel, PayMethod, Transaction } from "./types";

export const PAY_TYPE: Record<Transaction["payType"], string> = { credit: "신용카드", check: "체크카드", cash: "현금", transfer: "계좌이체" };
export const PAY_METHOD: Record<PayMethod, string> = { issuer_pay: "카드사 자체페이 (SOL페이 등)", samsung_pay: "삼성페이", naver_pay: "네이버페이", kakao_pay: "카카오페이", card: "실물카드" };
export const PAY_CHANNEL: Record<PayChannel, string> = { in_app: "앱 내 결제", offline: "현장 결제", web: "온라인 웹" };

export const RULE_KIND: Record<BenefitRule["kind"], { label: string; badge: BadgeKind }> = { discount: { label: "할인", badge: "benefit" }, cashback: { label: "캐시백", badge: "info" }, point: { label: "적립", badge: "info" } };

/* 영수증 인식이 판별한 문서 종류 */
export const DOC_KIND = { receipt: "영수증", sms: "결제 문자", statement: "명세서", unknown: "거래 없음" } as const;
