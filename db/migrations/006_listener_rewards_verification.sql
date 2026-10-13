-- Deployment contract only: reviewed migration runner, never executed from a native client.
-- The local adapter keeps these logical records in its existing SQLite records table.
create table referral_codes (
  code text primary key,
  profile_id uuid not null unique references listener_profiles(id),
  created_at timestamptz not null default now()
);
alter table referrals add column invite_code text references referral_codes(code);
alter table anonymous_installations add column verified_subject_hash text unique;
alter table listener_profiles add column onboarded_at timestamptz;
alter table allowance_ledger add column expires_at timestamptz;
-- Qualified-referral credits are permanent; optional friend bonuses explicitly expire.
create unique index allowance_one_referral_reward on allowance_ledger(profile_id, kind, referral_id)
  where referral_id is not null and reversed_at is null;
create unique index allowance_one_base on allowance_ledger(profile_id)
  where kind = 'base' and reversed_at is null;
create table verification_receipts (
  id uuid primary key,
  source text not null,
  source_event_id text not null,
  profile_id uuid not null references listener_profiles(id),
  verified_subject_hash text not null,
  fraud_approved boolean not null default false,
  created_at timestamptz not null default now(),
  unique(source, source_event_id)
);
alter table listening_sessions add column verification_receipt_id uuid references verification_receipts(id);
-- A report stays pending until a trusted server-side verifier authenticates the receipt.
alter table listening_sessions add constraint verified_session_requires_receipt
  check(reconciliation_status <> 'verified' or verification_receipt_id is not null);
create table listener_event_receipts (
  profile_id uuid not null references listener_profiles(id),
  event_id text not null,
  kind text not null,
  received_at timestamptz not null default now(),
  primary key(profile_id, event_id)
);
-- Monthly consumption is the union of verified time ranges clipped to the UTC period.
-- Do not sum overlapping sessions or subtract offline/client-only timers.
