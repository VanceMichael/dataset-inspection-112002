import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { start } from './source-server.mjs';

const read = async (name) => JSON.parse(await readFile(new URL(`source-data/${name}.json`, import.meta.url), 'utf8'));

test('资料在指定回放阶段从来源完整分页返回', async (t) => {
  const index = await read('index');
  const { server, url } = await start();
  t.after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  const overview = await (await fetch(url)).json();
  assert.deepEqual(overview.sources, index.sources);
  assert.equal(overview.stage, 1);
  const expectedRecords = new Map();
  for (const name of index.sources) {
    const records = await read(name);
    assert.ok(records.length > 0);
    assert.equal(new Set(records.map((entry) => entry.record)).size, records.length);
    expectedRecords.set(name, records);
  }
  for (let stage = 1; stage <= index.stages; stage += 1) {
    const control = await fetch(`${url}/control?stage=${stage}`, { method: 'POST' });
    assert.equal(control.status, 200);
    for (const name of index.sources) {
      const collected = [];
      let offset = 0;
      do {
        const response = await fetch(`${url}/source/${name}?offset=${offset}&limit=2`);
        assert.equal(response.status, 200);
        const page = await response.json();
        assert.equal(page.stage, stage);
        assert.ok(page.records.length <= 2);
        assert.ok(page.next === null || page.next > offset);
        collected.push(...page.records);
        offset = page.next;
      } while (offset !== null);
      assert.deepEqual(collected, expectedRecords.get(name).filter((entry) => entry.availableFrom <= stage));
    }
    for (const name of index.originals) {
      const response = await fetch(`${url}/original/${name}`);
      if (stage >= (index.originalStages[name] ?? 1)) {
        assert.equal(response.status, 200);
        const bytes = await response.arrayBuffer();
        assert.equal(createHash('sha256').update(Buffer.from(bytes)).digest('hex'), index.digests[name]);
      } else {
        assert.equal(response.status, 404);
      }
    }
  }
  assert.equal((await fetch(`${url}/control?stage=0`, { method: 'POST' })).status, 400);
  assert.equal((await fetch(`${url}/source/${index.sources[0]}?limit=0`)).status, 400);
  assert.equal((await fetch(`${url}/source/missing`)).status, 404);
  t.diagnostic(`${index.sources.length} 处来源、${index.stages} 个阶段、${index.originals.length} 份原件`);
});

test('领取方可查重试状态，网关保留部分交付凭证', async (t) => {
  const { server, url } = await start();
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const receive = (body) => fetch(url + '/sample/requests', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const request = { application: 'DS2', edition: 1, requestId: 'SM-19', materials: ['IMG12', 'INDEX4'] };
  const initial = await receive(request);
  assert.equal(initial.status, 200);
  assert.deepEqual((await initial.json()).items.map((item) => item.state), ['delivered','failed']);
  assert.equal((await receive(request)).status, 409);
  const receipt = await (await fetch(url + '/sample/requests/SM-19')).json();
  assert.equal(receipt.items[0].ticket, 'SM-19-1');
  await fetch(url + '/control?stage=2', { method: 'POST' });
  const unknown = await receive({ ...request, requestId: 'SM-20' });
  assert.equal(unknown.status, 202);
  assert.equal((await fetch(url + '/sample/requests/SM-20')).status, 200);
  await fetch(url + '/control?stage=3', { method: 'POST' });
  assert.equal((await receive({ ...request, requestId: 'SM-21' })).status, 409);
});
