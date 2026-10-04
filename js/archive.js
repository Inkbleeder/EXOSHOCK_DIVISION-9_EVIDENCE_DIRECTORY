"use strict";
/* archive.js - loads data/evidence.json and provides query helpers.
   Records are identified by their visible title. There are no IDs.
   Lookup and search mirror the main site's read / search commands. */

const Archive = (() => {
  const TYPES = ["image", "gif", "video", "audio", "document", "link"];
  const config = { archiveName: "DIVISION 9 // EVIDENCE ARCHIVE", version: "1.0", prompt: "D9>" };
  const items = [];
  let loadError = null;

  function norm(s) { return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(); }

  function normalize(e) {
    const title = e.title || e.filename || "UNTITLED";
    return {
      key: norm(title).replace(/ /g, "-"),          /* internal only, never shown */
      filename: e.filename || "",
      title,
      type: TYPES.includes((e.type || "").toLowerCase()) ? e.type.toLowerCase() : "image",
      category: e.category || "Uncategorised",
      subcategory: e.subcategory || "",
      date: e.date || "",
      size: e.size || "",
      description: e.description || "",
      tags: (e.tags || []).map(t => String(t).toLowerCase()),
      file: e.file || "",
      related: (e.related || []).map(String),        /* titles */
      hidden: !!e.hidden,
      locked: !!e.locked,
      downloadable: e.downloadable !== false,
      forceDownload: !!e.forceDownload,
      externalUrl: e.externalUrl || "",
      text: ""                                       /* body of document files, filled by loadText() */
    };
  }

  async function load() {
    try {
      const res = await fetch("data/evidence.json", { cache: "no-store" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();
      Object.assign(config, data.config || {});
      items.length = 0;
      (data.evidence || []).forEach(e => items.push(normalize(e)));   /* JSON order is the master order */
    } catch (err) {
      loadError = err.message || String(err);
    }
  }

  /* Pull the text of document files in the background so SEARCH can look
     inside them, the way the main site searches file contents. */
  async function loadText() {
    await Promise.all(items.filter(e => e.type === "document" && e.file).map(async e => {
      try {
        const r = await fetch(e.file, { cache: "no-store" });
        if (r.ok) e.text = await r.text();
      } catch (err) { /* missing file: no searchable body */ }
    }));
  }

  function byKey(key) { return items.find(e => e.key === key) || null; }
  function visible() { return items.filter(e => !e.hidden); }
  function location(e) { return e.subcategory ? e.category + " / " + e.subcategory : e.category; }

  /* Resolve what the person typed, in the main site's order:
       1. exact title (case-insensitive). Hidden records resolve here only.
          Several records sharing one title come back as `ambiguous`.
       2. "<category> <title>" or "<subcategory> <title>"
       3. unique partial title (sister-site convenience)
     Returns { exact, matches, ambiguous } */
  function find(query) {
    const q = norm(query);
    if (!q) return { exact: null, matches: [], ambiguous: false };
    const same = items.filter(e => norm(e.title) === q);
    if (same.length === 1) return { exact: same[0], matches: same, ambiguous: false };
    if (same.length > 1) return { exact: null, matches: same, ambiguous: true };
    const qual = items.find(e => q === norm(e.category + " " + e.title) ||
                                 (e.subcategory && q === norm(e.subcategory + " " + e.title)));
    if (qual) return { exact: qual, matches: [qual], ambiguous: false };
    const vis = visible();
    let m = vis.filter(e => norm(e.title).startsWith(q));
    if (!m.length) m = vis.filter(e => norm(e.title).includes(q));
    return { exact: m.length === 1 ? m[0] : null, matches: m, ambiguous: false };
  }

  function byTitle(title) { return find(title).exact; }

  /* [{category, direct:[items], subs:[{name, items}]}] in first-seen order,
     the same shape as the main site's database index */
  function group(list) {
    const cats = [];
    list.forEach(e => {
      let c = cats.find(x => x.category === e.category);
      if (!c) cats.push(c = { category: e.category, direct: [], subs: [] });
      if (!e.subcategory) { c.direct.push(e); return; }
      let s = c.subs.find(x => x.name === e.subcategory);
      if (!s) c.subs.push(s = { name: e.subcategory, items: [] });
      s.items.push(e);
    });
    return cats;
  }

  /* master order = the order LIST shows, used by NEXT / PREV */
  function ordered() { return group(visible()).flatMap(g => g.direct.concat(g.subs.flatMap(s => s.items))); }

  function neighbors(key) {
    const list = ordered();
    const i = list.findIndex(e => e.key === key);
    return { list, index: i, next: i >= 0 ? list[i + 1] || null : null, prev: i > 0 ? list[i - 1] || null : null };
  }

  function categories() { return [...new Set(visible().map(e => e.category))]; }
  function subcategories() { return [...new Set(visible().filter(e => e.subcategory).map(e => e.subcategory))]; }

  const TYPE_KEYWORDS = {
    IMAGE: "image", IMAGES: "image", IMG: "image", PHOTO: "image", PHOTOS: "image",
    GIF: "gif", GIFS: "gif", ANIM: "gif",
    VIDEO: "video", VIDEOS: "video", VID: "video", MOVIE: "video", MOVIES: "video",
    AUDIO: "audio", AUD: "audio", SOUND: "audio", SOUNDS: "audio", SND: "audio",
    DOC: "document", DOCS: "document", DOCUMENT: "document", DOCUMENTS: "document", TEXT: "document",
    LINK: "link", LINKS: "link", URL: "link", EXT: "link"
  };
  function typeFromKeyword(k) { return TYPE_KEYWORDS[String(k || "").toUpperCase()] || null; }

  /* LIST <name>: category, then subcategory (exact, like the main site's read),
     then a media type keyword. "subcategory <name>" forces a subcategory. */
  function section(term) {
    let q = norm(term);
    if (!q) return { list: visible(), label: "ALL RECORDS" };
    let onlySub = false;
    if (q.startsWith("subcategory ")) { q = q.slice(12).trim(); onlySub = true; }
    if (!onlySub) {
      const c = visible().filter(e => norm(e.category) === q);
      if (c.length) return { list: c, label: "CATEGORY: " + c[0].category.toUpperCase() };
    }
    const sb = visible().filter(e => e.subcategory && norm(e.subcategory) === q);
    if (sb.length) return { list: sb, label: "SUBCATEGORY: " + sb[0].subcategory.toUpperCase() };
    const t = onlySub ? null : typeFromKeyword(term);
    if (t) return { list: visible().filter(e => e.type === t), label: "TYPE: " + t.toUpperCase() };
    return { list: [], label: String(term).toUpperCase() };
  }

  const SORT_FIELDS = ["title", "type", "date"];
  function sort(list, field, desc) {
    field = SORT_FIELDS.includes((field || "").toLowerCase()) ? field.toLowerCase() : "title";
    const get = e => String(e[field] || "").toLowerCase();
    const mul = desc ? -1 : 1;
    return list.slice().sort((a, b) => get(a).localeCompare(get(b)) * mul);
  }

  /* ---- SEARCH: the main site's logic ----
     Full text across title, category, subcategory and body. A result carries
     a short excerpt when the hit is inside the body. */
  function body(e) { return e.description + " " + e.tags.join(" ") + " " + e.text; }

  function buildSnippet(content, query, radius) {
    radius = radius || 40;
    const idx = content.toLowerCase().indexOf(query);
    if (idx === -1) return null;
    const start = Math.max(0, idx - radius);
    const end = Math.min(content.length, idx + query.length + radius);
    let snip = content.slice(start, end).replace(/\s+/g, " ").trim();
    if (start > 0) snip = "\u2026" + snip;
    if (end < content.length) snip += "\u2026";
    return snip;
  }

  function search(term) {
    const query = String(term || "").toLowerCase().trim();
    if (!query) return [];
    return visible()
      .filter(e => (e.title + " " + e.category + " " + e.subcategory + " " + body(e)).toLowerCase().includes(query))
      .map(e => ({ entry: e, snippet: buildSnippet(body(e), query) }));
  }

  return {
    TYPES, config, items, load, loadText, location, byKey, byTitle, find, visible, ordered, neighbors,
    group, categories, subcategories, typeFromKeyword, section, sort, search,
    get loadError() { return loadError; },
    get loaded() { return loadError === null; }
  };
})();
