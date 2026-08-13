-- Existing carousel records used the video workflow. Move every unfinished
-- carousel to the first honest Canva stage; Posted records stay archived.
update public.content_items
set status = 'Copy Ready',
    updated_at = now()
where format = 'Carousel'
  and status <> 'Posted';

alter table public.content_items
  drop constraint if exists content_items_format_status_check;
alter table public.content_items
  add constraint content_items_format_status_check
  check (
    (
      format = 'Carousel'
      and status in ('Copy Ready', 'Designing in Canva', 'Design Ready', 'Posted')
    )
    or
    (
      format <> 'Carousel'
      and status in ('Script Ready', 'Ready to Record', 'Recorded', 'Edited', 'Scheduled', 'Posted')
    )
  );

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
  initial_status public.production_status;
begin
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

  initial_status := case
    when p_content->>'format' = 'Carousel' then 'Copy Ready'::public.production_status
    else 'Script Ready'::public.production_status
  end;

  insert into public.content_items (
    saved_post_id, pairing_id, brand_source_id, title, source_title,
    format, goal, pillars, status, spoken_hooks, on_screen_hooks,
    selected_hook, selected_on_screen_hook, test_variable, hypothesis,
    skeleton, closing_line, cta, caption, carousel_slides, platforms, archived_at
  ) values (
    source_pairing.saved_post_id, source_pairing.id, source_pairing.brand_source_id,
    p_content->>'title', p_content->>'sourceTitle', p_content->>'format',
    p_content->>'goal', array(select jsonb_array_elements_text(p_content->'pillars')),
    initial_status, p_content->'spokenHooks', p_content->'onScreenHooks',
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
    status = excluded.status,
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

  return query select * from public.dashboard_content_items
  where "id" = new_content_id::text;
end;
$$;

revoke all on function public.promote_pairing(uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.promote_pairing(uuid, jsonb)
  to service_role;
