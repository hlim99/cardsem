-- 직접 추가 카드(CARD-02)를 계정에 저장 (데이터를 지우지 않는 변경만). 원격 기록 20261009073948 custom_cards_owner
-- 사용자 카드도 card_products 한 테이블에 owner_id를 달아 둔다 → transactions·recurring_rules·user_cards.card_id FK가 그대로 성립
alter table card_products
  add column if not exists owner_id uuid references auth.users(id) on delete cascade, -- null = 기본 카드(관리자 관리), 값 = 그 사용자가 직접 추가한 카드
  add column if not exists custom_def jsonb;                                         -- 사용자 카드 정의 전체 (TypeScript CardProduct JSON). 앱은 이 값으로 계산
-- 사용자 카드 id는 custom_ 으로만 (기본 카드 id를 미리 차지하지 못하게), 정의가 꼭 있어야 한다
alter table card_products add constraint card_products_owner_custom check (owner_id is null or (id like 'custom\_%' and custom_def is not null));
-- 읽기: 기본 카드는 모두, 사용자 카드는 본인만. 쓰기: 본인 카드만 (관리자 쓰기 정책은 그대로)
alter policy "read all" on card_products using (owner_id is null or owner_id = auth.uid());
create policy "owner write" on card_products for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
