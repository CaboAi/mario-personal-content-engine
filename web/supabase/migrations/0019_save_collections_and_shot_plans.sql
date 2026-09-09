alter table public.saved_posts
  add column if not exists collection_ids text[] not null default '{}',
  add column if not exists collection_labels text[] not null default '{}',
  add column if not exists collection_purpose text not null default 'reference',
  add column if not exists analysis_transcript text,
  add column if not exists analysis_frames jsonb not null default '[]'::jsonb,
  add column if not exists analysis_duration_seconds numeric,
  add column if not exists analysis_cut_count integer,
  add column if not exists analysis_frame_stats jsonb not null default '{}'::jsonb,
  add column if not exists shot_plan_skeleton jsonb,
  add column if not exists shot_plan jsonb,
  add column if not exists shot_plan_source_id uuid references public.brand_sources(id) on delete set null,
  add column if not exists shot_plan_generated_at timestamptz;

alter table public.saved_posts
  drop constraint if exists saved_posts_collection_purpose_check;
alter table public.saved_posts
  add constraint saved_posts_collection_purpose_check
    check (collection_purpose in ('reference', 'recreate'));

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
  sp.analysis_evidence_summary as "analysisEvidenceSummary",
  sp.collection_ids as "collectionIds", sp.collection_labels as "collectionLabels",
  sp.collection_purpose as "collectionPurpose", sp.analysis_transcript as "analysisTranscript",
  sp.analysis_frames as "analysisFrames", sp.analysis_duration_seconds as "analysisDurationSeconds",
  sp.analysis_cut_count as "analysisCutCount", sp.analysis_frame_stats as "analysisFrameStats",
  sp.shot_plan_skeleton as "shotPlanSkeleton", sp.shot_plan as "shotPlan",
  sp.shot_plan_source_id::text as "shotPlanSourceId", sp.shot_plan_generated_at as "shotPlanGeneratedAt"
from public.saved_posts sp
left join public.pairings p on p.saved_post_id = sp.id
left join public.brand_sources bs on bs.id = p.brand_source_id
group by sp.id;

revoke all on public.dashboard_saved_posts from anon, authenticated;
