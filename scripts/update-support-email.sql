-- Run once in the existing Bloom Supabase SQL editor after deploying the address update.
-- Changes only the retired support/reply-to addresses. Other settings are preserved.
begin;
update public.app_settings
set value = jsonb_set(value, '{supportEmail}', to_jsonb('support@joinbloom.online'::text))
where key = 'business'
  and lower(btrim(value->>'supportEmail')) in ('suport@bloomsinvest.co', 'support@bloomsinvest.co');

update public.app_settings
set value = jsonb_set(value, '{replyToEmail}', to_jsonb('support@joinbloom.online'::text))
where key = 'business'
  and lower(btrim(value->>'replyToEmail')) in ('suport@bloomsinvest.co', 'support@bloomsinvest.co');
commit;
