/*
 * QNX Codelabs landing page: DOM wiring.
 * Cards are built once; filtering only toggles `hidden` and reorders nodes.
 * All logic lives in landing-core.js (window.LandingCore).
 */
(function () {
  'use strict';

  var C = window.LandingCore;
  var LABS = (window.CODELABS || []).slice();
  var facets = C.buildFacets(LABS);
  var state = C.emptyState();
  var cards = new Map();
  var inputs = { topic: new Map(), platform: new Map(), level: new Map() };
  var labelFor = {};
  var pendingChipFocus = null; // index of a just-removed active chip, so focus can stay in the list

  var $ = function (id) { return document.getElementById(id); };
  var grid = $('grid');
  var searchEl = $('search');
  var sortEl = $('sort');
  var filtersEl = $('filters');
  var backdrop = $('filter-backdrop');
  var openBtn = $('filters-open');
  var mobileQuery = window.matchMedia('(max-width: 800px)');

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) n.textContent = text;
    return n;
  }

  function svgIcon(path, size) {
    var ns = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', size);
    svg.setAttribute('height', size);
    svg.setAttribute('aria-hidden', 'true');
    var p = document.createElementNS(ns, 'path');
    p.setAttribute('d', path);
    p.setAttribute('stroke', 'currentColor');
    p.setAttribute('stroke-width', '2');
    p.setAttribute('stroke-linecap', 'round');
    p.setAttribute('fill', 'none');
    svg.appendChild(p);
    return svg;
  }

  function levelLabel(level) {
    return level ? level.charAt(0).toUpperCase() + level.slice(1) : '';
  }

  function levelMeter(level) {
    var wrap = el('span', 'level');
    wrap.dataset.level = level;
    var bars = el('span', 'level-bars');
    bars.setAttribute('aria-hidden', 'true');
    for (var i = 0; i < 3; i++) bars.appendChild(document.createElement('i'));
    wrap.appendChild(bars);
    wrap.appendChild(el('span', null, levelLabel(level)));
    return wrap;
  }

  // ---------- Card construction (once) ----------
  function buildCard(lab, featured) {
    var a = el('a', featured ? 'feature-card' : 'card');
    a.href = lab.href;

    var top = el('div', 'card-top');
    if (C.isNew(lab, new Date())) top.appendChild(el('span', 'badge-new', 'New'));
    if (lab.level) top.appendChild(levelMeter(lab.level));
    if (lab.duration > 0) top.appendChild(el('span', 'card-duration', lab.duration + ' min'));
    if (top.childNodes.length) a.appendChild(top);

    a.appendChild(el('h3', null, lab.title));
    if (lab.summary) a.appendChild(el('p', null, lab.summary));

    if (lab.topics.length || lab.platforms.length) {
      var chips = el('div', 'chips');
      lab.topics.forEach(function (t) { chips.appendChild(el('span', 'chip', t)); });
      lab.platforms.forEach(function (p) { chips.appendChild(el('span', 'chip chip-platform', p)); });
      a.appendChild(chips);
    }

    var foot = el('div', 'card-foot');
    if (lab.authors) foot.appendChild(el('span', 'card-author', 'By ' + lab.authors));
    var pub = C.formatDate(lab.published);
    if (pub) foot.appendChild(el('span', 'card-date', pub));
    if (foot.childNodes.length) a.appendChild(foot);
    return a;
  }

  function buildOption(group, type, slug, label) {
    var lab = el('label', 'option');
    var input = document.createElement('input');
    input.type = type;
    input.name = 'facet-' + group;
    input.value = slug;
    lab.appendChild(input);
    lab.appendChild(el('span', 'option-label', label));
    var count = el('span', 'option-count');
    lab.appendChild(count);
    inputs[group].set(slug, { input: input, label: lab, count: count });
    labelFor[group + ':' + slug] = label;
    input.addEventListener('change', function () { onFacetChange(group, slug, input.checked); });
    return lab;
  }

  function buildFacetUI() {
    var topicBox = $('facet-topic');
    facets.topics.forEach(function (o) { topicBox.appendChild(buildOption('topic', 'checkbox', o.slug, o.label)); });
    var platBox = $('facet-platform');
    facets.platforms.forEach(function (o) { platBox.appendChild(buildOption('platform', 'checkbox', o.slug, o.label)); });
    if (!facets.platforms.length) platBox.closest('fieldset').hidden = true;
    var levelBox = $('facet-level');
    levelBox.appendChild(buildOption('level', 'radio', '', 'Any level'));
    facets.levels.forEach(function (o) { levelBox.appendChild(buildOption('level', 'radio', o.slug, o.label)); });
  }

  function buildFeatured() {
    var list = C.featuredLabs(LABS);
    if (!list.length) return;
    var box = $('featured-list');
    list.forEach(function (lab) { box.appendChild(buildCard(lab, true)); });
    $('featured').hidden = false;
  }

  // ---------- State changes ----------
  function toggle(list, slug, on) {
    var without = list.filter(function (s) { return s !== slug; });
    return on ? without.concat([slug]) : without;
  }

  function onFacetChange(group, slug, checked) {
    var next = Object.assign({}, state);
    if (group === 'topic') next.topics = toggle(state.topics, slug, checked);
    else if (group === 'platform') next.platforms = toggle(state.platforms, slug, checked);
    else next.level = slug;
    commit(next, true);
  }

  function commit(next, pushHistory) {
    state = next;
    var hash = C.serializeHash(state);
    var url = hash ? '#' + hash : location.pathname + location.search;
    if (('#' + hash) !== (location.hash || '#')) {
      history[pushHistory ? 'pushState' : 'replaceState'](null, '', url);
    }
    render();
  }

  function activeCount() {
    return state.topics.length + state.platforms.length + (state.level ? 1 : 0);
  }

  // ---------- Render ----------
  function syncInputs() {
    if (document.activeElement !== searchEl && searchEl.value !== state.q) searchEl.value = state.q;
    sortEl.value = state.sort;
    inputs.topic.forEach(function (o, slug) { o.input.checked = state.topics.indexOf(slug) >= 0; });
    inputs.platform.forEach(function (o, slug) { o.input.checked = state.platforms.indexOf(slug) >= 0; });
    inputs.level.forEach(function (o, slug) { o.input.checked = state.level === slug; });
  }

  function renderCounts() {
    var counts = C.facetCounts(LABS, state);
    function apply(group, map) {
      inputs[group].forEach(function (o, slug) {
        var n = map[slug];
        o.count.textContent = n;
        var off = n === 0 && !o.input.checked;
        o.input.disabled = off;
        o.label.classList.toggle('disabled', off);
      });
    }
    apply('topic', counts.topics);
    apply('platform', counts.platforms);
    var anyLevel = C.filterAndSort(LABS, Object.assign({}, state, { level: '' })).length;
    counts.levels[''] = anyLevel;
    apply('level', counts.levels);
  }

  function chipNode(text, onRemove) {
    var li = el('li');
    var b = el('button', 'active-chip');
    b.type = 'button';
    b.setAttribute('aria-label', 'Remove filter: ' + text);
    b.appendChild(el('span', null, text));
    b.appendChild(svgIcon('M7 7l10 10M17 7L7 17', 16));
    b.addEventListener('click', onRemove);
    li.appendChild(b);
    return li;
  }

  function renderActive() {
    var list = $('active-list');
    list.textContent = '';
    var idx = 0;
    function chip(text, onRemove) {
      var n = idx++;
      return chipNode(text, function () { pendingChipFocus = n; onRemove(); });
    }
    if (state.q) list.appendChild(chip('“' + state.q + '”', function () {
      searchEl.value = '';
      commit(Object.assign({}, state, { q: '' }), true);
    }));
    state.topics.forEach(function (s) {
      list.appendChild(chip(labelFor['topic:' + s], function () { onFacetChange('topic', s, false); }));
    });
    if (state.level) list.appendChild(chip(labelFor['level:' + state.level], function () { onFacetChange('level', '', true); }));
    state.platforms.forEach(function (s) {
      list.appendChild(chip(labelFor['platform:' + s], function () { onFacetChange('platform', s, false); }));
    });
    $('active').hidden = !list.childNodes.length;

    if (pendingChipFocus !== null) {
      var chips = list.querySelectorAll('.active-chip');
      var target = chips.length ? chips[Math.min(pendingChipFocus, chips.length - 1)] : searchEl;
      pendingChipFocus = null;
      target.focus();
    }
  }

  function render() {
    var visible = C.filterAndSort(LABS, state);
    var shown = new Set(visible.map(function (l) { return l.id; }));
    cards.forEach(function (card, id) { card.hidden = !shown.has(id); });
    var frag = document.createDocumentFragment();
    visible.forEach(function (l) { frag.appendChild(cards.get(l.id)); });
    grid.appendChild(frag); // moves visible cards into sorted order; hidden ones trail behind

    var countEl = $('result-count');
    countEl.textContent = '';
    var strong = el('strong', null, String(visible.length));
    countEl.appendChild(strong);
    var filtered = visible.length !== LABS.length || state.q || activeCount();
    countEl.appendChild(document.createTextNode(
      filtered ? ' of ' + LABS.length + ' codelabs' : (LABS.length === 1 ? ' codelab' : ' codelabs')));

    $('empty').hidden = visible.length > 0;
    grid.hidden = visible.length === 0;

    var n = activeCount();
    var fc = $('filters-count');
    fc.textContent = n;
    fc.hidden = n === 0;
    openBtn.setAttribute('aria-label', n ? 'Filters, ' + n + ' active' : 'Filters');

    syncInputs();
    renderCounts();
    renderActive();
  }

  function clearAll() {
    searchEl.value = '';
    commit(Object.assign(C.emptyState(), { sort: state.sort }), true);
  }

  // ---------- Mobile filter drawer ----------
  var lastFocus = null;

  function setDrawerInert() {
    var closedOnMobile = mobileQuery.matches && !filtersEl.classList.contains('open');
    if (closedOnMobile) filtersEl.setAttribute('inert', '');
    else filtersEl.removeAttribute('inert');
  }

  function openDrawer() {
    lastFocus = document.activeElement;
    filtersEl.classList.add('open');
    backdrop.hidden = false;
    openBtn.setAttribute('aria-expanded', 'true');
    filtersEl.setAttribute('role', 'dialog');
    filtersEl.setAttribute('aria-modal', 'true');
    setDrawerInert();
    document.body.style.overflow = 'hidden';
    var first = filtersEl.querySelector('input:not(:disabled), button');
    if (first) first.focus();
  }

  function closeDrawer() {
    if (!filtersEl.classList.contains('open')) return;
    filtersEl.classList.remove('open');
    backdrop.hidden = true;
    openBtn.setAttribute('aria-expanded', 'false');
    filtersEl.removeAttribute('role');
    filtersEl.removeAttribute('aria-modal');
    setDrawerInert();
    document.body.style.overflow = '';
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  function trapFocus(e) {
    if (e.key === 'Escape') { closeDrawer(); return; }
    if (e.key !== 'Tab') return;
    var items = Array.prototype.filter.call(
      filtersEl.querySelectorAll('input, button, select, a[href]'),
      function (n) { return !n.disabled && n.offsetParent !== null; });
    if (!items.length) return;
    var first = items[0], last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  // ---------- Wire up ----------
  function init() {
    LABS.forEach(function (lab) { cards.set(lab.id, buildCard(lab, false)); });
    buildFacetUI();
    buildFeatured();

    var debounce;
    searchEl.addEventListener('input', function () {
      clearTimeout(debounce);
      debounce = setTimeout(function () {
        commit(Object.assign({}, state, { q: searchEl.value.trim() ? searchEl.value : '' }), false);
      }, 100);
    });
    sortEl.addEventListener('change', function () { commit(Object.assign({}, state, { sort: sortEl.value }), true); });
    $('clear-all').addEventListener('click', clearAll);
    $('empty-clear').addEventListener('click', clearAll);

    openBtn.addEventListener('click', openDrawer);
    $('filters-close').addEventListener('click', closeDrawer);
    $('filters-done').addEventListener('click', closeDrawer);
    backdrop.addEventListener('click', closeDrawer);
    filtersEl.addEventListener('keydown', function (e) { if (filtersEl.classList.contains('open')) trapFocus(e); });
    var onMedia = function () { if (!mobileQuery.matches) closeDrawer(); setDrawerInert(); };
    if (mobileQuery.addEventListener) mobileQuery.addEventListener('change', onMedia);
    else mobileQuery.addListener(onMedia);
    setDrawerInert();

    // In-page anchors (e.g. #results) are not filter state: keep the current filters.
    function fromUrl(initial) {
      if (!C.isStateHash(location.hash) && initial !== true) return;
      state = C.isStateHash(location.hash) ? C.parseHash(location.hash, facets) : C.emptyState();
      render();
    }
    window.addEventListener('popstate', fromUrl);
    window.addEventListener('hashchange', fromUrl);
    fromUrl(true);

    // Skip link: move focus without touching the URL, so a shared filtered link stays intact.
    var skip = document.querySelector('.skip-link');
    if (skip) skip.addEventListener('click', function (e) {
      e.preventDefault();
      $('results').focus();
    });
  }

  init();
})();
