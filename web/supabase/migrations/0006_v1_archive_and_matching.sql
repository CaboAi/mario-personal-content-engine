alter table public.content_items
  add column if not exists archived_at timestamptz;

alter table public.instagram_media_library
  add column if not exists suggested_content_id uuid
    references public.content_items(id) on delete set null,
  add column if not exists match_confidence numeric,
  add column if not exists match_reason text,
  add column if not exists dismissed_content_id uuid
    references public.content_items(id) on delete set null;

alter table public.instagram_media_library
  drop constraint if exists instagram_media_library_match_confidence_check;
alter table public.instagram_media_library
  add constraint instagram_media_library_match_confidence_check
  check (match_confidence is null or (match_confidence >= 0 and match_confidence <= 1));

create index if not exists instagram_media_library_suggested_content_idx
  on public.instagram_media_library(suggested_content_id)
  where suggested_content_id is not null;

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
  ci.post_date as "postDate",
  ci.archived_at as "archivedAt"
from public.content_items ci;

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
  count(ci.id)::integer as "usageCount",
  bs.source_external_id as "sourceExternalId",
  bs.created_at as "createdAt"
from public.brand_sources bs
left join public.content_items ci on ci.brand_source_id = bs.id
group by bs.id;

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
  im.edits_updated_at as "editsUpdatedAt",
  im.suggested_content_id::text as "suggestedContentId",
  suggested.title as "suggestedContentTitle",
  im.match_confidence as "matchConfidence",
  im.match_reason as "matchReason",
  im.dismissed_content_id::text as "dismissedContentId"
from public.instagram_media_library im
left join public.content_items ci on ci.instagram_media_id = im.instagram_media_id
left join public.content_items suggested on suggested.id = im.suggested_content_id;

revoke all on public.dashboard_content_items, public.dashboard_brand_sources,
  public.dashboard_instagram_media from anon, authenticated;

create or replace function public.promote_pairing(p_pairing_id uuid, p_content jsonb)
returns setof public.dashboard_content_items
language plpgsql
security definer
set search_path = ''
as $$
declare
  source_pairing public.pairings%rowtype;
  active_content_id uuid;
  active_pairing_id uuid;
  new_content_id uuid;
