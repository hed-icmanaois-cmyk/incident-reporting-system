-- Incident Reporting System : Supabase schema (Laboratory 33)
-- Run ONCE in Supabase > SQL Editor > New query > Run.
-- To start over, uncomment the next line first (this deletes ALL data):
-- drop schema public cascade; create schema public; grant usage on schema public to anon, authenticated, service_role;

-- ============ 1. TABLES ============
create table roles (id bigint generated always as identity primary key, name text not null unique);
create table departments (id bigint generated always as identity primary key, name text not null unique, active boolean not null default true);

create table users (
  id bigint generated always as identity primary key,
  auth_id uuid unique references auth.users(id) on delete set null,   -- linked automatically (see trigger below)
  username text not null unique,
  full_name text not null,
  role_id bigint not null references roles(id),
  department_id bigint references departments(id),
  active boolean not null default true);

create table reporters (
  id bigint generated always as identity primary key,
  reporter_no text not null unique, full_name text not null,
  department_id bigint not null references departments(id),
  position text, contact text, email text, address text, reporter_type text, status text not null default 'Active',
  created_at timestamptz not null default now());

create table incident_categories (id bigint generated always as identity primary key, name text not null unique, description text default '', active boolean not null default true);
create table incident_types (id bigint generated always as identity primary key, category_id bigint not null references incident_categories(id), name text not null, active boolean not null default true);

create table locations (
  id bigint generated always as identity primary key,
  name text not null unique, building text, floor text, room text, area text,
  department_id bigint references departments(id), description text, status text not null default 'Active');

create table incidents (
  id bigint generated always as identity primary key,
  incident_no text not null unique,
  reporter_id bigint not null references reporters(id),
  category_id bigint not null references incident_categories(id),
  type_id bigint not null references incident_types(id),
  location_id bigint not null references locations(id),
  incident_date date not null, incident_time text, description text not null, severity text not null,
  immediate_response text, status text not null default 'Open',
  date_reported timestamptz not null default now(), resolved_date date, closed_date date);

create table incident_attachments (
  id bigint generated always as identity primary key,
  incident_id bigint not null references incidents(id),
  file_name text, file_type text, file_data text, created_at timestamptz not null default now());

create table investigations (
  id bigint generated always as identity primary key,
  incident_id bigint not null references incidents(id),
  investigator_id bigint not null references users(id),
  status text not null default 'Assigned',
  start_date date, target_date date, end_date date, instructions text, notes text,
  assigned_at timestamptz default now(), assigned_by bigint references users(id),
  rca jsonb);                                                          -- root cause analysis form

create table investigation_findings (
  id bigint generated always as identity primary key,
  investigation_id bigint not null references investigations(id),
  finding text, root_cause text, contributing_factors text, witnesses text, evidence_summary text, recommendation text,
  created_at timestamptz not null default now());

create table investigation_evidence (
  id bigint generated always as identity primary key,
  investigation_id bigint not null references investigations(id),
  description text, file_name text, file_type text, file_data text,
  uploaded_by bigint references users(id), collected_at timestamptz not null default now());

create table actions (
  id bigint generated always as identity primary key,
  investigation_id bigint not null references investigations(id),
  incident_id bigint not null references incidents(id),
  action_type text, description text, requirements text,
  assigned_to bigint not null references users(id), assigned_by bigint references users(id), assigned_at timestamptz default now(),
  due_date date, priority text, status text not null default 'Pending',
  completion_date date, remarks text default '', verified_by bigint references users(id), verified_date date);

create table action_monitoring (
  id bigint generated always as identity primary key,
  action_id bigint not null references actions(id),
  from_status text, to_status text, remarks text,
  changed_by bigint references users(id), changed_at timestamptz not null default now());

create table resolutions (
  id bigint generated always as identity primary key,
  incident_id bigint not null unique references incidents(id),
  type text, description text, resolution_date date, resolved_by bigint references users(id), remarks text,
  doc_name text, doc_type text, doc_data text, created_at timestamptz not null default now(),
  confirmed boolean not null default false, closure_date date, closed_by bigint references users(id), closure_remarks text);

