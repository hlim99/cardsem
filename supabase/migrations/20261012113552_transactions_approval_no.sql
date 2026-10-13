-- 거래에 카드 승인번호를 둔다 (환불 영수증을 원결제에 붙이는 단서).
-- 환불 영수증에는 원결제와 같은 승인번호가 찍혀서, 가맹점 표기가 달라도('월정기수영' → '월정기수영 중도해약 반환금')
-- 같은 결제임을 확정할 수 있다. 화면에는 노출하지 않고 매칭에만 쓴다.
--
-- 되돌리기: `alter table transactions drop column if exists approval_no;` 하나로 끝난다.
-- 기존 데이터 영향 없음 — nullable 컬럼 추가라 기존 행은 전부 null이 되고, check는 null을 통과한다.
-- 카드번호는 지금처럼 user_cards.bin(앞 6자리)만 두고, 전체 번호·뒷 4자리는 저장하지 않는다.
alter table transactions add column if not exists approval_no text check (approval_no ~ '^[0-9]{1,20}$');

-- 환불 매칭은 "내 거래 중 같은 승인번호" 조회뿐이라 사용자별 부분 인덱스로 충분하다
create index if not exists transactions_approval_no on transactions (user_id, approval_no) where approval_no is not null;
