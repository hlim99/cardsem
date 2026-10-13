-- 가맹점 사전 + LLM 캐시: 읽기는 모두, 쓰기는 관리자만 (card_products와 같은 규칙)
alter table merchant_categories enable row level security;
create policy "read all" on merchant_categories for select using (true);
create policy "admin write" on merchant_categories for all using ((auth.jwt() ->> 'role') = 'admin');
