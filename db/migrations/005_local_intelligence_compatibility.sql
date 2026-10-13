-- PostgreSQL deployment contract only. Not applied during local development.
-- Untimed publisher text may support a brief, never a fabricated seek target.
alter table transcript_segments alter column start_ms drop not null;
alter table transcript_segments alter column end_ms drop not null;
alter table transcript_segments add constraint transcript_segment_timing_pair
  check ((start_ms is null and end_ms is null) or
         (start_ms is not null and end_ms is not null and start_ms >= 0 and end_ms > start_ms));
alter table transcripts add column audio_variant_key text;
alter table transcripts add column original_format text;
alter table transcripts add column completeness jsonb not null default '{}'::jsonb;
alter table processing_jobs add column provider_request_id text;
alter table processing_jobs add column source_checked_at timestamptz;

-- Micro-dollar precision avoids rounding sub-cent text calls to zero.
create table intelligence_cost_ledger (
  id text primary key,
  job_id uuid references processing_jobs(id),
  state text not null check (state in ('reserved','settled','uncertain')),
  kind text not null check (kind in ('text','transcription')),
  reserved_usd numeric(12,6) not null check (reserved_usd >= 0),
  actual_usd numeric(12,6) check (actual_usd >= 0),
  audio_seconds integer not null default 0 check (audio_seconds >= 0),
  input_tokens integer,
  output_tokens integer,
  created_at timestamptz not null default now(),
  settled_at timestamptz
);
create index intelligence_cost_period on intelligence_cost_ledger(created_at, state);
-- Production writers must lock one budget-control row before reading totals
-- and inserting a reservation, in the same transaction. The table alone does
-- not implement a distributed budget lock or migrate local SQLite JSON records.
