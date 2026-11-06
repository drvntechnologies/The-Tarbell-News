/**
 * The Tarbell News — shared front-end helpers
 * Loads articles from content/articles.json and renders list pages.
 */
(function () {
  "use strict";

  const GRADIENT_MAP = {
    "gradient-red-coffee": "grad-red-coffee",
    "gradient-navy-laundry": "grad-navy-laundry",
    "gradient-green-market": "grad-green-market",
    "gradient-purple-opinion": "grad-purple-opinion",
    "gradient-amber-blackout": "grad-amber-blackout",
    "gradient-teal-plant": "grad-teal-plant",
    "gradient-espn-turkey": "grad-espn-turkey",
    "gradient-espn-hoops": "grad-espn-hoops",
    "gradient-espn-board": "grad-espn-board",
    "gradient-espn-chores": "grad-espn-chores",
  };

  function gradientClass(key) {
    return GRADIENT_MAP[key] || "gradient-key";
  }

  function formatDate(iso) {
    try {
      const d = new Date(iso);
      return d.toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZone: "America/Lima",
      });
    } catch (_) {
      return iso;
    }
  }

  function formatDateShort(iso) {
    try {
      const d = new Date(iso);
      return d.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone: "America/Lima",
      });
    } catch (_) {
      return iso;
    }
  }

  function articleHref(article, fromSports) {
    const base = fromSports ? "../articles/" : "articles/";
    return base + article.id + ".html";
  }

  function mediaBlock(article, opts) {
    opts = opts || {};
    const cls = ["story-media"];
    if (opts.modifier) cls.push("story-media--" + opts.modifier);
    const image = article.image || "";
    const isImage = /^(images\/|https?:\/\/|\/)/i.test(image);
    const nested = /\/(sports|articles)(\/|$)/.test(window.location.pathname);
    const src = image.startsWith("images/") && nested ? "../" + image : image;
    const caption = opts.caption !== false ? (article.imageCaption || article.section || "") + (article.imageCredit ? " · Credit: " + article.imageCredit : "") + (article.imageSourceUrl ? " · Source: " + article.source : "") : "";
    const media = isImage
      ? '<img class="story-media__img" src="' + escapeAttr(src) + '" alt="' + escapeAttr(article.imageCaption || article.title) + '">'
      : '<div class="story-media__gradient ' + gradientClass(image) + '"></div>';
    return '<div class="' + cls.join(" ") + '"' +
      (isImage ? '' : ' role="img" aria-label="' + escapeAttr(article.title) + '"') + '>' +
      media + (caption ? '<div class="story-media__caption">' + escapeHtml(caption) + '</div>' : '') + '</div>';
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function escapeAttr(str) {
    return escapeHtml(str).replace(/'/g, "&#39;");
  }

  async function loadArticles() {
    const candidates = [
      "content/articles.json",
      "../content/articles.json",
    ];
    let lastErr;
    for (const path of candidates) {
      try {
        const res = await fetch(path, { cache: "no-store" });
        if (!res.ok) throw new Error("HTTP " + res.status);
        return await res.json();
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr || new Error("Could not load articles.json");
  }

  function sortByDateDesc(articles) {
    return articles.slice().sort(function (a, b) {
      return new Date(b.date) - new Date(a.date);
    });
  }

  function initMobileNav() {
    const toggle = document.querySelector("[data-nav-toggle]");
    const list = document.querySelector("[data-nav-list]");
    if (!toggle || !list) return;
    toggle.addEventListener("click", function () {
      const open = list.classList.toggle("is-open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    });
  }

  function setLiveDate() {
    const el = document.querySelector("[data-live-date]");
    if (!el) return;
    const now = new Date();
    el.textContent = now.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
      timeZone: "America/Lima",
    });
  }

  function renderHomepage(articles) {
    const life = sortByDateDesc(articles.filter(function (a) {
      return !a.sports;
    }));
    const featured = life.filter(function (a) {
      return a.featured;
    });
    const hero = featured[0] || life[0];
    ["cnn-hero", "cnn-secondary", "cnn-latest"].forEach(function (id) {
      const el = document.getElementById(id); if (el) el.innerHTML = "";
    });
    const empty = document.getElementById("section-empty");
    if (empty) empty.hidden = !!hero;
    const breaking = document.getElementById("cnn-breaking-text");
    if (!hero) { if (breaking) breaking.textContent = "Choose a section to browse the latest coverage."; return; }

    const secondary = life
      .filter(function (a) {
        return a.id !== hero.id;
      })
      .slice(0, 2);

    const latest = life.filter(function (a) {
      return a.id !== hero.id;
    });

    const heroEl = document.getElementById("cnn-hero");
    if (heroEl) {
      heroEl.innerHTML =
        mediaBlock(hero, { modifier: "wide" }) +
        '<p class="cnn-kicker">' +
        escapeHtml(hero.section) +
        "</p>" +
        '<h1 class="cnn-hero__title"><a href="' +
        articleHref(hero, false) +
        '">' +
        escapeHtml(hero.title) +
        "</a></h1>" +
        '<p class="cnn-hero__dek">' +
        escapeHtml(hero.dek) +
        "</p>" +
        '<p class="cnn-byline">By <strong>' +
        escapeHtml(hero.byline) +
        "</strong> · " +
        escapeHtml(formatDate(hero.date)) +
        " (America/Lima)</p>";
    }

    const breakingEl = document.getElementById("cnn-breaking-text");
    if (breakingEl) {
      breakingEl.innerHTML =
        '<a href="' +
        articleHref(hero, false) +
        '">' +
        escapeHtml(hero.title) +
        "</a>";
    }

    const secondaryEl = document.getElementById("cnn-secondary");
    if (secondaryEl) {
      secondaryEl.innerHTML = secondary
        .map(function (a) {
          return (
            '<article class="cnn-card">' +
            mediaBlock(a) +
            '<p class="cnn-kicker">' +
            escapeHtml(a.section) +
            "</p>" +
            '<h2 class="cnn-card__title"><a href="' +
            articleHref(a, false) +
            '">' +
            escapeHtml(a.title) +
            "</a></h2>" +
            '<p class="cnn-card__dek">' +
            escapeHtml(a.dek) +
            "</p>" +
            '<p class="cnn-byline">' +
            escapeHtml(formatDateShort(a.date)) +
            "</p>" +
            "</article>"
          );
        })
        .join("");
    }

    const latestEl = document.getElementById("cnn-latest");
    if (latestEl) {
      latestEl.innerHTML = latest
        .map(function (a) {
          return (
            '<article class="cnn-latest__item">' +
            '<p class="cnn-kicker">' +
            escapeHtml(a.section) +
            "</p>" +
            '<h3 class="cnn-latest__title"><a href="' +
            articleHref(a, false) +
            '">' +
            escapeHtml(a.title) +
            "</a></h3>" +
            '<p class="cnn-latest__meta">By ' +
            escapeHtml(a.byline) +
            " · " +
            escapeHtml(formatDateShort(a.date)) +
            "</p>" +
            "</article>"
          );
        })
        .join("");
    }
  }

  function sportsCategory(article) {
    if (article.league) return article.league;
    const t = (article.title || "").toLowerCase();
    if (t.indexOf("family league") !== -1) return "Family League";
    if (t.indexOf("weekend games") !== -1) return "Weekend Games";
    if (t.indexOf("recap") !== -1) return "Recap";
    return "Sports";
  }

  function boxScoreBlock(article, compact) {
    const score = article.boxScore;
    if (!score) return "";
    if (compact) {
      return '<div class="box-score box-score--compact" aria-label="Match result">' +
        '<span class="box-score__status">' + escapeHtml(score.status) + '</span>' +
        score.teams.map(function (team) {
          return '<span>' + escapeHtml(team.name) + ' <strong>' + escapeHtml(team.final) + '</strong></span>';
        }).join('<span aria-hidden="true"> / </span>') + '</div>';
    }
    const player = score.player;
    const nested = /\/(sports|articles)(\/|$)/.test(window.location.pathname);
    const image = (nested ? "../" : "") + article.boxScoreImage;
    return '<section class="box-score" aria-label="Match box score">' +
      '<figure class="box-score__figure"><img class="box-score__image" src="' + escapeAttr(image) +
      '" alt="Team Local 8, Team Callao 6, final. Line score and Cameron Tarbell statistics are available in the tables below.">' +
      '<figcaption>Peruvian Pichangas (Jesús María) · Nov. 5, 2026 (Lima). Match result and reported player stats; second-half goals calculated from halftime and final scores. ' +
      '<a href="' + escapeAttr(image) + '" download>Save box score (PNG)</a></figcaption></figure>' +
      '<details class="box-score__details"><summary>Line score &amp; player stats (text tables)</summary>' +
      '<table class="box-score__table"><caption>Team line score · ' + escapeHtml(score.status) + '</caption>' +
      '<thead><tr><th scope="col">Team</th><th scope="col">1H</th><th scope="col">2H</th><th scope="col">F</th></tr></thead><tbody>' +
      score.teams.map(function (team) {
        return '<tr><th scope="row">' + escapeHtml(team.name) + '</th><td>' + escapeHtml(team.halves[0]) +
          '</td><td>' + escapeHtml(team.halves[1]) + '</td><td><strong>' + escapeHtml(team.final) + '</strong></td></tr>';
      }).join('') + '</tbody></table>' +
      '<table class="box-score__table"><caption>Team Local · Player stats</caption>' +
      '<thead><tr><th scope="col">Player</th><th scope="col"><abbr title="Goals">G</abbr></th>' +
      '<th scope="col"><abbr title="Assists">A</abbr></th><th scope="col"><abbr title="Shots on goal">SOG</abbr></th></tr></thead>' +
      '<tbody><tr><th scope="row">' + escapeHtml(player.name) + '</th><td>' + escapeHtml(player.goals) +
      '</td><td>' + escapeHtml(player.assists) + '</td><td>' + escapeHtml(player.shotsOnGoal) + '</td></tr></tbody></table>' +
      '<p class="box-score__notes">' + escapeHtml(player.position + ' · ' + player.injuryNote) +
      '. MF = midfield; ST = striker; 2H = second half. No other individual player statistics reported.</p></details></section>';
  }

  function renderSports(articles) {
    const sports = sortByDateDesc(
      articles.filter(function (a) {
        return a.sports;
      })
    );
    if (!sports.length) return;

    const featured = sports.filter(function (a) {
      return a.featured;
    });
    const primary = featured[0] || sports[0];
    const side = sports
      .filter(function (a) {
        return a.id !== primary.id;
      })
      .slice(0, 2);

    const primaryEl = document.getElementById("espn-primary");
    if (primaryEl) {
      primaryEl.innerHTML =
        mediaBlock(primary, { modifier: "wide", caption: false }) +
        boxScoreBlock(primary, true) +
        '<div class="espn-feature-card__body">' +
        '<p class="espn-card__kicker">' +
        escapeHtml(sportsCategory(primary)) +
        "</p>" +
        '<h2 class="espn-feature-card__title"><a href="' +
        articleHref(primary, true) +
        '">' +
        escapeHtml(primary.title) +
        "</a></h2>" +
        '<p class="espn-feature-card__dek">' +
        escapeHtml(primary.dek) +
        "</p>" +
        '<p class="espn-feature-card__meta">By ' +
        escapeHtml(primary.byline) +
        " · " +
        escapeHtml(formatDate(primary.date)) +
        " (America/Lima)</p>" +
        "</div>";
    }

    const stackEl = document.getElementById("espn-stack");
    if (stackEl) {
      stackEl.innerHTML = side
        .map(function (a) {
          return (
            '<article class="espn-mini">' +
            mediaBlock(a, { modifier: "square", caption: false }) +
            "<div>" +
            '<p class="espn-card__kicker">' +
            escapeHtml(sportsCategory(a)) +
            "</p>" +
            '<h3 class="espn-mini__title"><a href="' +
            articleHref(a, true) +
            '">' +
            escapeHtml(a.title) +
            "</a></h3>" +
            '<p class="espn-mini__meta">' +
            escapeHtml(formatDateShort(a.date)) +
            "</p>" +
            "</div></article>"
          );
        })
        .join("");
    }

    const gridEl = document.getElementById("espn-grid");
    if (gridEl) {
      gridEl.innerHTML = sports
        .map(function (a) {
          return (
            '<article class="espn-card" data-category="' +
            escapeAttr(sportsCategory(a)) +
            '">' +
            mediaBlock(a, { caption: false }) +
            boxScoreBlock(a, true) +
            '<div class="espn-card__body">' +
            '<p class="espn-card__kicker">' +
            escapeHtml(sportsCategory(a)) +
            "</p>" +
            '<h3 class="espn-card__title"><a href="' +
            articleHref(a, true) +
            '">' +
            escapeHtml(a.title) +
            "</a></h3>" +
            '<p class="espn-card__meta">By ' +
            escapeHtml(a.byline) +
            " · " +
            escapeHtml(formatDateShort(a.date)) +
            "</p>" +
            "</div></article>"
          );
        })
        .join("");
    }

    initSportsChips();
  }

  function initSportsChips() {
    const chips = document.querySelectorAll("[data-chip]");
    const cards = document.querySelectorAll("#espn-grid .espn-card");
    if (!chips.length) return;

    function selectCategory(cat) {
      chips.forEach(function (chip) {
        const selected = chip.getAttribute("data-chip") === cat;
        chip.classList.toggle("is-active", selected);
        chip.setAttribute("aria-pressed", selected ? "true" : "false");
      });
      cards.forEach(function (card) {
        card.hidden = cat !== "all" && card.getAttribute("data-category") !== cat;
      });
    }

    chips.forEach(function (chip) {
      chip.addEventListener("click", function () {
        selectCategory(chip.getAttribute("data-chip"));
      });
      chip.addEventListener("keydown", function (e) {
        if (e.key === " ") { e.preventDefault(); chip.click(); }
      });
    });
    document.querySelectorAll("[data-filter-link]").forEach(function (link) {
      link.addEventListener("click", function () {
        selectCategory(link.getAttribute("data-filter-link"));
      });
    });
    function selectFromHash() {
      const chip = Array.from(chips).find(function (item) {
        return item.getAttribute("href") === window.location.hash;
      });
      selectCategory(chip ? chip.getAttribute("data-chip") : "all");
    }
    window.addEventListener("hashchange", selectFromHash);
    selectFromHash();
  }

  function renderArticlePage(articles) {
    const root = document.getElementById("article-root");
    if (!root) return;

    const params = new URLSearchParams(window.location.search);
    let id = params.get("id");
    if (!id) {
      const match = window.location.pathname.match(
        /\/articles\/([^/]+)\.html$/
      );
      if (match) id = match[1];
    }

    const article = articles.find(function (a) {
      return a.id === id;
    });

    if (!article) {
      root.innerHTML =
        '<p>Article not found. <a href="../index.html">Back to homepage</a></p>';
      return;
    }

    document.title = article.title + " — The Tarbell News";

    const isSports = !!article.sports;
    const backHref = isSports ? "../sports/index.html" : "../index.html";
    const backLabel = isSports ? "← Back to Sports" : "← Back to Home";

    if (isSports) {
      document.body.classList.remove("theme-cnn");
      document.body.classList.add("theme-espn");
      root.className = "espn-article";
      root.innerHTML =
        '<p class="espn-card__kicker">' +
        escapeHtml(article.league || article.section) +
        "</p>" +
        '<h1 class="espn-article__title">' +
        escapeHtml(article.title) +
        "</h1>" +
        '<p class="espn-article__dek">' +
        escapeHtml(article.dek) +
        "</p>" +
        '<p class="espn-article__meta">By <strong style="color:#fff">' +
        escapeHtml(article.byline) +
        "</strong> · Updated " +
        escapeHtml(formatDate(article.date)) +
        " (America/Lima)</p>" +
        '<div class="espn-article__media">' +
        mediaBlock(article, { modifier: "wide" }) +
        "</div>" +
        '<div class="espn-article__body">' +
        (article.importStatus === 'rss-fallback' ? '<p class="import-notice"><strong>RSS fallback:</strong> The full article could not be imported. Only available feed content is shown.</p>' : '') +
        article.body
          .map(function (p, index) {
            return "<p>" + escapeHtml(p) + "</p>" + (index === 1 ? boxScoreBlock(article, false) : "");
          })
          .join("") +
        externalSourceBlock(article) +
        "</div>" +
        '<a class="espn-article__back" href="' +
        backHref +
        '">' +
        backLabel +
        "</a>";
    } else {
      root.className = "cnn-article";
      root.innerHTML =
        '<p class="cnn-kicker cnn-article__kicker">' +
        escapeHtml(article.section) +
        "</p>" +
        '<h1 class="cnn-article__title">' +
        escapeHtml(article.title) +
        "</h1>" +
        '<p class="cnn-article__dek">' +
        escapeHtml(article.dek) +
        "</p>" +
        '<p class="cnn-article__meta">By <strong>' +
        escapeHtml(article.byline) +
        "</strong> · Updated " +
        escapeHtml(formatDate(article.date)) +
        " (America/Lima)</p>" +
        '<div class="cnn-article__media">' +
        mediaBlock(article, { modifier: "wide" }) +
        "</div>" +
        '<div class="cnn-article__body">' +
        (article.importStatus === 'rss-fallback' ? '<p class="import-notice"><strong>RSS fallback:</strong> The full article could not be imported. Only available feed content is shown.</p>' : '') +
        article.body
          .map(function (p) {
            return "<p>" + escapeHtml(p) + "</p>";
          })
          .join("") +
        externalSourceBlock(article) +
        "</div>" +
        '<a class="cnn-article__back" href="' +
        backHref +
        '">' +
        backLabel +
        "</a>";
    }
  }

  function initNewsSections(articles) {
    const categories = ["General", "Politics", "Business", "World", "Opinion"];
    function update() {
      const hash = window.location.hash.slice(1).toLowerCase();
      const category = categories.find(function (value) { return value.toLowerCase() === hash; });
      const heading = document.getElementById("section-heading");
      if (heading) heading.textContent = category || "Top Stories";
      document.querySelectorAll(".cnn-nav__list a").forEach(function (link) {
        const current = category ? link.hash === "#" + category.toLowerCase() : !link.hash && link.textContent === "Top Stories";
        if (current) link.setAttribute("aria-current", "page"); else link.removeAttribute("aria-current");
      });
      renderHomepage(category ? articles.filter(function (a) { return a.section === category; }) : articles);
    }
    window.addEventListener("hashchange", update); update();
  }

  function externalSourceBlock(article) {
    if (!article.externalNews || !/^https?:\/\//i.test(article.sourceUrl || "")) return "";
    return '<aside class="external-source" aria-label="Source attribution"><p><strong>Original source: ' + escapeHtml(article.source) + '</strong></p>' +
      '<p><a href="' + escapeAttr(article.sourceUrl) + '" target="_blank" rel="noopener noreferrer">Read the original on ' + escapeHtml(article.source) + ' ↗</a></p></aside>';
  }

  async function boot() {
    initMobileNav();
    setLiveDate();

    const page = document.body.getAttribute("data-page");
    if (!page) return;

    try {
      const articles = await loadArticles();
      if (page === "home") initNewsSections(articles);
      else if (page === "sports") renderSports(articles);
      else if (page === "article") renderArticlePage(articles);
    } catch (err) {
      console.error(err);
      const fallback = document.getElementById("load-error");
      if (fallback) {
        fallback.hidden = false;
        fallback.textContent =
          "Could not load stories. Serve this folder over HTTP (e.g. npx serve .) so articles.json can be fetched.";
      }
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

  // Expose for static article pages that embed content
  window.TarbellNews = {
    formatDate: formatDate,
    formatDateShort: formatDateShort,
    gradientClass: gradientClass,
    loadArticles: loadArticles,
  };
})();
