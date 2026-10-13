-- 누락된 FK·CHECK 보강, budgets 총예산(null) 허용 (원격 기록 20261005075515 fix_relations)
-- categories PK가 (user_id, id)라 카테고리 참조는 전부 복합 FK (사용자별 같은 id 허용)

-- 1. transactions (receipt_id 컬럼 삭제는 20261005080000_drop_transactions_receipt_id.sql 로 분리 — 파괴적 구문이라 따로 승인)
alter table transactions
  add constraint transactions_category_fkey foreign key (user_id, category_id)
    references categories (user_id, id) on delete set null (category_id),
  add constraint transactions_recurring_id_fkey foreign key (recurring_id)
    references recurring_rules (id) on delete set null;

-- 2. recurring_rules
alter table recurring_rules
  add constraint recurring_rules_type_check check (type in ('income','expense')),
  add constraint recurring_rules_pay_type_check check (pay_type in ('credit','check','cash','transfer')),
  add constraint recurring_rules_category_fkey foreign key (user_id, category_id)
    references categories (user_id, id) on delete set null (category_id),
  add constraint recurring_rules_card_id_fkey foreign key (card_id)
    references card_products (id);

-- 3. categories: 하위 카테고리 → 상위 (상위 삭제 시 하위도 삭제, 앱 동작과 동일)
alter table categories
  add constraint categories_parent_fkey foreign key (user_id, parent_id)
    references categories (user_id, id) on delete cascade;

-- 4. budgets: PK 때문에 category_id null(총예산)이 불가능했음 → unique nulls not distinct 로 교체
alter table budgets drop constraint budgets_pkey;
alter table budgets alter column category_id drop not null;
alter table budgets
  add constraint budgets_user_category_key unique nulls not distinct (user_id, category_id),
  add constraint budgets_category_fkey foreign key (user_id, category_id)
    references categories (user_id, id) on delete cascade;
