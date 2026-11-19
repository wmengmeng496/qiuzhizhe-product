create table if not exists auth_challenges (
  id uuid primary key default gen_random_uuid(),
  channel text not null check (channel = 'phone'),
  destination text not null,
  purpose text not null check (purpose = 'login'),
  secret_hash text not null,
  attempts integer not null default 0,
  max_attempts integer not null default 5,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  request_ip text,
  user_agent text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists auth_challenges_lookup_idx
  on auth_challenges(channel, destination, purpose, created_at desc);

create table if not exists user_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  token_hash text not null unique,
  auth_version integer not null,
  ip text,
  user_agent text,
  last_seen_at timestamptz not null default now(),
  idle_expires_at timestamptz not null,
  absolute_expires_at timestamptz not null,
  revoked_at timestamptz,
  revoke_reason text,
  created_at timestamptz not null default now()
);

create index if not exists user_sessions_user_active_idx
  on user_sessions(user_id, created_at desc) where revoked_at is null;
