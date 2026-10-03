"use strict";
/* terminal.js - terminal UI, command registry, history, autocomplete,
   result keyboard navigation. */

const Term = (() => {
  const out = document.getElementById("terminal-output");
  const input = document.getElementById("cmdline");
  const mirror = document.getElementById("mirror");
  const cursorEl = document.getElementById("cursor");
  const promptEl = document.getElementById("prompt");

  const history = [];
  let histIdx = -1;
  let liveEntry = "";

  let results = [];          // evidence ids shown in last result block
  let resultEls = [];
  let resultIdx = -1;
  let resultsActive = false;

  const commands = {};
  const aliases = {};

  /* ---------- output helpers ---------- */

  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function print(text, cls) {
    const lines = String(text).split("\n");
    let last = null;
    lines.forEach(l => {
      const d = document.createElement("div");
      d.className = "line" + (cls ? " " + cls : "");
      d.textContent = l === "" ? "\u00a0" : l;
      out.appendChild(d);
      last = d;
    });
    scroll();
    return last;
  }

  function printHTML(html, cls) {
    const d = document.createElement("div");
    d.className = "line" + (cls ? " " + cls : "");
    d.innerHTML = html;
    out.appendChild(d);
    return d;
  }

  function scroll() { out.scrollTop = out.scrollHeight; }

  function clear() { out.innerHTML = ""; resetResults(); }

  function echo(text) { print(promptEl.textContent + " " + text, "echo"); }

  /* ---------- command registry ---------- */

  function cmd(name, desc, usage, fn, aliasList) {
    commands[name] = { name, desc, usage, fn };
    (aliasList || []).forEach(a => { aliases[a] = name; });
  }

  /* ---------- result rendering + keyboard nav ---------- */

  const TYPE_TAGS = { image: "IMG", gif: "GIF", video: "VID", audio: "AUD", document: "DOC", link: "LNK" };

  function resetResults() {
    results = []; resultEls = []; resultIdx = -1; resultsActive = false;
  }

  function pad(s, n) { s = String(s); return s.length >= n ? s : s + " ".repeat(n - s.length); }

  function showResults(list, header) {
    resetResults();
    if (header) print(header, "dim");
    if (!list.length) { print("NO MATCHING RECORDS.", "dim"); return; }
    print("ID      TYPE  TITLE" + " ".repeat(28) + "DATE       FILE", "head");
    list.forEach(ev => {
      const row = printHTML(
        esc(pad(ev.id, 8)) + esc(pad("[" + TYPE_TAGS[ev.type] + "]", 6)) +
        esc(pad(ev.title, 32)) + esc(pad(ev.date || "-", 11)) +
        "<span class='rmeta'>" + esc(ev.filename || ev.file || "-") + "</span>",
        "result-line"
      );
      row.addEventListener("click", () => { resetResults(); Media.open(ev); });
      results.push(ev.id); resultEls.push(row);
    });
    print(list.length + " RECORD(S). CLICK A ROW OR USE ARROWS + ENTER TO OPEN.", "dim");
    resultsActive = true;
    selectResult(0);
  }

  function selectResult(i) {
    resultEls.forEach(el => el.classList.remove("sel"));
    resultIdx = i;
    if (i >= 0 && resultEls[i]) {
      resultEls[i].classList.add("sel");
      resultEls[i].scrollIntoView({ block: "nearest" });
    }
  }

  function moveSelection(dir) {
    if (!resultsActive || !results.length) return false;
    let i = resultIdx + dir;
    if (i < 0) i = 0;
    if (i > results.length - 1) i = results.length - 1;
    selectResult(i);
    return true;
  }

  function openSelected() {
    if (!resultsActive || resultIdx < 0) return false;
    const ev = Archive.byId(results[resultIdx]);
    resetResults();
    if (ev) Media.open(ev);
    return true;
  }

  /* ---------- autocomplete ---------- */

  function complete() {
    const v = input.value;
    const selStart = input.selectionStart ?? v.length;
    if (selStart !== v.length) return;   /* don't guess mid-string */
    const tokens = v.split(/\s+/);
    const last = tokens[tokens.length - 1];

    let pool, kind;
    if (tokens.length === 1) {
      pool = Object.keys(commands).concat(Object.keys(aliases));
      kind = "cmd";
    } else {
      const c = resolveCmd(tokens[0]);
      const up = last.toUpperCase();
      if (["OPEN", "INFO", "DOWNLOAD", "RELATED"].includes(c)) {
        pool = Archive.visible().map(e => e.id);
        kind = "id";
      } else if (c === "SEARCH") {
        pool = ["in:id", "in:file", "in:title", "in:type", "in:category", "in:tags", "in:date", "in:description", "in:all"];
        kind = "field";
      } else if (c === "LIST") {
        pool = ["IMAGES", "GIFS", "VIDEOS", "AUDIO", "DOCS", "LINKS", "/SORT:ID", "/SORT:TITLE", "/SORT:DATE", "/SORT:TYPE", "/DESC"];
        kind = "list";
      } else if (c === "HELP") {
        pool = Object.keys(commands);
        kind = "cmd";
      } else return;
    }

    const prefix = last.toUpperCase();
    const matches = pool.filter(p => p.toUpperCase().startsWith(prefix) && p.toUpperCase() !== prefix);
    if (!matches.length) {
      /* nothing more specific - show options anyway when ambiguous */
      const same = pool.filter(p => p.toUpperCase() === prefix);
      if (same.length) return;
      print("NO COMPLETION AVAILABLE.", "dim");
      return;
    }
    if (matches.length === 1) {
      tokens[tokens.length - 1] = kind === "cmd" ? matches[0].toUpperCase() : matches[0];
      input.value = tokens.join(" ") + " ";
      updateCursor();
      return;
    }
    /* common-prefix completion */
    let cp = matches[0];
    matches.forEach(m => { while (!m.toUpperCase().startsWith(cp.toUpperCase())) cp = cp.slice(0, -1); });
    if (cp.length > prefix.length) {
      tokens[tokens.length - 1] = cp;
      input.value = tokens.join(" ");
      updateCursor();
    }
    print("POSSIBLE COMPLETIONS: " + matches.slice(0, 12).join("  ") + (matches.length > 12 ? " ..." : ""), "dim");
  }

  /* ---------- cursor mirror ---------- */

  function updateCursor() {
    const v = input.value;
    const pos = input.selectionStart ?? v.length;
    mirror.textContent = v.slice(0, pos);
    cursorEl.style.left = mirror.offsetWidth + "px";
  }

  function refocus() { input.focus(); updateCursor(); }

  /* ---------- execute ---------- */

  function resolveCmd(name) {
    const n = name.toUpperCase();
    return aliases[n] || n;
  }

  function parseArgs(tokens) {
    const flags = {};
    const args = [];
    tokens.forEach(t => {
      if (t.startsWith("/")) {
        const body = t.slice(1);
        const ci = body.indexOf(":");
        if (ci === -1) flags[body.toLowerCase()] = true;
        else flags[body.slice(0, ci).toLowerCase()] = body.slice(ci + 1).toLowerCase();
      } else args.push(t);
    });
    return { flags, args };
  }

  function execute(raw) {
    raw = String(raw || "").trim();
    echo(raw || "");
    if (!raw) return;
    if (!history.length || history[history.length - 1] !== raw) history.push(raw);
    histIdx = history.length;
    liveEntry = "";

    const tokens = raw.split(/\s+/);
    const name = resolveCmd(tokens[0]);
    const { flags, args } = parseArgs(tokens.slice(1));

    const c = commands[name];
    if (!c) {
      const guess = Object.keys(commands).find(k => k.startsWith(name));
      print("UNKNOWN COMMAND: " + tokens[0].toUpperCase(), "err");
      if (guess) print("DID YOU MEAN: " + guess + " ?", "dim");
      print("TYPE HELP FOR COMMAND LIST.", "dim");
      Sound.blip(180, 0.1);
      return;
    }
    try { c.fn({ args, flags }); }
    catch (e) { print("SYSTEM ERROR: " + (e.message || e), "err"); }
  }

  /* ---------- input wiring ---------- */

  function onKey(e) {
    if (e.key === "Enter") {
      e.preventDefault();
      if (resultsActive && input.value === "" && openSelected()) return;
      const v = input.value;
      input.value = "";
      updateCursor();
      resetResults();
      execute(v);
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (resultsActive && input.value === "" && moveSelection(-1)) return;
      if (!history.length) return;
      if (histIdx === history.length) liveEntry = input.value;
      if (histIdx === -1) histIdx = history.length;
      histIdx = Math.max(0, histIdx - 1);
      input.value = history[histIdx] || "";
      updateCursor();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (resultsActive && input.value === "" && moveSelection(1)) return;
      if (histIdx === -1 || !history.length) return;
      histIdx = Math.min(history.length, histIdx + 1);
      input.value = histIdx === history.length ? liveEntry : history[histIdx];
      updateCursor();
      return;
    }
    if (e.key === "Tab") {
      e.preventDefault();
      complete();
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      if (resultsActive) { resetResults(); }
      return;
    }
    /* any real typing deactivates result selection mode */
    if (e.key.length === 1 && resultsActive) resetResults();
  }

  ["input", "keyup", "focus", "click", "select"].forEach(ev =>
    input.addEventListener(ev, updateCursor));

  /* ---------- commands ---------- */

  cmd("HELP", "Show command help.", "HELP [command]",
    ({ args }) => {
      if (args[0]) {
        const n = resolveCmd(args[0]);
        const c = commands[n];
        if (!c) { print("NO HELP ENTRY: " + args[0].toUpperCase(), "err"); return; }
        print(c.name + (n !== c.name ? " (alias " + n + ")" : ""));
        print("  " + c.desc, "dim");
        print("  USAGE: " + c.usage, "dim");
        return;
      }
      print("AVAILABLE COMMANDS:", "head");
      print("  HELP [cmd]    This help, or help for one command");
      print("  LIST [f]      List archive. f = type or category");
      print("                flags: /SORT:ID|TITLE|DATE|TYPE /DESC");
      print("  SEARCH q [in:f]  Search. fields: ID FILE TITLE TYPE");
      print("                CATEGORY TAGS DATE DESCRIPTION ALL");
      print("  OPEN id       Open evidence in a viewer window");
      print("  INFO id       Show evidence details");
      print("  DOWNLOAD id   Retrieve the raw file");
      print("  NEXT / PREV   Open next / previous record");
      print("  RELATED id    List linked evidence");
      print("  CLEAR         Clear the screen");
      print("  MAIN          Return to the main site");
      print("  SOUND ON|OFF  Terminal audio feedback");
      print("  STATUS        System diagnostics");
      print("  REBOOT        Replay boot sequence");
      print("TIP: RESULTS ARE CLICKABLE. ARROWS + ENTER ALSO WORK.", "dim");
    },
    ["MAN", "?"]);

  cmd("LIST", "List archive records.", "LIST [type|category] [/SORT:field] [/DESC]",
    ({ args, flags }) => {
      let list;
      let label = "ALL VISIBLE RECORDS";
      if (args[0]) {
        const t = Archive.typeFromKeyword(args[0]);
        if (t) { list = Archive.filter(Archive.visible(), { type: t }); label = "TYPE: " + t.toUpperCase(); }
        else { list = Archive.filter(Archive.visible(), { category: args[0] }); label = "CATEGORY: " + args[0].toUpperCase(); }
      } else {
        list = Archive.visible();
      }
      if (flags.sort) list = Archive.sort(list, flags.sort, !!flags.desc);
      showResults(list, "ARCHIVE INDEX \u2014 " + label);
    },
    ["DIR", "LS"]);

  cmd("SEARCH", "Search archive records.", "SEARCH <query> [in:FIELD]",
    ({ args, flags }) => {
      const field = (flags.in || "all");
      const q = args.join(" ");
      if (!q) { print("USAGE: SEARCH <query> [in:FIELD]", "err"); return; }
      const list = Archive.search(q, field);
      showResults(Archive.sort(list, "id", false), "SEARCH \u2014 \"" + q.toUpperCase() + "\" IN " + field.toUpperCase());
    },
    ["FIND", "GREP"]);

  cmd("OPEN", "Open an evidence record.", "OPEN <id>",
    ({ args }) => {
      if (!args[0]) { print("USAGE: OPEN <ID>   (TAB COMPLETES IDS)", "err"); return; }
      const ev = Archive.byId(args[0]);
      if (!ev) {
        const near = Archive.search(args[0], "id");
        print("EVIDENCE NOT FOUND: " + args[0].toUpperCase(), "err");
        if (near.length) print("CLOSE MATCH: " + near[0].id + " \u2014 " + near[0].title, "dim");
        return;
      }
      Media.open(ev);
    },
    ["PLAY", "VIEW"]);

  cmd("INFO", "Show evidence metadata.", "INFO <id>",
    ({ args }) => {
      if (!args[0]) { print("USAGE: INFO <ID>", "err"); return; }
      const ev = Archive.byId(args[0]);
      if (!ev) { print("EVIDENCE NOT FOUND: " + args[0].toUpperCase(), "err"); return; }
      print("\u2500".repeat(56), "dim");
      printHTML("<span class='k'>ID:</span>       " + esc(ev.id));
      print("FILE:      " + (ev.filename || ev.file || "(none)"));
      print("PATH:      " + (ev.file || "(none)"), "dim");
      print("TITLE:     " + ev.title);
      print("TYPE:      " + ev.type.toUpperCase() + (ev.category ? " / " + ev.category.toUpperCase() : ""));
      print("DATE:      " + (ev.date || "UNKNOWN"));
      print("SIZE:      " + (ev.size || "UNKNOWN"));
      print("STATUS:    " + (ev.locked ? "RESTRICTED" : ev.hidden ? "ARCHIVED / INDEX HIDDEN" : "UNRESTRICTED"));
      if (ev.description) print("NOTES:     " + ev.description, "dim");
      if (ev.tags.length) print("TAGS:      " + ev.tags.join(", "), "dim");
      if (ev.related.length) {
        const d = print("RELATED:   ");
        ev.related.forEach(rid => {
          const r = Archive.byId(rid);
          const s = document.createElement("span");
          s.className = "evlink";
          s.textContent = rid;
          s.addEventListener("click", () => { if (r) { resetResults(); Media.open(r); } });
          d.appendChild(s);
          d.appendChild(document.createTextNode("  "));
        });
      }
      if (ev.externalUrl) printHTML("EXTERNAL:  <a class='evlink' href='" + esc(ev.externalUrl) + "' target='_blank' rel='noopener'>" + esc(ev.externalUrl) + "</a>");
      print("\u2500".repeat(56), "dim");
    });

  cmd("DOWNLOAD", "Download an evidence file.", "DOWNLOAD <id>",
    ({ args }) => {
      if (!args[0]) { print("USAGE: DOWNLOAD <ID>", "err"); return; }
      const ev = Archive.byId(args[0]);
      if (!ev) { print("EVIDENCE NOT FOUND: " + args[0].toUpperCase(), "err"); return; }
      Media.download(ev);
    },
    ["GET", "SAVE"]);

  cmd("NEXT", "Open the next record.", "NEXT",
    () => {
      if (!Media.lastOpenedId) { print("NO RECORD OPEN. USE OPEN <ID> FIRST.", "err"); return; }
      const n = Archive.neighbors(Media.lastOpenedId).next;
      if (!n) { print("END OF INDEX. NO FURTHER RECORDS.", "dim"); return; }
      Media.open(n);
    });

  cmd("PREV", "Open the previous record.", "PREV",
    () => {
      if (!Media.lastOpenedId) { print("NO RECORD OPEN. USE OPEN <ID> FIRST.", "err"); return; }
      const p = Archive.neighbors(Media.lastOpenedId).prev;
      if (!p) { print("START OF INDEX. NO EARLIER RECORDS.", "dim"); return; }
      Media.open(p);
    },
    ["PREVIOUS"]);

  cmd("RELATED", "List evidence linked to a record.", "RELATED <id>",
    ({ args }) => {
      if (!args[0]) { print("USAGE: RELATED <ID>", "err"); return; }
      const ev = Archive.byId(args[0]);
      if (!ev) { print("EVIDENCE NOT FOUND: " + args[0].toUpperCase(), "err"); return; }
      if (!ev.related.length) { print("NO LINKED RECORDS FOR " + ev.id + ".", "dim"); return; }
      const list = ev.related.map(r => Archive.byId(r)).filter(Boolean);
      showResults(list, "RECORDS LINKED TO " + ev.id + ":");
    },
    ["LINKS"]);

  cmd("CLEAR", "Clear the terminal.", "CLEAR", () => clear(), ["CLS"]);

  cmd("MAIN", "Return to the main site.", "MAIN",
    () => {
      const url = Archive.config.mainSite;
      if (!url) { print("MAIN SITE LINK NOT CONFIGURED. SET config.mainSite IN data/evidence.json.", "err"); return; }
      printHTML("RETURNING TO MAIN SITE. CLICK TO PROCEED: <a class='evlink' href='" + esc(url) + "'>" + esc(url) + "</a>");
      print("(THE MAIN SITE ALSO REDIRECTS HERE THROUGH ITS ARCHIVE COMMAND.)", "dim");
    },
    ["HOME", "EXIT"]);

  cmd("SOUND", "Terminal audio feedback.", "SOUND ON|OFF",
    ({ args }) => {
      const v = (args[0] || "").toUpperCase();
      if (v === "ON") { Sound.enabled = true; Sound.blip(660, 0.06); print("SOUND: ON", "ok"); }
      else if (v === "OFF") { Sound.enabled = false; print("SOUND: OFF", "ok"); }
      else print("USAGE: SOUND ON | OFF   (CURRENTLY " + (Sound.enabled ? "ON" : "OFF") + ")", "dim");
    });

  cmd("STATUS", "System diagnostics.", "STATUS", () => {
    const counts = Archive.typeCounts();
    const uptime = fmtUptime(Date.now() - bootTime);
    print("SYSTEM DIAGNOSTICS", "head");
    print("RECORDS:      " + Archive.items.length + " (" + (Archive.items.length - Archive.visible().length) + " HIDDEN)");
    print("BY TYPE:      " + Object.entries(counts).map(([k, v]) => k.toUpperCase() + " " + v).join(" | "));
    print("WINDOWS OPEN: " + WinMgr.openCount() + " (" + WinMgr.count() + " TOTAL)");
    print("MEDIA LOADED: " + Media.stats().loaded + "   ERRORS: " + Media.stats().errors);
    print("DISPLAY:      " + window.innerWidth + "x" + window.innerHeight + " CRT-9 MONOCHROME");
    print("UPTIME:       " + uptime);
    print("INDEX SOURCE: data/evidence.json " + (Archive.loaded ? "[OK]" : "[ERROR: " + Archive.loadError + "]"), Archive.loaded ? "" : "err");
  });

  cmd("REBOOT", "Replay the boot sequence.", "REBOOT", () => { clear(); Main.bootSequence(); });

  let bootTime = Date.now();
  function fmtUptime(ms) {
    const s = Math.floor(ms / 1000);
    return String(Math.floor(s / 3600)).padStart(2, "0") + ":" +
           String(Math.floor(s / 60) % 60).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0");
  }

  function init() {
    promptEl.textContent = Archive.config.prompt || "D9>";
    input.addEventListener("keydown", onKey);
    refocus();
  }

  return { print, printHTML, echo, clear, execute, init, refocus, resetResults,
           get resultsActive() { return resultsActive; }, bootTime };
})();
