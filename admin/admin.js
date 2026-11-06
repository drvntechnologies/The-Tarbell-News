/* Local newsroom: feed data is untrusted text, never executable markup. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const e = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const validUrl = value => { try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? url.href : '#'; } catch { return '#'; } };
  const state = { items: [], regions: [], region: 'all', selected: new Set(), drafts: new Map(), current: null, token: null, readOnly: false, busy: false, pending: [] };
  const categories = ['General', 'Politics', 'Business', 'World', 'Opinion', 'Sports'];
  const defaults = [['peru', 'National Peru'], ['us', 'National US'], ['lima', 'Lima, PE'], ['des-moines', 'Des Moines, IA'], ['chimbote', 'Chimbote, PE']];
  const time = value => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString('en-US', { timeZone: 'America/Lima', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) + ' (Lima)' : 'Time not provided';
  function status(message, error = false) { $('status').textContent = message; $('status').classList.toggle('error', error); }
  function draft(item) {
    if (!state.drafts.has(item.id)) state.drafts.set(item.id, { id: item.id, title: item.title, section: item.section, featured: false });
    return state.drafts.get(item.id);
  }
  function visible() {
    const term = $('search').value.trim().toLocaleLowerCase();
    return state.items.filter(item => (state.region === 'all' || item.region === state.region) && (!term || (item.title + ' ' + item.source).toLocaleLowerCase().includes(term)));
  }
  function updateSelection() {
    $('selection-count').textContent = state.selected.size + ' selected';
    $('publish').textContent = state.busy ? 'Working…' : 'Add selected to site' + (state.selected.size ? ' (' + state.selected.size + ')' : '');
    $('publish').disabled = !state.selected.size || state.busy || state.readOnly;
    const available = visible().filter(item => !item.published);
    const count = available.filter(item => state.selected.has(item.id)).length;
    $('select-all').checked = available.length > 0 && count === available.length;
    $('select-all').indeterminate = count > 0 && count < available.length;
    $('select-all').disabled = !available.length || state.readOnly;
    $('refresh').disabled = state.busy || state.readOnly;
    $('preview-add').disabled = state.busy || state.readOnly || state.items.find(item => item.id === state.current)?.published;
  }
  function render() {
    const tabs = [{ id: 'all', label: 'All regions' }, ...state.regions];
    $('regions').innerHTML = tabs.map(region => `<button type="button" data-region="${e(region.id)}" aria-pressed="${state.region === region.id}">${e(region.label)} <span>(${state.items.filter(item => region.id === 'all' || item.region === region.id).length})</span></button>`).join('');
    $('feed-status').innerHTML = state.regions.map(region => `<span class="feed-pill ${region.status === 'error' ? 'error' : ''}">${e(region.label)} · ${region.status === 'error' ? 'Unavailable: ' + e(region.error) : (region.count ?? 0) + ' headlines'}</span>`).join('');
    const items = visible();
    $('headlines').innerHTML = items.length ? items.map(item => `<article class="news-card ${state.current === item.id ? 'active' : ''}" data-id="${e(item.id)}"><div><input type="checkbox" data-select="${e(item.id)}" aria-label="Select ${e(item.title)}" ${state.selected.has(item.id) ? 'checked' : ''} ${item.published || state.readOnly ? 'disabled' : ''}></div><div><div class="card-kicker">${e(item.regionLabel)} · ${e(draft(item).section)}</div><h3>${e(draft(item).title)}</h3><p class="meta">${e(item.source)} · ${e(time(item.publishedAt))}</p><p class="snippet">${e(item.snippet || 'No summary provided by this feed. Open the original report for details.')}</p><div class="card-actions"><button class="secondary" type="button" data-preview="${e(item.id)}">Preview &amp; edit</button><a href="${e(validUrl(item.url))}" target="_blank" rel="noopener noreferrer">Original report ↗</a>${item.published ? '<span class="published">✓ Already on site</span>' : `<button type="button" data-add="${e(item.id)}" ${state.readOnly || state.busy ? 'disabled' : ''}>Add to site</button>`}</div></div></article>`).join('') : '<div class="empty"><h2>No headlines here yet</h2><p>' + (state.regions.some(region => (state.region === 'all' || region.id === state.region) && region.status === 'error') ? 'The feed is unavailable. Check the error above and try Refresh feeds later.' : 'Try another region, clear your search, or refresh the feeds. No stories are invented to fill this space.') + '</p></div>';
    updateSelection();
  }
  function preview(id, scroll = false) {
    const item = state.items.find(item => item.id === id); if (!item) return;
    state.current = id;
    $('preview-empty').hidden = true; $('preview-editor').hidden = false;
    const options = draft(item);
    $('draft-title').value = options.title; $('draft-section').value = options.section; $('draft-featured').checked = options.featured;
    updatePreview(); render();
    if (scroll && matchMedia('(max-width: 760px)').matches) $('preview-title').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function updatePreview() {
    const item = state.items.find(item => item.id === state.current); if (!item) return;
    const options = draft(item);
    $('preview-region').textContent = item.regionLabel;
    $('preview-section').textContent = options.section;
    $('preview-headline').textContent = options.title;
    $('preview-dek').textContent = item.snippet || 'A headline from ' + item.source + ', selected for the ' + item.regionLabel + ' news desk. Read the original report for the full story.';
    $('preview-source').href = validUrl(item.url);
    $('preview-add').textContent = item.published ? 'Already on site' : 'Add this story to site';
    updateSelection();
  }
  async function load(refresh = false) {
    state.busy = true; updateSelection(); status(refresh ? 'Refreshing five regional RSS feeds…' : 'Loading the news wire…');
    try {
      const response = await fetch('/api/feeds' + (refresh ? '?refresh=1' : ''), { cache: 'no-store' });
      if (!response.ok) throw new Error('News wire returned HTTP ' + response.status + '. Check the local server and retry.');
      const data = await response.json(); applyData(data);
      const failed = data.regions.filter(region => region.status === 'error').length;
      status('Last refreshed ' + time(data.fetchedAt) + ' · ' + data.items.length + ' headlines' + (failed ? ' · ' + failed + ' feed(s) unavailable; see errors below.' : ''), failed > 0);
    } catch (error) { status(error.message, true); }
    finally { state.busy = false; render(); }
  }
  function applyData(data) {
    state.items = data.items.slice().sort((a, b) => (Date.parse(b.publishedAt) || 0) - (Date.parse(a.publishedAt) || 0));
    state.regions = data.regions;
    for (const id of state.selected) if (!state.items.some(item => item.id === id && !item.published)) state.selected.delete(id);
    if (state.current && !state.items.some(item => item.id === state.current)) { state.current = null; $('preview-editor').hidden = true; $('preview-empty').hidden = false; }
  }
  function confirmPublish(ids) {
    if (state.busy || state.readOnly) return;
    const items = state.items.filter(item => ids.includes(item.id) && !item.published);
    if (!items.length) return;
    if (items.length > 50) { status('Publish up to 50 stories at a time. Deselect some stories first.', true); return; }
    for (const item of items) if (!draft(item).title.trim()) { status('Add a headline before publishing.', true); preview(item.id, true); return; }
    state.pending = items.map(item => ({ ...draft(item) }));
    $('confirm-summary').textContent = items.length + (items.length === 1 ? ' selected story' : ' selected stories') + ' will be added to The Tarbell News.';
    $('confirm-titles').innerHTML = state.pending.map(item => `<li>${e(item.title)} <small>(${e(item.section)}${item.featured ? ' · Featured' : ''})</small></li>`).join('');
    $('confirm-dialog').returnValue = 'cancel';
    $('confirm-dialog').showModal();
  }
  async function publish() {
    state.busy = true; render(); status('Publishing approved stories to local files…');
    try {
      const response = await fetch('/api/publish', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Admin-Token': state.token }, body: JSON.stringify({ selections: state.pending }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Publishing failed');
      for (const selection of state.pending) state.selected.delete(selection.id);
      await load(false);
      status(result.published.length + (result.published.length === 1 ? ' story added to your local site.' : ' stories added to your local site.') + (result.skipped.length ? ' ' + result.skipped.length + ' duplicate(s) skipped.' : '') + ' GitHub is unchanged.');
      const links = document.createElement('span'); links.className = 'result-links';
      for (const article of result.published) { const a = document.createElement('a'); a.href = article.url; a.target = '_blank'; a.rel = 'noopener'; a.textContent = 'View: ' + article.title; links.append(a); }
      $('status').append(links);
      if (state.current) updatePreview();
    } catch (error) { status(error.message, true); }
    finally { state.pending = []; state.busy = false; render(); }
  }
  $('regions').addEventListener('click', event => { const button = event.target.closest('[data-region]'); if (button) { state.region = button.dataset.region; render(); } });
  $('headlines').addEventListener('change', event => { const id = event.target.dataset.select; if (id) { event.target.checked ? state.selected.add(id) : state.selected.delete(id); updateSelection(); } });
  $('headlines').addEventListener('click', event => { const button = event.target.closest('button'); if (!button) return; if (button.dataset.preview) preview(button.dataset.preview, true); if (button.dataset.add) confirmPublish([button.dataset.add]); });
  $('select-all').addEventListener('change', event => { for (const item of visible().filter(item => !item.published)) event.target.checked ? state.selected.add(item.id) : state.selected.delete(item.id); render(); });
  $('search').addEventListener('input', render);
  $('clear').addEventListener('click', () => { state.selected.clear(); render(); });
  $('refresh').addEventListener('click', () => load(true));
  $('publish').addEventListener('click', () => confirmPublish([...state.selected]));
  $('preview-add').addEventListener('click', () => confirmPublish([state.current]));
  $('confirm-dialog').addEventListener('close', () => { if ($('confirm-dialog').returnValue === 'publish') publish(); else state.pending = []; });
  for (const id of ['draft-title', 'draft-section', 'draft-featured']) $(id).addEventListener('input', () => {
    const item = state.items.find(item => item.id === state.current); if (!item) return;
    Object.assign(draft(item), { title: $('draft-title').value, section: $('draft-section').value, featured: $('draft-featured').checked });
    updatePreview(); render();
  });
  async function boot() {
    $('draft-section').innerHTML = categories.map(category => `<option>${category}</option>`).join('');
    state.regions = defaults.map(([id, label]) => ({ id, label, count: 0, status: 'pending' })); render();
    try {
      const response = await fetch('/api/config', { cache: 'no-store' });
      if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) throw new Error('readonly');
      const config = await response.json(); state.token = config.token;
      await load();
    } catch {
      state.readOnly = true; $('static-warning').hidden = false;
      try {
        const response = await fetch('/content/feeds.json', { cache: 'no-store' }); if (!response.ok) throw new Error();
        applyData(await response.json()); status('Cached headlines · Read-only preview. Start the admin server to publish.');
      } catch { status('No cached headlines yet. Start npm run admin, then choose Refresh feeds. No sample news has been invented.'); }
      render();
    }
  }
  boot();
})();
