-- Imported metrics may only attach to packages Mario explicitly marked Posted.
update public.instagram_media_library im
set suggested_content_id = null,
    match_confidence = null,
    match_reason = null,
    updated_at = now()
where suggested_content_id is not null
  and not exists (
    select 1 from public.content_items ci
    where ci.id = im.suggested_content_id
      and ci.archived_at is null
      and ci.status = 'Posted'
      and ci.instagram_media_id is null
  );

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
    where id = p_content_id
      and archived_at is null
      and status = 'Posted'
      and instagram_media_id is null
  ) then raise exception 'Eligible posted content item not found'; end if;

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
    where id = p_content_id and archived_at is null and status = 'Posted'
  ) then raise exception 'Eligible posted content item not found'; end if;

  update public.content_items
  set instagram_media_id = media.instagram_media_id,
      instagram_permalink = media.permalink,
      media_product_type = coalesce(media.media_product_type, media.media_type),
      post_date = media.posted_at,
      updated_at = now()
  where id = p_content_id;

  if media.posted_at + interval '24 hours' > now() then
    insert into public.performance_reviews (content_id, review_window_hours, due_at)
    values (p_content_id, 24, media.posted_at + interval '24 hours')
    on conflict (content_id, review_window_hours) do update
    set due_at = excluded.due_at,
        status = case when public.performance_reviews.status = 'Complete' then 'Complete' else 'Pending' end,
        updated_at = now();
  end if;

  if media.posted_at + interval '168 hours' > now() then
    insert into public.performance_reviews (content_id, review_window_hours, due_at)
    values (p_content_id, 168, media.posted_at + interval '168 hours')
    on conflict (content_id, review_window_hours) do update
    set due_at = excluded.due_at,
        status = case when public.performance_reviews.status = 'Complete' then 'Complete' else 'Pending' end,
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

revoke all on function public.suggest_instagram_content_match(text, uuid, numeric, text),
  public.confirm_instagram_content_match(text, uuid)
  from public, anon, authenticated;
grant execute on function public.suggest_instagram_content_match(text, uuid, numeric, text),
  public.confirm_instagram_content_match(text, uuid)
  to service_role;
