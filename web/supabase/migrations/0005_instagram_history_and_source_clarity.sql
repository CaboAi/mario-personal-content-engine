create table if not exists public.instagram_media_library (
  id uuid primary key default gen_random_uuid(),
  instagram_media_id text not null unique,
  content_id uuid references public.content_items(id) on delete set null,
  caption text,
  media_type text,
  media_product_type text,
  permalink text,
  thumbnail_url text,
  posted_at timestamptz not null,
  views bigint,
  reach bigint,
  average_watch_seconds numeric,
  total_watch_seconds numeric,
  likes bigint,
  comments bigint,
  shares bigint,
  saves bigint,
  follows bigint,
  total_interactions bigint,
  reposts bigint,
  hook_rate numeric check (hook_rate between 0 and 100),
  skip_rate numeric check (skip_rate between 0 and 100),
  follower_view_percentage numeric check (follower_view_percentage between 0 and 100),
  non_follower_view_percentage numeric check (non_follower_view_percentage between 0 and 100),
  retention_notes text,
  retention_curve jsonb not null default '[]'::jsonb,
  raw_metrics jsonb not null default '{}'::jsonb,
  last_synced_at timestamptz not null default now(),
  edits_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.instagram_account_daily (
  id uuid primary key default gen_random_uuid(),
  metric_date date not null unique,
  reach bigint,
  views bigint,
  profile_views bigint,
  follower_count bigint,
  accounts_engaged bigint,
  total_interactions bigint,
  likes bigint,
  comments bigint,
  shares bigint,
  saves bigint,
  raw_metrics jsonb not null default '{}'::jsonb,
  last_synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists instagram_media_library_posted_idx
  on public.instagram_media_library(posted_at desc);
create index if not exists instagram_media_library_product_idx
  on public.instagram_media_library(media_product_type, posted_at desc);

alter table public.instagram_media_library enable row level security;
alter table public.instagram_account_daily enable row level security;
revoke all on public.instagram_media_library, public.instagram_account_daily from anon, authenticated;

create or replace view public.dashboard_saved_posts with (security_invoker = true) as
select
  sp.id::text as "id",
  sp.author as "author",
  sp.shortcode as "shortcode",
  sp.url as "url",
  sp.content_type as "contentType",
  sp.caption as "caption",
  sp.duration_seconds as "durationSeconds",
  sp.saved_at as "savedAt",
  sp.status::text as "status",
  sp.framework_dna as "frameworkDna",
  sp.hook_mechanics as "hookMechanics",
  sp.visual_pacing as "visualPacing",
  sp.prohibited_transfer as "prohibitedTransfer",
  coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', p.id::text,
        'brandSourceId', p.brand_source_id::text,
        'title', p.title,
        'sourceType', p.source_type,
        'sourceTitle', p.source_title,
        'sourceUrl', p.source_url,
        'coreTruth', bs.core_truth,
        'storyEvidence', bs.story_evidence,
        'pillars', bs.pillars,
        'rationale', p.rationale,
        'direction', p.direction,
        'privacyStatus', p.privacy_status,
        'recommended', p.recommended
      ) order by p.rank
    ) filter (where p.id is not null),
    '[]'::jsonb
  ) as "pairings"
from public.saved_posts sp
left join public.pairings p on p.saved_post_id = sp.id
left join public.brand_sources bs on bs.id = p.brand_source_id
group by sp.id;

create or replace view public.dashboard_instagram_media with (security_invoker = true) as
select
  im.id::text as "id",
  im.instagram_media_id as "instagramMediaId",
  coalesce(im.content_id, ci.id)::text as "contentId",
  im.caption as "caption",
  im.media_type as "mediaType",
  im.media_product_type as "mediaProductType",
  im.permalink as "permalink",
  im.thumbnail_url as "thumbnailUrl",
  im.posted_at as "postedAt",
  im.views as "views",
  im.reach as "reach",
  im.average_watch_seconds as "averageWatchSeconds",
  im.total_watch_seconds as "totalWatchSeconds",
  im.likes as "likes",
  im.comments as "comments",
  im.shares as "shares",
  im.saves as "saves",
  im.follows as "follows",
  im.total_interactions as "totalInteractions",
  im.reposts as "reposts",
  im.hook_rate as "hookRate",
  im.skip_rate as "skipRate",
  im.follower_view_percentage as "followerViewPercentage",
  im.non_follower_view_percentage as "nonFollowerViewPercentage",
  im.retention_notes as "retentionNotes",
  im.retention_curve as "retentionCurve",
  im.last_synced_at as "lastSyncedAt",
  im.edits_updated_at as "editsUpdatedAt"
from public.instagram_media_library im
left join public.content_items ci on ci.instagram_media_id = im.instagram_media_id;

create or replace view public.dashboard_instagram_account_daily with (security_invoker = true) as
select
  iad.metric_date::text as "metricDate",
  iad.reach as "reach",
  iad.views as "views",
  iad.profile_views as "profileViews",
  iad.follower_count as "followerCount",
  iad.accounts_engaged as "accountsEngaged",
  iad.total_interactions as "totalInteractions",
  iad.likes as "likes",
  iad.comments as "comments",
  iad.shares as "shares",
  iad.saves as "saves",
  iad.last_synced_at as "lastSyncedAt"
from public.instagram_account_daily iad;

revoke all on public.dashboard_instagram_media, public.dashboard_instagram_account_daily from anon, authenticated;
