#!/usr/bin/env python3
"""Rebuild the recap page and data-led PNG. Requires Python 3 + Pillow.

Run from any directory: python3 scripts/build_pichanga_recap.py
Edit content/articles.json first; it is the single source for the score and story.
"""
from datetime import datetime
from html import escape
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
STORY_ID = 'pichanga-local-callao-jesus-maria'
article = next(a for a in json.loads((ROOT / 'content/articles.json').read_text()) if a['id'] == STORY_ID)
score = article['boxScore']
player = score['player']
assert all(sum(t['halves']) == t['final'] for t in score['teams'])

# Font locations cover Linux and macOS; use a Unicode-capable TrueType font.
font_dirs = [Path('/usr/share/fonts/truetype/dejavu'), Path('/Library/Fonts'), Path('/System/Library/Fonts/Supplemental')]
def font(size, bold=False):
    names = ['DejaVuSans-Bold.ttf', 'Arial Bold.ttf'] if bold else ['DejaVuSans.ttf', 'Arial.ttf']
    for directory in font_dirs:
        for name in names:
            path = directory / name
            if path.exists():
                return ImageFont.truetype(str(path), size)
    raise FileNotFoundError('Install DejaVu Sans or Arial to generate the score graphic.')

im = Image.new('RGB', (1440, 1140), '#0a0a0a')
draw = ImageDraw.Draw(im)
WHITE, MUTED, RED = '#ffffff', '#bcbcbc', '#a50000'
def text(x, y, value, size=36, bold=False, fill=WHITE, anchor=None):
    draw.text((x,y), str(value), font=font(size,bold), fill=fill, anchor=anchor)

draw.rectangle((0,0,1439,15),fill=RED)
text(64,45,'TARBELL SPORTS  /  MATCH RECAP',28,True,MUTED)
text(64,98,article['league'],45,True)
draw.rounded_rectangle((64,183,220,237),radius=4,fill=RED)
text(142,210,score['status'],30,True,anchor='mm')
text(1376,210,'NOV 5, 2026 · LIMA',28,fill=MUTED,anchor='rm')
for index, team in enumerate(score['teams']):
    y=285+index*128
    if index == 0:
        draw.rectangle((50,y-12,1390,y+102),fill='#202020')
        draw.rectangle((50,y-12,59,y+102),fill=RED)
    text(86,y+42,team['name'],57,True,anchor='lm')
    text(1355,y+42,team['final'],100,True,anchor='rm')

# All line-score values come from the JSON, not a rendered/generated picture.
draw.rectangle((64,560,1376,614),fill='#252525')
text(86,587,'LINE SCORE',28,True,anchor='lm')
for x,label in [(950,'1H'),(1120,'2H'),(1300,'F')]: text(x,587,label,28,True,anchor='mm')
for index,team in enumerate(score['teams']):
    y=660+index*70
    text(86,y,team['name'],34,True,anchor='lm')
    for x,value in zip([950,1120,1300],team['halves']+[team['final']]): text(x,y,value,40,True,anchor='mm')
    draw.line((64,y+35,1376,y+35),fill='#333333',width=2)
text(64,805,player['name'].upper(),40,True)
text(64,859,player['team']+' · '+player['position'],30,fill=MUTED)
for x,value,label in [(760,player['goals'],'G'),(1000,player['assists'],'A'),(1240,player['shotsOnGoal'],'SOG')]:
    text(x,844,value,68,True,anchor='mm')
    text(x,900,label,28,True,MUTED,anchor='mm')
draw.line((64,951,1376,951),fill=RED,width=4)
text(64,978,'INJURY NOTES',26,True,MUTED)
text(64,1019,player['injuryNote'],31)
text(64,1083,'G: Goals   A: Assists   SOG: Shots on goal   MF/ST: Midfield/striker',24,fill=MUTED)
image_path=ROOT/article['boxScoreImage']
im.save(image_path, optimize=True)

