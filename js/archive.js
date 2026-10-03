"use strict";
/* archive.js - loads data/evidence.json and provides query helpers. */

const Archive = (() => {
  const TYPES = ["image", "gif", "video", "audio", "document", "link"];

  const config = {
    archiveName: "DIVISION 9 // EVIDENCE ARCHIVE",
    version: "1.0",
    mainSite: "",
    prompt: "D9>"
  };

  const items = [];
  let loadError = null;

  function normalize(e) {
    const ev = {
      id: String(e.id || "").toUpperCase(),
      filename: e.filename || "",
      title: e.title || e.filename || e.id,
      type: TYPES.includes((e.type || "").toLowerCase()) ? e.type.toLowerCase() : "image",
      category: e.category || "",
      date: e.date || "",
      size: e.size || "",
      description: e.description || "",
      tags: (e.tags || []).map(t => String(t).toLowerCase()),
      file: e.file || "",
      thumb: e.thumb || "",
      related: (e.related || []).map(String),
      hidden: !!e.hidden,
      locked: !!e.locked,
      downloadable: e.downloadable !== false,
      forceDownload: !!e.forceDownload,
      externalUrl: e.externalUrl || ""
    };
    return ev;
  }

  async function load() {
    try {
      const res = await fetch("data/evidence.json", { cache: "no-store" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();
      Object.assign(config, data.config || {});
      items.length = 0;
      (data.evidence || []).forEach(e => items.push(normalize(e)));
      items.sort((a, b) => a.id.localeCompare(b.id));
    } catch (err) {
      loadError = err.message || String(err);
    }
  }

  function byId(id) {
    id = String(id || "").trim().toUpperCase();
    return items.find(e => e.id === id) || null;
  }

  function visible() {
    return items.filter(e => !e.hidden);
  }

  /* Ordered master list used by NEXT / PREVIOUS. */
  function ordered() {
    return visible().slice().sort((a, b) => a.id.localeCompare(b.id));
  }

  const TYPE_KEYWORDS = {
    IMAGE: "image", IMAGES: "image", IMG: "image", PHOTO: "image", PHOTOS: "image",
    GIF: "gif", GIFS: "gif", ANIM: "gif",
    VIDEO: "video", VIDEOS: "video", VID: "video", MOVIE: "video", MOVIES: "video",
    AUDIO: "audio", AUD: "audio", SOUND: "audio", SOUNDS: "audio", SND: "audio",
    DOC: "document", DOCS: "document", DOCUMENT: "document", DOCUMENTS: "document", TEXT: "document",
    LINK: "link", LINKS: "link", URL: "link", EXT: "link"
  };

  function typeFromKeyword(k) {
    return TYPE_KEYWORDS[String(k || "").toUpperCase()] || null;
  }

  function filter(list, { type = null, category = null } = {}) {
    let out = list;
    if (type) out = out.filter(e => e.type === type);
    if (category) {
      const c = String(category).toLowerCase();
      out = out.filter(e => (e.category || "").toLowerCase().includes(c));
    }
    return out;
  }

  const SORT_FIELDS = ["id", "filename", "file", "title", "type", "date", "category"];

  function sort(list, field, desc) {
    field = SORT_FIELDS.includes((field || "").toLowerCase()) ? field.toLowerCase() : "id";
    const get = e => (field === "date" ? (e.date || "0000-00-00") : String(e[field] || "")).toLowerCase();
    const mul = desc ? -1 : 1;
    return list.slice().sort((a, b) => get(a).localeCompare(get(b)) * mul);
  }

  const SEARCH_FIELDS = ["id", "filename", "file", "title", "type", "category", "tags", "date", "description", "all"];

  function search(query, field) {
    field = SEARCH_FIELDS.includes((field || "").toLowerCase()) ? field.toLowerCase() : "all";
    const q = String(query || "").toLowerCase().trim();
    if (!q) return [];
    return visible().filter(e => {
      if (field === "all") {
        return [e.id, e.filename, e.file, e.title, e.type, e.category, e.date,
                e.description, e.tags.join(" ")].join(" ").toLowerCase().includes(q);
      }
      if (field === "tags") return e.tags.some(t => t.includes(q)) || e.tags.join(" ").includes(q);
      return String(e[field] || "").toLowerCase().includes(q);
    });
  }

  function neighbors(id) {
    const list = ordered();
    const i = list.findIndex(e => e.id === String(id).toUpperCase());
    return { list, index: i, next: i >= 0 ? list[i + 1] || null : null, prev: i > 0 ? list[i - 1] || null : null };
  }

  function typeCounts() {
    const c = {};
    visible().forEach(e => { c[e.type] = (c[e.type] || 0) + 1; });
    return c;
  }

  return {
    TYPES, config, items, load, byId, visible, ordered, typeFromKeyword,
    filter, sort, search, neighbors, typeCounts,
    get loadError() { return loadError; },
    get loaded() { return loadError === null; }
  };
})();
