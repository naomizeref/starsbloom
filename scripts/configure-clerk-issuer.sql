-- Run AFTER clerk_auth_migration.sql. This issuer comes from Bloom's supplied
-- production publishable key. Also add this Clerk provider in Supabase Auth.
insert into bloom_auth.issuers(issuer,provider)
values('https://clerk.joinbloom.online','clerk')
on conflict (issuer) do nothing;
