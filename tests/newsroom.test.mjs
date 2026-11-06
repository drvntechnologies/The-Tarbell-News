import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, readdir } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import https from 'node:https';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { createApp } from '../scripts/admin-server.mjs';
import { CATEGORIES, REGIONS, fetchRegion, refreshFeeds } from '../scripts/news-feeds.mjs';
import { articleHtml, buildArticle, publishSelected as publishStories } from '../scripts/publish-news.mjs';

import { importArticle, extractArticle, isPublicAddress, publicTarget, fetchArticleHtml, downloadArticleImage } from '../scripts/import-article.mjs';

const paragraphs = [
  'Local leaders gathered on Thursday to discuss the new transport proposal, with the council reviewing public feedback and the next steps for the city. Residents asked for clearer timelines and a transparent explanation of how the plan would work.',
  'The committee will meet again next month to consider the proposal. Members said that public comments will remain open during the review, and the council will publish the supporting documents before making a final decision.',
  'Officials have not announced a final vote or a construction date. The current proposal includes neighborhood consultation and further technical assessments before any changes to the existing transport network can begin.'
];
const sourceHtml = `<!doctype html><html><head><title>Full transport report — Example News</title><meta name="author" content="Alex Reporter"></head><body><nav>Navigation junk</nav><article><h1>Full transport report</h1>${paragraphs.map(p => '<p>' + p + '</p>').join('')}<aside>Advertisement junk</aside><script>globalThis.articleScriptExecuted = true</script></article><footer>Footer junk</footer></body></html>`;
const fixtureImporter = item => importArticle(item, { fetchPage: async () => ({ html: sourceHtml, url: 'https://example.org/story' }) });
const publishSelected = (root, selections, options = {}) => publishStories(root, selections, { importer: fixtureImporter, ...options });

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
  const instance = createApp(root, { importer: fixtureImporter, ...options }).listen(0, '127.0.0.1');
  await new Promise(resolve => instance.once('listening', resolve));
  t.after(() => new Promise(resolve => instance.close(resolve)));
  return 'http://127.0.0.1:' + instance.address().port;
}

