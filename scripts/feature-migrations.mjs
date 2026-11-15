import { readFile } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
export const featureMigrations = [
  'bloom_feature_schema.sql',
  'kyc_admin_helper_fix.sql',
  'investment_functions.sql',
  'copytrade_functions.sql',
  'transaction_functions.sql',
  'deposit_proofs_storage_setup.sql',
  'gift_card_deposits.sql',
  'kyc_image_review.sql',
  'account_suspension.sql',
  'account_position_suspension.sql',
  'bloom_feature_guards.sql',
  'bloom_export_compatibility.sql',
];
export async function buildFeatureMigration() {
const parts = await Promise.all(featureMigrations.map(async file => {
  const source = await readFile(new URL(file, root), 'utf8');
  return `\n-- SOURCE: ${file}\n${source.replace(/^(?:begin|commit);\s*$/gm, '')}`;
}));
return "-- Bloom feature upgrade: review and apply to a staging database first.\n-- Requires the existing Bloom core/master schema. All steps commit together.\nbegin;\n" + parts.join("\n") + "\ncommit;\n";
}
