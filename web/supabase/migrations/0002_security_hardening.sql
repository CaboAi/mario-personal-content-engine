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

  if source_pairing.id is null then
    raise exception 'Pairing not found';
  end if;
  if source_pairing.privacy_status <> 'Clear' then
    raise exception 'Pairing requires privacy confirmation';
  end if;

  insert into public.content_items (
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

  update public.pairings
  set selected = (id = source_pairing.id)
  where saved_post_id = source_pairing.saved_post_id;

  update public.saved_posts
  set status = 'Used', updated_at = now()
  where id = source_pairing.saved_post_id;

  return query
  select * from public.dashboard_content_items where "id" = new_content_id::text;
end;
$$;

revoke all on function public.promote_pairing(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.promote_pairing(uuid, jsonb) to service_role;
