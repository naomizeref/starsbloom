-- READ ONLY: aggregate checks against Bloom pqbivesimvmzdwbrqprj.
-- Run before any upgrade. Returns no emails, documents, wallet secrets or balances.
-- Counts are diagnostic; nonzero findings require review, not automatic deletion/merging.
select jsonb_pretty(jsonb_build_object(
  'account_roles', (select jsonb_agg(s) from (select role,status,count(*) as accounts from public.users group by role,status) s),
  'kyc_duplicate_user_groups', (select count(*) from (select user_id from public.kyc_submissions group by user_id having count(*)>1) s),
  'legacy_portfolio_rows', (select count(*) from public.portfolio_positions),
  'current_portfolio_rows', (select count(*) from public.portfolio_assets),
  'portfolio_overlap_user_symbol_pairs', (select count(*) from public.portfolio_positions p where exists(select 1 from public.portfolio_assets a where a.user_id=p.user_id and a.symbol=p.symbol)),
  'current_portfolio_duplicate_user_symbol_groups', (select count(*) from (select user_id,symbol from public.portfolio_assets group by user_id,symbol having count(*)>1) s),
  'legacy_portfolio_duplicate_user_symbol_groups', (select count(*) from (select user_id,symbol from public.portfolio_positions group by user_id,symbol having count(*)>1) s),
  'trader_limit_alias_mismatches', (select count(*) from public.traders where min_copy_amount is distinct from minimum_copy_amount or max_copy_amount is distinct from maximum_copy_amount),
  'investments_needing_payout_reconciliation', (select count(*) from public.active_investments where lower(status)='completed' and payout_transaction_id is null and not coalesce(payout_completed,false)),
  'copies_needing_payout_reconciliation', (select count(*) from public.copy_trades where lower(status)='completed' and payout_transaction_id is null and not coalesce(payout_completed,false)),
  'pending_claims_without_current_campaign', (select count(*) from public.airdrop_claims c where c.status='Pending' and not exists(select 1 from public.airdrops a where a.id=c.airdrop_id)),
  'duplicate_claim_user_campaign_groups', (select count(*) from (select user_id,airdrop_id from public.airdrop_claims where airdrop_id is not null group by user_id,airdrop_id having count(*)>1) s),
  'missing_or_stale_market_prices', (select count(*) from public.market_prices where price is null or price<=0 or price::text in ('NaN','Infinity','-Infinity') or updated_at is null or updated_at<now()-interval '15 minutes'),
  'market_price_rows', (select count(*) from public.market_prices),
  'proof_bucket_configuration', (select jsonb_agg(jsonb_build_object('id',id,'public',public,'max_bytes',file_size_limit,'allowed_types',allowed_mime_types)) from storage.buckets where id in ('kyc-documents','deposit-proofs','gift-card-proofs'))
)) as bloom_preflight;
