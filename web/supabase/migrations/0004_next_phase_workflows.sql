alter table public.content_items
  add column if not exists carousel_slides jsonb not null default '[]'::jsonb,
  add column if not exists instagram_permalink text,
  add column if not exists media_product_type text;

alter table public.metric_snapshots
  add column if not exists media_product_type text;

create table if not exists public.performance_reviews (
  id uuid primary key default gen_random_uuid(),
  content_id uuid not null references public.content_items(id) on delete cascade,
  review_window_hours integer not null check (review_window_hours in (24, 168)),
  due_at timestamptz not null,
  status text not null default 'Pending' check (status in ('Pending', 'Complete', 'Failed')),
  primary_metric text,
  primary_value numeric,
  comparable_count integer not null default 0,
  signal text,
  observation text,
  next_test text,
  analyzed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(content_id, review_window_hours)
);

create table if not exists public.carousel_publications (
  id uuid primary key default gen_random_uuid(),
  content_id uuid not null unique references public.content_items(id) on delete cascade,
  status text not null default 'Draft' check (status in ('Draft', 'Validated', 'Processing', 'Published', 'Failed')),
  asset_urls text[] not null default '{}',
  alt_texts text[] not null default '{}',
  caption text not null default '',
  child_container_ids text[] not null default '{}',
  carousel_container_id text,
  instagram_media_id text,
  instagram_permalink text,
  attempt_count integer not null default 0,
  last_error text,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists performance_reviews_due_idx
  on public.performance_reviews(status, due_at);
create index if not exists carousel_publications_status_idx
  on public.carousel_publications(status, updated_at desc);

alter table public.performance_reviews enable row level security;
alter table public.carousel_publications enable row level security;
revoke all on public.performance_reviews, public.carousel_publications from anon, authenticated;

create or replace view public.dashboard_content_items with (security_invoker = true) as
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
  ci.created_at as "createdAt",
  ci.cta as "cta",
  ci.caption as "caption",
  ci.carousel_slides as "carouselSlides",
  ci.instagram_media_id as "instagramMediaId",
  ci.instagram_permalink as "instagramPermalink",
  ci.media_product_type as "mediaProductType",
  ci.post_date as "postDate"
from public.content_items ci;

create or replace view public.dashboard_metric_snapshots with (security_invoker = true) as
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
  ms.follows,
  ms.media_product_type as "mediaProductType"
from public.metric_snapshots ms;

create or replace view public.dashboard_brand_sources with (security_invoker = true) as
select
  bs.id::text as "id",
  bs.source_type as "sourceType",
  bs.title as "title",
  bs.core_truth as "coreTruth",
  bs.story_evidence as "storyEvidence",
  bs.privacy_status as "privacyStatus",
  bs.pillars as "pillars",
  bs.source_url as "sourceUrl",
  bs.status as "status",
  bs.updated_at as "updatedAt",
  count(ci.id)::integer as "usageCount"
from public.brand_sources bs
left join public.content_items ci on ci.brand_source_id = bs.id
group by bs.id;

create or replace view public.dashboard_performance_reviews with (security_invoker = true) as
select
  pr.id::text as "id",
  pr.content_id::text as "contentId",
  pr.review_window_hours as "reviewWindowHours",
  pr.due_at as "dueAt",
  pr.status as "status",
  pr.primary_metric as "primaryMetric",
  pr.primary_value as "primaryValue",
  pr.comparable_count as "comparableCount",
  pr.signal as "signal",
  pr.observation as "observation",
  pr.next_test as "nextTest",
  pr.analyzed_at as "analyzedAt",
  pr.last_error as "lastError"
from public.performance_reviews pr;

create or replace view public.dashboard_carousel_publications with (security_invoker = true) as
select
  cp.id::text as "id",
  cp.content_id::text as "contentId",
  cp.status as "status",
  cp.asset_urls as "assetUrls",
  cp.alt_texts as "altTexts",
  cp.caption as "caption",
  cp.instagram_media_id as "instagramMediaId",
  cp.instagram_permalink as "instagramPermalink",
  cp.attempt_count as "attemptCount",
  cp.last_error as "lastError",
  cp.published_at as "publishedAt",
  cp.updated_at as "updatedAt"
from public.carousel_publications cp;

revoke all on public.dashboard_content_items, public.dashboard_metric_snapshots,
  public.dashboard_brand_sources, public.dashboard_performance_reviews,
  public.dashboard_carousel_publications from anon, authenticated;

create or replace function public.promote_pairing(p_pairing_id uuid, p_content jsonb)
returns setof public.dashboard_content_items
language plpgsql
security definer
set search_path = ''
as $$
declare
  source_pairing public.pairings%rowtype;
  new_content_id uuid;
begin
  select * into source_pairing
  from public.pairings
  where id = p_pairing_id
  for update;

  if source_pairing.id is null then raise exception 'Pairing not found'; end if;
  if source_pairing.privacy_status <> 'Clear' then
    raise exception 'Pairing requires privacy confirmation';
  end if;

  insert into public.content_items (
    saved_post_id, pairing_id, brand_source_id, title, source_title,
    format, goal, pillars, status, spoken_hooks, on_screen_hooks,
    selected_hook, selected_on_screen_hook, test_variable, hypothesis,
    skeleton, closing_line, cta, caption, carousel_slides, platforms
  ) values (
    source_pairing.saved_post_id, source_pairing.id, source_pairing.brand_source_id,
    p_content->>'title', p_content->>'sourceTitle', p_content->>'format',
    p_content->>'goal', array(select jsonb_array_elements_text(p_content->'pillars')),
    'Script Ready', p_content->'spokenHooks', p_content->'onScreenHooks',
    p_content->>'selectedHook', p_content->>'selectedOnScreenHook',
    p_content->>'testVariable', p_content->>'hypothesis', p_content->'skeleton',
    p_content->>'closingLine', nullif(p_content->>'cta', ''),
    nullif(p_content->>'caption', ''), coalesce(p_content->'carouselSlides', '[]'::jsonb),
    array(select jsonb_array_elements_text(p_content->'platforms'))
  )
  on conflict (pairing_id) do update set
    title = excluded.title,
    format = excluded.format,
    goal = excluded.goal,
    pillars = excluded.pillars,
    spoken_hooks = excluded.spoken_hooks,
    on_screen_hooks = excluded.on_screen_hooks,
    selected_hook = excluded.selected_hook,
    selected_on_screen_hook = excluded.selected_on_screen_hook,
    test_variable = excluded.test_variable,
    hypothesis = excluded.hypothesis,
    skeleton = excluded.skeleton,
    closing_line = excluded.closing_line,
    cta = excluded.cta,
    caption = excluded.caption,
    carousel_slides = excluded.carousel_slides,
    updated_at = now()
  returning id into new_content_id;

  update public.pairings set selected = (id = source_pairing.id)
  where saved_post_id = source_pairing.saved_post_id;
  update public.saved_posts set status = 'Used', updated_at = now()
  where id = source_pairing.saved_post_id;

  return query select * from public.dashboard_content_items where "id" = new_content_id::text;
end;
$$;

create or replace function public.link_content_instagram(
  p_content_id uuid,
  p_instagram_media_id text,
  p_permalink text,
  p_media_product_type text,
  p_posted_at timestamptz
)
returns setof public.dashboard_content_items
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(nullif(trim(p_instagram_media_id), ''), '') = '' then
    raise exception 'Instagram media ID is required';
  end if;

  update public.content_items
  set instagram_media_id = trim(p_instagram_media_id),
      instagram_permalink = nullif(trim(p_permalink), ''),
      media_product_type = nullif(trim(p_media_product_type), ''),
      post_date = p_posted_at,
      status = 'Posted',
      updated_at = now()
  where id = p_content_id;

  if not found then raise exception 'Content item not found'; end if;

  insert into public.performance_reviews (content_id, review_window_hours, due_at)
  values
    (p_content_id, 24, p_posted_at + interval '24 hours'),
    (p_content_id, 168, p_posted_at + interval '168 hours')
  on conflict (content_id, review_window_hours) do update
  set due_at = excluded.due_at,
      status = case when public.performance_reviews.status = 'Complete' then 'Complete' else 'Pending' end,
      updated_at = now();

  return query select * from public.dashboard_content_items where "id" = p_content_id::text;
end;
$$;

create or replace function public.save_carousel_publication(
  p_content_id uuid,
  p_asset_urls jsonb,
  p_alt_texts jsonb,
  p_caption text
)
returns setof public.dashboard_carousel_publications
language plpgsql
security definer
set search_path = ''
as $$
declare
  asset_count integer;
  content_format text;
  job_id uuid;
begin
  if jsonb_typeof(p_asset_urls) <> 'array' or jsonb_typeof(p_alt_texts) <> 'array' then
    raise exception 'Carousel assets and alt text must be arrays';
  end if;
  asset_count := jsonb_array_length(p_asset_urls);
  if asset_count < 2 or asset_count > 10 then
    raise exception 'Carousels require between 2 and 10 assets';
  end if;
  if jsonb_array_length(p_alt_texts) <> asset_count then
    raise exception 'Each carousel asset requires matching alt text';
  end if;

  select format into content_format from public.content_items where id = p_content_id;
  if content_format is null then raise exception 'Content item not found'; end if;
  if content_format <> 'Carousel' then raise exception 'Content item is not a Carousel'; end if;

  insert into public.carousel_publications (
    content_id, status, asset_urls, alt_texts, caption, last_error, updated_at
  ) values (
    p_content_id, 'Validated',
    array(select jsonb_array_elements_text(p_asset_urls)),
    array(select jsonb_array_elements_text(p_alt_texts)),
    coalesce(p_caption, ''), null, now()
  )
  on conflict (content_id) do update set
    status = 'Validated',
    asset_urls = excluded.asset_urls,
    alt_texts = excluded.alt_texts,
    caption = excluded.caption,
    child_container_ids = '{}',
    carousel_container_id = null,
    last_error = null,
    updated_at = now()
  where public.carousel_publications.status <> 'Published'
  returning id into job_id;

  if job_id is null then raise exception 'Published carousel cannot be replaced'; end if;
  return query select * from public.dashboard_carousel_publications where "id" = job_id::text;
end;
$$;

create or replace function public.record_performance_window(
  p_content_id uuid,
  p_window_hours integer,
  p_instagram_media_id text,
  p_media_product_type text,
  p_metrics jsonb,
  p_analysis jsonb
)
returns setof public.dashboard_performance_reviews
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_window_hours not in (24, 168) then raise exception 'Unsupported review window'; end if;

  insert into public.metric_snapshots (
    content_id, instagram_media_id, captured_at, review_window_hours,
    views, reach, average_watch_seconds, likes, comments, shares, saves, follows,
    media_product_type, raw_metrics
  ) values (
    p_content_id, p_instagram_media_id, now(), p_window_hours,
    nullif(p_metrics->>'views', '')::bigint,
    nullif(p_metrics->>'reach', '')::bigint,
    nullif(p_metrics->>'averageWatchSeconds', '')::numeric,
    nullif(p_metrics->>'likes', '')::bigint,
    nullif(p_metrics->>'comments', '')::bigint,
    nullif(p_metrics->>'shares', '')::bigint,
    nullif(p_metrics->>'saves', '')::bigint,
    nullif(p_metrics->>'follows', '')::bigint,
    p_media_product_type,
    p_metrics
  )
  on conflict (content_id, review_window_hours) do update set
    instagram_media_id = excluded.instagram_media_id,
    captured_at = excluded.captured_at,
    views = excluded.views,
    reach = excluded.reach,
    average_watch_seconds = excluded.average_watch_seconds,
    likes = excluded.likes,
    comments = excluded.comments,
    shares = excluded.shares,
    saves = excluded.saves,
    follows = excluded.follows,
    media_product_type = excluded.media_product_type,
    raw_metrics = excluded.raw_metrics;

  insert into public.performance_reviews (
    content_id, review_window_hours, due_at, status, primary_metric, primary_value,
    comparable_count, signal, observation, next_test, analyzed_at, last_error, updated_at
  ) values (
    p_content_id, p_window_hours, now(), 'Complete', p_analysis->>'primaryMetric',
    nullif(p_analysis->>'primaryValue', '')::numeric,
    coalesce((p_analysis->>'comparableCount')::integer, 0),
    p_analysis->>'signal', p_analysis->>'observation', p_analysis->>'nextTest',
    now(), null, now()
  )
  on conflict (content_id, review_window_hours) do update set
    status = 'Complete',
    primary_metric = excluded.primary_metric,
    primary_value = excluded.primary_value,
    comparable_count = excluded.comparable_count,
    signal = excluded.signal,
    observation = excluded.observation,
    next_test = excluded.next_test,
    analyzed_at = excluded.analyzed_at,
    last_error = null,
    updated_at = now();

  return query select * from public.dashboard_performance_reviews
  where "contentId" = p_content_id::text and "reviewWindowHours" = p_window_hours;
end;
$$;

create or replace function public.finalize_carousel_publication(
  p_job_id uuid,
  p_instagram_media_id text,
  p_permalink text,
  p_media_product_type text,
  p_published_at timestamptz
)
returns setof public.dashboard_carousel_publications
language plpgsql
security definer
set search_path = ''
as $$
declare linked_content_id uuid;
begin
  update public.carousel_publications
  set status = 'Published', instagram_media_id = p_instagram_media_id,
      instagram_permalink = p_permalink, published_at = p_published_at,
      last_error = null, updated_at = now()
  where id = p_job_id
  returning content_id into linked_content_id;

  if linked_content_id is null then raise exception 'Carousel publication not found'; end if;

  perform * from public.link_content_instagram(
    linked_content_id, p_instagram_media_id, p_permalink,
    p_media_product_type, p_published_at
  );

  return query select * from public.dashboard_carousel_publications where "id" = p_job_id::text;
end;
$$;

revoke all on function public.promote_pairing(uuid, jsonb),
  public.link_content_instagram(uuid, text, text, text, timestamptz),
  public.save_carousel_publication(uuid, jsonb, jsonb, text),
  public.record_performance_window(uuid, integer, text, text, jsonb, jsonb),
  public.finalize_carousel_publication(uuid, text, text, text, timestamptz)
  from public, anon, authenticated;

grant execute on function public.promote_pairing(uuid, jsonb),
  public.link_content_instagram(uuid, text, text, text, timestamptz),
  public.save_carousel_publication(uuid, jsonb, jsonb, text),
  public.record_performance_window(uuid, integer, text, text, jsonb, jsonb),
  public.finalize_carousel_publication(uuid, text, text, text, timestamptz)
  to service_role;
