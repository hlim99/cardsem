-- UserCard 타입에 뒤늦게 추가된 두 필드. bin은 카드번호 앞 6자리만 (뒷자리 저장 안 함)
alter table user_cards add column bin text check (bin ~ '^[0-9]{4,6}$');
alter table user_cards add column statement_cycle_day int check (statement_cycle_day between 1 and 28);
