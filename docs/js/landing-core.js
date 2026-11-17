/*
 * QNX Codelabs landing page: pure filter / sort / URL-state logic.
 * No DOM access here, so the same file runs in the browser (window.LandingCore)
 * and under Node for unit tests (module.exports).
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.LandingCore = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var LEVELS = ['beginner', 'intermediate', 'advanced'];
  var SORTS = ['newest', 'az', 'shortest'];
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var DAY_MS = 86400000;

  function slugify(label) {
    return String(label).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }

  function capitalize(s) {
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  function emptyState() {
    return { q: '', topics: [], level: '', platforms: [], sort: 'newest' };
  }

  function labSlugs(lab, key) {
    if (!lab._slugs) {
      // Cache slugs on a non-enumerable property so repeated filtering stays cheap.
      Object.defineProperty(lab, '_slugs', {
        value: { topics: (lab.topics || []).map(slugify), platforms: (lab.platforms || []).map(slugify) },
        enumerable: false,
      });
    }
    return lab._slugs[key];
  }

  function haystack(lab) {
    if (lab._text === undefined) {
      var text = [lab.title, lab.summary, (lab.topics || []).join(' '), (lab.platforms || []).join(' '), lab.authors]
        .join(' ').toLowerCase();
      Object.defineProperty(lab, '_text', { value: text, enumerable: false });
    }
    return lab._text;
  }

  function countGroup(labs, key) {
    var map = {};
    labs.forEach(function (lab) {
      (lab[key] || []).forEach(function (label) {
        var slug = slugify(label);
        if (!slug) return;
        if (!map[slug]) map[slug] = { slug: slug, label: label, total: 0 };
        map[slug].total++;
      });
    });
    return Object.keys(map).map(function (k) { return map[k]; }).sort(function (a, b) {
      return b.total - a.total || a.label.localeCompare(b.label);
    });
  }

  function buildFacets(labs) {
    var levels = LEVELS.map(function (lv) {
      return { slug: lv, label: capitalize(lv), total: labs.filter(function (l) { return l.level === lv; }).length };
    }).filter(function (o) { return o.total > 0; });
    return { topics: countGroup(labs, 'topics'), platforms: countGroup(labs, 'platforms'), levels: levels };
  }

  function tokens(q) {
    return String(q || '').toLowerCase().split(/\s+/).filter(Boolean);
  }

  function matches(lab, state) {
    var t = labSlugs(lab, 'topics');
    var p = labSlugs(lab, 'platforms');
    for (var i = 0; i < state.topics.length; i++) if (t.indexOf(state.topics[i]) < 0) return false;
    for (var j = 0; j < state.platforms.length; j++) if (p.indexOf(state.platforms[j]) < 0) return false;
    if (state.level && lab.level !== state.level) return false;
    var words = tokens(state.q);
    if (words.length) {
      var text = haystack(lab);
      for (var k = 0; k < words.length; k++) if (text.indexOf(words[k]) < 0) return false;
    }
    return true;
  }

  function withAdded(list, slug) {
    return list.indexOf(slug) >= 0 ? list : list.concat([slug]);
  }

  function facetCounts(labs, state) {
    var out = { topics: {}, platforms: {}, levels: {} };
    var f = buildFacets(labs);
    function count(s) { return labs.filter(function (l) { return matches(l, s); }).length; }
    f.topics.forEach(function (o) {
      out.topics[o.slug] = count(Object.assign({}, state, { topics: withAdded(state.topics, o.slug) }));
    });
    f.platforms.forEach(function (o) {
      out.platforms[o.slug] = count(Object.assign({}, state, { platforms: withAdded(state.platforms, o.slug) }));
    });
    f.levels.forEach(function (o) {
      out.levels[o.slug] = count(Object.assign({}, state, { level: o.slug }));
    });
    return out;
  }

  function byTitle(a, b) {
    return String(a.title).localeCompare(String(b.title));
  }

  var COMPARATORS = {
    newest: function (a, b) {
      var pa = a.published || '', pb = b.published || '';
      if (pa !== pb) {
        if (!pa) return 1;
        if (!pb) return -1;
        return pa < pb ? 1 : -1; // YYYY-MM-DD sorts lexically
      }
      return byTitle(a, b);
    },
    az: byTitle,
    shortest: function (a, b) {
      var da = a.duration > 0 ? a.duration : Infinity;
      var db = b.duration > 0 ? b.duration : Infinity;
      if (da !== db) return da < db ? -1 : 1;
      return byTitle(a, b);
    },
  };

  function sortLabs(labs, sort) {
    return labs.slice().sort(COMPARATORS[sort] || COMPARATORS.newest);
  }

  function filterAndSort(labs, state) {
    return sortLabs(labs.filter(function (l) { return matches(l, state); }), state.sort);
  }

  function featuredLabs(labs) {
    return sortLabs(labs.filter(function (l) { return l.featured === true; }), 'newest').slice(0, 3);
  }

  function parseYmd(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
    return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
  }

  // Whole days between two local calendar dates (DST-safe via UTC of the y/m/d parts).
  function dayNumber(d) {
    return Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY_MS);
  }

  function isNew(lab, now, days) {
    if (days === undefined) days = 30;
    var pub = parseYmd(lab && lab.published);
    if (!pub) return false;
    var diff = dayNumber(now) - dayNumber(pub);
    return diff >= 0 && diff <= days;
  }

  function formatDate(value) {
    if (!value) return '';
    // Use the calendar date as written (e.g. claat's "2026-11-17T17:04:29-05:00"), not the visitor's timezone.
    var d = parseYmd(String(value).slice(0, 10)) || new Date(value);
    if (isNaN(d.getTime())) return '';
    return MONTHS[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear();
  }

  function safeDecode(s) {
    try { return decodeURIComponent(s); } catch (e) { return null; }
  }

  function parseHash(hash, facets) {
    var state = emptyState();
    var known = {
      topic: facets.topics.map(function (o) { return o.slug; }),
      platform: facets.platforms.map(function (o) { return o.slug; }),
      level: facets.levels.map(function (o) { return o.slug; }),
    };
    String(hash || '').replace(/^#/, '').split('&').forEach(function (pair) {
      var eq = pair.indexOf('=');
      if (eq < 0) return;
      var key = pair.slice(0, eq);
      var raw = safeDecode(pair.slice(eq + 1).replace(/\+/g, ' '));
      if (raw === null) return;
      if (key === 'q') state.q = raw;
      else if (key === 'topic' || key === 'platform') {
        var list = raw.split(',').filter(function (s, i, a) {
          return known[key].indexOf(s) >= 0 && a.indexOf(s) === i;
        });
        state[key === 'topic' ? 'topics' : 'platforms'] = list;
      } else if (key === 'level' && known.level.indexOf(raw) >= 0) state.level = raw;
      else if (key === 'sort' && SORTS.indexOf(raw) >= 0) state.sort = raw;
    });
    return state;
  }

  // True when the hash holds filter state (or is empty). In-page anchors like the
  // skip link's #results are not state and must not reset the filters.
  function isStateHash(hash) {
    var h = String(hash || '').replace(/^#/, '');
    return h === '' || h.indexOf('=') >= 0;
  }

  function serializeHash(state) {
    var parts = [];
    if (state.q) parts.push('q=' + encodeURIComponent(state.q));
    if (state.topics.length) parts.push('topic=' + state.topics.join(','));
    if (state.level) parts.push('level=' + state.level);
    if (state.platforms.length) parts.push('platform=' + state.platforms.join(','));
    if (state.sort && state.sort !== 'newest') parts.push('sort=' + state.sort);
    return parts.join('&');
  }

  return {
    LEVELS: LEVELS,
    isStateHash: isStateHash,
    slugify: slugify,
    buildFacets: buildFacets,
    emptyState: emptyState,
    matches: matches,
    facetCounts: facetCounts,
    sortLabs: sortLabs,
    filterAndSort: filterAndSort,
    featuredLabs: featuredLabs,
    isNew: isNew,
    formatDate: formatDate,
    parseHash: parseHash,
    serializeHash: serializeHash,
  };
});
