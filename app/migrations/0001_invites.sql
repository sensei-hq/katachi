-- Invites, their hits and spend, and invite requests (Cloudflare D1, binding DB).
-- Apply: bunx wrangler d1 migrations apply katachi --remote
create table if not exists invites (
  code        text primary key,
  email       text not null,
  label       text,
  expires_at  integer not null,              -- ms since epoch
  cap_usd     real not null default 1,       -- model spend allowed across all its sessions
  active      integer not null default 1,
  request_id  integer,                       -- the request it answered, if any
  created_at  integer not null
);
create index if not exists invites_email on invites (email);

create table if not exists invite_hits (
  id       integer primary key autoincrement,
  code     text not null,                    -- as typed (failed guesses too)
  at       integer not null,
  ok       integer not null,
  reason   text,
  ip_hash  text,
  ua       text
);
create index if not exists invite_hits_code on invite_hits (code, at);

create table if not exists usage (
  id        integer primary key autoincrement,
  code      text not null,
  at        integer not null,
  path      text not null,
  model     text not null,
  purpose   text,
  cost_usd  real not null
);
create index if not exists usage_code on usage (code, at);

create table if not exists invite_requests (
  id       integer primary key autoincrement,
  email    text not null,
  note     text,
  at       integer not null,
  status   text not null default 'new',     -- new · sent · declined
  ip_hash  text
);
create index if not exists invite_requests_status on invite_requests (status, at);