create table notifications (
  id bigint generated always as identity primary key,
  user_id bigint not null references users(id),
  incident_id bigint references incidents(id), action_id bigint references actions(id),
  message text, is_read boolean not null default false, created_at timestamptz not null default now());

create table audit_logs (
  id bigint generated always as identity primary key,
  user_id bigint references users(id), entity text, entity_id bigint, action text, details text,
  created_at timestamptz not null default now());

-- ============ 2. INDEXES (foreign keys + search columns) ============
create index on users(role_id);                 create index on users(department_id);
create index on reporters(department_id);       create index on reporters(reporter_type);
create index on incident_types(category_id);    create index on locations(department_id);
create index on incidents(reporter_id);         create index on incidents(category_id);
create index on incidents(type_id);             create index on incidents(location_id);
create index on incidents(severity);            create index on incidents(status);
create index on incidents(incident_date);       create index on incident_attachments(incident_id);
create index on investigations(incident_id);    create index on investigations(investigator_id);
create index on investigation_findings(investigation_id);
create index on investigation_evidence(investigation_id);
create index on actions(investigation_id);      create index on actions(incident_id);
create index on actions(assigned_to);           create index on actions(status);
create index on action_monitoring(action_id);   create index on notifications(user_id);
create index on audit_logs(user_id);            create index on audit_logs(entity);

-- ============ 3. REFERENCE / SEED DATA ============
insert into roles(name) values ('Admin'),('Investigator'),('Reporter Officer'),('Viewer');
insert into departments(name) values ('Administration'),('Security'),('IT'),('Facilities'),('Human Resources'),('Academic Affairs');
insert into incident_categories(name) values ('Safety'),('Security'),('Accident'),('Property Damage'),('Workplace'),('IT/Technical'),('Environmental'),('Health'),('Other');
insert into incident_types(name, category_id)
  select t.n, (select id from incident_categories where name = t.c) from (values
    ('Slip/Fall','Safety'),('Equipment Failure','Safety'),('Theft','Security'),('Unauthorized Access','Security'),
    ('Fire','Environmental'),('Data Incident','IT/Technical'),('Vehicle Accident','Accident'),('Physical Injury','Health')) as t(n,c);
insert into locations(name, building) values ('Main Building','Main Building'),('Parking Lot','Parking Lot'),('Library','Library'),('Laboratory','Laboratory'),('Cafeteria','Cafeteria');
insert into users(username, full_name, role_id)
  select u.n, u.f, (select id from roles where name = u.r) from (values
    ('admin','System Admin','Admin'),('investigator1','Investigator One','Investigator'),('investigator2','Investigator Two','Investigator'),
    ('officer1','Reporter Officer One','Reporter Officer'),('viewer1','Viewer One','Viewer')) as u(n,f,r);

-- ============ 4. LINK SUPABASE LOGINS TO users ROWS ============
-- Login email is  <username>@irs.local . When you add that user under Authentication > Users,
-- this trigger fills users.auth_id automatically.
create or replace function public.link_auth_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.users set auth_id = new.id where username = lower(split_part(new.email, '@', 1)) and auth_id is null;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.link_auth_user();
-- also link any Auth users that already exist:
update public.users u set auth_id = a.id from auth.users a where a.email = u.username || '@irs.local' and u.auth_id is null;

-- ============ 5. SECURITY (Row Level Security) ============
-- Signed-in users can read/insert/update; nobody can delete; anonymous visitors get nothing.
-- audit_logs is append-only (no update). Role rules (Admin / Investigator / ...) are still enforced in the app screens;
-- tighten them in the database during Laboratory 36 (Role-Based Access Control).
revoke all on all tables in schema public from anon;
grant select, insert, update on all tables in schema public to authenticated;
revoke update on audit_logs from authenticated;
grant usage, select on all sequences in schema public to authenticated;

do $$ declare t text; begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select to authenticated using (true)', t || '_read', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (true)', t || '_insert', t);
    if t <> 'audit_logs' then
      execute format('create policy %I on public.%I for update to authenticated using (true) with check (true)', t || '_update', t);
    end if;
  end loop;
end $$;
