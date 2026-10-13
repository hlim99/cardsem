-- 카드셈 Supabase public 스키마 → ERDCloud import용 DDL (MySQL 방언)
-- 기준: supabase/schema.sql (= migrations 20261009073948_custom_cards_owner 까지 적용한 상태), 2026-10-09 갱신
-- 타입 매핑: uuid→CHAR(36), text PK→VARCHAR(64), jsonb/text[]→JSON, timestamptz→DATETIME
-- 원본 PG 타입·CHECK·DEFAULT 는 COMMENT 에 보존

-- Supabase auth 스키마 (FK 대상 표시용 스텁)
CREATE TABLE auth_users (
  id CHAR(36) NOT NULL COMMENT 'auth.users.id (uuid)',
  PRIMARY KEY (id)
) COMMENT='Supabase auth.users (스텁)';

CREATE TABLE card_products (
  id VARCHAR(64) NOT NULL,
  issuer VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  type VARCHAR(16) NOT NULL COMMENT 'CHECK credit|check',
  color VARCHAR(255) NULL,
  grade VARCHAR(1) NULL COMMENT 'CHECK A|B|C|D',
  annual_fee INT NULL,
  tiers JSON NOT NULL COMMENT 'jsonb, default [{"max":null,"min":0}]',
  spend_excludes JSON NOT NULL COMMENT 'text[], default {}',
  variants JSON NULL COMMENT 'jsonb',
  perks JSON NOT NULL COMMENT 'jsonb, default []',
  source_url TEXT NULL,
  checked_at DATE NULL,
  review_status VARCHAR(16) NOT NULL DEFAULT 'pending' COMMENT 'CHECK approved|pending|none',
  raw_text TEXT NULL,
  raw_hash VARCHAR(255) NULL,
  owner_id CHAR(36) NULL COMMENT 'uuid. null = 기본 카드, 값 = 그 사용자가 직접 추가한 카드',
  custom_def JSON NULL COMMENT 'jsonb. 직접 추가한 카드 정의 전체 (CardProduct). CHECK owner_id is null or (id like custom\\_% and custom_def is not null)',
  created_at DATETIME NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'timestamptz',
  PRIMARY KEY (id)
);

CREATE TABLE benefit_rules (
  id VARCHAR(64) NOT NULL,
  card_id VARCHAR(64) NOT NULL,
  version INT NOT NULL DEFAULT 1,
  valid_from DATE NULL,
  valid_to DATE NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'pending' COMMENT 'CHECK approved|pending|rejected',
  rule JSON NOT NULL COMMENT 'jsonb',
  reviewed_by CHAR(36) NULL COMMENT 'uuid, 검수자 계정 삭제 시 NULL',
  reviewed_at DATETIME NULL COMMENT 'timestamptz',
  PRIMARY KEY (id)
);

CREATE TABLE user_cards (
  user_id CHAR(36) NOT NULL COMMENT 'uuid',
  card_id VARCHAR(64) NOT NULL,
  variant_id VARCHAR(64) NULL,
  spend_tier_override INT NULL COMMENT '사용자가 고친 전월 실적',
  spend_tier_override_ym VARCHAR(7) NULL COMMENT '보정값을 적용할 달 YYYY-MM, CHECK ^[0-9]{4}-[0-9]{2}$, null이면 모든 달',
  issued_at DATE NULL,
  added_at DATETIME NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'timestamptz',
  bin VARCHAR(6) NULL COMMENT 'CHECK ^[0-9]{4,6}$',
  statement_cycle_day INT NULL COMMENT 'CHECK 1..28',
  PRIMARY KEY (user_id, card_id)
);

CREATE TABLE categories (
  id VARCHAR(64) NOT NULL,
  user_id CHAR(36) NOT NULL COMMENT 'uuid',
  type VARCHAR(16) NOT NULL COMMENT 'CHECK income|expense',
  name VARCHAR(255) NOT NULL,
  icon VARCHAR(255) NULL,
  parent_id VARCHAR(64) NULL,
  sort_order INT NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, id)
);

