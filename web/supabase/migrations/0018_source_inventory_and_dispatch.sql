alter table public.brand_sources
  add column if not exists retired boolean not null default false,
  add column if not exists dispatch_what_happened text,
  add column if not exists dispatch_specific_detail text,
  add column if not exists dispatch_decision text,
  add column if not exists dispatch_occurred_on date,
  add column if not exists dispatch_next_implication text,
  add column if not exists dispatch_freshness_days smallint;

update public.brand_sources
set retired = true
where source_type = 'Existing Content' or privacy_status = 'Needs confirmation';

alter table public.brand_sources
  drop constraint if exists brand_sources_source_type_check,
  drop constraint if exists brand_sources_dispatch_required_check;
alter table public.brand_sources
  add constraint brand_sources_source_type_check
    check (source_type in ('Story', 'Daily Entry', 'Existing Content', 'Dispatch')),
  add constraint brand_sources_dispatch_required_check
    check (source_type <> 'Dispatch' or (
      nullif(trim(dispatch_what_happened), '') is not null and
      nullif(trim(dispatch_specific_detail), '') is not null and
      nullif(trim(dispatch_decision), '') is not null and
      dispatch_occurred_on is not null and
      nullif(trim(dispatch_next_implication), '') is not null and
      dispatch_freshness_days = 30
    ));

alter table public.pairings
  drop constraint if exists pairings_source_type_check;
alter table public.pairings
  add constraint pairings_source_type_check
    check (source_type in ('Story', 'Daily Entry', 'Existing Content', 'Dispatch'));

alter table public.content_items alter column mode drop default;

create or replace view public.dashboard_brand_sources with (security_invoker = true) as
select
  bs.id::text as "id", bs.source_type as "sourceType", bs.title as "title",
  bs.core_truth as "coreTruth", bs.story_evidence as "storyEvidence",
  bs.privacy_status as "privacyStatus", bs.pillars as "pillars", bs.source_url as "sourceUrl",
  bs.status as "status", bs.updated_at as "updatedAt", count(ci.id)::integer as "usageCount",
  bs.source_external_id as "sourceExternalId", bs.created_at as "createdAt",
  bs.retired as "retired", bs.dispatch_what_happened as "dispatchWhatHappened",
  bs.dispatch_specific_detail as "dispatchSpecificDetail", bs.dispatch_decision as "dispatchDecision",
  bs.dispatch_occurred_on as "dispatchOccurredOn", bs.dispatch_next_implication as "dispatchNextImplication",
  bs.dispatch_freshness_days as "dispatchFreshnessDays"
from public.brand_sources bs
left join public.content_items ci on ci.brand_source_id = bs.id
group by bs.id;

create or replace view public.dashboard_saved_posts with (security_invoker = true) as
select
  sp.id::text as "id", sp.author as "author", sp.shortcode as "shortcode", sp.url as "url",
  sp.content_type as "contentType", sp.caption as "caption", sp.duration_seconds as "durationSeconds",
  sp.saved_at as "savedAt", sp.status::text as "status", sp.framework_dna as "frameworkDna",
  sp.hook_mechanics as "hookMechanics", sp.visual_pacing as "visualPacing",
  sp.prohibited_transfer as "prohibitedTransfer",
  coalesce(jsonb_agg(jsonb_build_object(
    'id', p.id::text, 'brandSourceId', p.brand_source_id::text, 'title', p.title,
    'sourceType', p.source_type, 'sourceTitle', p.source_title, 'sourceUrl', p.source_url,
    'coreTruth', bs.core_truth, 'storyEvidence', bs.story_evidence, 'pillars', bs.pillars,
    'retired', bs.retired, 'dispatchOccurredOn', bs.dispatch_occurred_on,
    'dispatchFreshnessDays', bs.dispatch_freshness_days, 'rationale', p.rationale,
    'direction', p.direction, 'privacyStatus', p.privacy_status, 'recommended', p.recommended,
    'selectionRole', p.selection_role, 'fitScore', p.fit_score
  ) order by p.rank) filter (where p.id is not null), '[]'::jsonb) as "pairings",
  sp.creator_topic_terms as "creatorTopicTerms", sp.analysis_method as "analysisMethod",
  sp.analysis_evidence_summary as "analysisEvidenceSummary"
