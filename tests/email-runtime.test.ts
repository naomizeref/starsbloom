import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, readFile, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import ts from 'typescript';

test('compiled authentication and email endpoints load in plain Node ESM on the deployment runtime', async () => {
  const root = await mkdtemp(join(tmpdir(), 'bloom-email-runtime-'));
  try {
    await writeFile(join(root, 'package.json'), '{"type":"module"}');
    await symlink(join(process.cwd(), 'node_modules'), join(root, 'node_modules'), 'dir');
    for (const file of ['api/send-email.ts', 'api/_clerkAuth.ts', 'api/_clerkSignupProfile.ts', 'api/clerk-session.ts', 'api/auth-codes.ts', 'api/_emailDelivery.ts', 'api/_emailTemplates.ts', 'src/constants/countries.ts', 'src/lib/emailEvents.ts', 'src/lib/emailTemplates.ts']) {
      const target = join(root, file.replace(/\.ts$/, '.js'));
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, ts.transpileModule(await readFile(file, 'utf8'), {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
      }).outputText);
    }
    const output = execFileSync(process.execPath, ['--input-type=module', '-e', `
      import send from './api/send-email.js';
      import codes from './api/auth-codes.js';
      import clerkSession from './api/clerk-session.js';
      const statuses = [];
      const res = {setHeader(){}, status(s){statuses.push(s); return this;}, json(){}};
      await send({method:'GET'}, res);
      await codes({method:'GET'}, res);
      await clerkSession({method:'GET'}, res);
      console.log(JSON.stringify(statuses));
    `], { cwd: root, encoding: 'utf8' });
    assert.deepEqual(JSON.parse(output), [405, 405, 405]);
  } finally { await rm(root, { recursive: true, force: true }); }
});
