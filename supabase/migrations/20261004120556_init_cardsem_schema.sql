-- 카드셈 Supabase 스키마 (기획안 7.5절 데이터 개요)
-- 혜택 규칙은 JSONB로 저장: TypeScript BenefitRule 타입(src/lib/types.ts)과 1:1
-- (원격 마이그레이션 기록 20261004120556 init_cardsem_schema 그대로. 이후 변경은 뒤 파일들이 순서대로 덧붙인다 — 최종 모양은 ../schema.sql)

create table card_products (
  id text primary key,
  issuer text not null,
  name text not null,
  type text not null check (type in ('credit','check')),
  color text,
  grade text check (grade in ('A','B','C','D')),
  annual_fee int,
  tiers jsonb not null default '[{"min":0,"max":null}]',
  spend_excludes text[] not null default '{}',
  variants jsonb,
  perks jsonb not null default '[]',
  source_url text,
  checked_at date,
  review_status text not null default 'pending' check (review_status in ('approved','pending','none')),
  raw_text text,
  raw_hash text,
  created_at timestamptz default now()
);

create table benefit_rules (
  id text primary key,
  card_id text not null references card_products(id) on delete cascade,
  version int not null default 1,
  valid_from date,
  valid_to date,
  status text not null default 'pending' check (status in ('approved','pending','rejected')),
  rule jsonb not null,
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz
);
create index on benefit_rules(card_id) where status = 'approved';

create table user_cards (
  user_id uuid not null references auth.users(id) on delete cascade,
  card_id text not null references card_products(id),
  variant_id text,
  spend_tier_override int,
  issued_at date,
  added_at timestamptz default now(),
  primary key (user_id, card_id)
);

create table categories (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('income','expense')),
  name text not null,
  icon text,
  parent_id text,
  sort_order int not null default 0,
  primary key (user_id, id)
);

create table transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('income','expense')),
  amount numeric not null,
  currency text not null default 'KRW',
  amount_krw numeric,
  date date not null,
  merchant text not null,
  category_id text,
  merchant_industry text,
  pay_type text not null check (pay_type in ('credit','check','cash','transfer')),
  card_id text references card_products(id),
  memo text,
  items text[],
  recurring_id uuid,
  paid_at time,
  is_auto_pay boolean,
  pay_method text,
  pay_channel text,
  fuel_liters numeric,
  installment_months int,
  is_interest_free boolean,
  original_txn_id uuid references transactions(id),
  receipt_id uuid,
  created_at timestamptz default now()
);
create index on transactions(user_id, date);

create table recurring_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null, amount numeric not null, merchant text not null, category_id text, card_id text, pay_type text not null,
  cycle text not null check (cycle in ('monthly','weekly')), day int not null,
  start_date date not null, end_date date, is_auto_pay boolean, last_generated_at date
);

create table budgets (
  user_id uuid not null references auth.users(id) on delete cascade,
  category_id text,
  amount numeric not null,
  primary key (user_id, category_id)
);

create table receipts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  transaction_id uuid references transactions(id),
  storage_path text not null,
  ocr_text text,
  structured jsonb,
  confidence jsonb,
  inferred text[],
  status text not null default 'queued' check (status in ('queued','processing','done','failed')),
  created_at timestamptz default now()
);

create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null, title text not null, sub text, read boolean default false, created_at timestamptz default now()
);

create table merchant_categories (
  keyword text primary key,
  industry text not null,
  source text not null check (source in ('dict','llm','user')),
  confidence numeric
);

-- RLS: 장부는 본인만 (7.4절)
alter table transactions enable row level security;
alter table user_cards enable row level security;
alter table categories enable row level security;
alter table recurring_rules enable row level security;
alter table budgets enable row level security;
alter table receipts enable row level security;
alter table notifications enable row level security;
create policy "own rows" on transactions for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows" on user_cards for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows" on categories for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows" on recurring_rules for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows" on budgets for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows" on receipts for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows" on notifications for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
-- 카드 상품·승인 규칙은 모두 읽기, 쓰기는 관리자 역할만 (NFR-06)
alter table card_products enable row level security;
alter table benefit_rules enable row level security;
create policy "read all" on card_products for select using (true);
create policy "read approved" on benefit_rules for select using (status = 'approved' or (auth.jwt() ->> 'role') = 'admin');
create policy "admin write" on card_products for all using ((auth.jwt() ->> 'role') = 'admin');
create policy "admin write" on benefit_rules for all using ((auth.jwt() ->> 'role') = 'admin');
