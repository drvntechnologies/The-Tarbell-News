import { fileURLToPath } from 'node:url';
import { refreshFeeds } from './news-feeds.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
try {
  const result = await refreshFeeds(root);
  for (const region of result.regions) console.log(`${region.label}: ${region.count} headlines${region.error ? ' — ' + region.error : ''}`);
  console.log('Saved content/feeds.json. No stories were published.');
  if (result.regions.every(region => region.status === 'error')) process.exitCode = 1;
} catch (error) { console.error(error.message); process.exitCode = 1; }
