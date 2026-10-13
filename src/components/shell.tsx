"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { Chip, cx, Icon, segBox, segItem, Sheet, useDialog } from "./ui";
import { useStore, DEMO_USER } from "@/lib/store";
import { fmtYm, nextYm, prevYm } from "@/lib/engine";
import { receiptJobs } from "@/lib/ai/receipt-jobs";

type NavItem = readonly [icon: string, label: string, href: string];
/* 데스크톱 사이드바 메뉴. 묶음 제목이 없는 첫 묶음이 자주 가는 곳 */
const NAV_GROUPS: readonly (readonly [title: string, items: readonly NavItem[]])[] = [
  ["", [["home", "홈", "/home"], ["receipt_long", "거래 내역", "/transactions"], ["summarize", "월간 요약", "/monthly"]]],
  ["카드·혜택", [["credit_card", "내 카드", "/cards"]]],
  ["분석", [["pie_chart", "통계", "/stats/trend"], ["download", "엑셀 내보내기", "/settings/export"]]],
];
const SETTINGS: NavItem = ["settings", "설정", "/settings"];
const ADMIN_NAV: readonly NavItem[] = [
  ["credit_card", "카드 상품", "/admin/cards"], ["edit_note", "원문 입력", "/admin/input"],
];
/* 모바일 하단 탭. 가운데는 + 메뉴, 오른쪽 끝 '더보기'는 MORE 시트를 연다 */
const BOTTOM: readonly NavItem[] = [["home", "홈", "/home"], ["receipt_long", "내역", "/transactions"], ["add", "", ""], ["credit_card", "카드", "/cards"]];
/** 하단 탭에 없는 화면 전부 (모바일에는 사이드바가 없어서 여기서만 갈 수 있다) */
const MORE: readonly NavItem[] = [
  ["summarize", "월간 요약", "/monthly"], ["pie_chart", "통계", "/stats/trend"],
  ["download", "엑셀 내보내기", "/settings/export"], ["notifications", "알림", "/notifications"], SETTINGS,
];

/** 지금 경로에 해당하는 메뉴 href 하나 — 가장 길게 맞는 것 (/settings/export는 '설정'이 아니라 '엑셀 내보내기', /admin/cards는 '현황'이 아니라 '카드 상품') */
export const activeHref = (path: string, hrefs: readonly string[]) =>
  hrefs.filter((h) => path === h || path.startsWith(h + "/") || (h === "/stats/trend" && path.startsWith("/stats/"))).sort((a, b) => b.length - a.length)[0];

const navLink = (on: boolean) => cx("flex items-center gap-3 h-11 px-3 rounded-md text-body transition-colors", on ? "bg-primary-soft text-violet-700 font-semibold" : "text-body font-medium hover:bg-gray-50");

