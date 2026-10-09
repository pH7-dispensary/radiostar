-- PostgreSQL 15+; run through the deployment migration runner, never from the client.
create table anonymous_installations (
  id uuid primary key,
  credential_hash text not null unique,
  credential_version integer not null default 1,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create table listener_profiles (
  id uuid primary key,
  installation_id uuid not null unique references anonymous_installations(id) on delete cascade,
  preferences jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table podcasts (id uuid primary key, provider text not null, provider_id text not null, title text not null, publisher text, artwork_url text, created_at timestamptz not null default now(), unique(provider,provider_id));
create table podcast_feeds (id uuid primary key, podcast_id uuid not null references podcasts(id) on delete cascade, feed_url text not null unique, etag text, last_modified text, last_refreshed_at timestamptz, last_error text, refresh_lock_until timestamptz);
create table episodes (id uuid primary key, podcast_id uuid not null references podcasts(id) on delete cascade, feed_id uuid references podcast_feeds(id) on delete set null, guid text not null, title text not null, publisher_description text, published_at timestamptz, duration_seconds integer, enclosure_url text, created_at timestamptz not null default now(), unique(feed_id,guid));
create table follows (profile_id uuid not null references listener_profiles(id) on delete cascade, podcast_id uuid not null references podcasts(id) on delete cascade, created_at timestamptz not null default now(), primary key(profile_id,podcast_id));
create table playback_positions (profile_id uuid not null references listener_profiles(id) on delete cascade, episode_id uuid not null references episodes(id) on delete cascade, position_ms bigint not null check(position_ms>=0), playback_speed numeric(3,2) not null default 1, updated_at timestamptz not null default now(), primary key(profile_id,episode_id));
create table listening_sessions (id uuid primary key, profile_id uuid not null references listener_profiles(id) on delete cascade, episode_id uuid not null references episodes(id), client_event_id uuid not null unique, started_at timestamptz not null, ended_at timestamptz, listened_ms bigint not null default 0 check(listened_ms>=0), source text not null, reconciliation_status text not null default 'pending');
create table saved_episodes (profile_id uuid not null references listener_profiles(id) on delete cascade, episode_id uuid not null references episodes(id) on delete cascade, created_at timestamptz not null default now(), primary key(profile_id,episode_id));
create table listening_allowances (profile_id uuid primary key references listener_profiles(id) on delete cascade, period_start date not null, base_minutes integer not null default 600, consumed_minutes integer not null default 0, updated_at timestamptz not null default now());
create table allowance_ledger (id uuid primary key, profile_id uuid not null references listener_profiles(id) on delete cascade, kind text not null, monthly_minutes integer not null, referral_id uuid, effective_from date not null, reversed_at timestamptz, metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now());
create table referrals (id uuid primary key, referrer_profile_id uuid not null references listener_profiles(id), code text not null unique, referred_installation_id uuid unique references anonymous_installations(id), status text not null, qualification_minutes integer not null default 30, qualified_at timestamptz, reversed_at timestamptz, created_at timestamptz not null default now());
create table feature_controls (key text primary key, state text not null check(state in ('on','throttled','off')), config jsonb not null default '{}'::jsonb, updated_at timestamptz not null default now());
create table processing_jobs (id uuid primary key, episode_id uuid references episodes(id), trigger text not null, idempotency_key text not null unique, status text not null, retry_count integer not null default 0, processing_version text not null, estimated_cost_cents integer, reused boolean not null default false, created_at timestamptz not null default now(), completed_at timestamptz);
create index episodes_podcast_published on episodes(podcast_id,published_at desc); create index listening_sessions_profile_time on listening_sessions(profile_id,started_at desc); create index processing_jobs_episode_status on processing_jobs(episode_id,status);
