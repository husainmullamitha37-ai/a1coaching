-- Run after schema.sql
alter table institute_settings add column if not exists reminder_time time default '17:00';
-- Make Lokesh Sir the admin: first create his login in Supabase > Authentication > Users, then run (change the email):
insert into users (id, email, name, role) select id, email, 'Lokesh Sir', 'admin' from auth.users where email = 'lokesh@example.com' on conflict (id) do nothing;
