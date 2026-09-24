-- Consolidate configuration into the existing JSONB records store.
--
-- This migration is intentionally non-destructive. It creates one canonical
-- settings/config record only when that record does not already exist. The
-- application keeps the legacy tables as a read fallback until parity has
-- been verified in production.

insert into public.records (entity, id, data)
select
  'settings',
  'config',
  jsonb_strip_nulls(
    coalesce((
      select value
      from public.app_settings
      where key = 'config'
      limit 1
    ), '{}'::jsonb)
    || jsonb_build_object(
      'currencyRates', coalesce((
        select jsonb_object_agg(currency_code, rate_to_inr)
        from public.currency_rates
        where is_active = true
      ), '{}'::jsonb),
      'approvalThresholds', coalesce((
        select definition->'thresholds'
        from public.approval_rules
        where rule_key = 'approval-thresholds' and enabled = true
        limit 1
      ), '{}'::jsonb),
      'approvalRules', coalesce((
        select definition->'gates'
        from public.approval_rules
        where rule_key = 'approval-thresholds' and enabled = true
        limit 1
      ), '[]'::jsonb),
      'ownershipRules', coalesce((
        select definition->'ownershipRules'
        from public.lead_rules
        where rule_key = 'lead-routing-and-deadlines' and enabled = true
        limit 1
      ), '[]'::jsonb),
      'ownerRules', coalesce((
        select definition->'ownerRules'
        from public.lead_rules
        where rule_key = 'lead-routing-and-deadlines' and enabled = true
        limit 1
      ), '[]'::jsonb),
      'stateRegions', coalesce((
        select definition->'stateRegions'
        from public.lead_rules
        where rule_key = 'lead-routing-and-deadlines' and enabled = true
        limit 1
      ), '[]'::jsonb),
      'leadDeadlines', coalesce((
        select definition->'leadDeadlines'
        from public.lead_rules
        where rule_key = 'lead-routing-and-deadlines' and enabled = true
        limit 1
      ), '{}'::jsonb),
      'fastTrack', coalesce((
        select definition->'fastTrack'
        from public.lead_rules
        where rule_key = 'lead-routing-and-deadlines' and enabled = true
        limit 1
      ), '{}'::jsonb),
      'workflow', coalesce((
        select definition->'workflow'
        from public.workflow_rules
        where rule_key = 'workflow-and-gates' and enabled = true
        limit 1
      ), '{}'::jsonb),
      'customerClasses', coalesce((
        select definition->'customerClasses'
        from public.workflow_rules
        where rule_key = 'workflow-and-gates' and enabled = true
        limit 1
      ), '{}'::jsonb),
      'documentChecklists', coalesce((
        select definition->'documentChecklists'
        from public.workflow_rules
        where rule_key = 'workflow-and-gates' and enabled = true
        limit 1
      ), '{}'::jsonb),
      'kycItems', coalesce((
        select definition->'kycItems'
        from public.workflow_rules
        where rule_key = 'workflow-and-gates' and enabled = true
        limit 1
      ), '[]'::jsonb),
      'kycValidation', coalesce((
        select definition->'kycValidation'
        from public.workflow_rules
        where rule_key = 'workflow-and-gates' and enabled = true
        limit 1
      ), '{}'::jsonb),
      'classRules', coalesce((
        select definition->'classRules'
        from public.workflow_rules
        where rule_key = 'workflow-and-gates' and enabled = true
        limit 1
      ), '{}'::jsonb),
      'amberFee', coalesce((
        select definition->'amberFee'
        from public.workflow_rules
        where rule_key = 'workflow-and-gates' and enabled = true
        limit 1
      ), '{}'::jsonb),
      'workflowRequiredFields', coalesce((
        select definition->'requiredFields'
        from public.workflow_rules
        where rule_key = 'workflow-and-gates' and enabled = true
        limit 1
      ), '[]'::jsonb),
      'workflowRouteRules', coalesce((
        select definition->'routeRules'
        from public.workflow_rules
        where rule_key = 'workflow-and-gates' and enabled = true
        limit 1
      ), '[]'::jsonb)
    )
  )
where not exists (
  select 1
  from public.records
  where entity = 'settings' and id = 'config' and deleted_at is null
);