from public.saved_posts sp
left join public.pairings p on p.saved_post_id = sp.id
left join public.brand_sources bs on bs.id = p.brand_source_id
group by sp.id;

create or replace function public.apply_save_analysis(p_saved_post_id uuid, p_analysis jsonb)
returns setof public.dashboard_saved_posts
language plpgsql security definer set search_path = '' as $$
declare
  source_save public.saved_posts%rowtype; source_record public.brand_sources%rowtype;
  pairing jsonb; pairings jsonb := coalesce(p_analysis->'pairings', '[]'::jsonb);
  pairing_count integer; pairing_rank integer := 0;
begin
  select * into source_save from public.saved_posts where id = p_saved_post_id for update;
  if source_save.id is null then raise exception 'Save not found'; end if;
  if source_save.status = 'Used' then raise exception 'This save already has a production item'; end if;
  if jsonb_typeof(pairings) <> 'array' then raise exception 'Analysis pairings must be an array'; end if;
  pairing_count := jsonb_array_length(pairings);
  if pairing_count > 3 then raise exception 'Analysis cannot contain more than three pairings'; end if;
  if coalesce(nullif(trim(p_analysis->>'frameworkDna'), ''), '') = ''
    or coalesce(nullif(trim(p_analysis->>'hookMechanics'), ''), '') = ''
    or coalesce(nullif(trim(p_analysis->>'visualPacing'), ''), '') = '' then
    raise exception 'Analysis is missing required delivery fields';
  end if;
  delete from public.pairings where saved_post_id = p_saved_post_id and selected = false;
  for pairing in select value from jsonb_array_elements(pairings) loop
    pairing_rank := pairing_rank + 1;
    select * into source_record from public.brand_sources
    where id = (pairing->>'brandSourceId')::uuid and status = 'Verified' and privacy_status = 'Clear'
      and retired = false
      and (source_type <> 'Dispatch' or dispatch_occurred_on + (dispatch_freshness_days * interval '1 day') >= current_date)
    for share;
    if source_record.id is null then
      raise exception 'Pairing % references a source that is retired, expired, or not Clear and Verified', pairing_rank;
    end if;
    if coalesce(nullif(trim(pairing->>'title'), ''), '') = '' or coalesce(nullif(trim(pairing->>'rationale'), ''), '') = '' or coalesce(nullif(trim(pairing->>'direction'), ''), '') = '' then
      raise exception 'Pairing % is missing required fields', pairing_rank;
    end if;
    insert into public.pairings (saved_post_id, brand_source_id, title, source_type, source_title, source_url, rationale, direction, privacy_status, rank, recommended, selection_role, fit_score)
    values (p_saved_post_id, source_record.id, pairing->>'title', source_record.source_type, source_record.title, source_record.source_url, pairing->>'rationale', pairing->>'direction', source_record.privacy_status, pairing_rank, pairing_rank = 1, pairing->>'selectionRole', (pairing->>'fitScore')::numeric);
  end loop;
  update public.saved_posts set framework_dna = p_analysis->>'frameworkDna', hook_mechanics = p_analysis->>'hookMechanics', visual_pacing = p_analysis->>'visualPacing',
    prohibited_transfer = coalesce(array(select jsonb_array_elements_text(p_analysis->'prohibitedTransfer')), '{}'::text[]),
    creator_topic_terms = coalesce(array(select jsonb_array_elements_text(p_analysis->'creatorTopicTerms')), '{}'::text[]),
    analysis_method = p_analysis->>'analysisMethod', analysis_evidence_summary = p_analysis->>'analysisEvidenceSummary',
    status = case when pairing_count > 0 then 'Needs Review'::public.save_status else 'Blocked'::public.save_status end,
    analyzed_at = now(), updated_at = now() where id = p_saved_post_id;
  return query select * from public.dashboard_saved_posts where "id" = p_saved_post_id::text;
end;
$$;

