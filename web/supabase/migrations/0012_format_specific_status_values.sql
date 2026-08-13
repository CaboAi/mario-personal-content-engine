-- Enum additions must commit before a later migration can safely use the new
-- values in data updates, constraints, and functions.
alter type public.production_status add value if not exists 'Concept Ready';
alter type public.production_status add value if not exists 'Outline Ready';
alter type public.production_status add value if not exists 'Drafting';
alter type public.production_status add value if not exists 'Final Copy';