export function Sidebar({ admin = false }: { admin?: boolean }) {
  const path = usePathname();
  const { userCards, me } = useStore();
  const groups: typeof NAV_GROUPS = admin ? [["", ADMIN_NAV]] : NAV_GROUPS;
  const cur = activeHref(path, [...groups.flatMap(([, items]) => items.map((i) => i[2])), SETTINGS[2]]);
  return (
    <aside className="hidden md:flex w-60 flex-none bg-white border-r border-line flex-col p-4 gap-6 sticky top-0 h-screen overflow-y-auto">
      <Link href={admin ? "/admin" : "/home"} className="flex items-center gap-2.5 px-2 py-1">
        <span className={cx("w-8 h-8 rounded-btn text-white inline-flex items-center justify-center font-bold text-body", admin ? "bg-gray-900" : "bg-primary")}>셈</span>
        <span className="text-h3 font-bold tracking-title text-strong">카드셈{admin && <span className="ml-1.5 text-overline text-muted align-middle">ADMIN</span>}</span>
      </Link>
      <nav aria-label={admin ? "어드민 메뉴" : "주 메뉴"} className="flex flex-col gap-4">
        {groups.map(([title, items]) => (
          <div key={title} className="flex flex-col gap-0.5">
            {title && <span className="px-3 pb-1 text-overline text-muted">{title}</span>}
            {items.map(([icon, label, href]) => {
              const on = href === cur;
              return <Link key={href} href={href} aria-current={on ? "page" : undefined} className={navLink(on)}><Icon name={icon} size={22} fill={on} />{label}</Link>;
            })}
          </div>
        ))}
      </nav>
      <div className="mt-auto flex flex-col gap-0.5">
        {/* 어드민 링크: 데모 모드는 누구나(시연용), 로그인 모드는 관리자만 */}
        {(admin || !me || me.admin) && <Link href={admin ? "/home" : "/admin"} className={navLink(false)}><Icon name={admin ? "person" : "admin_panel_settings"} size={22} />{admin ? "사용자 화면" : "어드민"}</Link>}
        <Link href={SETTINGS[2]} aria-current={cur === SETTINGS[2] ? "page" : undefined} className={navLink(cur === SETTINGS[2])}><Icon name={SETTINGS[0]} size={22} fill={cur === SETTINGS[2]} />{SETTINGS[1]}</Link>
        <div className="flex items-center gap-3 h-13 px-3">
          <span className="w-8 h-8 rounded-full bg-violet-200 text-violet-800 inline-flex items-center justify-center font-bold text-caption">{(me?.name ?? (admin ? "관리자" : DEMO_USER.name))[0]}</span>
          <div className="flex flex-col gap-0.5">
            <span className="text-label text-strong">{me?.name ?? (admin ? "관리자" : DEMO_USER.name)}</span>
            <span className="text-caption text-muted">{admin ? (me?.admin ? "관리자" : "데모 · 둘러보기만") : `카드 ${userCards.length}장`}</span>
          </div>
        </div>
      </div>
    </aside>
  );
}

/** 하단 + 메뉴: 촬영 · 앨범 · 직접 입력. 앨범은 1장이면 바로 확인, 여러 장이면 일괄 처리로 내부 분기.
 * 인식은 여기서 바로 시작하고 /receipt로 간다 (소유자를 먼저 정한 뒤 시작) */
export function AddMenu({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const { me } = useStore();
  const ref = useDialog(open, onClose);
  const pick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!files.length) return;
    // 소유자를 먼저 알린다 — 안 그러면 계정이 바뀐 뒤 /receipt의 own()이 방금 시작한 작업을 이전 사용자 것으로 보고 지운다
    receiptJobs.own(me?.id ?? "demo");
    receiptJobs.start(files); onClose(); router.push("/receipt");
  };
  if (!open) return null;
  // focus-within: 키보드로 옮겨 간 줄이 보이게 (파일 input은 sr-only라 자체 표시가 없음)
  const row = "flex items-center gap-3 px-4 h-14 hover:bg-gray-50 focus-within:bg-gray-50 cursor-pointer text-left w-full";
  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal aria-label="거래 추가">
      <button type="button" aria-label="닫기" tabIndex={-1} className="absolute inset-0 bg-gray-900/30" onClick={onClose} />
      <div ref={ref} className="absolute left-1/2 -translate-x-1/2 bottom-28 md:bottom-auto md:top-1/2 md:-translate-y-1/2 w-70 bg-white rounded-xl shadow-3 overflow-hidden py-1">
        <label className={row}><span className="w-10 h-10 rounded-md bg-primary-soft text-primary inline-flex items-center justify-center"><Icon name="photo_camera" size={22} /></span><span className="flex-1 flex flex-col"><span className="text-label text-strong">촬영</span><span className="text-caption text-muted">영수증·문자 화면을 바로 찍어요</span></span><input type="file" accept="image/*" capture="environment" className="sr-only" onChange={pick} /></label>
        <label className={row}><span className="w-10 h-10 rounded-md bg-primary-soft text-primary inline-flex items-center justify-center"><Icon name="photo_library" size={22} /></span><span className="flex-1 flex flex-col"><span className="text-label text-strong">앨범</span><span className="text-caption text-muted">영수증·문자 캡처·명세서(PDF)</span></span><input type="file" accept="image/*,.heic,.heif,application/pdf" multiple className="sr-only" onChange={pick} /></label>
        <Link href="/transactions/new" onClick={onClose} className={row}><span className="w-10 h-10 rounded-md bg-gray-100 text-body inline-flex items-center justify-center"><Icon name="edit" size={22} /></span><span className="flex-1 flex flex-col"><span className="text-label text-strong">직접 입력</span><span className="text-caption text-muted">금액·가맹점을 입력해요</span></span></Link>
      </div>
    </div>
  );
}

