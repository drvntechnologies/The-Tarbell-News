import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, readdir } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { createApp } from '../scripts/admin-server.mjs';
import { CATEGORIES, REGIONS, fetchRegion, refreshFeeds } from '../scripts/news-feeds.mjs';
import { articleHtml, buildArticle, publishSelected } from '../scripts/publish-news.mjs';

const xml = `<?xml version="1.0"?><rss version="2.0"><channel><title>Real source fixture</title><link>https://example.org/</link><description>test</description><item><title>City transport plan - Example News</title><link>https://example.org/story?utm_source=feed</link><pubDate>Thu, 05 Nov 2026 18:00:00 GMT</pubDate><description><![CDATA[<p>A short &amp; useful excerpt.</p>]]></description><source url="https://example.org">Example News</source></item><item><title>Bad link</title><link>javascript:alert(1)</link></item></channel></rss>`;
const fixtureFetch = async () => new Response(xml);
async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'tarbell-news-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, 'content')); await mkdir(path.join(root, 'articles'));
  await writeFile(path.join(root, 'index.html'), '<h1>Test homepage</h1>');
  await writeFile(path.join(root, 'content/articles.json'), JSON.stringify([{ id: 'existing', title: 'Original reporting' }]));
  const feeds = await refreshFeeds(root, fixtureFetch);
  return { root, feeds };
}
async function server(t, root, options) {
  const instance = createApp(root, options).listen(0, '127.0.0.1');
  await new Promise(resolve => instance.once('listening', resolve));
  t.after(() => new Promise(resolve => instance.close(resolve)));
  return 'http://127.0.0.1:' + instance.address().port;
}

test('five real region definitions and RSS parsing with safe external links', async () => {
  assert.deepEqual(REGIONS.map(r => r.id), ['peru', 'us', 'lima', 'des-moines', 'chimbote']);
  assert.ok(REGIONS.every(r => r.url.startsWith('https://news.google.com/rss/')));
  const result = await fetchRegion(REGIONS[0], fixtureFetch);
  assert.equal(result.status, 'ok'); assert.equal(result.count, 1);
  assert.equal(result.items[0].source, 'Example News');
  assert.equal(result.items[0].title, 'City transport plan');
  assert.equal(result.items[0].snippet, 'A short & useful excerpt.');
  assert.equal(result.items[0].publishedAt, '2026-11-05T18:00:00.000Z');
});

test('network and malformed feeds are explicit empty error states, never fake headlines', async () => {
  for (const fetcher of [async () => new Response('', { status: 503 }), async () => new Response('<bad>'), async () => { throw new Error('Offline'); }, async () => new Response('<!DOCTYPE rss><rss></rss>')]) {
    const result = await fetchRegion(REGIONS[0], fetcher);
    assert.equal(result.status, 'error'); assert.equal(result.count, 0); assert.deepEqual(result.items, []); assert.ok(result.error);
  }
});

test('publishes selected stories, persists HTML + JSON, defaults and category assignment', async t => {
  const { root, feeds } = await fixture(t);
  const selected = feeds.items[0];
  const result = await publishSelected(root, [{ id: selected.id, section: 'Business', title: 'Transport & investment', featured: true }]);
  assert.equal(result.published.length, 1);
  const articles = JSON.parse(await readFile(path.join(root, 'content/articles.json'), 'utf8'));
  assert.equal(articles.length, 2); assert.equal(articles[1].id, 'existing');
  const article = articles[0]; assert.equal(article.section, 'Business'); assert.equal(article.region, 'peru'); assert.equal(article.sports, false); assert.equal(article.featured, true);
  assert.equal(article.source, 'Example News'); assert.equal(article.sourcePublishedAt, selected.publishedAt);
  const html = await readFile(path.join(root, 'articles', article.id + '.html'), 'utf8');
  assert.ok(html.includes('Transport &amp; investment')); assert.ok(html.includes('Read the original report')); assert.ok(html.includes('not original reporting'));
  assert.equal(buildArticle(selected).featured, false); assert.equal(buildArticle(selected).section, 'World');
  assert.equal(buildArticle(selected, { section: 'Sports' }).sports, true);
});

test('idempotent publication and duplicate source links across regions', async t => {
  const { root, feeds } = await fixture(t);
  await publishSelected(root, [{ id: feeds.items[0].id }]);
  const result = await publishSelected(root, [{ id: feeds.items[0].id }, { id: feeds.items[1].id }]);
  assert.equal(result.published.length, 0); assert.equal(result.skipped.length, 2);
  assert.equal(JSON.parse(await readFile(path.join(root, 'content/articles.json'), 'utf8')).length, 2);
});

