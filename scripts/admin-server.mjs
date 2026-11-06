import express from 'express';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { CATEGORIES, REGIONS, readJson, refreshFeeds } from './news-feeds.mjs';
import { isPublished, publishSelected } from './publish-news.mjs';

export function createApp(root, { readOnly = false, refresh = refreshFeeds, importer, downloadImage } = {}) {
  const app = express(); const token = randomBytes(32).toString('hex');
  let refreshing;
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    if (!['localhost', '127.0.0.1', '[::1]'].includes(req.hostname)) return res.status(403).json({ error: 'Localhost requests only' });
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    if (req.path.startsWith('/api/') || req.path.startsWith('/admin')) res.set('Cache-Control', 'no-store');
    next();
  });
  app.use('/api', (req, res, next) => {
    if (readOnly) return res.status(403).json({ error: 'Read-only site. Start npm run admin and open http://localhost:3001/admin/ to publish.' });
    if (req.headers.origin && req.headers.origin !== 'http://' + req.headers.host) return res.status(403).json({ error: 'Cross-origin requests are not allowed' });
    next();
  });
  app.use('/api', express.json({ limit: '64kb' }));
  app.get('/api/config', (req, res) => res.json({ token, categories: CATEGORIES, regions: REGIONS }));
  app.get('/api/feeds', async (req, res) => {
    let feeds = await readJson(path.join(root, 'content/feeds.json'), null);
    if (!feeds || req.query.refresh === '1' || REGIONS.some(region => !feeds.regions?.some(cached => cached.id === region.id))) {
      refreshing ??= refresh(root).finally(() => { refreshing = null; });
      feeds = await refreshing;
    }
    const articles = await readJson(path.join(root, 'content/articles.json'), []);
    res.json({ ...feeds, items: feeds.items.map(item => ({ ...item, published: isPublished(item, articles) })) });
  });
  app.post('/api/publish', async (req, res) => {
    if (req.get('X-Admin-Token') !== token) return res.status(403).json({ error: 'Reopen the admin dashboard and try again' });
    if (!req.is('application/json')) return res.status(415).json({ error: 'JSON body required' });
    try {
      const selections = req.body?.selections ?? req.body?.ids?.map(id => ({ id }));
      res.json(await publishSelected(root, selections, { importer, downloadImage }));
    } catch (error) { res.status(400).json({ error: error.code === 'EEXIST' ? 'An article file already exists. No existing files were overwritten.' : error.message }); }
  });
  // Explicit public roots: never expose .git, scripts, node_modules, or lock files.
  for (const directory of ['admin', 'css', 'js', 'images', 'articles', 'content', 'sports']) {
    app.use('/' + directory, express.static(path.join(root, directory), { dotfiles: 'deny', maxAge: 0 }));
  }
  for (const file of ['index.html', 'article.html', 'README.md']) app.get('/' + file, (req, res) => res.sendFile(path.join(root, file)));
  app.get('/', (req, res) => res.sendFile(path.join(root, 'index.html')));
  app.get('/articles/:id', (req, res, next) => {
    if (!/^[a-z0-9-]+$/.test(req.params.id)) return next();
    res.sendFile(path.join(root, 'articles', req.params.id + '.html'), error => { if (error) next(); });
  });
  app.use((req, res) => res.status(404).send('Not found'));
  app.use((error, req, res, next) => { console.error(error.message); res.status(error.status || 500).json({ error: 'The newsroom could not complete this request. Check the local server terminal.' }); });
  return app;
}
const main = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (main) {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const readOnly = process.argv.includes('--read-only');
  const portIndex = process.argv.indexOf('--port');
  const port = Number(portIndex >= 0 ? process.argv[portIndex + 1] : (readOnly ? 3000 : 3001));
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid port');
  const server = createApp(root, { readOnly }).listen(port, '127.0.0.1', () => {
    console.log(`The Tarbell News: http://localhost:${port}/${readOnly ? '' : 'admin/'}`);
    console.log(readOnly ? 'Read-only viewer. No publishing APIs enabled.' : 'Local-only editorial server. Publishes to local files, never to GitHub automatically.');
  });
  server.on('error', error => { console.error(error.code === 'EADDRINUSE' ? `Port ${port} is already in use. Stop the existing server or choose --port.` : error.message); process.exitCode = 1; });
}