export function BottomNav() {
  const path = usePathname();
  const [add, setAdd] = useState(false);
  const [more, setMore] = useState(false);
  const cur = activeHref(path, [...BOTTOM, ...MORE].map((i) => i[2]).filter(Boolean));
  const moreOn = MORE.some((i) => i[2] === cur);
  const tab = (on: boolean) => cx("flex flex-col items-center gap-1 pt-1.5 text-nav", on ? "text-primary font-semibold" : "text-muted font-medium");
  return (
    <nav aria-label="주 메뉴" className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t border-line grid grid-cols-5 items-start px-2 pt-2 pb-safe">
      {BOTTOM.map(([icon, label, href]) => {
        if (!label) return (
          <span key="add" className="flex justify-center"><button type="button" aria-label="거래 추가" aria-haspopup="dialog" aria-expanded={add} onClick={() => setAdd(true)} className="w-12 h-12 rounded-lg bg-primary text-white inline-flex items-center justify-center shadow-2 active:scale-98"><Icon name="add" size={26} /></button><AddMenu open={add} onClose={() => setAdd(false)} /></span>
        );
        const on = href === cur;
        return <Link key={href} href={href} aria-current={on ? "page" : undefined} className={tab(on)}><Icon name={icon} size={24} fill={on} />{label}</Link>;
      })}
      <button type="button" aria-haspopup="dialog" aria-expanded={more} onClick={() => setMore(true)} className={tab(moreOn)}><Icon name="menu" size={24} fill={moreOn} />더보기</button>
      <Sheet open={more} onClose={() => setMore(false)} title="전체 메뉴">
        <div className="grid grid-cols-4 gap-y-2">
          {MORE.map(([icon, label, href]) => {
            const on = href === cur;
            return (
              <Link key={href} href={href} onClick={() => setMore(false)} aria-current={on ? "page" : undefined} className="flex flex-col items-center gap-1.5 py-2 rounded-md hover:bg-gray-50">
                <span className={cx("w-12 h-12 rounded-md inline-flex items-center justify-center", on ? "bg-primary text-white" : "bg-primary-soft text-primary")}><Icon name={icon} size={24} /></span>
                <span className={cx("text-caption text-center", on ? "text-primary font-semibold" : "text-body")}>{label}</span>
              </Link>
            );
          })}
        </div>
      </Sheet>
    </nav>
  );
}

/** 화면 프레임: 모바일 상단바(56px) + 데스크톱 헤더(72px). nav=true면 모바일 하단 탭 표시.
 * 제목이 글자면 h1, 컨트롤(MonthPicker·검색창)이면 div — 폼 컨트롤·버튼이 제목으로 읽히지 않게. MonthPicker는 월 글자만 h1으로 그린다 */
