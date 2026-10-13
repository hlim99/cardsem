import { AppShell } from "@/components/shell";

// NFR-06 어드민 접근
// - 데모 모드(로그인 안 함): 시연용으로 누구나 열 수 있다 (알려진 한계)
// - 로그인 모드: AppShell(클라이언트)이 관리자(app_metadata.role='admin')가 아니면 화면을 가린다 — UI 가리기일 뿐
// 진짜 보호는 서버 쪽이다: card_products·benefit_rules 쓰기는 RLS가, /api/normalize는 Supabase 토큰 확인이 관리자만 통과시킨다.
// 서버 레이아웃에서 막지 않는 이유: 세션이 브라우저 localStorage에 있어 서버는 누가 로그인했는지 모른다
export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return <AppShell admin>{children}</AppShell>;
}