# Semantic HTML tables keep the graphic's data selectable and accessible.
e=lambda value: escape(str(value),quote=True)
rows=''.join(f'<tr><th scope="row">{e(t["name"])}</th><td>{t["halves"][0]}</td><td>{t["halves"][1]}</td><td><strong>{t["final"]}</strong></td></tr>' for t in score['teams'])
box=f'''<section class="box-score" aria-label="Match box score">
          <figure class="box-score__figure">
            <img class="box-score__image" src="../{e(article['boxScoreImage'])}" width="1440" height="1140" alt="Team Local 8, Team Callao 6, final. Line score and Cameron Tarbell statistics are available in the tables below.">
            <figcaption>{e(article['league'])} · Nov. 5, 2026 (Lima). Match result and reported player stats; second-half goals calculated from halftime and final scores. <a href="../{e(article['boxScoreImage'])}" download>Save box score (PNG)</a></figcaption>
          </figure>
          <details class="box-score__details">
            <summary>Line score &amp; player stats (text tables)</summary>
            <table class="box-score__table">
              <caption>Team line score · {e(score['status'])}</caption>
              <thead><tr><th scope="col">Team</th><th scope="col">1H</th><th scope="col">2H</th><th scope="col">F</th></tr></thead>
              <tbody>{rows}</tbody>
            </table>
            <table class="box-score__table">
              <caption>Team Local · Player stats</caption>
              <thead><tr><th scope="col">Player</th><th scope="col"><abbr title="Goals">G</abbr></th><th scope="col"><abbr title="Assists">A</abbr></th><th scope="col"><abbr title="Shots on goal">SOG</abbr></th></tr></thead>
              <tbody><tr><th scope="row">{e(player['name'])}</th><td>{player['goals']}</td><td>{player['assists']}</td><td>{player['shotsOnGoal']}</td></tr></tbody>
            </table>
            <p class="box-score__notes">{e(player['position'])} · {e(player['injuryNote'])}. MF = midfield; ST = striker; 2H = second half. No other individual player statistics reported.</p>
          </details>
        </section>'''
paragraphs='\n        '.join(f'<p>{e(p)}</p>'+('\n        '+box if i==1 else '') for i,p in enumerate(article['body']))
date = datetime.fromisoformat(article['date']).strftime('%a, %b %-d, %Y, %-I:%M %p')
html=f'''<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{e(article['title'])} — The Tarbell News</title>
  <meta name="description" content="{e(article['dek'])}">
  <meta property="og:title" content="{e(article['title'])}">
  <meta property="og:description" content="{e(article['dek'])}">
  <meta property="og:type" content="article">
  <meta property="article:published_time" content="{e(article['date'])}">
  <link rel="stylesheet" href="../css/base.css">
  <link rel="stylesheet" href="../css/espn.css">
</head>
<body class="theme-espn">
  <a class="skip-link" href="#main">Skip to content</a>
  <header>
    <div class="espn-topbar">
      <div class="container espn-topbar__inner">
        <span><a href="../sports/index.html">← Tarbell Sports</a></span>
        <span><a href="../index.html">Main News</a></span>
      </div>
    </div>
    <div class="espn-masthead">
      <div class="container espn-masthead__inner">
        <a class="espn-logo" href="../sports/index.html">Tarbell Sports<span class="espn-logo__sub">Pichangas · Match Recap</span></a>
        <nav class="espn-nav" aria-label="Sports sections">
          <a href="../sports/index.html#pichangas">Pichangas</a>
          <a href="../sports/index.html">All Sports</a>
        </nav>
      </div>
    </div>
  </header>
  <main id="main" class="container">
    <article class="espn-article">
      <p class="espn-card__kicker"><a href="../sports/index.html#pichangas">{e(article['league'])}</a> · Match Recap</p>
      <h1 class="espn-article__title">{e(article['title'])}</h1>
      <p class="espn-article__dek">{e(article['dek'])}</p>
      <p class="espn-article__meta">By <strong style="color:#fff">{e(article['byline'])}</strong> · Updated <time datetime="{e(article['date'])}">{date}</time> (America/Lima)</p>
      <div class="story-media story-media--wide">
        <img class="story-media__img" src="../{e(article['image'])}" alt="Campo de Marte in Lima; file photograph">
        <div class="story-media__caption">{e(article['imageCaption'])}</div>
      </div>
      <div class="espn-article__body" style="margin-top:1.5rem">
        {paragraphs}
      </div>
      <a class="espn-article__back" href="../sports/index.html#pichangas">← More from Peruvian Pichangas (Jesús María)</a>
    </article>
  </main>
  <footer class="site-footer espn-footer">
    <div class="container site-footer__inner">
      <p>© 2026 The Tarbell News Sports.</p>
      <p><a href="../index.html">Main newsroom</a></p>
    </div>
  </footer>
</body>
</html>
'''
(ROOT/'articles'/f'{STORY_ID}.html').write_text(html)
print(f'Built articles/{STORY_ID}.html and {article["boxScoreImage"]}')