export function Screen({ title, desc, back, right, nav = false, children, wide, className }: { title: ReactNode; desc?: ReactNode; back?: boolean | string; right?: ReactNode; nav?: boolean; children: ReactNode; wide?: boolean; className?: string }) {
  const router = useRouter();
  const goBack = () => (typeof back === "string" ? router.push(back) : router.back());
  const Title = typeof title === "string" ? "h1" : "div";
  return (
    <div className={cx("flex-1 flex flex-col min-w-0", nav && "pb-nav md:pb-0")}>
      <header className="sticky top-0 z-30 bg-white border-b border-line md:h-header flex items-center px-2 md:px-8 gap-1 md:gap-4 h-14">
        {back && <button type="button" aria-label="뒤로" onClick={goBack} className="w-11 h-11 md:w-9 md:h-9 md:border md:border-line md:rounded-btn inline-flex items-center justify-center text-strong flex-none"><Icon name="chevron_left" size={24} /></button>}
        {!back && <span className="w-3 md:hidden" />}
        <div className="flex-1 min-w-0 flex flex-col md:gap-0.5">
          <Title className="m-0 text-h3 md:text-h2 md:tracking-title text-strong truncate">{title}</Title>
          {desc && <span className="hidden md:block text-caption text-muted">{desc}</span>}
        </div>
        <div className="flex items-center gap-1 md:gap-2 flex-none">{right}</div>
      </header>
      <div className={cx("flex-1 w-full mx-auto px-4 md:px-8 py-4 md:py-6 flex flex-col gap-4 md:gap-5", wide ? "max-w-none" : "max-w-content", className)}>{children}</div>
      {nav && <BottomNav />}
    </div>
  );
}

export const TopIconButton = ({ icon, href, onClick, label, dot }: { icon: string; href?: string; onClick?: () => void; label: string; dot?: boolean }) => {
  const cls = "relative w-11 h-11 md:w-10 md:h-10 md:border md:border-line md:rounded-md inline-flex items-center justify-center text-strong hover:bg-gray-50";
  const inner = (<><Icon name={icon} size={24} className="md:hidden" /><Icon name={icon} size={22} className="hidden md:inline-flex" />{dot && <i className="absolute top-2 right-2 w-2 h-2 rounded-full bg-danger border-2 border-white" />}</>);
  return href ? <Link href={href} aria-label={label} className={cls}>{inner}</Link> : <button type="button" aria-label={label} onClick={onClick} className={cls}>{inner}</button>;
};
export const TopAction = ({ children, onClick, href }: { children: ReactNode; onClick?: () => void; href?: string }) => {
  const cls = "font-semibold text-body text-primary px-2 h-11 inline-flex items-center";
  return href ? <Link href={href} className={cls}>{children}</Link> : <button type="button" onClick={onClick} className={cls}>{children}</button>;
};

/* Screen 제목 자리에 들어간다. 화면의 h1은 월 글자만 (이전·다음 달 버튼 이름이 제목에 섞이지 않게) */
export function MonthPicker({ suffix = "" }: { suffix?: string }) {
  const { month, setMonth } = useStore();
  return (
    <div className="flex items-center gap-0.5 -ml-1">
      <button type="button" aria-label="이전 달" onClick={() => setMonth(prevYm(month))} className="w-9 h-9 rounded-btn inline-flex items-center justify-center text-body hover:bg-gray-100"><Icon name="chevron_left" size={22} /></button>
      <h1 className="m-0 text-h2 tracking-title text-strong min-w-24 md:min-w-30 text-center whitespace-nowrap"><span className="md:hidden">{Number(month.slice(5))}월</span><span className="hidden md:inline">{fmtYm(month)}</span>{suffix}</h1>
      <button type="button" aria-label="다음 달" onClick={() => setMonth(nextYm(month))} className="w-9 h-9 rounded-btn inline-flex items-center justify-center text-body hover:bg-gray-100"><Icon name="chevron_right" size={22} /></button>
    </div>
  );
}

const VIEWS = { 내역: "/transactions", "월간 요약": "/monthly" } as const;
/** 거래 내역 · 월간 요약 전환 (두 화면 위쪽 공통). 모양은 Seg지만 페이지 이동이라 nav 안의 링크 */
export function ViewSwitch({ value, className = "md:w-90" }: { value: keyof typeof VIEWS; className?: string }) {
  return (
    <nav aria-label="보기 전환" className={cx(segBox, className)}>
      {(Object.keys(VIEWS) as (keyof typeof VIEWS)[]).map((k) => <Link key={k} href={VIEWS[k]} aria-current={k === value ? "page" : undefined} className={segItem(k === value)}>{k}</Link>)}
    </nav>
  );
}

