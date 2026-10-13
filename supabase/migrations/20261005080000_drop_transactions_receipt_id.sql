-- transactions.receipt_id 는 receipts.transaction_id 와 중복. 영수증 여부는 receipts 조인으로 본다.
-- 파괴적 구문이라 fix_relations 에서 분리. 원격에는 2026-10-05 대시보드 SQL 편집기에서 직접 적용돼 마이그레이션 기록에 없다
-- → if exists 로 써서 원격에 다시 돌려도 오류 없이 기록만 남는다. 다만 원격 최신 기록(20261009070630)보다 앞선 버전이라
--   `supabase db push`는 끼워 넣기로 보고 거부한다 → `supabase db push --include-all`로 올리거나,
--   `supabase migration repair --status applied 20261005080000`으로 원격 기록에만 올려 둘 것
alter table transactions drop column if exists receipt_id;
