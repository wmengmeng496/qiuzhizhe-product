create table if not exists optimization_records (
  id bigserial primary key,
  role text not null,
  keywords text[] not null default '{}',
  match_score integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  phone text unique,
  password_hash text,
  display_name text,
  plan text not null default 'free',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table users add column if not exists phone text;
alter table users add column if not exists password_hash text;
alter table users add column if not exists updated_at timestamptz not null default now();
create unique index if not exists users_phone_unique on users (phone) where phone is not null;

create table if not exists user_consents (
  id bigserial primary key,
  user_id uuid not null references users(id) on delete cascade,
  agreement_version text not null,
  terms_accepted boolean not null default false,
  privacy_accepted boolean not null default false,
  ip_address text,
  user_agent text,
  accepted_at timestamptz not null default now()
);

create index if not exists user_consents_user_id_idx on user_consents (user_id);

create table if not exists usage_quotas (
  user_id uuid not null references users(id) on delete cascade,
  period text not null,
  resume_optimize_used integer not null default 0 check (resume_optimize_used >= 0),
  interview_review_used integer not null default 0 check (interview_review_used >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, period)
);

create table if not exists resume_optimizations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  job_title text,
  company text,
  job_requirements text not null,
  resume_content text not null,
  optimize_mode text not null,
  model text not null,
  optimized_content text not null,
  highlighted_content text,
  keywords jsonb not null default '[]'::jsonb,
  improvements jsonb not null default '[]'::jsonb,
  match_score integer not null default 0,
  status text not null default 'completed',
  created_at timestamptz not null default now()
);
create index if not exists resume_optimizations_user_created_idx
  on resume_optimizations (user_id, created_at desc);

create table if not exists app_events (
  id bigserial primary key,
  user_id uuid references users(id) on delete set null,
  event_type text not null,
  entity_type text,
  entity_id text,
  metadata jsonb not null default '{}'::jsonb,
  ip text,
  user_agent text,
  created_at timestamptz not null default now()
);
