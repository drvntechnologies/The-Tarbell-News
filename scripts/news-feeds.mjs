import Parser from 'rss-parser';
import { createHash, randomUUID } from 'node:crypto';
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import path from 'node:path';

export const CATEGORIES = ['General', 'Politics', 'Business', 'World', 'Opinion', 'Sports'];
const search = (q, peru = true) => 'https://news.google.com/rss/search?' + new URLSearchParams({ q, hl: peru ? 'es-419' : 'en-US', gl: peru ? 'PE' : 'US', ceid: peru ? 'PE:es-419' : 'US:en' });
export const REGIONS = [
  { id: 'peru', label: 'National Peru', section: 'World', url: search('Perú política economía sociedad when:7d') },
  { id: 'us', label: 'National US', section: 'General', url: 'https://news.google.com/rss/headlines/section/topic/NATION?hl=en-US&gl=US&ceid=US:en' },
  { id: 'lima', label: 'Lima, PE', section: 'World', url: search('Lima Perú when:7d') },
  { id: 'des-moines', label: 'Des Moines, IA', section: 'General', url: search('"Des Moines" Iowa when:7d', false) },
  { id: 'chimbote', label: 'Chimbote, PE', section: 'World', url: search('Chimbote Perú when:7d') },
  { id: 'iowa-politics', label: 'Iowa Politics', section: 'Politics', url: search('Iowa politics when:7d', false) },
];
export const parser = new Parser({ customFields: { item: [['source', 'sourceNode', { keepArray: false }]] } });
export function plain(value, limit = 500) {
  return String(value ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, limit);
}
export function safeUrl(value) {
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : ''; } catch { return ''; }
}
export function canonicalUrl(value) {
  const url = new URL(value); url.hash = '';
  for (const key of [...url.searchParams.keys()]) if (/^(utm_|fbclid|gclid)/i.test(key)) url.searchParams.delete(key);
  return url.href;
}
export async function readJson(file, fallback) {
  try { return JSON.parse(await readFile(file, 'utf8')); } catch (error) { if (error.code === 'ENOENT') return fallback; throw error; }
}
export async function atomicJson(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  const temp = file + '.' + randomUUID() + '.tmp';
  await writeFile(temp, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
  await rename(temp, file);
}
export async function fetchRegion(region, fetcher = fetch) {
  try {
    const response = await fetcher(region.url, { signal: AbortSignal.timeout(15000), headers: { 'User-Agent': 'TheTarbellNews/1.0 (local RSS reader)', Accept: 'application/rss+xml, application/xml, text/xml' } });
    if (!response.ok) throw new Error('RSS request returned HTTP ' + response.status);
    // Bound untrusted RSS size before parsing. Article pages are fetched only when publishing.
    let xml = ''; let size = 0;
    const decoder = new TextDecoder();
    for await (const chunk of response.body) {
      size += chunk.byteLength;
      if (size > 2_000_000) throw new Error('Feed exceeds 2 MB limit');
      xml += decoder.decode(chunk, { stream: true });
    }
    xml += decoder.decode();
    if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('Unsupported XML declarations');
    const parsed = await parser.parseString(xml);
    const seen = new Set();
    const items = (parsed.items || []).flatMap(item => {
      const url = safeUrl(item.link); const title = plain(item.title, 300);
      if (!url || !title || seen.has(canonicalUrl(url))) return [];
      seen.add(canonicalUrl(url));
      const rawSource = item.sourceNode;
      const source = plain(typeof rawSource === 'string' ? rawSource : rawSource?._, 100) || plain(item.creator, 100) || 'Google News';
      const headline = source !== 'Google News' && title.endsWith(' - ' + source) ? title.slice(0, -(source.length + 3)) : title;
      // Google News descriptions usually repeat the headline rather than supply a summary.
      const description = plain(item.contentSnippet || item.summary || '', 280);
      const snippet = description === title || description === headline + ' ' + source ? '' : description;
      // Keep available RSS article content for an honest fallback if the outlet cannot be read.
      const content = String(item['content:encoded'] || item.content || item.summary || '').slice(0, 100_000);
      const date = item.isoDate || item.pubDate;
      return [{ id: region.id + '-' + createHash('sha256').update(canonicalUrl(url)).digest('hex').slice(0, 20), title: headline, source,
        sourceUrl: safeUrl(rawSource?.$?.url), region: region.id, regionLabel: region.label, section: region.section,
        publishedAt: date && Number.isFinite(Date.parse(date)) ? new Date(date).toISOString() : null,
        snippet, content, url }];
    }).slice(0, 40);
    return { ...region, status: 'ok', error: null, count: items.length, items };
  } catch (error) {
    return { ...region, status: 'error', error: plain(error.message, 200), count: 0, items: [] };
  }
}
export async function refreshFeeds(root, fetcher = fetch) {
  const results = await Promise.all(REGIONS.map(region => fetchRegion(region, fetcher)));
  const data = { version: 1, fetchedAt: new Date().toISOString(), regions: results.map(({ items, ...region }) => region), items: results.flatMap(region => region.items) };
  await atomicJson(path.join(root, 'content/feeds.json'), data);
  return data;
}