CREATE TABLE transactions (
  id CHAR(36) NOT NULL COMMENT 'uuid, default gen_random_uuid()',
  user_id CHAR(36) NOT NULL COMMENT 'uuid',
  type VARCHAR(16) NOT NULL COMMENT 'CHECK income|expense',
  amount DECIMAL(15,2) NOT NULL COMMENT 'numeric',
  currency VARCHAR(8) NOT NULL DEFAULT 'KRW',
  amount_krw DECIMAL(15,2) NULL COMMENT 'numeric',
  date DATE NOT NULL,
  merchant VARCHAR(255) NOT NULL,
  category_id VARCHAR(64) NULL,
  merchant_industry VARCHAR(255) NULL,
  pay_type VARCHAR(16) NOT NULL COMMENT 'CHECK credit|check|cash|transfer',
  card_id VARCHAR(64) NULL,
  memo TEXT NULL,
  items JSON NULL COMMENT 'text[]',
  recurring_id CHAR(36) NULL COMMENT 'uuid',
  paid_at TIME NULL,
  is_auto_pay BOOLEAN NULL,
  pay_method VARCHAR(255) NULL,
  pay_channel VARCHAR(255) NULL,
  fuel_liters DECIMAL(10,3) NULL COMMENT 'numeric',
  installment_months INT NULL,
  is_interest_free BOOLEAN NULL,
  original_txn_id CHAR(36) NULL COMMENT 'uuid',
  created_at DATETIME NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'timestamptz',
  PRIMARY KEY (id),
  KEY transactions_user_id_date_idx (user_id, date),
  UNIQUE KEY transactions_recurring_once (user_id, recurring_id, date) COMMENT '반복 거래 회차는 규칙·날짜당 한 건 (recurring_id NULL끼리는 중복 아님)'
);

CREATE TABLE recurring_rules (
  id CHAR(36) NOT NULL COMMENT 'uuid, default gen_random_uuid()',
  user_id CHAR(36) NOT NULL COMMENT 'uuid',
  type VARCHAR(16) NOT NULL COMMENT 'CHECK income|expense',
  amount DECIMAL(15,2) NOT NULL COMMENT 'numeric',
  merchant VARCHAR(255) NOT NULL,
  category_id VARCHAR(64) NULL,
  card_id VARCHAR(64) NULL,
  pay_type VARCHAR(16) NOT NULL COMMENT 'CHECK credit|check|cash|transfer',
  cycle VARCHAR(16) NOT NULL COMMENT 'CHECK monthly|weekly',
  day INT NOT NULL COMMENT 'monthly: 1~31일 (없는 달은 말일), weekly: 요일 0=일~6=토',
  start_date DATE NOT NULL,
  end_date DATE NULL,
  is_auto_pay BOOLEAN NULL,
  last_generated_at DATE NULL COMMENT '마지막으로 거래를 만든 회차 날짜 (앱이 이 다음 날부터 오늘까지 생성)',
  PRIMARY KEY (id)
);

CREATE TABLE budgets (
  user_id CHAR(36) NOT NULL COMMENT 'uuid',
  category_id VARCHAR(64) NULL COMMENT 'null이면 총예산',
  amount DECIMAL(15,2) NOT NULL COMMENT 'numeric',
  UNIQUE KEY budgets_user_category_key (user_id, category_id) COMMENT 'PG: unique nulls not distinct, PK 없음'
);

CREATE TABLE receipts (
  id CHAR(36) NOT NULL COMMENT 'uuid, default gen_random_uuid()',
  user_id CHAR(36) NOT NULL COMMENT 'uuid',
  transaction_id CHAR(36) NULL COMMENT 'uuid',
  storage_path TEXT NOT NULL,
  ocr_text TEXT NULL,
  structured JSON NULL COMMENT 'jsonb',
  confidence JSON NULL COMMENT 'jsonb',
  inferred JSON NULL COMMENT 'text[]',
  status VARCHAR(16) NOT NULL DEFAULT 'queued' COMMENT 'CHECK queued|processing|done|failed',
  created_at DATETIME NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'timestamptz',
  PRIMARY KEY (id)
);

CREATE TABLE notifications (
  id CHAR(36) NOT NULL COMMENT 'uuid, default gen_random_uuid()',
  user_id CHAR(36) NOT NULL COMMENT 'uuid',
  kind VARCHAR(64) NOT NULL,
  title VARCHAR(255) NOT NULL,
  sub TEXT NULL,
  `read` BOOLEAN NULL DEFAULT FALSE,
  created_at DATETIME NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'timestamptz',
  PRIMARY KEY (id)
) COMMENT='앱은 아직 쓰지 않음 (알림은 장부 데이터에서 계산)';

