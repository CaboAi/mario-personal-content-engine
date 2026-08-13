alter table public.content_items
  add column if not exists full_script text,
  add column if not exists script_risk_lines jsonb not null default '[]'::jsonb;

alter table public.content_items
  drop constraint if exists content_items_script_risk_lines_array_check;
alter table public.content_items
  add constraint content_items_script_risk_lines_array_check
  check (jsonb_typeof(script_risk_lines) = 'array');

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
  ci.script_risk_lines as "scriptRiskLines"
from public.content_items ci;

revoke all on public.dashboard_content_items from anon, authenticated;

create or replace function public.save_content_full_script(
  p_content_id uuid,
  p_full_script text,
  p_risk_lines jsonb
)
returns setof public.dashboard_content_items
language plpgsql
security definer
set search_path = ''
as $$
begin
  if length(trim(coalesce(p_full_script, ''))) < 80 then
    raise exception 'Full script is too short';
  end if;
  if jsonb_typeof(p_risk_lines) <> 'array' or jsonb_array_length(p_risk_lines) > 5 then
    raise exception 'Risk lines must be an array with no more than five items';
  end if;

  update public.content_items
  set full_script = trim(p_full_script),
      script_risk_lines = p_risk_lines,
      updated_at = now()
  where id = p_content_id
    and archived_at is null
    and status <> 'Posted';

  if not found then raise exception 'Active content item not found'; end if;
  return query select * from public.dashboard_content_items
  where "id" = p_content_id::text;
end;
$$;

revoke all on function public.save_content_full_script(uuid, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.save_content_full_script(uuid, text, jsonb)
  to service_role;