begin
  -- Serialize the global one-active-project decision until the cleanup-backed
  -- unique invariant can be installed in the following migration.
  perform pg_catalog.pg_advisory_xact_lock(20260812);

  select * into source_pairing
  from public.pairings
  where id = p_pairing_id
  for update;

  if source_pairing.id is null then raise exception 'Pairing not found'; end if;
  if source_pairing.privacy_status <> 'Clear' then
    raise exception 'Pairing requires privacy confirmation';
  end if;

  select id, pairing_id into active_content_id, active_pairing_id
  from public.content_items
  where archived_at is null
    and status <> 'Posted'
  limit 1
  for update;

  if active_content_id is not null then
    if active_pairing_id = source_pairing.id then
      return query select * from public.dashboard_content_items
      where "id" = active_content_id::text;
      return;
    end if;
    raise exception 'Another production project is already active';
  end if;

  insert into public.content_items (
    saved_post_id, pairing_id, brand_source_id, title, source_title,
    format, goal, pillars, status, spoken_hooks, on_screen_hooks,
    selected_hook, selected_on_screen_hook, test_variable, hypothesis,
    skeleton, closing_line, cta, caption, carousel_slides, platforms, archived_at
  ) values (
    source_pairing.saved_post_id, source_pairing.id, source_pairing.brand_source_id,
    p_content->>'title', p_content->>'sourceTitle', p_content->>'format',
    p_content->>'goal', array(select jsonb_array_elements_text(p_content->'pillars')),
    'Script Ready', p_content->'spokenHooks', p_content->'onScreenHooks',
    p_content->>'selectedHook', p_content->>'selectedOnScreenHook',
    p_content->>'testVariable', p_content->>'hypothesis', p_content->'skeleton',
    p_content->>'closingLine', nullif(p_content->>'cta', ''),
    nullif(p_content->>'caption', ''), coalesce(p_content->'carouselSlides', '[]'::jsonb),
    array(select jsonb_array_elements_text(p_content->'platforms')), null
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
    archived_at = null,
    updated_at = now()
  returning id into new_content_id;

  update public.pairings set selected = (id = source_pairing.id)
  where saved_post_id = source_pairing.saved_post_id;
  update public.saved_posts set status = 'Used', updated_at = now()
  where id = source_pairing.saved_post_id;

  return query select * from public.dashboard_content_items where "id" = new_content_id::text;
end;
$$;

create or replace function public.archive_content_item(
  p_content_id uuid,
  p_archived boolean default true
)
returns setof public.dashboard_content_items
language plpgsql
security definer
set search_path = ''
as $$
declare
  source_save_id uuid;
  content_status public.production_status;
begin
  perform pg_catalog.pg_advisory_xact_lock(20260812);

  select saved_post_id, status into source_save_id, content_status
  from public.content_items
  where id = p_content_id
  for update;

  if not found then raise exception 'Content item not found'; end if;

  if not p_archived and content_status <> 'Posted' and exists (
    select 1 from public.content_items
    where id <> p_content_id
      and archived_at is null
      and status <> 'Posted'
  ) then
    raise exception 'Another production project is already active';
  end if;

  update public.content_items
  set archived_at = case when p_archived then now() else null end,
      updated_at = now()
  where id = p_content_id;

  if source_save_id is not null then
    if p_archived then
      update public.saved_posts
      set status = case
          when exists (
            select 1 from public.content_items
            where saved_post_id = source_save_id and archived_at is null
          ) then 'Used'::public.save_status
          when exists (
            select 1 from public.pairings where saved_post_id = source_save_id
          ) then 'Needs Review'::public.save_status
          else 'New'::public.save_status
        end,
        updated_at = now()
      where id = source_save_id;
    else
      update public.saved_posts set status = 'Used', updated_at = now()
      where id = source_save_id;
    end if;
  end if;

  return query select * from public.dashboard_content_items where "id" = p_content_id::text;
end;
$$;

create or replace function public.suggest_instagram_content_match(
  p_instagram_media_id text,
  p_content_id uuid,
  p_confidence numeric,
  p_reason text
)
returns setof public.dashboard_instagram_media
language plpgsql
security definer
set search_path = ''
as $$
declare
  media_id uuid;
begin
  if p_confidence < 0 or p_confidence > 1 then
    raise exception 'Match confidence must be between 0 and 1';
  end if;
  if not exists (
    select 1 from public.content_items
    where id = p_content_id and archived_at is null
  ) then raise exception 'Active content item not found'; end if;

  select id into media_id
  from public.instagram_media_library
  where instagram_media_id = p_instagram_media_id
  for update;
  if media_id is null then raise exception 'Instagram media not found'; end if;

  update public.instagram_media_library
  set suggested_content_id = p_content_id,
      match_confidence = p_confidence,
      match_reason = nullif(trim(p_reason), ''),
      updated_at = now()
  where id = media_id and content_id is null
    and dismissed_content_id is distinct from p_content_id;

  return query select * from public.dashboard_instagram_media
  where "instagramMediaId" = p_instagram_media_id;
end;
$$;

create or replace function public.confirm_instagram_content_match(
  p_instagram_media_id text,
  p_content_id uuid
)
returns setof public.dashboard_instagram_media
language plpgsql
security definer
set search_path = ''
as $$
declare
  media public.instagram_media_library%rowtype;
begin
  select * into media
  from public.instagram_media_library
  where instagram_media_id = p_instagram_media_id
  for update;
  if media.id is null then raise exception 'Instagram media not found'; end if;
  if media.suggested_content_id is null or media.suggested_content_id <> p_content_id then
    raise exception 'Suggested content match changed or is unavailable';
  end if;
  if not exists (
    select 1 from public.content_items
    where id = p_content_id and archived_at is null
  ) then raise exception 'Active content item not found'; end if;

  update public.content_items
  set instagram_media_id = media.instagram_media_id,
      instagram_permalink = media.permalink,
      media_product_type = coalesce(media.media_product_type, media.media_type),
      post_date = media.posted_at,
      status = 'Posted',
      updated_at = now()
  where id = p_content_id;

  if media.posted_at + interval '24 hours' > now() then
    insert into public.performance_reviews (content_id, review_window_hours, due_at)
    values (p_content_id, 24, media.posted_at + interval '24 hours')
    on conflict (content_id, review_window_hours) do update
    set due_at = excluded.due_at,
        status = case
          when public.performance_reviews.status = 'Complete' then 'Complete'
          else 'Pending'
        end,
        updated_at = now();
  end if;

  if media.posted_at + interval '168 hours' > now() then
    insert into public.performance_reviews (content_id, review_window_hours, due_at)
    values (p_content_id, 168, media.posted_at + interval '168 hours')
    on conflict (content_id, review_window_hours) do update
    set due_at = excluded.due_at,
        status = case
          when public.performance_reviews.status = 'Complete' then 'Complete'
          else 'Pending'
        end,
        updated_at = now();
  end if;

  update public.instagram_media_library
  set content_id = p_content_id,
      suggested_content_id = null,
      match_confidence = null,
      match_reason = null,
      dismissed_content_id = null,
      updated_at = now()
  where id = media.id;

  return query select * from public.dashboard_instagram_media
  where "instagramMediaId" = p_instagram_media_id;
end;
$$;

create or replace function public.dismiss_instagram_content_match(
  p_instagram_media_id text
)
returns setof public.dashboard_instagram_media
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.instagram_media_library
  set dismissed_content_id = suggested_content_id,
      suggested_content_id = null,
      match_confidence = null,
      match_reason = null,
      updated_at = now()
  where instagram_media_id = p_instagram_media_id;

  if not found then raise exception 'Instagram media not found'; end if;

  return query select * from public.dashboard_instagram_media
  where "instagramMediaId" = p_instagram_media_id;
end;
$$;

revoke all on function public.promote_pairing(uuid, jsonb),
  public.archive_content_item(uuid, boolean),
  public.suggest_instagram_content_match(text, uuid, numeric, text),
  public.confirm_instagram_content_match(text, uuid),
  public.dismiss_instagram_content_match(text)
  from public, anon, authenticated;

grant execute on function public.promote_pairing(uuid, jsonb),
  public.archive_content_item(uuid, boolean),
  public.suggest_instagram_content_match(text, uuid, numeric, text),
  public.confirm_instagram_content_match(text, uuid),
  public.dismiss_instagram_content_match(text)
  to service_role;