CREATE TABLE merchant_categories (
  keyword VARCHAR(255) NOT NULL,
  industry VARCHAR(255) NOT NULL,
  source VARCHAR(16) NOT NULL COMMENT 'CHECK dict|llm|user',
  confidence DECIMAL(5,4) NULL COMMENT 'numeric',
  PRIMARY KEY (keyword)
);

-- FK (카테고리 참조는 categories PK (user_id, id) 에 맞춘 복합 FK)
-- 삭제 동작: 사용자 삭제 → 장부 전체 CASCADE / 카테고리 삭제 → 예산·하위 카테고리 CASCADE, 거래·반복 거래는 category_id만 NULL
--           반복 규칙 삭제 → 거래의 recurring_id NULL (이미 만든 거래는 남음) / 거래 삭제 → 영수증 기록 CASCADE
-- PG 전용 'ON DELETE SET NULL (category_id)'(복합 FK 중 한 열만 비움)은 MySQL에 없어 아래 해당 줄에 주석으로 적었다
ALTER TABLE card_products ADD CONSTRAINT card_products_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES auth_users (id) ON DELETE CASCADE;
ALTER TABLE benefit_rules ADD CONSTRAINT benefit_rules_card_id_fkey FOREIGN KEY (card_id) REFERENCES card_products (id) ON DELETE CASCADE;
ALTER TABLE benefit_rules ADD CONSTRAINT benefit_rules_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES auth_users (id) ON DELETE SET NULL;
ALTER TABLE user_cards ADD CONSTRAINT user_cards_card_id_fkey FOREIGN KEY (card_id) REFERENCES card_products (id);
ALTER TABLE user_cards ADD CONSTRAINT user_cards_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth_users (id) ON DELETE CASCADE;
ALTER TABLE categories ADD CONSTRAINT categories_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth_users (id) ON DELETE CASCADE;
ALTER TABLE transactions ADD CONSTRAINT transactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth_users (id) ON DELETE CASCADE;
ALTER TABLE transactions ADD CONSTRAINT transactions_card_id_fkey FOREIGN KEY (card_id) REFERENCES card_products (id);
ALTER TABLE transactions ADD CONSTRAINT transactions_original_txn_id_fkey FOREIGN KEY (original_txn_id) REFERENCES transactions (id);
ALTER TABLE recurring_rules ADD CONSTRAINT recurring_rules_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth_users (id) ON DELETE CASCADE;
ALTER TABLE budgets ADD CONSTRAINT budgets_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth_users (id) ON DELETE CASCADE;
ALTER TABLE receipts ADD CONSTRAINT receipts_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth_users (id) ON DELETE CASCADE;
ALTER TABLE receipts ADD CONSTRAINT receipts_transaction_id_fkey FOREIGN KEY (transaction_id) REFERENCES transactions (id) ON DELETE CASCADE;
ALTER TABLE notifications ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth_users (id) ON DELETE CASCADE;
-- PG: ON DELETE SET NULL (category_id)
ALTER TABLE transactions ADD CONSTRAINT transactions_category_fkey FOREIGN KEY (user_id, category_id) REFERENCES categories (user_id, id);
ALTER TABLE transactions ADD CONSTRAINT transactions_recurring_id_fkey FOREIGN KEY (recurring_id) REFERENCES recurring_rules (id) ON DELETE SET NULL;
-- PG: ON DELETE SET NULL (category_id)
ALTER TABLE recurring_rules ADD CONSTRAINT recurring_rules_category_fkey FOREIGN KEY (user_id, category_id) REFERENCES categories (user_id, id);
ALTER TABLE recurring_rules ADD CONSTRAINT recurring_rules_card_id_fkey FOREIGN KEY (card_id) REFERENCES card_products (id);
ALTER TABLE categories ADD CONSTRAINT categories_parent_fkey FOREIGN KEY (user_id, parent_id) REFERENCES categories (user_id, id) ON DELETE CASCADE;
ALTER TABLE budgets ADD CONSTRAINT budgets_category_fkey FOREIGN KEY (user_id, category_id) REFERENCES categories (user_id, id) ON DELETE CASCADE;
