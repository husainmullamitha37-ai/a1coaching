-- A1 Coaching Classes: run in Supabase SQL editor
create extension if not exists pgcrypto;
create or replace function set_updated() returns trigger language plpgsql as $$ begin new.updated_at=now(); return new; end $$;
create sequence if not exists student_seq start 1001;

create table users(id uuid primary key references auth.users on delete cascade, name text not null default 'Lokesh Sir', email text unique not null, role text not null default 'admin', created_at timestamptz default now(), updated_at timestamptz default now());
create table batches(id uuid primary key default gen_random_uuid(), name text unique not null, created_at timestamptz default now(), updated_at timestamptz default now());
create table students(id uuid primary key default gen_random_uuid(),
  student_code text unique not null default ('A1-'||nextval('student_seq')),
  name text not null, roll_no int not null, class_name text not null,
  batch_id uuid not null references batches on delete restrict,
  mobile text, admission_date date default current_date,
  status text not null default 'active' check (status in ('active','inactive')),
  created_at timestamptz default now(), updated_at timestamptz default now(), unique(batch_id,roll_no));
create table parent_contacts(id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students on delete cascade, parent_name text not null,
  whatsapp_e164 text not null check (whatsapp_e164 ~ '^[1-9][0-9]{9,14}$'), alt_phone text,
  created_at timestamptz default now(), updated_at timestamptz default now(), unique(student_id));
create table attendance_submissions(id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references batches, att_date date not null, submitted_by uuid references users,
  submitted_at timestamptz default now(), edited_at timestamptz, unique(batch_id,att_date));
create table attendance(id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students on delete cascade, batch_id uuid not null references batches,
  att_date date not null, status text not null check (status in ('present','absent')),
  parent_status text not null default 'none' check (parent_status in ('none','awaiting','confirmed','disputed','needs_review','under_verification','failed')),
  marked_by uuid references users, created_at timestamptz default now(), updated_at timestamptz default now(), unique(student_id,att_date));
create table whatsapp_messages(id uuid primary key default gen_random_uuid(),
  attendance_id uuid not null unique references attendance on delete cascade, -- one absence notice per attendance event
  student_id uuid not null references students on delete cascade, to_phone text not null, template_name text,
  wa_message_id text unique,
  status text not null default 'queued' check (status in ('queued','sending','sent','delivered','read','failed','replied')),
  retry_count int not null default 0, next_retry_at timestamptz default now(), error text,
  queued_at timestamptz default now(), sent_at timestamptz, delivered_at timestamptz, read_at timestamptz, failed_at timestamptz,
  created_at timestamptz default now(), updated_at timestamptz default now());
create table parent_replies(id uuid primary key default gen_random_uuid(),
  message_id uuid references whatsapp_messages on delete set null, student_id uuid references students on delete cascade,
  wa_message_id text unique not null, from_phone text not null, body text, payload text,
  kind text not null check (kind in ('confirmed','disputed','other')), reviewed boolean default false, received_at timestamptz default now());
create table follow_up_tasks(id uuid primary key default gen_random_uuid(),
  message_id uuid references whatsapp_messages on delete cascade, attendance_id uuid references attendance on delete cascade,
  student_id uuid not null references students on delete cascade,
  kind text not null check (kind in ('no_response','disputed','needs_review','send_failed')),
  priority text not null default 'high' check (priority in ('high','medium','low')),
  status text not null default 'pending' check (status in ('pending','in_progress','completed','escalated','cancelled')),
  reason text not null, notes text, assigned_to uuid references users, due_at timestamptz,
  created_at timestamptz default now(), updated_at timestamptz default now(), completed_at timestamptz,
  unique(message_id,kind));
create table institute_settings(id int primary key default 1 check (id=1),
  institute_name text default 'A1 Coaching Classes', teacher_name text default 'Lokesh Sir', address text, contact text, logo_url text,
  template_name text, template_lang text default 'en', template_has_buttons boolean default true,
  auto_notifications boolean default true, allow_editing boolean default true,
  read_timeout_min int default 15, fallback_timeout_min int default 30, max_retries int default 3,
  wa_business_account_id text, wa_phone_number_id text, timezone text default 'Asia/Kolkata', date_format text default 'DD-MM-YYYY',
  created_at timestamptz default now(), updated_at timestamptz default now());
insert into institute_settings(id) values (1) on conflict do nothing;
create table notification_logs(id uuid primary key default gen_random_uuid(), message_id uuid references whatsapp_messages on delete cascade, event text not null, detail jsonb, created_at timestamptz default now());
create table audit_logs(id uuid primary key default gen_random_uuid(), actor uuid, action text not null, entity text not null, entity_id text, old_data jsonb, new_data jsonb, created_at timestamptz default now());

create index on students(batch_id); create index on attendance(att_date, batch_id); create index on attendance(student_id);
create index on whatsapp_messages(status, next_retry_at); create index on whatsapp_messages(to_phone, queued_at desc);
create index on follow_up_tasks(status, priority); create index on parent_replies(message_id);

do $$ declare t text; begin
 foreach t in array array['users','batches','students','parent_contacts','attendance','whatsapp_messages','follow_up_tasks','institute_settings'] loop
  execute format('create trigger %I_upd before update on %I for each row execute function set_updated()',t,t); end loop;
 foreach t in array array['users','batches','students','parent_contacts','attendance_submissions','attendance','whatsapp_messages','parent_replies','follow_up_tasks','institute_settings','notification_logs','audit_logs'] loop
  execute format('alter table %I enable row level security',t);
  execute format('create policy "admin read" on %I for select to authenticated using (exists (select 1 from users u where u.id=auth.uid()))',t); end loop;
end $$;
-- Browser writes for plain CRUD (students, batches, contacts, settings, tasks) are allowed for the admin; messages/replies/audit are written only by the server (service role).
do $$ declare t text; begin
 foreach t in array array['batches','students','parent_contacts','follow_up_tasks','institute_settings'] loop
  execute format('create policy "admin write" on %I for all to authenticated using (exists (select 1 from users u where u.id=auth.uid())) with check (exists (select 1 from users u where u.id=auth.uid()))',t); end loop;
end $$;
-- Realtime dashboard updates
alter publication supabase_realtime add table attendance, whatsapp_messages, parent_replies, follow_up_tasks;
