alter table public.content_items
  add column if not exists mode text not null default 'Reflection';

alter table public.content_items
  drop constraint if exists content_items_mode_check;

alter table public.content_items
  add constraint content_items_mode_check
  check (mode in ('Dispatch', 'Practical', 'Reflection'));

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
  ci.archived_at as "archivedAt",
  ci.full_script as "fullScript",
  ci.script_risk_lines as "scriptRiskLines",
  ci.source_reference as "sourceReference",
  ci.batch_id::text as "batchId",
  ci.planned_for as "plannedFor",
  ci.hook_rationale as "hookRationale",
  ci.production_notes as "productionNotes",
  ci.privacy_notes as "privacyNotes",
  ci.publication_clearance as "publicationClearance",
  ci.mode as "mode"
from public.content_items ci;

create or replace function public.promote_pairing(p_pairing_id uuid, p_content jsonb)
returns setof public.dashboard_content_items
language plpgsql
security definer
set search_path = ''
as $$
declare
  source_pairing public.pairings%rowtype;
  new_content_id uuid;
  initial_status public.production_status;
begin
  select * into source_pairing from public.pairings where id = p_pairing_id for update;
  if source_pairing.id is null then raise exception 'Pairing not found'; end if;
  if source_pairing.privacy_status <> 'Clear' then raise exception 'Pairing requires privacy confirmation'; end if;

  initial_status := case p_content->>'format'
    when 'POV / Realization' then 'Concept Ready'::public.production_status
    when 'Carousel' then 'Copy Ready'::public.production_status
    when 'Written Post' then 'Outline Ready'::public.production_status
    when 'Long-form' then 'Outline Ready'::public.production_status
    else 'Script Ready'::public.production_status
  end;

  insert into public.content_items (
    saved_post_id, pairing_id, brand_source_id, title, source_title, format, mode, goal, pillars,
    status, spoken_hooks, on_screen_hooks, selected_hook, selected_on_screen_hook,
    test_variable, hypothesis, skeleton, closing_line, cta, caption, carousel_slides,
    platforms, archived_at
  ) values (
    source_pairing.saved_post_id, source_pairing.id, source_pairing.brand_source_id,
    p_content->>'title', p_content->>'sourceTitle', p_content->>'format',
    coalesce(p_content->>'mode', 'Reflection'), p_content->>'goal',
    array(select jsonb_array_elements_text(p_content->'pillars')), initial_status,
    p_content->'spokenHooks', p_content->'onScreenHooks', p_content->>'selectedHook',
    p_content->>'selectedOnScreenHook', p_content->>'testVariable', p_content->>'hypothesis',
    p_content->'skeleton', p_content->>'closingLine', nullif(p_content->>'cta', ''),
    nullif(p_content->>'caption', ''), coalesce(p_content->'carouselSlides', '[]'::jsonb),
    array(select jsonb_array_elements_text(p_content->'platforms')), null
  ) on conflict (pairing_id) do update set
    title = excluded.title, format = excluded.format, mode = excluded.mode, goal = excluded.goal,
    pillars = excluded.pillars, status = excluded.status, spoken_hooks = excluded.spoken_hooks,
    on_screen_hooks = excluded.on_screen_hooks, selected_hook = excluded.selected_hook,
    selected_on_screen_hook = excluded.selected_on_screen_hook, test_variable = excluded.test_variable,
    hypothesis = excluded.hypothesis, skeleton = excluded.skeleton, closing_line = excluded.closing_line,
    cta = excluded.cta, caption = excluded.caption, carousel_slides = excluded.carousel_slides,
    archived_at = null, updated_at = now()
  returning id into new_content_id;

  update public.pairings set selected = (id = source_pairing.id) where saved_post_id = source_pairing.saved_post_id;
  update public.saved_posts set status = 'Used', updated_at = now() where id = source_pairing.saved_post_id;
  return query select * from public.dashboard_content_items where "id" = new_content_id::text;
end;
$$;
