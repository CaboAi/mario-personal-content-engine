create or replace function public.apply_save_analysis(
  p_saved_post_id uuid,
  p_analysis jsonb
)
returns setof public.dashboard_saved_posts
language plpgsql
security definer
set search_path = ''
as $$
declare
  source_save public.saved_posts%rowtype;
  source_record public.brand_sources%rowtype;
  pairing jsonb;
  pairings jsonb := coalesce(p_analysis->'pairings', '[]'::jsonb);
  pairing_count integer;
  pairing_rank integer := 0;
begin
  select * into source_save
  from public.saved_posts
  where id = p_saved_post_id
  for update;

  if source_save.id is null then
    raise exception 'Save not found';
  end if;
  if source_save.status = 'Used' then
    raise exception 'This save already has a production item';
  end if;
  if jsonb_typeof(pairings) <> 'array' then
    raise exception 'Analysis pairings must be an array';
  end if;

  pairing_count := jsonb_array_length(pairings);
  if pairing_count > 3 then
    raise exception 'Analysis cannot contain more than three pairings';
  end if;
  if coalesce(nullif(trim(p_analysis->>'frameworkDna'), ''), '') = ''
    or coalesce(nullif(trim(p_analysis->>'hookMechanics'), ''), '') = ''
    or coalesce(nullif(trim(p_analysis->>'visualPacing'), ''), '') = '' then
    raise exception 'Analysis is missing required delivery fields';
  end if;

  -- A non-Used save has no active Production item. Clear every stale pairing,
  -- including a selection left by an archived draft, before assigning ranks.
  -- Archived content survives because content_items.pairing_id uses ON DELETE SET NULL.
  delete from public.pairings
  where saved_post_id = p_saved_post_id;

  for pairing in select value from jsonb_array_elements(pairings)
  loop
    pairing_rank := pairing_rank + 1;

    select * into source_record
    from public.brand_sources
    where id = (pairing->>'brandSourceId')::uuid
      and status = 'Verified'
      and privacy_status = 'Clear'
    for share;

    if source_record.id is null then
      raise exception 'Pairing % references a source that is not Clear and Verified', pairing_rank;
    end if;
    if coalesce(nullif(trim(pairing->>'title'), ''), '') = ''
      or coalesce(nullif(trim(pairing->>'rationale'), ''), '') = ''
      or coalesce(nullif(trim(pairing->>'direction'), ''), '') = '' then
      raise exception 'Pairing % is missing required fields', pairing_rank;
    end if;

    insert into public.pairings (
      saved_post_id, brand_source_id, title, source_type, source_title,
      source_url, rationale, direction, privacy_status, rank, recommended,
      selection_role, fit_score
    ) values (
      p_saved_post_id, source_record.id, pairing->>'title', source_record.source_type,
      source_record.title, source_record.source_url, pairing->>'rationale',
      pairing->>'direction', source_record.privacy_status, pairing_rank, pairing_rank = 1,
      pairing->>'selectionRole', (pairing->>'fitScore')::numeric
    );
  end loop;

  update public.saved_posts
  set
    framework_dna = p_analysis->>'frameworkDna',
    hook_mechanics = p_analysis->>'hookMechanics',
    visual_pacing = p_analysis->>'visualPacing',
    prohibited_transfer = coalesce(
      array(select jsonb_array_elements_text(p_analysis->'prohibitedTransfer')),
      '{}'::text[]
    ),
    creator_topic_terms = coalesce(
      array(select jsonb_array_elements_text(p_analysis->'creatorTopicTerms')),
      '{}'::text[]
    ),
    analysis_method = p_analysis->>'analysisMethod',
    analysis_evidence_summary = p_analysis->>'analysisEvidenceSummary',
    status = case when pairing_count > 0 then 'Needs Review'::public.save_status else 'Blocked'::public.save_status end,
    analyzed_at = now(),
    updated_at = now()
  where id = p_saved_post_id;

  return query
  select * from public.dashboard_saved_posts
  where "id" = p_saved_post_id::text;
end;
$$;

revoke all on function public.apply_save_analysis(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.apply_save_analysis(uuid, jsonb) to service_role;
