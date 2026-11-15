import {readFile,writeFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {uuid_ossp} from '@electric-sql/pglite/contrib/uuid_ossp';
import {restoreExport} from '../tests/helpers/restore-export.mjs';
import {buildFeatureMigration} from './feature-migrations.mjs';
import {seedExportScenarios,runExportScenarios,financialSnapshot} from './schema-export-scenarios.mjs';
const input=process.argv[2];
if(!input) throw new Error('Usage: node scripts/check-schema-export.mjs /path/to/export.json');
let schema=JSON.parse(await readFile(input,'utf8'));
if(Array.isArray(schema)) schema=JSON.parse(schema[0].schema_export);
const db=new PGlite({extensions:{uuid_ossp}});
try {
 await restoreExport(db,schema);
 console.log(`Restored ${schema.tables.length} public tables and ${schema.functions.length} functions in disposable PGlite.`);
 await seedExportScenarios(db);
 const before=await runExportScenarios(db,"exported_schema");
 const saved=JSON.stringify(await financialSnapshot(db));
 const upgrade=await buildFeatureMigration();
 await db.exec(upgrade);
 console.log('Prepared migration applied successfully.');
 await db.exec(upgrade);
 console.log('Second application succeeded. No live database was contacted.');
 if(JSON.stringify(await financialSnapshot(db))!==saved)throw new Error('Upgrade altered existing synthetic financial records');
 console.log('Existing synthetic balances, ledger, both holdings tables and investment terms were preserved.');
 const after=await runExportScenarios(db,'prepared_upgrade');
 const report={before,after};
 if(process.argv[3])await writeFile(process.argv[3],JSON.stringify(report,null,2));
 console.log(JSON.stringify(report,null,2));
 if(after.failed) process.exitCode=2;
} catch(error) {console.error('Compatibility check failed:',error.message);process.exitCode=1;}
finally {await db.close();}
