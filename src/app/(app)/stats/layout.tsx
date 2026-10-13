"use client";
/* 통계 (RPT-07~09). 탭 3개가 같은 "선택한 달"을 기준으로 움직인다 — 머리글의 달 이동으로 바꾼다 */
import { usePathname } from "next/navigation";
import { MonthPicker, Screen } from "@/components/shell";
import { Chip } from "@/components/ui";

const TABS = [["추이", "/stats/trend"], ["비중", "/stats/share"]] as const;

export default function StatsLayout({ children }: LayoutProps<"/stats">) {
  const path = usePathname();
  return (
    <Screen title={<MonthPicker suffix=" 통계" />} desc="그래프 옆 [표]를 누르면 같은 숫자를 표로 봐요" nav>
      {/* 페이지 이동이라 tablist가 아니라 nav (탭 역할 버튼이 없는 tablist는 낭독기가 잘못 읽는다) */}
      <nav aria-label="통계 종류" className="flex gap-2 overflow-x-auto no-scrollbar md:flex-wrap -mx-4 px-4 md:mx-0 md:px-0">
        {TABS.map(([l, h]) => <Chip key={h} on={path === h} href={h}>{l}</Chip>)}
      </nav>
      {children}
    </Screen>
  );
}
