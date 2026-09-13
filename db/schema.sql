-- Custom Smartlink App — schema
--
-- Single-owner today, multi-account by construction. `account` holds one row; every
-- project hangs off it via account_id. Supporting other users later means inserting
-- rows and putting an auth check in front of queries, not restructuring.

create extension if not exists "pgcrypto";

create table if not exists account (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  email       text unique,
  created_at  timestamptz not null default now()
);

create table if not exists project (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null references account(id) on delete cascade,
  slug        text not null,
  name        text not null,
  tagline     text,
  theme       jsonb not null default '{}'::jsonb,
  profiles    jsonb not null default '{}'::jsonb,  -- spotify/instagram/etc profile URLs
  created_at  timestamptz not null default now(),
  unique (account_id, slug)
);

-- Host -> project lookup. Each project lives at the ROOT of its own domain; a project
-- may have several hostnames (apex + www) but they all resolve to the same project.
create table if not exists domain (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references project(id) on delete cascade,
  hostname    text not null unique,
  is_primary  boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists domain_project_idx on domain (project_id);

-- One pixel and one ad account per project, so reputation and audiences stay isolated.
-- capi_token_ref holds an ENV VAR NAME, never a token. If this ever goes commercial the
-- column becomes a KMS key reference — same shape, different backend.
create table if not exists tracking (
  id                  uuid primary key default gen_random_uuid(),
  project_id          uuid not null unique references project(id) on delete cascade,
  meta_pixel_id       text,
  meta_ad_account_id  text,
  capi_token_ref      text,
  test_event_code_ref text,
  updated_at          timestamptz not null default now()
);

create table if not exists release (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references project(id) on delete cascade,
  slug        text not null,
  title       text not null,
  subtitle    text,
  artwork_url text,
  upc         text,
  isrc        text,              -- primary key across DSPs; titles disagree, ISRCs don't
  release_at  timestamptz,       -- page flips pre-release -> live at this instant
  is_published boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (project_id, slug)
);

-- Adapter-shaped, deliberately not one column per DSP.
create table if not exists destination (
  id          uuid primary key default gen_random_uuid(),
  release_id  uuid not null references release(id) on delete cascade,
  dsp         text not null,     -- spotify | apple-music | youtube-music | ...
  url         text not null,
  region      text not null default '*',  -- '*' = all regions; NULLs would break the unique key
  sort_order  int not null default 0,
  unique (release_id, dsp, region)
);
create index if not exists destination_release_idx on destination (release_id);

-- Your own click log. Meta shows you its version of the truth; this is yours, and it's
-- what lets you reconcile against Ads Manager later.
create table if not exists event (
  id            bigserial primary key,
  project_id    uuid not null references project(id) on delete cascade,
  release_id    uuid references release(id) on delete set null,
  event_name    text not null,   -- PageView | DspClick
  event_id      text not null,   -- shared with the browser pixel for deduplication
  dsp           text,
  fbp           text,
  fbc           text,
  ip            inet,
  user_agent    text,
  referrer      text,
  is_bot        boolean not null default false,
  capi_status   text,            -- ok | failed | skipped
  created_at    timestamptz not null default now()
);
create index if not exists event_project_time_idx on event (project_id, created_at desc);
create index if not exists event_release_idx on event (release_id);
