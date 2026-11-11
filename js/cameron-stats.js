/** Running totals for Cameron Tarbell, computed only from reported (non-null) stats. */

const DASH = '—';

export function isReported(value) {
  return value !== null && value !== undefined;
}

export function sumStat(games, key) {
  return games.reduce((total, game) => (isReported(game[key]) ? total + game[key] : total), 0);
}

export function reportedCount(games, key) {
  return games.filter((game) => isReported(game[key])).length;
}

export function averageStat(games, key) {
  const count = reportedCount(games, key);
  return count ? sumStat(games, key) / count : null;
}

export function sortGamesNewestFirst(games) {
  return [...games].sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

export function computeTotals(games) {
  const list = games || [];
  const goals = sumStat(list, 'goals');
  const assists = sumStat(list, 'assists');
  return {
    gamesPlayed: list.length,
    goals,
    assists,
    goalContributions: goals + assists,
    shotsOnGoal: sumStat(list, 'shotsOnGoal'),
    defensiveStops: reportedCount(list, 'defensiveStops') ? sumStat(list, 'defensiveStops') : null,
    averages: {
      goals: averageStat(list, 'goals'),
      assists: averageStat(list, 'assists'),
      goalContributions: list.length ? (goals + assists) / list.length : null,
      shotsOnGoal: averageStat(list, 'shotsOnGoal'),
      defensiveStops: averageStat(list, 'defensiveStops')
    }
  };
}

export function formatValue(value, { digits } = {}) {
  if (!isReported(value)) return DASH;
  if (digits !== undefined) {
    const n = Number(value);
    return Number.isInteger(n) && digits === 1 && n === Math.round(n) ? n.toFixed(1) : n.toFixed(digits);
  }
  return String(value);
}

function formatDate(iso) {
  const date = new Date(iso + 'T00:00:00-05:00');
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/Lima' });
}

function formatScore(game) {
  if (!isReported(game.result) && !isReported(game.scoreFor)) return DASH;
  const result = isReported(game.result) ? game.result : '';
  if (!isReported(game.scoreFor) || !isReported(game.scoreAgainst)) return result || DASH;
  return `${result ? result + ' ' : ''}${game.scoreFor}–${game.scoreAgainst}`.trim();
}

function formatHalftime(game) {
  if (!isReported(game.halftimeFor) || !isReported(game.halftimeAgainst)) return DASH;
  return `${game.halftimeFor}–${game.halftimeAgainst}`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function chip(value, label, extraClass) {
  const cls = extraClass ? `stat-chip ${extraClass}` : 'stat-chip';
  return `<div class="${cls}"><span class="stat-chip__value">${escapeHtml(value)}</span><span class="stat-chip__label">${escapeHtml(label)}</span></div>`;
}

function fillStrip(el, items) {
  if (!el) return;
  el.innerHTML = items.map((item) => chip(item.value, item.label, item.cls)).join('');
}

export function renderPlayerPage({ dataUrl, articlePrefix = '' } = {}) {
  const errorEl = document.getElementById('stats-error');
  const totalsEl = document.getElementById('season-totals');
  const averagesEl = document.getElementById('season-averages');
  const logEl = document.getElementById('game-log');
  const body = logEl ? logEl.querySelector('tbody') : null;

  function fail(message) {
    if (errorEl) {
      errorEl.hidden = false;
      errorEl.textContent = message;
    }
    if (body) body.innerHTML = `<tr><td colspan="10">${escapeHtml(message)}</td></tr>`;
  }

  return fetch(dataUrl)
    .then((response) => {
      if (!response.ok) throw new Error('Could not load the stat line.');
      return response.json();
    })
    .then((data) => {
      const games = sortGamesNewestFirst(data.games || []);
      const totals = computeTotals(games);
      fillStrip(totalsEl, [
        { value: formatValue(totals.gamesPlayed), label: 'GP' },
        { value: formatValue(totals.goals), label: 'G' },
        { value: formatValue(totals.assists), label: 'A' },
        { value: formatValue(totals.goalContributions), label: 'G+A' },
        { value: formatValue(totals.shotsOnGoal), label: 'SOG' },
        { value: formatValue(totals.defensiveStops), label: 'Stops' }
      ]);
      fillStrip(averagesEl, [
        { value: formatValue(totals.averages.goals, { digits: 1 }), label: 'G', cls: 'stat-chip--avg' },
        { value: formatValue(totals.averages.assists, { digits: 1 }), label: 'A', cls: 'stat-chip--avg' },
        { value: formatValue(totals.averages.goalContributions, { digits: 1 }), label: 'G+A', cls: 'stat-chip--avg' },
        { value: formatValue(totals.averages.shotsOnGoal, { digits: 1 }), label: 'SOG', cls: 'stat-chip--avg' },
        { value: formatValue(totals.averages.defensiveStops, { digits: 1 }), label: 'Stops', cls: 'stat-chip--avg' }
      ]);
      if (body) {
        body.innerHTML = games.map((game) => {
          const href = articlePrefix + game.article;
          const opponent = game.opponent || DASH;
          return `<tr>
            <th scope="row"><a href="${escapeHtml(href)}">${escapeHtml(formatDate(game.date))}</a></th>
            <td>${escapeHtml(opponent)}</td>
            <td>${escapeHtml(isReported(game.venue) ? game.venue : DASH)}</td>
            <td>${escapeHtml(formatScore(game))}</td>
            <td>${escapeHtml(formatHalftime(game))}</td>
            <td>${escapeHtml(formatValue(game.goals))}</td>
            <td>${escapeHtml(formatValue(game.assists))}</td>
            <td>${escapeHtml(formatValue(game.shotsOnGoal))}</td>
            <td>${escapeHtml(formatValue(game.defensiveStops))}</td>
            <td class="game-log__notes">${escapeHtml(game.notes || DASH)}</td>
          </tr>`;
        }).join('');
      }
      return totals;
    })
    .catch((err) => {
      fail('Could not load stories. Serve this folder over HTTP so the stat line can be fetched.');
      throw err;
    });
}
