-- 관리자 판정을 app_metadata.role로. auth.jwt() ->> 'role'은 Postgres 역할 클레임이라 로그인 사용자는 항상 'authenticated' → 아무도 관리자가 될 수 없었다.
-- 관리자 지정: Supabase 대시보드 Authentication → Users → 사용자 → raw_app_meta_data에 {"role":"admin"} (사용자가 스스로 못 바꾸는 값)
alter policy "read approved" on benefit_rules using (status = 'approved' or (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
alter policy "admin write" on benefit_rules using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
alter policy "admin write" on card_products using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
alter policy "admin write" on merchant_categories using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
