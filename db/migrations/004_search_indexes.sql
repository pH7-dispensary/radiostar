create extension if not exists vector;
alter table transcript_segments add column embedding vector(1536), add column embedding_model text, add column embedding_version text, add column embedded_at timestamptz;
alter table transcript_segments add column search_document tsvector generated always as (to_tsvector('english',coalesce(text,''))) stored;
create index transcript_segments_lexical_idx on transcript_segments using gin(search_document); create index transcript_segments_embedding_idx on transcript_segments using ivfflat (embedding vector_cosine_ops) with (lists=100);
