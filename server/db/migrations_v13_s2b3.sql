-- Sprint 2 Block 3 — EOS instant sync: timer demoted to 60-min fallback
-- (primary path is webhook POST /api/integrations/eos/items/import on approval)

update system_settings
set value = '60',
    description = 'Fallback interval (minutes) for automatic EOS → Item Master sync. Primary path is the approval webhook; this catches missed pushes when ERP was down.',
    updated_at = now()
where key = 'eos_auto_sync_minutes'
  and value in ('30', '60');

insert into system_settings (key, value, description)
values (
  'eos_auto_sync_minutes',
  '60',
  'Fallback interval (minutes) for automatic EOS → Item Master sync. Primary path is the approval webhook; this catches missed pushes when ERP was down.'
)
on conflict (key) do nothing;

notify pgrst, 'reload schema';
