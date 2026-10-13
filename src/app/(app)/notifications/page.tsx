"use client";
/* 알림 (RPT-10). 저장된 문구가 아니라 오늘이 속한 달 데이터에서 만든다 (lib/notify.ts). 누르면 읽음 + 관련 화면으로 */
import Link from "next/link";
import { Screen, TopAction } from "@/components/shell";
import { Card, Cap, cx, EmptyState, IconTile } from "@/components/ui";
import { useStore } from "@/lib/store";
import { fmtYm } from "@/lib/engine";
import { deriveNotifications, useReadNotices, type NoticeKind } from "@/lib/notify";

const STYLE: Record<NoticeKind, [string, "warn" | "danger" | "primary"]> = { tierSoon: ["trending_up", "primary"], missed: ["savings", "warn"] };

export default function NotificationsPage() {
  const { txns, calcFor, userCards, today, me } = useStore();
  const ym = today.slice(0, 7);
  const notices = deriveNotifications({ calc: calcFor(ym), userCards, txns, month: ym, today });
  const { read, markRead } = useReadNotices(me?.id);
  const hasUnread = notices.some((n) => !read.has(n.id));
  return (
    <Screen title="알림" desc="카드 실적 구간 달성 직전, 놓친 혜택이 큰 결제를 앱 안에서 알려요 (RPT-10)" back right={hasUnread && <TopAction onClick={() => markRead(notices.map((n) => n.id))}>모두 읽음</TopAction>}>
      <div className="max-w-180 w-full mx-auto flex flex-col gap-3">
        <Cap>{fmtYm(ym)} 기준</Cap>
        {notices.length === 0 && <Card><EmptyState icon="notifications" title="새 알림이 없어요" desc="예산을 80% 넘게 쓰거나 카드 실적 구간이 가까워지면 여기서 알려드려요." /></Card>}
        {notices.map((n) => {
          const unread = !read.has(n.id);
          return (
            <Link key={n.id} href={n.href} onClick={() => markRead([n.id])} className="block rounded-lg">
              <Card pad="p-4" className={cx("flex-row items-center gap-3 hover:bg-gray-50", unread && "border-violet-200")}>
                <IconTile name={STYLE[n.kind][0]} tone={STYLE[n.kind][1]} />
                <span className="flex-1 flex flex-col gap-0.5 min-w-0"><span className={cx("text-label", unread ? "text-strong font-semibold" : "text-body")}>{n.title}</span><Cap>{n.sub}</Cap></span>
                {unread && <><i aria-hidden className="w-2 h-2 rounded-full bg-primary flex-none" /><span className="sr-only">읽지 않음</span></>}
              </Card>
            </Link>
          );
        })}
      </div>
    </Screen>
  );
}
