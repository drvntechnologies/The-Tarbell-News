# The Tarbell News

A news-style blog with static public pages and a local-only editorial dashboard for life events — kitchen diplomacy, household legislation, weekend sports — written as if they were breaking news.

- **Main site** evokes a cable-news homepage (red accent, bold masthead, hero + latest rail).
- **Sports desk** (`sports/`) evokes a dark sports hub (scoreboard strip, bold headlines, category chips).

This project is independent fan-style layout inspiration only. It does **not** use CNN or ESPN logos, wordmarks, or claim any affiliation.

## View on localhost

From this directory:

```bash
# Option A — npx serve (port 3000)
npx --yes serve . -p 3000

# Option B — Python
python3 -m http.server 8000

# Option C — PHP
php -S localhost:5500
```

Then open:

- Home: http://localhost:3000/ (or `:8000` / `:5500`)
- Sports: http://localhost:3000/sports/
- Sample article: http://localhost:3000/articles/morning-coffee-summit.html
- Dynamic article loader: http://localhost:3000/article.html?id=morning-coffee-summit

> **Important:** Open the site through a local HTTP server (not `file://`). The homepage and sports hub `fetch` `content/articles.json`, which browsers block on the file protocol.

## Project layout

```
the-tarbell-news/
├── index.html              # CNN-style homepage
├── article.html            # Dynamic article (?id=…)
├── sports/index.html       # ESPN-style sports hub
├── articles/               # One HTML page per story
├── content/articles.json   # Source of truth for stories
├── css/
│   ├── base.css
│   ├── cnn.css
│   └── espn.css
├── js/main.js
└── README.md
```

## Add a life-event article

1. Append an object to `content/articles.json` with:
   - `id` — URL slug (lowercase, hyphens)
   - `title`, `section`, `dek`, `byline`, `date` (ISO 8601)
   - `body` — array of paragraph strings
   - `image` — one of the gradient keys already used (`gradient-red-coffee`, `gradient-navy-laundry`, …) or add a matching class in `css/base.css`
   - `featured` — `true` to prefer on the homepage hero / sports feature
   - `sports` — `true` for the sports desk, `false` for main news
   - `league` — optional sports league label, e.g. `Peruvian Pichangas (Jesús María)`; takes priority over title-based categories

2. Create `articles/<id>.html` (copy an existing article page and swap the copy), **or** open `article.html?id=<id>` while iterating.

3. Refresh localhost — the home and sports pages pick up JSON changes automatically.

### Public news categories

The main navigation now uses **Top Stories, General, Politics, Business, World, Opinion, Sports**. Top Stories shows all non-sports stories. Category links filter the homepage using `#general`, `#politics`, `#business`, `#world`, and `#opinion`; Sports opens its existing dedicated hub. Empty categories show an explicit empty state. Existing articles have been migrated from World of Us → World, Politics of Life → Politics, and Business of Living → Business; their original story URLs are unchanged.

Use these same standard names in `article.section`. The admin can choose any category; selecting Sports also sets `sports: true` so it appears in the sports hub.

## License / credit

Personal project for Cameron. Design patterns are generic news/sports UI conventions, not official brand assets.

### Article photos

Store photos in `images/` and set an article’s `image` to `images/filename.jpg` with an `imageCaption`. Home, sports, and article views resolve local image paths automatically; HTTP(S) and root-relative image URLs are also supported. Existing gradient image keys still work. Static article pages use `../images/filename.jpg`.


### Pichangas match coverage

- League filter: http://localhost:3000/sports/#pichangas
- Local–Callao recap: http://localhost:3000/articles/pichanga-local-callao-jesus-maria.html
- Box score PNG: `images/box-score-local-callao.png`

The recap's `boxScore` object in `content/articles.json` stores the team line score and reported player statistics. The sports cards render a compact score; the article embeds the PNG with a caption, a download link, and expandable semantic HTML tables. No opponent player statistics are inferred. Second-half team goals are the final score minus the halftime score.

After editing this recap's JSON, rebuild its static page and PNG from the same data:

```bash
python3 -m pip install Pillow  # One-time build dependency; the site itself is plain HTML/CSS/JS
python3 scripts/build_pichanga_recap.py
python3 -m unittest discover -s tests -v
```

The graphic builder uses DejaVu Sans (Linux) or Arial (macOS). No image-generation service is used. The La Molina reference is an injury-status note in the recap, not a second league page.


## Local admin news aggregator

Requires **Node.js 20+**. From this project directory:

```bash
npm install
npm run admin
```

Open **http://localhost:3001/admin/**. The same server serves the public site at http://localhost:3001/. Your usual read-only viewer on port 3000 can continue running alongside it as long as both serve this same directory.

