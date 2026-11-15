import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, readFile, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import ts from 'typescript';

test('compiled market function starts in plain Node ESM without the development loader', async () => {
  const root = await mkdtemp(join(tmpdir(), 'bloom-market-runtime-'));
  try {
    await writeFile(join(root, 'package.json'), '{"type":"module"}');
    await symlink(join(process.cwd(), 'node_modules'), join(root, 'node_modules'), 'dir');
    // Vercel emits individual JS modules; a bundled/tsx test masks missing extensions.
    for (const file of ['api/markets.ts', 'api/_marketFeed.ts', 'src/lib/marketQuotes.ts']) {
      const target = join(root, file.replace(/\.ts$/, '.js'));
      await mkdir(dirname(target), { recursive: true });
      const compiled = ts.transpileModule(await readFile(file, 'utf8'), {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
      });
      await writeFile(target, compiled.outputText);
    }
    const output = execFileSync(process.execPath, ['--input-type=module', '-e', `
      import handler from './api/markets.js';
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;
      let status; let cache;
      const results = [];
      const res = {
        setHeader(name, value) { if(name === 'Cache-Control') cache = value; },
        status(value) { status = value; return this; },
        json(body) { results.push({status, cache, body}); }
      };
      await handler({}, res);
      process.env.SUPABASE_URL = 'https://fixture.supabase.co';
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-only-key';
      let syncs = 0;
      globalThis.fetch = async (input) => {
        const url = String(input instanceof Request ? input.url : input);
        if(url.startsWith('https://api.coingecko.com/')) return new Response(JSON.stringify([{
          id:'bitcoin', current_price:100, last_updated:new Date().toISOString(),
          high_24h:105, low_24h:95, price_change_percentage_24h:2, total_volume:1000000
        }]));
        if(url.startsWith('https://fixture.supabase.co/rest/v1/market_prices')) {
          syncs++;
          return new Response(null, {status:201});
        }
        throw new Error('Unexpected network request');
      };
      await handler({}, res);
      console.log(JSON.stringify({results, syncs}));
    `], { cwd: root, encoding: 'utf8' });
    const { results: [unconfigured, ready], syncs } = JSON.parse(output.trim());
    assert.equal(unconfigured.status, 503);
    assert.equal(unconfigured.body.code, 'MARKET_SYNC_NOT_CONFIGURED');
    assert.equal(unconfigured.cache, 'no-store');
    assert.equal(unconfigured.body.tradingReady, false);
    assert.deepEqual(unconfigured.body.crypto, []);
    assert.equal(ready.status, 200);
    assert.equal(ready.body.tradingReady, true);
    assert.equal(ready.body.crypto[0].symbol, 'BTC/USD');
    assert.equal(ready.cache, 'public, max-age=0, s-maxage=30');
    assert.equal(syncs, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