test('malicious HTML is escaped and invalid category, URLs and arbitrary IDs are rejected', async t => {
  const { root, feeds } = await fixture(t);
  const item = { ...feeds.items[0], snippet: '<script>alert(1)</script>', source: '\"><img onerror=bad>' };
  const article = buildArticle(item, { title: 'Safe "headline" <script>x</script>' });
  assert.ok(!articleHtml(article).includes('<script>')); assert.ok(!articleHtml(article).includes('<img onerror'));
  assert.throws(() => buildArticle({ ...item, url: 'javascript:alert(1)' }));
  for (const selection of [{ id: '../escape' }, { id: item.id, section: 'Fake' }, { id: item.id, title: '' }, { id: item.id, featured: 'true' }]) await assert.rejects(publishSelected(root, [selection]));
  assert.equal(JSON.parse(await readFile(path.join(root, 'content/articles.json'), 'utf8')).length, 1);
  assert.deepEqual(await readdir(path.join(root, 'articles')), []);
});

test('file collisions never overwrite and leave the article index untouched', async t => {
  const { root, feeds } = await fixture(t);
  const item = feeds.items[0]; const article = buildArticle(item);
  const target = path.join(root, 'articles', article.id + '.html'); await writeFile(target, 'Do not overwrite');
  await assert.rejects(publishSelected(root, [{ id: item.id }]));
  assert.equal(await readFile(target, 'utf8'), 'Do not overwrite');
  assert.equal(JSON.parse(await readFile(path.join(root, 'content/articles.json'), 'utf8')).length, 1);
  assert.equal((await readdir(path.join(root, 'articles'))).length, 1);
});

test('local API requires an approval token, rejects foreign origins, hides repository internals', async t => {
  const { root, feeds } = await fixture(t); const base = await server(t, root);
  const config = await (await fetch(base + '/api/config')).json(); assert.deepEqual(config.categories, CATEGORIES);
  assert.equal((await fetch(base + '/api/publish', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 403);
  assert.equal((await fetch(base + '/api/config', { headers: { Origin: 'https://hostile.example' } })).status, 403);
  const foreignHostStatus = await new Promise((resolve, reject) => { const req = http.get(base + '/api/config', { headers: { Host: 'hostile.example' } }, response => { response.resume(); resolve(response.statusCode); }); req.on('error', reject); });
  assert.equal(foreignHostStatus, 403);
  for (const route of ['/.git/config', '/scripts/admin-server.mjs', '/node_modules/express/package.json', '/content/.publish-lock']) assert.equal((await fetch(base + route)).status, 404);
  const response = await fetch(base + '/api/publish', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Admin-Token': config.token }, body: JSON.stringify({ ids: [feeds.items[0].id] }) });
  assert.equal(response.status, 200); const result = await response.json(); assert.equal(result.published.length, 1);
  assert.equal((await fetch(base + result.published[0].url)).status, 200);
  assert.equal((await fetch(base + result.published[0].url.replace('.html', ''))).status, 200);
  const cached = await (await fetch(base + '/api/feeds')).json(); assert.ok(cached.items.every(item => item.published));
});

test('read-only viewer disables every API including publication', async t => {
  const { root } = await fixture(t); const base = await server(t, root, { readOnly: true });
  assert.equal((await fetch(base)).status, 200);
  assert.equal((await fetch(base + '/api/config')).status, 403);
  assert.equal((await fetch(base + '/api/publish', { method: 'POST' })).status, 403);
});


test('batch failure rolls back already staged pages and releases the lock', async t => {
  const { root, feeds } = await fixture(t);
  const first = feeds.items[0];
  const second = { ...feeds.items[1], url: 'https://example.org/second-story', id: 'us-second-item' };
  feeds.items.push(second);
  await writeFile(path.join(root, 'content/feeds.json'), JSON.stringify(feeds));
  const existingPage = path.join(root, 'articles', buildArticle(second).id + '.html');
  await writeFile(existingPage, 'Existing page');
  await assert.rejects(publishSelected(root, [{ id: first.id }, { id: second.id }]));
  assert.deepEqual(await readdir(path.join(root, 'articles')), [path.basename(existingPage)]);
  assert.equal(JSON.parse(await readFile(path.join(root, 'content/articles.json'), 'utf8')).length, 1);
  const retry = await publishSelected(root, [{ id: first.id }]);
  assert.equal(retry.published.length, 1);
});

test('public navigation and existing article sections use standard category names', async () => {
  const root = new URL('../', import.meta.url);
  const articles = JSON.parse(await readFile(new URL('content/articles.json', root), 'utf8'));
  assert.ok(articles.every(article => CATEGORIES.includes(article.section)));
  const home = await readFile(new URL('index.html', root), 'utf8');
  for (const category of CATEGORIES.filter(category => category !== 'Sports')) assert.ok(home.includes('index.html#' + category.toLowerCase()));
  assert.ok(home.includes('href="sports/"')); assert.ok(home.includes('id="section-empty"')); assert.ok(home.includes('href="admin/"'));
});
