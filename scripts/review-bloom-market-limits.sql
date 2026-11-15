-- READ ONLY, Bloom pqbivesimvmzdwbrqprj. Catalog/quote diagnostics only.
-- Does not expose account records, balances, documents or credentials.
select id, name, min_copy_amount, minimum_copy_amount,
       max_copy_amount, maximum_copy_amount
from public.traders
where min_copy_amount is distinct from minimum_copy_amount
   or max_copy_amount is distinct from maximum_copy_amount
order by name, id;

select symbol, updated_at,
       case when price is null or price <= 0 or price::text in ('NaN','Infinity','-Infinity') then 'invalid price'
            when updated_at is null then 'missing timestamp'
            when updated_at > now() then 'future timestamp'
            when updated_at <= now() - interval '15 minutes' then 'stale'
            else 'fresh by timestamp; source still needs verification'
       end as quote_status
from public.market_prices order by symbol;
