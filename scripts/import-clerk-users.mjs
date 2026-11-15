import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import dotenv from 'dotenv';
import { createClerkClient } from '@clerk/backend';
import { createClient } from '@supabase/supabase-js';

export function parseClerkExport(raw) {
  let parsed;
  try { parsed = JSON.parse(raw); } catch { throw new Error("Invalid JSON export. No accounts imported."); }
  const payload = Array.isArray(parsed) && parsed.length===1 && 'clerk_users' in parsed[0] ? parsed[0].clerk_users : parsed;
  let rows;
  try { rows = typeof payload==='string' ? JSON.parse(payload) : payload; } catch { throw new Error('Invalid export payload. No accounts imported.'); }
  if (!Array.isArray(rows) || !rows.length) throw new Error('Export contains no accounts.');
  const emails = new Set(), ids = new Set();
  return rows.map((row,index) => {
    const email = typeof row.email==='string' ? row.email.trim().toLowerCase() : '';
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(row.id) ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || row.emailVerified!==true || row.authEmailMatches!==true || row.banned!==false ||
        typeof row.passwordDigest!=='string' || !/^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(row.passwordDigest)) {
      throw new Error(`Export row ${index+1} needs review: require a matching, verified, non-banned legacy account with a bcrypt password.`);
    }
    if (ids.has(row.id) || emails.has(email)) throw new Error(`Duplicate account in export row ${index+1}; nothing imported.`);
    ids.add(row.id); emails.add(email);
    return { externalId: row.id, emailAddress: [email], passwordDigest: row.passwordDigest, passwordHasher: 'bcrypt',
      ...(row.firstName ? { firstName: row.firstName } : {}), ...(row.lastName ? { lastName: row.lastName } : {}) };
  });
}

export async function importClerkUsers(rows, clerk, db, issuer) {
  // Validate ALL destination conflicts before writing. A second run can resume
  // a partial import, but never overwrites an existing password or account link.
  const planned = [];
  for (const row of rows) {
    const [byId, byEmail] = await Promise.all([
      clerk.users.getUserList({ externalId: [row.externalId], limit: 2 }),
      clerk.users.getUserList({ emailAddress: row.emailAddress, limit: 2 }),
    ]);
    const user = byId.data[0];
    if (byId.totalCount>1 || byEmail.totalCount>1 || (byEmail.data[0] && byEmail.data[0].id!==user?.id) ||
        (user && (user.externalId!==row.externalId ||
          !user.emailAddresses.some(e => e.id===user.primaryEmailAddressId && e.emailAddress.toLowerCase()===row.emailAddress[0] && e.verification?.status==='verified')))) {
      throw new Error(`Destination conflict for import row ${planned.length+1}. No accounts were imported; review the existing Clerk account.`);
    }
    planned.push({ row, user });
  }
  let created=0, linked=0;
  for (const entry of planned) {
    const user = entry.user || await clerk.users.createUser(entry.row);
    if (!entry.user) created++;
    const { error } = await db.rpc('bloom_provision_clerk_user', { p_issuer: issuer, p_subject: user.id,
      p_legacy_id: entry.row.externalId, p_email: entry.row.emailAddress[0], p_name: [entry.row.firstName,entry.row.lastName].filter(Boolean).join(' ') });
    if (error) throw new Error(`Account linking failed after ${linked} accounts. Fix database/issuer configuration, then rerun the same export to resume.`);
    linked++;
  }
  return { created, linked };
}

async function main() {
  dotenv.config({path:[".env.local",".env"],quiet:true});
  const args=process.argv.slice(2), file=args.find(value=>!value.startsWith('--'));
  if (!file || args.some(value=>value.startsWith('--') && !['--apply','--production'].includes(value))) throw new Error('Usage: node scripts/import-clerk-users.mjs /private/export.json [--apply --production]');
  const rows=parseClerkExport(await readFile(file,'utf8'));
  if (!args.includes('--apply')) {
    console.log(`Validated ${rows.length} accounts locally. Dry run: no network requests or account changes. Add --apply to import.`);
    return;
  }
  const secretKey=process.env.CLERK_SECRET_KEY, issuer=process.env.CLERK_JWT_ISSUER;
  const url=process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL, key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secretKey || !issuer || !url || !key) throw new Error('Set CLERK_SECRET_KEY, CLERK_JWT_ISSUER, SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the private environment.');
  if (secretKey.startsWith('sk_live_') && !args.includes('--production')) throw new Error('Production import requires --apply --production after reviewing the dry run.');
  const clerk=createClerkClient({secretKey});
  const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  console.log(JSON.stringify(await importClerkUsers(rows,clerk,db,issuer.replace(/\/$/,''))));
}
if (process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    // Provider errors can contain emails or password digests; never print their body.
    console.error(error.clerkError ? 'Clerk import failed. Review provider configuration and retry; imported accounts will be reused.' : error.message);
    process.exitCode=1;
  });
}