test('six real region and topic definitions and RSS parsing with safe external links', async () => {
  assert.deepEqual(REGIONS.map(r => r.id), ['peru', 'us', 'lima', 'des-moines', 'chimbote', 'iowa-politics']);
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
  assert.ok(html.includes('Transport &amp; investment')); assert.ok(html.includes('Read the original on Example News')); assert.ok(html.includes(paragraphs[2]));
  assert.deepEqual(article.body, paragraphs); assert.equal(article.byline, 'Alex Reporter'); assert.equal(article.importStatus, 'full-text');
  assert.deepEqual(result.warnings, []); assert.equal(article.sourceUrl, 'https://example.org/story');
  assert.ok(!html.includes('Navigation junk')); assert.ok(!html.includes('Advertisement junk')); assert.ok(!html.includes('Footer junk'));
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


test('Iowa Politics uses the configured US query, refreshes with all feeds, and defaults to Politics', async t => {
  const { root, feeds } = await fixture(t);
  const region = REGIONS.find(region => region.id === 'iowa-politics');
  assert.equal(region.label, 'Iowa Politics'); assert.equal(region.section, 'Politics');
  const url = new URL(region.url);
  assert.equal(url.searchParams.get('q'), 'Iowa politics when:7d');
  assert.equal(url.searchParams.get('gl'), 'US'); assert.equal(url.searchParams.get('ceid'), 'US:en');
  assert.equal(feeds.regions.length, 6);
  const item = feeds.items.find(item => item.region === region.id);
  const result = await publishSelected(root, [{ id: item.id }]);
  const articles = JSON.parse(await readFile(path.join(root, 'content/articles.json'), 'utf8'));
  assert.equal(result.published.length, 1); assert.equal(articles[0].section, 'Politics'); assert.equal(articles[0].regionLabel, 'Iowa Politics');
  const ui = await readFile(new URL('../admin/admin.js', import.meta.url), 'utf8');
  assert.ok(ui.includes("['iowa-politics', 'Iowa Politics']"));
});

test('a cached five-region installation automatically refreshes to include Iowa Politics', async t => {
  const { root, feeds } = await fixture(t);
  feeds.regions = feeds.regions.filter(region => region.id !== 'iowa-politics');
  feeds.items = feeds.items.filter(item => item.region !== 'iowa-politics');
  await writeFile(path.join(root, 'content/feeds.json'), JSON.stringify(feeds));
  let calls = 0;
  const base = await server(t, root, { refresh: async root => { calls++; return refreshFeeds(root, fixtureFetch); } });
  const data = await (await fetch(base + '/api/feeds')).json();
  assert.equal(calls, 1); assert.equal(data.regions.length, 6); assert.ok(data.items.some(item => item.region === 'iowa-politics'));
});

test('RSS keeps full encoded content separately from the short feed preview', async () => {
  const withContent = xml.replace('<rss version="2.0">', '<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">')
    .replace('</item>', '<content:encoded><![CDATA[<p>First RSS paragraph.</p><p>Second RSS paragraph.</p>]]></content:encoded></item>');
  const data = await fetchRegion(REGIONS[0], async () => new Response(withContent));
  assert.equal(data.status, 'ok'); assert.ok(data.items[0].content.includes('Second RSS paragraph.'));
  assert.equal(data.items[0].snippet, 'A short & useful excerpt.');
});

test('failed extraction uses RSS body without invented text and exposes a publish warning', async t => {
  const { root, feeds } = await fixture(t);
  feeds.items[0].content = '<p>First available RSS paragraph.</p><p>Second &amp; final paragraph.</p><script>doNotRun()</script>';
  await writeFile(path.join(root, 'content/feeds.json'), JSON.stringify(feeds));
  const importer = item => importArticle(item, { fetchPage: async () => { throw new Error('Article request returned HTTP 403'); } });
  const base = await server(t, root, { importer });
  const config = await (await fetch(base + '/api/config')).json();
  const response = await fetch(base + '/api/publish', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Admin-Token': config.token }, body: JSON.stringify({ ids: [feeds.items[0].id] }) });
  const result = await response.json(); assert.equal(response.status, 200); assert.equal(result.warnings.length, 1);
  assert.ok(result.warnings[0].message.includes('403')); assert.equal(result.published[0].importStatus, 'rss-fallback');
  const articles = JSON.parse(await readFile(path.join(root, 'content/articles.json'), 'utf8'));
  assert.deepEqual(articles[0].body, ['First available RSS paragraph.', 'Second & final paragraph.']);
  assert.equal(articles[0].sourceUrl, feeds.items[0].url);
  const html = await (await fetch(base + result.published[0].url)).text();
  assert.ok(html.includes('RSS fallback:')); assert.ok(html.includes('Read the original on Example News')); assert.ok(!html.includes('doNotRun'));
  const noText = await importer({ ...feeds.items[0], content: '', snippet: '' }); assert.deepEqual(noText.body, []);
  const snippetOnly = await importer({ ...feeds.items[0], content: '' }); assert.deepEqual(snippetOnly.body, ['A short & useful excerpt.']);
});

test('short/unreadable pages fall back and network timeouts are bounded', async () => {
  const item = { url: 'https://example.org/story', snippet: 'Available summary.' };
  const short = await importArticle(item, { fetchPage: async () => ({ html: '<h1>Access denied</h1>', url: item.url }) });
  assert.equal(short.status, 'rss-fallback'); assert.deepEqual(short.body, ['Available summary.']);
  const start = Date.now();
  const timed = await importArticle(item, { timeoutMs: 10, fetchPage: (_url, { signal }) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Too late')), 1000);
    signal.addEventListener('abort', () => { clearTimeout(timer); reject(signal.reason); }, { once: true });
  }) });
  assert.ok(timed.warning.includes('timed out')); assert.ok(Date.now() - start < 500);
});

test('Google News public publisher links resolve but Google landing text is never imported', async () => {
  const item = { url: 'https://news.google.com/rss/articles/opaque-id', snippet: 'Feed summary.' };
  const calls = [];
  const resolved = await importArticle(item, { fetchPage: async url => {
    calls.push(url);
    return url === item.url ? { url, html: '<link rel="canonical" href="https://example.org/story">' } : { url, html: sourceHtml };
  } });
  assert.deepEqual(calls, [item.url, 'https://example.org/story']); assert.equal(resolved.status, 'full-text'); assert.equal(resolved.sourceUrl, 'https://example.org/story');
  const unresolved = await importArticle(item, { fetchPage: async url => ({ url, html: sourceHtml }) });
  assert.equal(unresolved.status, 'rss-fallback'); assert.ok(unresolved.warning.includes('did not expose')); assert.deepEqual(unresolved.body, ['Feed summary.']);
});

const photoHtml = sourceHtml.replace('</head>', '<meta property="og:image" content="/photos/hero.png"><meta property="og:image:alt" content="Council at work"></head>')
  .replace('<article>', '<article><figure><img src="/photos/hero.png" alt="Council photo" data-credit="Sam Photographer"><figcaption>Council at work · Sam Photographer</figcaption></figure>');
const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const photoImporter = item => importArticle(item, { fetchPage: async () => ({ url: 'https://example.org/story', html: photoHtml }) });
const fixtureImage = async url => ({ bytes: png, ext: 'png', url });

test('extracts hero/lead photo URL and actual caption/credit without executing scripts', () => {
  const article = extractArticle(photoHtml, 'https://example.org/story');
  assert.equal(article.imageUrl, 'https://example.org/photos/hero.png'); assert.equal(article.imageCaption, 'Council at work'); assert.equal(article.imageCredit, 'Sam Photographer');
  assert.equal(globalThis.articleScriptExecuted, undefined); assert.deepEqual(article.body, paragraphs);
  const lead = extractArticle(photoHtml.replace(/<meta property="og:image[^>]+>/g, ''), 'https://example.org/story');
  assert.equal(lead.imageUrl, article.imageUrl); assert.ok(lead.imageCaption.includes('Sam Photographer'));
});

test('publishes hero image bytes locally with caption/credit on the static article', async t => {
  const { root, feeds } = await fixture(t);
  const result = await publishSelected(root, [{ id: feeds.items[0].id, title: feeds.items[0].title }], { importer: photoImporter, downloadImage: fixtureImage });
  const articles = JSON.parse(await readFile(path.join(root, 'content/articles.json'), 'utf8')); const article = articles[0];
  assert.ok(article.image === 'images/imports/' + article.id + '.png'); assert.equal(article.title, extractArticle(photoHtml, 'https://example.org/story').title);
  assert.deepEqual(await readFile(path.join(root, article.image)), png); assert.equal(article.imageCredit, 'Sam Photographer');
  const html = await readFile(path.join(root, 'articles', article.id + '.html'), 'utf8');
  assert.ok(html.includes('src="../' + article.image + '"')); assert.ok(html.includes('Credit: Sam Photographer')); assert.ok(html.includes('Source: Example News'));
  assert.deepEqual(result.warnings, []);
  const base = await server(t, root);
  const photoResponse = await fetch(base + '/' + article.image); assert.equal(photoResponse.status, 200);
  assert.deepEqual(Buffer.from(await photoResponse.arrayBuffer()), png);
});

test('failed photo download keeps imported text and gives an admin warning', async t => {
  const { root, feeds } = await fixture(t);
  const result = await publishSelected(root, [{ id: feeds.items[0].id }], { importer: photoImporter, downloadImage: async () => { throw new Error('Photo unavailable'); } });
  const articles = JSON.parse(await readFile(path.join(root, 'content/articles.json'), 'utf8'));
  assert.equal(articles[0].importStatus, 'full-text'); assert.deepEqual(articles[0].body, paragraphs); assert.equal(articles[0].image, 'gradient-navy-laundry');
  assert.equal(result.warnings.length, 1); assert.ok(result.warnings[0].message.includes('Photo unavailable'));
});

test('HTML collisions roll back newly downloaded photos as well as staged pages', async t => {
  const { root, feeds } = await fixture(t); const id = buildArticle(feeds.items[0]).id;
  await writeFile(path.join(root, 'articles', id + '.html'), 'Keep existing page');
  await assert.rejects(publishSelected(root, [{ id: feeds.items[0].id }], { importer: photoImporter, downloadImage: fixtureImage }));
  assert.deepEqual(await readdir(path.join(root, 'images/imports')), []);
  assert.equal(await readFile(path.join(root, 'articles', id + '.html'), 'utf8'), 'Keep existing page');
  assert.equal(JSON.parse(await readFile(path.join(root, 'content/articles.json'), 'utf8')).length, 1);
});

test('article and image requests reject local/reserved destinations and DNS rebinding', async () => {
  for (const ip of ['127.0.0.1', '10.0.0.1', '172.16.0.1', '192.168.1.1', '169.254.169.254', '0.0.0.0', '100.64.0.1', '224.0.0.1', '::1', '::ffff:127.0.0.1', 'fc00::1', 'fe80::1', '2001:db8::1']) assert.equal(isPublicAddress(ip), false, ip);
  for (const ip of ['93.184.216.34', '8.8.8.8', '2606:4700:4700::1111']) assert.equal(isPublicAddress(ip), true, ip);
  const signal = AbortSignal.timeout(1000);
  for (const url of ['http://127.0.0.1/private', 'file:///etc/passwd', 'https://user:pass@example.org/', 'https://example.org:8080/']) await assert.rejects(publicTarget(url, signal));
  await assert.rejects(publicTarget('https://example.org/story', signal, async () => [{ address: '93.184.216.34', family: 4 }, { address: '127.0.0.1', family: 4 }]));
  await assert.rejects(downloadArticleImage('http://169.254.169.254/metadata'));
});

function mockResponse(t, status, headers, bytes) {
  const calls = [];
  t.mock.method(https, 'get', (url, options, callback) => {
    calls.push({ url: url.href, options });
    const request = new EventEmitter();
    queueMicrotask(() => { const response = Readable.from([Buffer.from(bytes)]); response.statusCode = status; response.headers = headers; callback(response); });
    return request;
  });
  return calls;
}

test('manual redirects reject private targets before any follow-up connection', async t => {
  const calls = mockResponse(t, 302, { location: 'http://127.0.0.1/secret' }, '');
  await assert.rejects(fetchArticleHtml('https://93.184.216.34/story'), /Private or reserved/);
  assert.equal(calls.length, 1); assert.equal(calls[0].options.agent, false);
});

test('article downloader enforces the streaming size limit and HTML MIME type', async t => {
  mockResponse(t, 200, { 'content-type': 'text/html' }, 'A page larger than the test byte budget');
  await assert.rejects(fetchArticleHtml('https://93.184.216.34/story', { maxBytes: 4 }), /byte limit/);
  t.mock.restoreAll();
  mockResponse(t, 200, { 'content-type': 'application/pdf' }, '%PDF');
  await assert.rejects(fetchArticleHtml('https://93.184.216.34/story'), /supported html/);
});

test('photo downloader verifies MIME and raster signatures, never accepts SVG', async t => {
  mockResponse(t, 200, { 'content-type': 'image/png' }, png);
  const image = await downloadArticleImage('https://93.184.216.34/hero'); assert.equal(image.ext, 'png'); assert.deepEqual(image.bytes, png);
  t.mock.restoreAll();
  mockResponse(t, 200, { 'content-type': 'image/png' }, '<svg onload="alert(1)"></svg>');
  await assert.rejects(downloadArticleImage('https://93.184.216.34/not-a-photo'), /raster image/);
  t.mock.restoreAll();
  mockResponse(t, 200, { 'content-type': 'image/svg+xml' }, '<svg></svg>');
  await assert.rejects(downloadArticleImage('https://93.184.216.34/photo.svg'), /supported image/);
});


test('author text in an article header is retained even when page chrome is stripped', () => {
  const html = sourceHtml.replace('<meta name="author" content="Alex Reporter">', '').replace('<article>', '<article><header><span class="byline">Alex Reporter</span></header>');
  const article = extractArticle(html, 'https://example.org/story');
  assert.equal(article.byline, 'Alex Reporter'); assert.deepEqual(article.body, paragraphs);
});
