-- 카드셈 Supabase 스키마의 최종 모양 (기획안 7.5절 데이터 개요). 빈 DB에 이 파일 하나만 돌려도 되고,
-- supabase/migrations/ 를 순서대로 돌려도 같은 결과가 된다.
-- 스키마를 바꿀 때는 migrations/에 새 파일을 추가하고 이 파일도 같이 고친다
-- 혜택 규칙은 JSONB로 저장: TypeScript BenefitRule 타입(src/lib/types.ts)과 1:1

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
  perks jsonb not null default '[]',  -- 정성 혜택 (라운지·바우처·우대금리 …). TypeScript Perk[]와 1:1.
                                      -- 계산에 쓰이지 않아 benefit_rules로 두지 않는다. 종류별 조회가 필요해지면 별도 테이블로 분리
  source_url text,
  checked_at date,
  review_status text not null default 'pending' check (review_status in ('approved','pending','none')),
  raw_text text,                      -- DAT-01 어드민이 붙여넣은 원문
  raw_hash text,                      -- 8.4절 갱신 감지
  owner_id uuid references auth.users(id) on delete cascade, -- null = 기본 카드(관리자 관리), 값 = 그 사용자가 직접 추가한 카드 (CARD-02)
  custom_def jsonb,                   -- 사용자 카드 정의 전체 (TypeScript CardProduct JSON). 앱은 이 값으로 계산
  created_at timestamptz default now(),
  -- 사용자 카드 id는 custom_ 으로만 (기본 카드 id를 미리 차지하지 못하게), 정의가 꼭 있어야 한다
  constraint card_products_owner_custom check (owner_id is null or (id like 'custom\_%' and custom_def is not null))
);

create table benefit_rules (
  id text primary key,
  card_id text not null references card_products(id) on delete cascade,
  version int not null default 1,
  valid_from date,
  valid_to date,
  status text not null default 'pending' check (status in ('approved','pending','rejected')),
  rule jsonb not null,                -- BenefitRule 전체 (target, rate, limitsByTier, stacking …)
                                      -- rule->>'supported'='false'는 "계산 불가"(검수 대기·스키마 한계)이지 정성 혜택이 아니다 → card_products.perks 참고
  reviewed_by uuid references auth.users(id) on delete set null, -- 검수자 계정을 지워도 규칙은 남김
  reviewed_at timestamptz
);
create index on benefit_rules(card_id) where status = 'approved';

create table user_cards (
  user_id uuid not null references auth.users(id) on delete cascade,
  card_id text not null references card_products(id),
  variant_id text,
  spend_tier_override int,
  spend_tier_override_ym text check (spend_tier_override_ym ~ '^[0-9]{4}-[0-9]{2}$'), -- 보정값을 적용할 달. null이면 모든 달(예전 데이터)
  statement_cycle_day int check (statement_cycle_day between 1 and 28), -- 청구 사이클 시작일. 없으면 달력 월
  bin text check (bin ~ '^[0-9]{4,6}$'),      -- 카드번호 앞 6자리만 (영수증 대조용). 뒷자리 저장 안 함
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
  primary key (user_id, id),
  constraint categories_parent_fkey foreign key (user_id, parent_id) references categories (user_id, id) on delete cascade -- 상위 삭제 시 하위도
);

-- transactions.recurring_id 가 참조하므로 transactions 보다 먼저 만든다
create table recurring_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('income','expense')), amount numeric not null, merchant text not null, category_id text, card_id text references card_products(id),
  pay_type text not null check (pay_type in ('credit','check','cash','transfer')),
  cycle text not null check (cycle in ('monthly','weekly')), day int not null,
  start_date date not null, end_date date, is_auto_pay boolean, last_generated_at date,
  constraint recurring_rules_category_fkey foreign key (user_id, category_id) references categories (user_id, id) on delete set null (category_id)
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
  category_id text,                   -- (user_id, category_id) → categories, 삭제 시 null
  merchant_industry text,             -- 혜택 매칭용 업종 (사용자 카테고리와 분리, TRX-13)
  pay_type text not null check (pay_type in ('credit','check','cash','transfer')),
  card_id text references card_products(id),
  memo text,
  items text[],
  recurring_id uuid references recurring_rules(id) on delete set null,
  paid_at time,                       -- 조건 필드 5개 (TRX-06)
  is_auto_pay boolean,
  pay_method text,
  pay_channel text,
  fuel_liters numeric,
  installment_months int,
  is_interest_free boolean,
  approval_no text check (approval_no ~ '^[0-9]{1,20}$'), -- 카드 승인번호. 환불 영수증을 원결제에 붙이는 단서 (화면 노출 없음)
  original_txn_id uuid references transactions(id),
  created_at timestamptz default now(),
  constraint transactions_category_fkey foreign key (user_id, category_id) references categories (user_id, id) on delete set null (category_id)
);
create index on transactions(user_id, date);
-- 반복 거래 회차는 규칙·날짜당 한 건 (두 기기가 동시에 만들어도 중복 없음, 앱은 on conflict do nothing). recurring_id null은 서로 달라 걸리지 않음
create unique index transactions_recurring_once on transactions (user_id, recurring_id, date);

create table budgets (
  user_id uuid not null references auth.users(id) on delete cascade,
  category_id text,                   -- null이면 총예산
  amount numeric not null,
  constraint budgets_user_category_key unique nulls not distinct (user_id, category_id),
  constraint budgets_category_fkey foreign key (user_id, category_id) references categories (user_id, id) on delete cascade
);

create table receipts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  transaction_id uuid references transactions(id) on delete cascade, -- 거래를 지우면 영수증 기록도
  storage_path text not null,         -- 비공개 버킷 (RCP-01, RCP-06)
  ocr_text text,
  structured jsonb,                   -- RCP-03 구조화 결과
  confidence jsonb,                   -- 필드별 신뢰도 (RCP-05)
  inferred text[],                    -- 추론한 필드 (RCP-04)
  status text not null default 'queued' check (status in ('queued','processing','done','failed')),
  created_at timestamptz default now()
);

-- 앱은 아직 쓰지 않음: 알림은 src/lib/notify.ts가 장부 데이터에서 매번 계산하고 읽음 표시는 기기에 둔다. 서버 푸시 알림을 붙일 때 쓸 자리
create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null, title text not null, sub text, read boolean default false, created_at timestamptz default now()
);

create table merchant_categories (        -- TRX-03 가맹점 사전 + LLM 캐시
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
-- 카드 상품·승인 규칙은 모두 읽기, 쓰기는 관리자 역할만 (NFR-06). 사용자가 직접 추가한 카드(owner_id)는 본인만 읽기·쓰기
alter table card_products enable row level security;
alter table benefit_rules enable row level security;
create policy "read all" on card_products for select using (owner_id is null or owner_id = auth.uid()); -- 이름은 예전 그대로 (기본 카드는 모두 읽기)
create policy "owner write" on card_products for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "read approved" on benefit_rules for select using (status = 'approved' or (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
create policy "admin write" on card_products for all using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
create policy "admin write" on benefit_rules for all using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
-- 가맹점 사전 + LLM 캐시도 같은 규칙. Supabase가 새 테이블에 RLS를 자동으로 켜므로 정책을 꼭 둔다
alter table merchant_categories enable row level security;
create policy "read all" on merchant_categories for select using (true);
create policy "admin write" on merchant_categories for all using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
