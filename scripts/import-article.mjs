import { Readability } from '@mozilla/readability';
import { JSDOM, VirtualConsole } from 'jsdom';
import { lookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';
import http from 'node:http';
import https from 'node:https';
import { plain, safeUrl } from './news-feeds.mjs';

const MAX_BYTES = 2_000_000;
const TIMEOUT_MS = 15_000;
const blocked = new BlockList();
for (const [address, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24],
  ['192.88.99.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24],
  ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4]
]) blocked.addSubnet(address, prefix, 'ipv4');
const globalV6 = new BlockList(); globalV6.addSubnet('2000::', 3, 'ipv6');
for (const [address, prefix] of [['2001::', 23], ['2001:db8::', 32], ['2002::', 16], ['3fff::', 20]]) blocked.addSubnet(address, prefix, 'ipv6');

export function isPublicAddress(address) {
  const family = isIP(address);
  return family === 4 ? !blocked.check(address, 'ipv4') : family === 6 && globalV6.check(address, 'ipv6') && !blocked.check(address, 'ipv6');
}
function abortable(promise, signal) {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener('abort', abort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}
export async function publicTarget(value, signal, resolver = lookup) {
  const safe = safeUrl(value);
  if (!safe) throw new Error('Only public HTTP(S) article URLs are supported');
  const url = new URL(safe);
  if (url.port && !['80', '443'].includes(url.port)) throw new Error('Nonstandard article ports are not allowed');
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  const records = isIP(hostname) ? [{ address: hostname, family: isIP(hostname) }] : await abortable(resolver(hostname, { all: true, verbatim: true }), signal);
  if (!records.length || records.some(record => !isPublicAddress(record.address))) throw new Error('Private or reserved article addresses are not allowed');
  return { url, records };
}

// Native HTTP pins the validated DNS results to this connection, preventing DNS rebinding.
// Redirects are manual so every destination is checked; no credentials/cookies are sent.
async function fetchPublicResource(value, { signal = AbortSignal.timeout(TIMEOUT_MS), maxBytes = MAX_BYTES, kind = 'html' } = {}) {
  let next = value;
  for (let redirects = 0; redirects <= 5; redirects++) {
    const { url, records } = await publicTarget(next, signal);
    signal.throwIfAborted();
    const result = await new Promise((resolve, reject) => {
      const request = (url.protocol === 'https:' ? https : http).get(url, {
        signal, agent: false,
        lookup: (_hostname, options, callback) => options.all ? callback(null, records) : callback(null, records[0].address, records[0].family),
        headers: { 'User-Agent': 'TheTarbellNews/1.0 (local article importer)', Accept: kind === 'image' ? 'image/jpeg,image/png,image/webp,image/gif' : 'text/html, application/xhtml+xml', 'Accept-Encoding': 'identity' }
      }, async response => {
        try {
          if ([301, 302, 303, 307, 308].includes(response.statusCode)) {
            const location = response.headers.location;
            response.destroy();
            if (!location) throw new Error('Article redirect has no destination');
            resolve({ redirect: new URL(location, url).href }); return;
          }
          if (response.statusCode !== 200) { response.destroy(); throw new Error('Article request returned HTTP ' + response.statusCode); }
          const type = response.headers['content-type'] || '';
          if (!(kind === 'image' ? /^image\/(jpeg|png|webp|gif)(?:;|$)/i : /^(text\/html|application\/xhtml\+xml)(?:;|$)/i).test(type)) { response.destroy(); throw new Error('Source did not return supported ' + kind + ' content'); }
          if (response.headers['content-encoding'] && response.headers['content-encoding'] !== 'identity') { response.destroy(); throw new Error('Source returned unsupported compressed content'); }
          if (Number(response.headers['content-length']) > maxBytes) { response.destroy(); throw new Error('Source exceeds the ' + maxBytes + ' byte limit'); }
          const chunks = []; let size = 0;
          for await (const chunk of response) {
            size += chunk.byteLength;
            if (size > maxBytes) { response.destroy(); throw new Error('Source exceeds the ' + maxBytes + ' byte limit'); }
            chunks.push(chunk);
          }
          const charset = type.match(/charset=["']?([^;"'\s]+)/i)?.[1] || 'utf-8';
          const bytes = Buffer.concat(chunks);
          resolve(kind === 'image' ? { bytes, contentType: type, url: url.href } : { html: new TextDecoder(charset).decode(bytes), url: url.href });
        } catch (error) { reject(error); }
      });
      request.on('error', reject);
    });
    if (!result.redirect) return result;
    next = result.redirect;
  }
  throw new Error('Too many article redirects');
}
export function fetchArticleHtml(value, options = {}) { return fetchPublicResource(value, options); }
export async function downloadArticleImage(value, options = {}) {
  const image = await fetchPublicResource(value, { ...options, maxBytes: 8_000_000, kind: 'image' });
  const b = image.bytes;
  const ext = b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff ? 'jpg'
    : b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ? 'png'
    : b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP' ? 'webp'
    : /^GIF8[79]a$/.test(b.subarray(0, 6).toString()) ? 'gif' : '';
  if (!ext) throw new Error('Photo is not a supported raster image');
  return { ...image, ext };
}
function leadPhoto(document, base) {
  const resolve = value => { try { return value ? safeUrl(new URL(value, base).href) : ''; } catch { return ''; } };
  const ogUrl = resolve(document.querySelector('meta[property="og:image"]')?.content);
  const candidates = [...document.querySelectorAll('article img, main img, [itemprop="articleBody"] img')];
  const imageUrlFor = image => resolve(image.getAttribute('data-src') || image.getAttribute('src'));
  const image = ogUrl ? candidates.find(candidate => imageUrlFor(candidate) === ogUrl) : candidates.find(candidate => imageUrlFor(candidate));
  const imageUrl = ogUrl || (image ? imageUrlFor(image) : '');
  const figure = image?.closest('figure');
  return { imageUrl,
    imageCaption: clean((ogUrl ? document.querySelector('meta[property="og:image:alt"]')?.content : '') || figure?.querySelector('figcaption')?.textContent || image?.getAttribute('alt')).slice(0, 1000),
    imageCredit: clean(image?.getAttribute('data-credit') || figure?.querySelector('[class*="credit"], [itemprop="creditText"]')?.textContent).slice(0, 500) };
}
const unwanted = 'script,style,noscript,nav,header,footer,aside,form,iframe,button,[hidden],[aria-hidden="true"],[role="navigation"],[role="banner"],[role="complementary"],[class~="ad"],[class~="ads"],[class~="advertisement"],[aria-label="Advertisement"],[id^="google_ads"]';
function removeClutter(node) { node.querySelectorAll(unwanted).forEach(element => element.remove()); }
const clean = value => String(value || '').replace(/\s+/g, ' ').trim();
export function textParagraphs(html) {
  const fragment = JSDOM.fragment(html || '');
  removeClutter(fragment);
  fragment.querySelectorAll('br').forEach(element => element.replaceWith('\n'));
  const selector = 'p,h2,h3,h4,li,blockquote,pre';
  const paragraphs = [...fragment.querySelectorAll(selector)].filter(element => !element.querySelector(selector)).map(element => clean(element.textContent)).filter(Boolean);
  return paragraphs.length ? paragraphs : (fragment.textContent || '').split(/\n+/).map(clean).filter(Boolean);
}
export function extractArticle(html, url) {
  const dom = new JSDOM(html, { url, virtualConsole: new VirtualConsole() });
  try {
    // Defaults deliberately leave scripts and subresource loading disabled.
    const photo = leadPhoto(dom.window.document, url);
    const author = clean(dom.window.document.querySelector('meta[name="author"]')?.content || dom.window.document.querySelector('article [rel="author"], article [itemprop="author"], article .byline, [rel="author"]')?.textContent);
    removeClutter(dom.window.document);
    const result = new Readability(dom.window.document, { maxElemsToParse: 40_000 }).parse();
    const body = result?.content ? textParagraphs(result.content) : [];
    if (!body.length || body.join(' ').length < 160) throw new Error('No substantial readable article text found');
    if (!photo.imageUrl && result.content) Object.assign(photo, leadPhoto(JSDOM.fragment('<article>' + result.content + '</article>'), url));
    return { ...photo, title: clean(result.title).slice(0, 300), byline: clean(result.byline || author).slice(0, 300), excerpt: clean(result.excerpt).slice(0, 280), body };
  } finally { dom.window.close(); }
}
function isGoogleNews(url) { return new URL(url).hostname === 'news.google.com'; }
function publisherLink(html, url) {
  const dom = new JSDOM(html, { url, virtualConsole: new VirtualConsole() });
  try {
    // Some Google RSS links expose a normal canonical/publisher link, others do not.
    // Never call private Google APIs or attempt to bypass a publisher's access controls.
    const document = dom.window.document;
    const candidates = [document.querySelector('link[rel="canonical"]')?.href, document.querySelector('meta[property="og:url"]')?.content,
      ...[...document.querySelectorAll('a[rel~="nofollow"][href], article a[href]')].map(a => a.href)];
    return candidates.map(safeUrl).find(link => link && !/(^|\.)google\.[a-z.]+$/.test(new URL(link).hostname)) || '';
  } finally { dom.window.close(); }
}
export async function importArticle(item, { fetchPage = fetchArticleHtml, timeoutMs = TIMEOUT_MS } = {}) {
  const signal = AbortSignal.timeout(timeoutMs);
  let sourceUrl = item.url;
  try {
    let page = await fetchPage(item.url, { signal });
    if (isGoogleNews(page.url)) {
      const target = publisherLink(page.html, page.url);
      if (!target) throw new Error('Google News did not expose the original publisher URL');
      sourceUrl = target;
      page = await fetchPage(target, { signal });
    }
    if (isGoogleNews(page.url)) throw new Error('The source still points to Google News, not the original article');
    sourceUrl = page.url;
    const extracted = extractArticle(page.html, page.url);
    return { ...extracted, sourceUrl: page.url, status: 'full-text', warning: null };
  } catch (error) {
    const content = textParagraphs(String(item.content || '').slice(0, 100_000));
    const snippet = textParagraphs(String(item.snippet || '').slice(0, 10_000));
    return { title: '', byline: '', body: content.length ? content : snippet, sourceUrl, status: 'rss-fallback',
      warning: 'Full article import failed: ' + plain(signal.aborted ? 'source request timed out' : error.message, 200) + '. Only available RSS content is included; use the original link for the complete report.' };
  }
}
