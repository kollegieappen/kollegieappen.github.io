-- KollegieAppen (KA) · Fjern alle testdata fra testkollegie.sql
delete from public.dorms where name in ('🧪 Testkollegiet', '🧪 Testvenskabskollegiet');
delete from auth.users where email like '%@kollegieappen.test';
