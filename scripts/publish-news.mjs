import { createHash, randomUUID } from 'node:crypto';
import { mkdir, writeFile, link, unlink, rm } from 'node:fs/promises';
import path from 'node:path';
import { importArticle, downloadArticleImage } from './import-article.mjs';
import { CATEGORIES, REGIONS, atomicJson, canonicalUrl, plain, readJson, safeUrl } from './news-feeds.mjs';

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}
export function buildArticle(item, options = {}, now = new Date(), imported = {}) {
  const section = options.section ?? item.section;
  if (!CATEGORIES.includes(section)) throw new Error('Choose a valid category');
  if (options.title !== undefined && (typeof options.title !== 'string' || !options.title.trim() || options.title.length > 300)) throw new Error('Headline must contain 1–300 characters');
  if (options.featured !== undefined && typeof options.featured !== 'boolean') throw new Error('Featured must be true or false');
  const url = safeUrl(item.url);
  if (!url || !REGIONS.some(region => region.id === item.region)) throw new Error('Invalid feed item');
  const snippet = plain(item.snippet, 280);
  return { id: 'wire-' + createHash('sha256').update(canonicalUrl(url)).digest('hex').slice(0, 20),
    title: plain(options.title ?? imported.title ?? item.title, 300) || plain(item.title, 300), section, region: item.region, regionLabel: item.regionLabel,
    dek: imported.excerpt || snippet || 'A report from ' + plain(item.source, 100) + ', selected for the ' + item.regionLabel + ' news desk.',
    byline: imported.byline || plain(item.source, 100), date: now.toISOString(), body: imported.body?.length ? imported.body : (snippet ? [snippet] : []),
    image: 'gradient-navy-laundry', imageCaption: item.regionLabel + ' · Imported news', featured: options.featured ?? false,
    sports: section === 'Sports', externalNews: true, source: plain(item.source, 100), sourceUrl: safeUrl(imported.sourceUrl) || url,
    originalFeedUrl: url, sourceTitle: imported.title || item.title, sourceByline: imported.byline || null,
    importStatus: imported.status || 'rss-fallback', importWarning: imported.warning || null, sourcePublishedAt: item.publishedAt,
    sourceFeedId: item.id, sourceFeedUrl: REGIONS.find(region => region.id === item.region).url };
}
export function articleHtml(article) {
  const e = escapeHtml;
  const date = new Date(article.date).toLocaleString('en-US', { timeZone: 'America/Lima', dateStyle: 'long', timeStyle: 'short' });
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${e(article.title)} — The Tarbell News</title><meta name="description" content="${e(article.dek)}">
<link rel="stylesheet" href="../css/base.css"><link rel="stylesheet" href="../css/cnn.css"></head>
<body class="theme-cnn"><a class="skip-link" href="#main">Skip to content</a>
<header><div class="cnn-topbar"><div class="container cnn-topbar__inner"><span class="cnn-topbar__tag">The Tarbell News · Imported news</span></div></div>
<div class="cnn-masthead"><div class="container cnn-masthead__inner"><a class="cnn-logo" href="../index.html">The <span>Tarbell</span> News</a></div></div>
<nav class="cnn-nav" aria-label="Primary"><div class="container cnn-nav__inner"><ul class="cnn-nav__list">
<li><a href="../index.html">Top Stories</a></li>${CATEGORIES.map(section => `<li><a href="${section === 'Sports' ? '../sports/' : '../index.html#' + section.toLowerCase()}">${section}</a></li>`).join('')}
</ul></div></nav></header><main id="main" class="container"><article class="cnn-article">
<p class="cnn-kicker cnn-article__kicker">${e(article.section)} · ${e(article.regionLabel)}</p>
<h1 class="cnn-article__title">${e(article.title)}</h1><p class="cnn-article__dek">${e(article.dek)}</p>
<p class="cnn-article__meta">By ${e(article.byline)} · Imported ${e(date)} (Lima)</p>
${article.image.startsWith('images/imports/') ? `<figure class="story-media"><img class="story-media__img" src="../${e(article.image)}" alt="${e(article.imageCaption || article.title)}"><figcaption class="story-media__caption">${e(article.imageCaption)}${article.imageCredit ? ' · Credit: ' + e(article.imageCredit) : ''} · Source: ${e(article.source)}</figcaption></figure>` : '<div class="story-media" role="img" aria-label="Illustrative news graphic, not a photograph of the event"><div class="story-media__gradient grad-navy-laundry"></div><div class="story-media__caption">' + e(article.imageCaption) + '</div></div>'}
<div class="cnn-article__body">${article.importStatus !== 'full-text' ? '<p class="import-notice"><strong>RSS fallback:</strong> The full article could not be imported. ' + (article.body.length ? 'Only the available feed content is shown below.' : 'The feed did not provide article text.') + '</p>' : ''}${article.body.map(p => `<p>${e(p)}</p>`).join('')}
<aside class="external-source" aria-label="Source attribution"><p><strong>Original source: ${e(article.source)}</strong>${article.sourcePublishedAt ? ' · Published ' + e(new Date(article.sourcePublishedAt).toLocaleString('en-US', { timeZone: 'America/Lima' })) + ' (Lima)' : ''}</p>
<p><a href="${e(article.sourceUrl)}" target="_blank" rel="noopener noreferrer">Read the original on ${e(article.source)} ↗</a></p></aside></div>
<a class="cnn-article__back" href="../index.html#${e(article.section.toLowerCase())}">← Back to ${e(article.section)}</a>
</article></main><footer class="site-footer"><div class="container site-footer__inner"><p>The Tarbell News · Imported stories credit and link to their original publishers.</p><a href="../admin/">Newsroom</a></div></footer></body></html>
`;
}
export function isPublished(item, articles) {
  return articles.some(article => article.sourceFeedId === item.id || ([article.sourceUrl, article.originalFeedUrl].some(url => url && canonicalUrl(url) === canonicalUrl(item.url))));
}
export async function publishSelected(root, selections, { importer = importArticle, downloadImage = downloadArticleImage } = {}) {
  if (!Array.isArray(selections) || !selections.length || selections.length > 50) throw new Error('Select between 1 and 50 stories');
  const lock = path.join(root, 'content/.publish-lock');
  try { await mkdir(lock); } catch (error) { if (error.code === 'EEXIST') throw new Error('Another publication is in progress. Try again shortly.'); throw error; }
  let stage; const installed = [];
  try {
    const feeds = await readJson(path.join(root, 'content/feeds.json'), { items: [] });
    const existing = await readJson(path.join(root, 'content/articles.json'), []);
    const pending = []; const skipped = []; const jobs = []; const warnings = []; const photos = new Map();
    for (const selection of selections) {
      if (!selection || typeof selection.id !== 'string') throw new Error('Invalid selection');
      const item = feeds.items.find(item => item.id === selection.id);
      if (!item) throw new Error('A selected headline is no longer in the feed cache. Refresh and select again.');
      if (isPublished(item, [...existing, ...pending])) { skipped.push(item.id); continue; }
      const article = buildArticle(item, selection);
      if (existing.some(existing => existing.id === article.id)) throw new Error('Article ID collision; no files changed');
      pending.push(article); jobs.push({ item, selection, article });
    }
    if (!pending.length) return { published: [], skipped, warnings };
    // Validate the entire batch before fetching. Four workers bound outbound traffic and wait time.
    async function worker() {
      while (jobs.length) {
        const { item, selection, article } = jobs.shift();
        const imported = await importer(item);
        // The UI submits a default title too; prefer the extracted headline unless actually edited.
        const options = selection.title === item.title ? { ...selection, title: undefined } : selection;
        Object.assign(article, buildArticle(item, options, new Date(), imported));
        if (article.importWarning) warnings.push({ feedId: item.id, title: article.title, message: article.importWarning });
        if (imported.imageUrl) {
          try {
            const photo = await downloadImage(imported.imageUrl, { signal: AbortSignal.timeout(10_000) });
            if (!['jpg', 'png', 'webp', 'gif'].includes(photo.ext)) throw new Error('Unsupported photo type');
            article.image = 'images/imports/' + article.id + '.' + photo.ext;
            article.imageCaption = imported.imageCaption || article.title;
            article.imageCredit = imported.imageCredit || null;
            article.imageSourceUrl = photo.url || imported.imageUrl;
            photos.set(article.id, photo.bytes);
          } catch (error) {
            article.imageImportWarning = 'Photo import skipped: ' + plain(error.message, 200) + '. Text publication is unchanged.';
            warnings.push({ feedId: item.id, title: article.title, message: article.imageImportWarning });
          }
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(4, jobs.length) }, worker));
    stage = path.join(root, 'articles/.stage-' + randomUUID());
    await mkdir(stage, { recursive: true });
    if (photos.size) await mkdir(path.join(root, 'images/imports'), { recursive: true });
    for (const article of pending) {
      if (photos.has(article.id)) {
        const imageStage = path.join(stage, article.id + '.image');
        await writeFile(imageStage, photos.get(article.id), { flag: 'wx' });
        const imageTarget = path.join(root, article.image);
        await link(imageStage, imageTarget);
        installed.push(imageTarget);
      }
      const staged = path.join(stage, article.id + '.html');
      await writeFile(staged, articleHtml(article), { flag: 'wx' });
      const target = path.join(root, 'articles', article.id + '.html');
      await link(staged, target); // Exclusive creation: never overwrite an existing article.
      installed.push(target);
    }
    await atomicJson(path.join(root, 'content/articles.json'), [...pending, ...existing]);
    installed.length = 0; // Successful JSON write commits the batch.
    return { published: pending.map(article => ({ id: article.id, feedId: article.sourceFeedId, title: article.title, url: '/articles/' + article.id + '.html', importStatus: article.importStatus, warning: article.importWarning, image: article.image, imageWarning: article.imageImportWarning || null })), skipped, warnings };
  } finally {
    await Promise.all(installed.map(file => unlink(file)));
    if (stage) await rm(stage, { recursive: true, force: true });
    await rm(lock, { recursive: true, force: true });
  }
}
