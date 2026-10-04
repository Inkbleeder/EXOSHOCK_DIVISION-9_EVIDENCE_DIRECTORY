"use strict";
/* terminal.js - terminal UI, command registry, typewriter output,
   history, Tab completion, result keyboard navigation.

   Output behaves like the main terminal: lines type out, any key
   instantly completes them, bordered help boxes, highlighted search
   matches, Tab cycles completions with a (1/3) counter. */

const Term = (() => {
  const out = document.getElementById("terminal-output");
  const input = document.getElementById("cmdline");
  const promptEl = document.getElementById("prompt");
  const tabHint = document.getElementById("tab-hint");

  const history = [];
  let histIdx = -1;
  let liveEntry = "";

  let results = [];          // evidence ids shown in last result block
  let resultEls = [];
  let resultIdx = -1;
  let resultsActive = false;

  const commands = {};
  const aliases = {};

  const TYPE_SPEED = 12;     // ms per character (same as the main terminal)

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function mk(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  /* ---------- typewriter print queue ----------
     Elements are added to the page immediately (so callers can keep
     using the element print() returns) but stay hidden until their
     turn, so lines always appear in order. */

  const queue = [];
  let busy = false;
  let fast = false;

  function scroll() { out.scrollTop = out.scrollHeight; }

  function enqueue(item) {
    queue.push(item);
    if (!busy) pump();
  }

  async function pump() {
    busy = true;
    while (queue.length) {
      const it = queue.shift();
      it.el.style.display = "";
      if (it.text) {
        if (fast || it.instant) {
          it.node.data = it.text;
        } else {
          for (let i = 1; i <= it.text.length; i++) {
            if (fast) { it.node.data = it.text; break; }
            it.node.data = it.text.slice(0, i);
            scroll();
            await sleep(TYPE_SPEED);
          }
        }
      }
      scroll();
    }
    busy = false;
    fast = false;
  }

  /* any key while text is typing out completes it at once */
  function skipTyping() { if (busy) fast = true; }

  function whenIdle() {
    return new Promise(res => {
      (function chk() { if (!busy && queue.length === 0) res(); else setTimeout(chk, 30); })();
    });
  }

  let lastErrSound = 0;

  function print(text, cls, opts) {
    const instant = !!(opts && opts.instant);
    const lines = String(text).split("\n");
    let last = null;
    lines.forEach(l => {
      const d = mk("div", "line" + (cls ? " " + cls : ""));
      const node = document.createTextNode("");
      d.appendChild(node);
      d.style.display = "none";
      out.appendChild(d);
      enqueue({ el: d, node, text: l === "" ? "\u00a0" : l, instant });
      last = d;
    });
    if (cls === "err" || cls === "error") {
      const now = Date.now();
      if (now - lastErrSound > 200) { lastErrSound = now; Sound.play("error"); }
    }
    return last;
  }

  /* HTML / DOM lines appear whole (no typing), in order */
  function printHTML(html, cls) {
    const d = mk("div", "line" + (cls ? " " + cls : ""));
    d.innerHTML = html;
    d.style.display = "none";
    out.appendChild(d);
    enqueue({ el: d });
    return d;
  }

  function printNode(node) {
    node.style.display = "none";
    out.appendChild(node);
    enqueue({ el: node });
    return node;
  }

  function clear() { out.innerHTML = ""; resetResults(); }

  function echo(text) { print(promptEl.textContent + " " + text, "echo", { instant: true }); }

  /* progress bar line, used by the boot sequence */
  async function progress(text, skipFn) {
    await whenIdle();
    const d = mk("div", "line system");
    out.appendChild(d);
    for (let i = 0; i <= 10; i++) {
      d.textContent = text + " [" + "\u2588".repeat(i) + "\u2591".repeat(10 - i) + "]";
      scroll();
      if (!(skipFn && skipFn())) await sleep(100);
    }
  }

  /* one bordered box per command, like the main terminal's help */
  function printBox(title, desc) {
    const box = mk("div", "help-entry");
    box.appendChild(mk("div", "help-entry-title", title));
    if (desc) box.appendChild(mk("div", "help-entry-desc", desc));
    return printNode(box);
  }

  /* wraps every match of `words` in <span class="hl"> (text is escaped) */
  function hlHTML(text, words) {
    text = String(text);
    words = (words || []).filter(Boolean);
    if (!words.length) return esc(text);
    const re = new RegExp("(" + words.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|") + ")", "ig");
    return text.split(re).map((part, i) =>
      i % 2 === 1 ? "<span class='hl'>" + esc(part) + "</span>" : esc(part)).join("");
  }

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

  function showResults(list, title, words) {
    resetResults();
    if (!list.length) { print("NO MATCHING RECORDS.", "warning"); return; }

    const panel = mk("div", "ev-panel");
    const head = mk("div", "ev-head");
    head.appendChild(mk("span", "", title));
    head.appendChild(mk("span", "", list.length + (list.length === 1 ? " RECORD" : " RECORDS")));
    panel.appendChild(head);

    list.forEach(ev => {
      const row = mk("div", "ev-row result-line");
      row.appendChild(mk("span", "r-id", ev.id));
      row.appendChild(mk("span", "ev-badge t-" + ev.type, TYPE_TAGS[ev.type]));
      const t = mk("span", "r-title");
      t.innerHTML = hlHTML(ev.title, words);
      row.appendChild(t);
      row.appendChild(mk("span", "r-date", ev.date || ""));
      const f = mk("span", "r-file");
      f.innerHTML = hlHTML(ev.filename || ev.file || "", words);
      row.appendChild(f);
      row.addEventListener("click", () => { resetResults(); Media.open(ev); });
      panel.appendChild(row);
      results.push(ev.id); resultEls.push(row);
    });

    printNode(panel);
    print("TYPE AN ID TO OPEN IT, OR USE \u2191 \u2193 + ENTER ON AN EMPTY LINE. (CLICKING A ROW WORKS TOO.)", "dim");
    Sound.play("success");
    resultsActive = true;
    selectResult(0, true);
  }

  function selectResult(i, noScroll) {
    resultEls.forEach(el => el.classList.remove("sel"));
    resultIdx = i;
    if (i >= 0 && resultEls[i]) {
      resultEls[i].classList.add("sel");
      if (!noScroll) resultEls[i].scrollIntoView({ block: "nearest" });
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

  /* ---------- Tab completion (cycles in place, (n/total) counter) ---------- */

  let tabMatches = [];
  let tabIndex = -1;

  function resolveCmd(name) {
    const n = name.toUpperCase();
    return aliases[n] || n;
  }

  /* full-line replacements for what is currently typed */
  function candidates(v) {
    const tokens = v.split(/\s+/);
    const last = tokens[tokens.length - 1];
    const head = tokens.slice(0, -1).join(" ");
    let pool, kind;

    if (tokens.length === 1) {
      pool = Object.keys(commands).concat(Object.keys(aliases).filter(a => a.length > 1));
      kind = "cmd";
    } else {
      const c = resolveCmd(tokens[0]);
      if (["OPEN", "INFO", "RELATED"].includes(c)) {
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
      } else return [];
    }

    if (!last && tokens.length === 1) return [];
    const prefix = last.toUpperCase();
    const seen = new Set();
    return pool
      .filter(p => p.toUpperCase().startsWith(prefix))
      .map(p => (kind === "cmd" ? p.toUpperCase() : p))
      .filter(p => !seen.has(p) && seen.add(p))
      .sort()
      .map(p => (head ? head + " " : "") + p + (kind === "cmd" && tokens.length === 1 ? " " : ""));
  }

  function updateTabHint() {
    tabHint.textContent = tabMatches.length > 1 ? "(" + (tabIndex + 1) + "/" + tabMatches.length + ")" : "";
  }

  function resetTab() { tabMatches = []; tabIndex = -1; tabHint.textContent = ""; }

  function complete() {
    const v = input.value;
    if (tabIndex >= 0 && tabMatches.length && v === tabMatches[tabIndex]) {
      tabIndex = (tabIndex + 1) % tabMatches.length;      /* cycle */
    } else {
      const c = candidates(v);
      if (!c.length) { Sound.play("error"); return; }
      tabMatches = c;
      tabIndex = 0;
    }
    input.value = tabMatches[tabIndex];
    updateTabHint();
  }

  function refocus() { input.focus(); }

  /* ---------- execute ---------- */

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

    /* a lone ID (EV-003) or number (3) opens that record */
    if (tokens.length === 1 && /^(ev-)?\d+$/i.test(tokens[0])) {
      const digits = tokens[0].replace(/^ev-/i, "");
      const id = "EV-" + digits.padStart(3, "0");
      const ev = Archive.byId(id);
      if (ev) { Media.open(ev); return; }
      print("EVIDENCE NOT FOUND: " + id, "err");
      return;
    }

    const name = resolveCmd(tokens[0]);
    const { flags, args } = parseArgs(tokens.slice(1));
    const c = commands[name];

    if (!c) {
      const guess = Object.keys(commands).find(k => k.startsWith(name));
      print("UNKNOWN COMMAND: " + tokens[0].toUpperCase(), "err");
      if (guess) print("DID YOU MEAN: " + guess + " ?", "dim");
      print("TYPE HELP FOR APPROVED COMMANDS.", "dim");
      return;
    }
    try { c.fn({ args, flags }); }
    catch (e) { print("SYSTEM ERROR: " + (e.message || e), "err"); }
  }

  /* ---------- input wiring ---------- */

  function onKey(e) {
    Sound.startAmbience();

    /* any key while text is typing completes it; Enter waits for that */
    if (busy) {
      fast = true;
      if (e.key === "Enter") { e.preventDefault(); return; }
    }

    if (e.key === "Enter") {
      e.preventDefault();
      if (resultsActive && input.value === "" && openSelected()) return;
      const v = input.value;
      input.value = "";
      resetResults();
      resetTab();
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
      resetTab();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (resultsActive && input.value === "" && moveSelection(1)) return;
      if (histIdx === -1 || !history.length) return;
      histIdx = Math.min(history.length, histIdx + 1);
      input.value = histIdx === history.length ? liveEntry : history[histIdx];
      resetTab();
      return;
    }
    if (e.key === "Tab") {
      e.preventDefault();
      complete();
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      if (resultsActive) resetResults();
      return;
    }

    /* anything else is typing: click sound, clear completion state */
    if (e.key.length === 1 || e.key === "Backspace" || e.key === "Delete") {
      Sound.play("keypress");
      resetTab();
      if (resultsActive && e.key.length === 1) resetResults();
    }
  }

  /* ---------- commands ---------- */

  cmd("HELP", "Show command help.", "HELP [command]",
    ({ args }) => {
      if (args[0]) {
        const n = resolveCmd(args[0]);
        const c = commands[n];
        if (!c) { print("NO HELP ENTRY: " + args[0].toUpperCase(), "err"); return; }
        Sound.play("success");
        printBox(c.usage, c.desc);
        return;
      }
      Sound.play("success");
      print("APPROVED COMMANDS:", "success");
      printBox("LIST [type|category]", "list the archive. Flags: /SORT:ID|TITLE|DATE|TYPE  /DESC");
      printBox("SEARCH <words> [in:field]", "search records. Fields: ID FILE TITLE TYPE CATEGORY TAGS DATE DESCRIPTION ALL");
      printBox("OPEN <id>", "open a record in a viewer window. Typing just the ID (EV-003) or number (3) works too");
      printBox("INFO <id>", "show a record's details");
      printBox("NEXT / PREV", "open the next or previous record");
      printBox("RELATED <id>", "list records linked to one");
      printBox("MUTE / UNMUTE", "silence or restore all sound");
      printBox("CLEAR", "clear the screen");
      printBox("MAIN", "return to the main site");
      printBox("REBOOT", "replay the boot sequence");
      print("Tab completes (press again to cycle) \u00b7 \u2191 \u2193 recalls previous commands \u00b7 ESC closes the front window", "system");
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
      const words = q.toLowerCase().split(/\s+/).filter(Boolean);
      showResults(Archive.sort(list, "id", false), "SEARCH \u2014 \"" + q.toUpperCase() + "\" IN " + field.toUpperCase(), [q.toLowerCase()].concat(words));
    },
    ["FIND", "GREP"]);

  cmd("OPEN", "Open an evidence record in a viewer window.", "OPEN <id>",
    ({ args }) => {
      if (!args[0]) { print("USAGE: OPEN <ID>   (TAB COMPLETES IDS)", "err"); return; }
      const ev = Archive.byId(args[0]);
      if (!ev) {
        const near = Archive.search(args[0], "id");
        print("NO RECORD ON FILE: " + args[0].toUpperCase(), "err");
        if (near.length) print("CLOSE MATCH: " + near[0].id + " \u2014 " + near[0].title, "dim");
        else print("IF THE RECORD EXISTS, YOU ARE NOT CLEARED TO KNOW.", "dim");
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

      const panel = mk("div", "ev-panel");
      const head = mk("div", "ev-head");
      head.appendChild(mk("span", "", "RECORD " + ev.id));
      head.appendChild(mk("span", "", TYPE_TAGS[ev.type] + (ev.category ? " / " + ev.category.toUpperCase() : "")));
      panel.appendChild(head);

      const kv = (k, v) => {
        const row = mk("div", "ev-row");
        row.appendChild(mk("span", "ev-key", k));
        row.appendChild(mk("span", "ev-val", v));
        panel.appendChild(row);
        return row;
      };

      kv("TITLE", ev.title);
      kv("FILE", ev.filename || ev.file || "(none)");
      kv("PATH", ev.file || "(none)");
      kv("DATE", ev.date || "UNKNOWN");
      kv("SIZE", ev.size || "UNKNOWN");
      kv("CLASS", ev.locked ? "RESTRICTED // SEALED" : ev.hidden ? "SEALED // INDEX HIDDEN" : "INTERNAL USE ONLY");
      kv("HANDLING", "DO NOT DISTRIBUTE");
      kv("ACCESS LOG", "SUPPRESSED");
      if (ev.description) kv("NOTES", ev.description);
      if (ev.tags.length) kv("TAGS", ev.tags.join(", "));

      if (ev.related.length) {
        const row = kv("RELATED", "");
        const val = row.lastChild;
        ev.related.forEach(rid => {
          const r = Archive.byId(rid);
          const s = mk("span", "evlink", rid);
          s.addEventListener("click", () => { if (r) { resetResults(); Media.open(r); } });
          val.appendChild(s);
          val.appendChild(document.createTextNode("  "));
        });
      }

      if (ev.externalUrl) {
        const row = kv("EXTERNAL", "");
        const a = mk("a", "evlink", ev.externalUrl);
        a.href = ev.externalUrl; a.target = "_blank"; a.rel = "noopener noreferrer";
        row.lastChild.appendChild(a);
      }

      printNode(panel);
      Sound.play("success");
    });

  cmd("NEXT", "Open the next record.", "NEXT",
    () => {
      if (!Media.lastOpenedId) { print("NO RECORD OPEN. USE OPEN <ID> FIRST.", "err"); return; }
      const n = Archive.neighbors(Media.lastOpenedId).next;
      if (!n) { print("END OF INDEX. NO FURTHER RECORDS.", "warning"); return; }
      Media.open(n);
    },
    ["N"]);

  cmd("PREV", "Open the previous record.", "PREV",
    () => {
      if (!Media.lastOpenedId) { print("NO RECORD OPEN. USE OPEN <ID> FIRST.", "err"); return; }
      const p = Archive.neighbors(Media.lastOpenedId).prev;
      if (!p) { print("START OF INDEX. NO EARLIER RECORDS.", "warning"); return; }
      Media.open(p);
    },
    ["PREVIOUS", "B", "BACK"]);

  cmd("RELATED", "List evidence linked to a record.", "RELATED <id>",
    ({ args }) => {
      if (!args[0]) { print("USAGE: RELATED <ID>", "err"); return; }
      const ev = Archive.byId(args[0]);
      if (!ev) { print("EVIDENCE NOT FOUND: " + args[0].toUpperCase(), "err"); return; }
      if (!ev.related.length) { print("NO LINKED RECORDS FOR " + ev.id + ".", "warning"); return; }
      const list = ev.related.map(r => Archive.byId(r)).filter(Boolean);
      showResults(list, "RECORDS LINKED TO " + ev.id);
    },
    ["LINKS"]);

  cmd("CLEAR", "Clear the terminal.", "CLEAR", () => clear(), ["CLS", "C"]);

  cmd("MUTE", "Silence all sound.", "MUTE",
    () => {
      if (Sound.muted) { print("SOUND ALREADY MUTED", "warning"); return; }
      Sound.setMuted(true);
      print("SOUND MUTED", "system");
    });

  cmd("UNMUTE", "Restore all sound.", "UNMUTE",
    () => {
      if (!Sound.muted) { print("SOUND ALREADY UNMUTED", "warning"); return; }
      Sound.setMuted(false);
      Sound.play("success");
      print("SOUND UNMUTED", "success");
    });

  cmd("SOUND", "Sound on or off.", "SOUND ON|OFF",
    ({ args }) => {
      const v = (args[0] || "").toUpperCase();
      if (v === "ON") { Sound.setMuted(false); Sound.play("success"); print("SOUND UNMUTED", "success"); }
      else if (v === "OFF") { Sound.setMuted(true); print("SOUND MUTED", "system"); }
      else print("USAGE: SOUND ON | OFF   (CURRENTLY " + (Sound.muted ? "OFF" : "ON") + ")", "system");
    });

  cmd("MAIN", "Return to the main site.", "MAIN",
    () => {
      const url = Archive.config.mainSite;
      if (!url) { print("MAIN SITE LINK NOT CONFIGURED. SET config.mainSite IN data/evidence.json.", "err"); return; }
      printHTML("RETURNING TO MAIN SITE. CLICK TO PROCEED: <a class='evlink' href='" + esc(url) + "'>" + esc(url) + "</a>");
      print("(THE MAIN SITE ALSO REDIRECTS HERE THROUGH ITS ARCHIVE COMMAND.)", "dim");
    },
    ["HOME", "EXIT"]);

  cmd("REBOOT", "Replay the boot sequence.", "REBOOT", () => { clear(); Main.bootSequence(); });

  function init() {
    /* prompt is a plain ">" like the main terminal */
    input.addEventListener("keydown", onKey);
    refocus();
  }

  return {
    print, printHTML, printNode, printBox, echo, clear, execute, init, refocus,
    resetResults, progress, whenIdle, skipTyping,
    get resultsActive() { return resultsActive; }
  };
})();