create or replace function public.promote_pairing(p_pairing_id uuid, p_content jsonb)
returns setof public.dashboard_content_items
language plpgsql security definer set search_path = '' as $$
declare
  source_pairing public.pairings%rowtype; source_record public.brand_sources%rowtype;
  new_content_id uuid; initial_status public.production_status; requested_mode text;
begin
  select * into source_pairing from public.pairings where id = p_pairing_id for update;
  if source_pairing.id is null then raise exception 'Pairing not found'; end if;
  if source_pairing.privacy_status <> 'Clear' then raise exception 'Pairing requires privacy confirmation'; end if;
  select * into source_record from public.brand_sources where id = source_pairing.brand_source_id for share;
  if source_record.id is null then raise exception 'Mario source not found'; end if;
  if source_record.retired then raise exception 'Mario source is retired and cannot be used for generation'; end if;
  requested_mode := nullif(trim(p_content->>'mode'), '');
  if requested_mode is null then raise exception 'Content mode is required'; end if;
  if requested_mode = 'Dispatch' and source_record.source_type <> 'Dispatch' then raise exception 'Dispatch mode requires a current Dispatch source'; end if;
  if source_record.source_type = 'Dispatch' and requested_mode = 'Reflection' then raise exception 'Reflection mode cannot use a Dispatch source'; end if;
  if source_record.source_type = 'Dispatch' and source_record.dispatch_occurred_on + (source_record.dispatch_freshness_days * interval '1 day') < current_date then raise exception 'Dispatch source has expired'; end if;
  initial_status := case p_content->>'format' when 'POV / Realization' then 'Concept Ready'::public.production_status when 'Carousel' then 'Copy Ready'::public.production_status when 'Written Post' then 'Outline Ready'::public.production_status when 'Long-form' then 'Outline Ready'::public.production_status else 'Script Ready'::public.production_status end;
  insert into public.content_items (saved_post_id, pairing_id, brand_source_id, title, source_title, format, mode, goal, pillars, status, spoken_hooks, on_screen_hooks, selected_hook, selected_on_screen_hook, test_variable, hypothesis, skeleton, closing_line, cta, caption, carousel_slides, platforms, archived_at)
  values (source_pairing.saved_post_id, source_pairing.id, source_pairing.brand_source_id, p_content->>'title', p_content->>'sourceTitle', p_content->>'format', requested_mode, p_content->>'goal', array(select jsonb_array_elements_text(p_content->'pillars')), initial_status, p_content->'spokenHooks', p_content->'onScreenHooks', p_content->>'selectedHook', p_content->>'selectedOnScreenHook', p_content->>'testVariable', p_content->>'hypothesis', p_content->'skeleton', p_content->>'closingLine', nullif(p_content->>'cta', ''), nullif(p_content->>'caption', ''), coalesce(p_content->'carouselSlides', '[]'::jsonb), array(select jsonb_array_elements_text(p_content->'platforms')), null)
  on conflict (pairing_id) do update set title = excluded.title, format = excluded.format, mode = excluded.mode, goal = excluded.goal, pillars = excluded.pillars, status = excluded.status, spoken_hooks = excluded.spoken_hooks, on_screen_hooks = excluded.on_screen_hooks, selected_hook = excluded.selected_hook, selected_on_screen_hook = excluded.selected_on_screen_hook, test_variable = excluded.test_variable, hypothesis = excluded.hypothesis, skeleton = excluded.skeleton, closing_line = excluded.closing_line, cta = excluded.cta, caption = excluded.caption, carousel_slides = excluded.carousel_slides, archived_at = null, updated_at = now()
  returning id into new_content_id;
  update public.pairings set selected = (id = source_pairing.id) where saved_post_id = source_pairing.saved_post_id;
  update public.saved_posts set status = 'Used', updated_at = now() where id = source_pairing.saved_post_id;
  return query select * from public.dashboard_content_items where "id" = new_content_id::text;
end;
$$;

revoke all on function public.apply_save_analysis(uuid, jsonb), public.promote_pairing(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.apply_save_analysis(uuid, jsonb), public.promote_pairing(uuid, jsonb) to service_role;