- **Region tabs:** All, National Peru, National US, Lima (PE), Des Moines (IA), Chimbote (PE).
- Click **Refresh feeds** to fetch real RSS headlines server-side, avoiding browser CORS. The first admin visit fetches them if there is no cache. There is no polling, background schedule, or automatic publication.
- Review the publisher, original timestamp (shown in **Lima / UTC−5**), available feed excerpt, region, and original-report link. Google News frequently provides **no summary**; the dashboard explicitly says so instead of inventing one.
- **Preview & edit** lets you keep or rewrite the headline, choose a standard news category, and optionally mark the story Featured. Region defaults: Peru/Lima/Chimbote → **World**; US/Des Moines → **General**. Featured defaults to false; Sports is false unless you select the Sports category.
- Use **Add to site** for one item, or select checkboxes across regions and **Add selected to site** (up to 50 at once). A final confirmation lists the actual headlines and categories.
- After approval the server appends new entries to `content/articles.json` (newest-first), writes real static pages at `articles/wire-<stable-id>.html`, and marks source links already published. Repeated publication and source URLs shared across regions are deduplicated. Original articles are never overwritten.
- Refresh your public viewer to see the new stories. These are **attributed, curated external-news link briefings**, not original reporting or copies of publisher articles. They contain the headline, at most a short feed excerpt, and a prominent original-report link. No source article pages or publisher images are scraped; the preview and article use an illustrative gradient.
- Publication is **local only**. It does not commit, push to GitHub, or deploy. Back up/review changed article files and obtain approval before publishing repository changes elsewhere.

### Other commands

```bash
npm run fetch-feeds  # Fetch once to content/feeds.json; never publishes articles
npm start            # Read-only localhost:3000 viewer; all write APIs disabled
npm test             # RSS, publishing, duplicate handling, and local API security tests
python3 -m unittest discover -s tests -v  # Existing sports/box-score regression tests
```

`npx --yes serve . -p 3000` still works as a **read-only** static viewer. On a static-only server `/admin/` can preview a previously fetched cache but publishing and refresh are disabled, with instructions pointing to port 3001. The feed cache is local runtime data and is ignored by Git, not bundled with stale/demo headlines. It is generated by the CLI or admin server.

### Sources and failure behavior

All five feeds are free, public **Google News RSS** feeds, with source publishers attributed item-by-item. Google News links may redirect through Google before reaching the original publisher. These are discovery queries, not verified regional coverage; admins should review relevance and accuracy before selecting anything. Peru-region feeds retain Spanish headlines; no automatic translation is claimed. Each refresh keeps up to 40 items per region and reports the fetch time. Google can change or throttle these undocumented RSS endpoints.

The exact feed definitions live in `scripts/news-feeds.mjs`:

- **National Peru:** <https://news.google.com/rss/search?q=Per%C3%BA+pol%C3%ADtica+econom%C3%ADa+sociedad+when%3A7d&hl=es-419&gl=PE&ceid=PE%3Aes-419>
- **National US:** <https://news.google.com/rss/headlines/section/topic/NATION?hl=en-US&gl=US&ceid=US:en>
- **Lima, PE:** <https://news.google.com/rss/search?q=Lima+Per%C3%BA+when%3A7d&hl=es-419&gl=PE&ceid=PE%3Aes-419>
- **Des Moines, IA:** <https://news.google.com/rss/search?q=%22Des+Moines%22+Iowa+when%3A7d&hl=en-US&gl=US&ceid=US%3Aen>
- **Chimbote, PE:** <https://news.google.com/rss/search?q=Chimbote+Per%C3%BA+when%3A7d&hl=es-419&gl=PE&ceid=PE%3Aes-419>

A timeout, HTTP failure, oversized or malformed XML feed produces an **empty error state for that region**, not invented stories or silently retained stale results. Other regions continue working. The refresh action retries all regions. There is no API key or paid news subscription to configure.

### Local security / operating limits

There is deliberately **no password gate**: this is a single-user localhost tool, not a hosted multi-user CMS. Both npm servers bind only to `127.0.0.1`, reject non-local Host headers, and the admin API uses an in-memory same-origin publishing token plus cross-origin checks. Server static roots do not expose `.git`, `node_modules`, or scripts. These controls reduce accidental access and browser cross-site requests; they are **not production authentication** and do not protect against someone using your computer. Do not expose this server through a tunnel, reverse proxy, LAN bind, or production hosting without implementing real authentication, HTTPS, authorization, and durable transactions.

Article HTML is staged and exclusively created before an atomic article-index replacement. Ordinary write failures roll back the batch without overwriting existing pages; concurrent publishing is locked. Keep a backup / use Git history. A process or computer crash during publication can leave `.stage-*`, `.publish-lock`, or an orphan HTML page; after stopping all admin processes, review and remove only leftover staging/lock files before restarting. Confirm whether the article-index write completed before retrying a batch.

API endpoints (admin server only):
- `GET /api/config` — categories, region definitions, and per-process publishing token.
- `GET /api/feeds` — cached headlines plus already-published status; fetches once if absent.
- `GET /api/feeds?refresh=1` — refresh all configured sources server-side.
- `POST /api/publish` — JSON `{ "selections": [{ "id": "feed-item-id", "title": "Optional headline", "section": "World", "featured": false }] }`, with `X-Admin-Token` from config. Only IDs present in the local feed cache are accepted; arbitrary URLs/HTML/file paths cannot be published. `{ "ids": ["feed-item-id"] }` also works with defaults.

New files: `admin/` (dashboard), `scripts/news-feeds.mjs` (sources and parsing), `scripts/fetch-feeds.mjs` (CLI), `scripts/admin-server.mjs` (local viewer/API), `scripts/publish-news.mjs` (safe publishing/templates), and `tests/newsroom.test.mjs`.