/** 어드민은 모바일에 사이드바가 없어서 화면 위에 메뉴 칩 줄을 둔다 */
function AdminTabs() {
  const path = usePathname();
  const cur = activeHref(path, ADMIN_NAV.map((i) => i[2]));
  return (
    <nav aria-label="어드민 메뉴" className="md:hidden flex gap-2 overflow-x-auto no-scrollbar px-4 py-2 bg-white border-b border-line">
      {ADMIN_NAV.map(([, label, href]) => <Chip key={href} on={href === cur} href={href}>{label}</Chip>)}
      <Chip icon="person" href="/home">사용자 화면</Chip>
    </nav>
  );
}

/** 모든 화면이 거치는 틀. 로그인 데이터를 읽는 동안은 데모 시드가 비치거나 입력이 사라지지 않게 화면을 막고,
 * DB 쓰기·읽기 실패(store.syncError)는 닫을 수 있는 알림으로 띄운다. 데모 모드는 loading이 처음부터 false */
/** 로그인 사용자의 장부를 DB에서 읽는 동안의 전체 화면 (AppShell 밖 화면인 온보딩도 같이 쓴다) */
export function Loading() {
  return (
    <div role="status" className="min-h-screen flex flex-col items-center justify-center gap-3 text-muted">
      <Icon name="progress_activity" size={32} className="text-primary animate-spin" />
      <span className="text-label">장부를 불러오는 중이에요</span>
    </div>
  );
}

export function AppShell({ children, admin }: { children: ReactNode; admin?: boolean }) {
  const { loading, syncError, clearSyncError, me, demoOn } = useStore();
  const router = useRouter();
  // 로그인도 데모 선택도 안 했으면 로그인 화면으로. 소셜 로그인 후 가입 절차(닉네임)를 마치지 않은 사용자는 가입 화면으로
  // ponytail: 화면 가리기일 뿐 — 데이터 보호는 RLS가 한다 (세션이 브라우저에 있어 서버는 로그인 여부를 모름)
  const out = !loading && !me && !demoOn;
  useEffect(() => { if (out) router.replace("/login"); else if (me?.needsProfile) router.replace("/welcome"); }, [out, me?.needsProfile, router]);
  if (loading || out || me?.needsProfile) return <Loading />;
  // 어드민 화면 가리기 (UI용). 데이터 보호는 RLS(app_metadata.role)와 /api/normalize의 서버 확인이 한다
  if (admin && me && !me.admin) return (
    <div role="alert" className="min-h-screen flex flex-col items-center justify-center gap-3 px-6 text-center">
      <Icon name="lock" size={32} className="text-muted" />
      <span className="text-h3 text-strong">관리자만 볼 수 있어요</span>
      <span className="text-label text-muted">관리자 지정은 Supabase 대시보드에서 해요 (app_metadata.role = admin)</span>
      <Link href="/home" className="text-label font-semibold text-link">홈으로</Link>
    </div>
  );
  return (
    <div className="min-h-screen flex">
      <Sidebar admin={admin} />
      <main className="flex-1 flex flex-col min-w-0 min-h-screen">{admin && <AdminTabs />}{children}</main>
      {syncError && (
        <div role="alert" className="fixed z-50 inset-x-4 bottom-above-nav md:bottom-6 md:left-auto md:right-8 md:w-100 flex items-start gap-2.5 px-4 py-3 rounded-md bg-danger-soft text-red-700 shadow-2">
          <Icon name="cloud_off" size={20} className="mt-px" />
          <span className="flex-1 min-w-0 flex flex-col gap-0.5">
            <span className="text-label font-semibold">서버와 맞추지 못했어요</span>
            <span className="text-caption break-words">{syncError} · 새로고침하면 서버에 저장된 내용으로 다시 불러와요</span>
          </span>
          <button type="button" onClick={() => window.location.reload()} className="text-label font-semibold underline flex-none">새로고침</button>
          <button type="button" aria-label="알림 닫기" onClick={clearSyncError} className="flex-none"><Icon name="close" size={20} /></button>
        </div>
      )}
    </div>
  );
}
