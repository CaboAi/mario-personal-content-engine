create table if not exists public.content_batches (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  source_url text,
  timezone text not null default 'America/Chihuahua',
  starts_on date,
  ends_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.content_batches enable row level security;

alter table public.content_items
  add column if not exists batch_id uuid references public.content_batches(id) on delete set null,
  add column if not exists planned_for date,
  add column if not exists source_reference text,
  add column if not exists hook_rationale text,
  add column if not exists production_notes text,
  add column if not exists privacy_notes text,
  add column if not exists publication_clearance boolean not null default true,
  add column if not exists import_key text;

create index if not exists content_items_batch_planned_for_idx
  on public.content_items(batch_id, planned_for);
create unique index if not exists content_items_import_key_unique_idx
  on public.content_items(import_key)
  where import_key is not null;

drop index if exists public.content_items_one_active_project_idx;

create or replace function public.require_publication_clearance()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'Posted'::public.production_status and not new.publication_clearance then
    raise exception 'Content requires personal privacy approval before it can be posted';
  end if;
  return new;
end;
$$;

drop trigger if exists content_items_require_publication_clearance on public.content_items;
create trigger content_items_require_publication_clearance
before insert or update of status on public.content_items
for each row execute function public.require_publication_clearance();

create or replace view public.dashboard_content_batches with (security_invoker = true) as
select
  cb.id::text as "id",
  cb.title as "title",
  cb.description as "description",
  cb.source_url as "sourceUrl",
  cb.timezone as "timezone",
  cb.starts_on as "startsOn",
  cb.ends_on as "endsOn",
  cb.created_at as "createdAt"
from public.content_batches cb;

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
  ci.publication_clearance as "publicationClearance"
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
    saved_post_id, pairing_id, brand_source_id, title, source_title, format, goal, pillars,
    status, spoken_hooks, on_screen_hooks, selected_hook, selected_on_screen_hook,
    test_variable, hypothesis, skeleton, closing_line, cta, caption, carousel_slides,
    platforms, archived_at
  ) values (
    source_pairing.saved_post_id, source_pairing.id, source_pairing.brand_source_id,
    p_content->>'title', p_content->>'sourceTitle', p_content->>'format', p_content->>'goal',
    array(select jsonb_array_elements_text(p_content->'pillars')), initial_status,
    p_content->'spokenHooks', p_content->'onScreenHooks', p_content->>'selectedHook',
    p_content->>'selectedOnScreenHook', p_content->>'testVariable', p_content->>'hypothesis',
    p_content->'skeleton', p_content->>'closingLine', nullif(p_content->>'cta', ''),
    nullif(p_content->>'caption', ''), coalesce(p_content->'carouselSlides', '[]'::jsonb),
    array(select jsonb_array_elements_text(p_content->'platforms')), null
  ) on conflict (pairing_id) do update set
    title = excluded.title, format = excluded.format, goal = excluded.goal, pillars = excluded.pillars,
    status = excluded.status, spoken_hooks = excluded.spoken_hooks, on_screen_hooks = excluded.on_screen_hooks,
    selected_hook = excluded.selected_hook, selected_on_screen_hook = excluded.selected_on_screen_hook,
    test_variable = excluded.test_variable, hypothesis = excluded.hypothesis, skeleton = excluded.skeleton,
    closing_line = excluded.closing_line, cta = excluded.cta, caption = excluded.caption,
    carousel_slides = excluded.carousel_slides, archived_at = null, updated_at = now()
  returning id into new_content_id;

  update public.pairings set selected = (id = source_pairing.id) where saved_post_id = source_pairing.saved_post_id;
  update public.saved_posts set status = 'Used', updated_at = now() where id = source_pairing.saved_post_id;
  return query select * from public.dashboard_content_items where "id" = new_content_id::text;
end;
$$;

create or replace function public.archive_content_item(p_content_id uuid, p_archived boolean default true)
returns setof public.dashboard_content_items
language plpgsql
security definer
set search_path = ''
as $$
declare source_save_id uuid;
begin
  select saved_post_id into source_save_id from public.content_items where id = p_content_id for update;
  if not found then raise exception 'Content item not found'; end if;
  update public.content_items set archived_at = case when p_archived then now() else null end, updated_at = now() where id = p_content_id;
  if source_save_id is not null then
    update public.saved_posts set status = case
      when p_archived and not exists (select 1 from public.content_items where saved_post_id = source_save_id and archived_at is null) then 'Needs Review'::public.save_status
      else 'Used'::public.save_status end, updated_at = now() where id = source_save_id;
  end if;
  return query select * from public.dashboard_content_items where "id" = p_content_id::text;
end;
$$;

revoke all on public.content_batches, public.dashboard_content_batches from anon, authenticated;
revoke all on function public.promote_pairing(uuid, jsonb), public.archive_content_item(uuid, boolean) from public, anon, authenticated;
grant execute on function public.promote_pairing(uuid, jsonb), public.archive_content_item(uuid, boolean) to service_role;
