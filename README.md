# The Tarbell News

A static news-style blog for life events — kitchen diplomacy, household legislation, weekend sports — written as if they were breaking news.

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

2. Create `articles/<id>.html` (copy an existing article page and swap the copy), **or** open `article.html?id=<id>` while iterating.

3. Refresh localhost — the home and sports pages pick up JSON changes automatically.

### Sections used on the main site

- World of Us
- Politics of Life
- Business of Living
- Opinion
- Sports (also has its own hub)

## License / credit

Personal project for Cameron. Design patterns are generic news/sports UI conventions, not official brand assets.

### Article photos

Store photos in `images/` and set an article’s `image` to `images/filename.jpg` with an `imageCaption`. Home, sports, and article views resolve local image paths automatically; HTTP(S) and root-relative image URLs are also supported. Existing gradient image keys still work. Static article pages use `../images/filename.jpg`.
