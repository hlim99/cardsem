-- 계정·반복 거래 동기화 보강 (데이터를 지우지 않는 변경만). 원격 기록 20261009070630 account_sync
-- 1. 실적 보정을 적용할 달 (UserCard.spendTierOverrideYm, "YYYY-MM"). null이면 예전 데이터라 모든 달에 적용
alter table user_cards add column if not exists spend_tier_override_ym text check (spend_tier_override_ym ~ '^[0-9]{4}-[0-9]{2}$');

-- 2. 반복 거래 회차는 규칙·날짜당 한 건. 두 기기가 같은 날 앱을 열어도 같은 회차가 두 번 들어가지 않게
--    (앱은 on conflict do nothing으로 넣는다). recurring_id가 null인 일반 거래는 null끼리 서로 달라 걸리지 않는다
create unique index if not exists transactions_recurring_once on transactions (user_id, recurring_id, date);

-- 3. 거래를 지우면 그 거래의 영수증 기록도 함께 지운다 (없으면 영수증이 달린 거래 삭제가 FK로 거부됨)
alter table receipts drop constraint receipts_transaction_id_fkey,
  add constraint receipts_transaction_id_fkey foreign key (transaction_id) references transactions (id) on delete cascade;

-- 4. 규칙을 검수한 어드민 계정을 지워도 규칙은 남긴다 (검수자만 비움)
alter table benefit_rules drop constraint benefit_rules_reviewed_by_fkey,
  add constraint benefit_rules_reviewed_by_fkey foreign key (reviewed_by) references auth.users (id) on delete set null;
