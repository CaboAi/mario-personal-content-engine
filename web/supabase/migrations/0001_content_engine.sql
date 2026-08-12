create extension if not exists pgcrypto;

create type save_status as enum (
  'New', 'Needs Review', 'Approved', 'Used', 'Ignored', 'Blocked'
);

create type production_status as enum (
  'Script Ready', 'Ready to Record', 'Recorded', 'Edited', 'Scheduled', 'Posted'
);

create table brand_sources (
  id uuid primary key default gen_random_uuid(),
  source_type text not null check (source_type in ('Story', 'Daily Entry', 'Existing Content')),
  title text not null,
  core_truth text not null,
  story_evidence text not null,
  privacy_status text not null default 'Needs confirmation' check (privacy_status in ('Clear', 'Needs confirmation')),
  pillars text[] not null default '{}',
  source_url text,
  source_external_id text,
  status text not null default 'Verified' check (status in ('Captured', 'Verified', 'Used', 'Retired')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table saved_posts (
  id uuid primary key default gen_random_uuid(),
  instagram_media_id text not null unique,
  shortcode text not null default '',
  author text not null,
  url text not null,
  content_type text not null check (content_type in ('Reel', 'Carousel', 'Post', 'IGTV')),
  caption text not null default '',
  duration_seconds numeric,
  saved_at timestamptz not null default now(),
  status save_status not null default 'New',
  framework_dna text not null default '',
  hook_mechanics text not null default '',
  visual_pacing text not null default '',
  prohibited_transfer text[] not null default '{}',
  media_asset_url text,
  notion_page_id text,
  analyzed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table pairings (
  id uuid primary key default gen_random_uuid(),
  saved_post_id uuid not null references saved_posts(id) on delete cascade,
  brand_source_id uuid references brand_sources(id) on delete set null,
  title text not null,
  source_type text not null check (source_type in ('Story', 'Daily Entry', 'Existing Content')),
  source_title text not null,
  source_url text,
  rationale text not null,
  direction text not null,
  privacy_status text not null default 'Needs confirmation' check (privacy_status in ('Clear', 'Needs confirmation')),
  rank smallint not null check (rank between 1 and 3),
  recommended boolean not null default false,
  selected boolean not null default false,
  created_at timestamptz not null default now(),
  unique(saved_post_id, rank)
);

create table content_items (
  id uuid primary key default gen_random_uuid(),
  saved_post_id uuid references saved_posts(id) on delete set null,
  pairing_id uuid unique references pairings(id) on delete set null,
  brand_source_id uuid references brand_sources(id) on delete set null,
  title text not null,
  source_title text not null,
  format text not null check (format in ('Yap Reel', 'Mini Story', 'POV / Realization', 'Carousel', 'Written Post', 'Long-form')),
  goal text not null check (goal in ('Reach', 'Shares', 'Saves', 'Follows', 'Trust')),
  pillars text[] not null,
  status production_status not null default 'Script Ready',
  spoken_hooks jsonb not null,
  on_screen_hooks jsonb not null,
  selected_hook text not null,
  selected_on_screen_hook text not null,
  test_variable text not null check (test_variable in ('Hook', 'Topic', 'Length', 'Format', 'CTA', 'Visual', 'None')),
  hypothesis text not null,
  skeleton jsonb not null,
  full_script text,
  closing_line text not null,
  cta text,
  caption text,
  platforms text[] not null default array['Instagram'],
  instagram_media_id text,
  notion_page_id text,
  post_date timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table metric_snapshots (
  id uuid primary key default gen_random_uuid(),
  content_id uuid not null references content_items(id) on delete cascade,
  instagram_media_id text not null,
  captured_at timestamptz not null default now(),
  review_window_hours integer not null,
  views bigint,
  reach bigint,
  average_watch_seconds numeric,
  likes bigint,
  comments bigint,
  shares bigint,
  saves bigint,
  follows bigint,
  raw_metrics jsonb not null default '{}',
  unique(content_id, review_window_hours)
);

create table job_runs (
  id uuid primary key default gen_random_uuid(),
  job_type text not null,
  status text not null check (status in ('Running', 'Succeeded', 'Failed')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  processed_count integer not null default 0,
  error_message text,
  details jsonb not null default '{}'
);

create index saved_posts_status_saved_at_idx on saved_posts(status, saved_at desc);
create index content_items_status_created_at_idx on content_items(status, created_at desc);
create index metric_snapshots_content_captured_idx on metric_snapshots(content_id, captured_at desc);

alter table brand_sources enable row level security;
alter table saved_posts enable row level security;
alter table pairings enable row level security;
alter table content_items enable row level security;
alter table metric_snapshots enable row level security;
alter table job_runs enable row level security;

revoke all on brand_sources, saved_posts, pairings, content_items, metric_snapshots, job_runs from anon, authenticated;

create view dashboard_saved_posts with (security_invoker = true) as
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
        'title', p.title,
        'sourceType', p.source_type,
        'sourceTitle', p.source_title,
        'sourceUrl', p.source_url,
        'rationale', p.rationale,
        'direction', p.direction,
        'privacyStatus', p.privacy_status,
        'recommended', p.recommended
      ) order by p.rank
    ) filter (where p.id is not null),
    '[]'::jsonb
  ) as "pairings"
from saved_posts sp
left join pairings p on p.saved_post_id = sp.id
group by sp.id;

create view dashboard_content_items with (security_invoker = true) as
select
  ci.id::text as "id",
  ci.saved_post_id::text as "sourceSaveId",
  ci.source_title as "sourceTitle",
  ci.title as "title",
  ci.format as "format",
  ci.goal as "goal",
  ci.pillars as "pillars",
  ci.status::text as "status",
  ci.spoken_hooks as "spokenHooks",
  ci.on_screen_hooks as "onScreenHooks",
  ci.selected_hook as "selectedHook",
  ci.selected_on_screen_hook as "selectedOnScreenHook",
  ci.test_variable as "testVariable",
  ci.hypothesis as "hypothesis",
  ci.skeleton as "skeleton",
  ci.closing_line as "closingLine",
  ci.platforms as "platforms",
  ci.created_at as "createdAt"
from content_items ci;

create view dashboard_metric_snapshots with (security_invoker = true) as
select
  ms.content_id::text as "contentId",
  ms.captured_at as "capturedAt",
  ms.review_window_hours as "reviewWindowHours",
  ms.views,
  ms.reach,
  ms.average_watch_seconds as "averageWatchSeconds",
  ms.likes,
  ms.comments,
  ms.shares,
  ms.saves,
  ms.follows
from metric_snapshots ms;

revoke all on dashboard_saved_posts, dashboard_content_items, dashboard_metric_snapshots from anon, authenticated;

create or replace function promote_pairing(p_pairing_id uuid, p_content jsonb)
returns setof dashboard_content_items
language plpgsql
security definer
set search_path = public
as $$
declare
  source_pairing pairings%rowtype;
  new_content_id uuid;
begin
  select * into source_pairing from pairings where id = p_pairing_id for update;
  if source_pairing.id is null then
    raise exception 'Pairing not found';
  end if;
  if source_pairing.privacy_status <> 'Clear' then
    raise exception 'Pairing requires privacy confirmation';
  end if;

  insert into content_items (
    saved_post_id, pairing_id, brand_source_id, title, source_title,
    format, goal, pillars, status, spoken_hooks, on_screen_hooks,
    selected_hook, selected_on_screen_hook, test_variable, hypothesis,
    skeleton, closing_line, platforms
  ) values (
    source_pairing.saved_post_id,
    source_pairing.id,
    source_pairing.brand_source_id,
    p_content->>'title',
    p_content->>'sourceTitle',
    p_content->>'format',
    p_content->>'goal',
    array(select jsonb_array_elements_text(p_content->'pillars')),
    'Script Ready',
    p_content->'spokenHooks',
    p_content->'onScreenHooks',
    p_content->>'selectedHook',
    p_content->>'selectedOnScreenHook',
    p_content->>'testVariable',
    p_content->>'hypothesis',
    p_content->'skeleton',
    p_content->>'closingLine',
    array(select jsonb_array_elements_text(p_content->'platforms'))
  )
  on conflict (pairing_id) do update set
    title = excluded.title,
    spoken_hooks = excluded.spoken_hooks,
    on_screen_hooks = excluded.on_screen_hooks,
    selected_hook = excluded.selected_hook,
    selected_on_screen_hook = excluded.selected_on_screen_hook,
    hypothesis = excluded.hypothesis,
    skeleton = excluded.skeleton,
    closing_line = excluded.closing_line,
    updated_at = now()
  returning id into new_content_id;

  update pairings set selected = (id = source_pairing.id)
  where saved_post_id = source_pairing.saved_post_id;
  update saved_posts set status = 'Used', updated_at = now()
  where id = source_pairing.saved_post_id;

  return query select * from dashboard_content_items where "id" = new_content_id::text;
end;
$$;

revoke all on function promote_pairing(uuid, jsonb) from public, anon, authenticated;
grant execute on function promote_pairing(uuid, jsonb) to service_role;
