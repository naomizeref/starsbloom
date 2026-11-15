import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { buildFeatureMigration, featureMigrations } from './feature-migrations.mjs';
const output = new URL('../dist/bloom-feature-upgrade.sql', import.meta.url);
await mkdir(new URL('../dist/', import.meta.url), { recursive: true });
await writeFile(output, await buildFeatureMigration());
console.log(`Prepared ${fileURLToPath(output)} (${featureMigrations.length} ordered migrations). No database was contacted.`);
