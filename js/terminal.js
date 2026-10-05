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
  const listOut = document.getElementById("list-output");

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
            await sleep(it.speed || TYPE_SPEED);
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
    const speed = opts && opts.speed ? opts.speed : 0;   /* ms per character, overrides the default */
    const lines = String(text).split("\n");
    let last = null;
    lines.forEach(l => {
      const d = mk("div", "line" + (cls ? " " + cls : ""));
      const node = document.createTextNode("");
      d.appendChild(node);
      d.style.display = "none";
      out.appendChild(d);
      enqueue({ el: d, node, text: l === "" ? "\u00a0" : l, instant, speed });
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
  async function progress(text, skipFn, stepMs) {
    await whenIdle();
    const d = mk("div", "line system");
    out.appendChild(d);
    for (let i = 0; i <= 10; i++) {
      d.textContent = text + " [" + "\u2588".repeat(i) + "\u2591".repeat(10 - i) + "]";
      scroll();
      if (!(skipFn && skipFn())) await sleep(stepMs || 100);
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

  function addPanelHead(panel, title, count, unit) {
    const head = mk("div", "ev-head");
    head.appendChild(mk("span", "", title));
    head.appendChild(mk("span", "", count + (count === 1 ? " " + unit : " " + unit + "S")));
    panel.appendChild(head);
  }

  function makeRow(ev, words, indent, panel) {
    const row = mk("div", "ev-row result-line ind" + indent);
    row.appendChild(mk("span", "ev-badge t-" + ev.type, TYPE_TAGS[ev.type]));
    const t = mk("span", "r-title");
    t.innerHTML = hlHTML(ev.title, words);
    row.appendChild(t);
    row.addEventListener("click", () => { resetResults(); Media.open(ev); });
    panel.appendChild(row);
    results.push(ev.key); resultEls.push(row);
    return row;
  }

  function finishResults() {
    print("TYPE A RECORD NAME TO OPEN IT, OR USE \u2191 \u2193 + ENTER ON AN EMPTY LINE. (CLICKING A ROW WORKS TOO.)", "dim");
    Sound.play("success");
    resultsActive = true;
    selectResult(0, true);
  }

  /* LIST / pick lists. Tree layout matches the main site's database index:
       [CATEGORY]
           Title
           [SUBCATEGORY]
               Title                                                   */
  function showResults(list, title, words, opts) {
    resetResults();
    opts = opts || {};
    if (!list.length) { print("NO MATCHING RECORDS.", "warning"); return; }

    const panel = mk("div", "ev-panel");
    addPanelHead(panel, title, list.length, "RECORD");

    const ordered = items => opts.sort ? Archive.sort(items, opts.sort, opts.desc) : items;
    if (opts.flat) list.forEach(ev => makeRow(ev, words, 0, panel));
    else Archive.group(list).forEach(g => {
      panel.appendChild(mk("div", "ev-cat", "[" + g.category.toUpperCase() + "]"));
      ordered(g.direct).forEach(ev => makeRow(ev, words, 1, panel));
      g.subs.forEach(sc => {
        panel.appendChild(mk("div", "ev-sub", "[" + sc.name.toUpperCase() + "]"));
        ordered(sc.items).forEach(ev => makeRow(ev, words, 2, panel));
      });
    });

    printNode(panel);
    finishResults();
  }

  /* SEARCH results, same shape as the main site's: each hit shows
     [CATEGORY / SUBCATEGORY] Title with the term highlighted, plus an
     excerpt line when the match is inside the file body. */
  function showSearch(hits, term) {
    resetResults();
    const panel = mk("div", "ev-panel");
    addPanelHead(panel, "SEARCH RESULTS FOR \"" + term + "\"", hits.length, "RESULT");
    hits.forEach(h => {
      const ev = h.entry;
      const row = makeRow(ev, [term], 0, panel);
      row.insertBefore(mk("span", "r-loc", "[" + Archive.location(ev).toUpperCase() + "]"), row.children[1]);
      if (h.snippet) {
        const sn = mk("div", "ev-snip");
        sn.innerHTML = "\"" + hlHTML(h.snippet, [term]) + "\"";
        panel.appendChild(sn);
      }
    });
    printNode(panel);
    finishResults();
  }

  /* ---------- the index panel (always on screen) ----------
       [CATEGORY]
           Title
           [SUBCATEGORY]
               Title                                              */

  function clearIndex(text) {
    listOut.innerHTML = "";
    if (text) listOut.appendChild(mk("div", "idx-wait", text));
  }

  function renderIndex() {
    listOut.innerHTML = "";
    const list = Archive.visible();
    const panel = mk("div", "ev-panel");
    const head = mk("div", "ev-head");
    head.appendChild(mk("span", "", "DIRECTORY INDEX"));
    head.appendChild(mk("span", "", list.length + (list.length === 1 ? " RECORD" : " RECORDS")));
    panel.appendChild(head);

    const addRow = (ev, indent) => {
      const row = mk("div", "ev-row result-line ind" + indent);
      row.appendChild(mk("span", "ev-badge t-" + ev.type, TYPE_TAGS[ev.type]));
      row.appendChild(mk("span", "r-title", ev.title));
      row.addEventListener("click", () => { resetResults(); Media.open(ev); });
      panel.appendChild(row);
    };

    Archive.group(list).forEach(g => {
      panel.appendChild(mk("div", "ev-cat", "[" + g.category.toUpperCase() + "]"));
      g.direct.forEach(ev => addRow(ev, 1));
      g.subs.forEach(sc => {
        panel.appendChild(mk("div", "ev-sub", "[" + sc.name.toUpperCase() + "]"));
        sc.items.forEach(ev => addRow(ev, 2));
      });
    });
    listOut.appendChild(panel);
    listOut.scrollTop = 0;
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
    const ev = Archive.byKey(results[resultIdx]);
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
      if (["OPEN", "RELATED", "SEARCH"].includes(c)) {
        const rest = tokens.slice(1).join(" ").toLowerCase();
        const names = new Set();
        Archive.visible().forEach(e => names.add(e.title));
        if (c === "SEARCH") Archive.categories().concat(Archive.subcategories()).forEach(n => names.add(n));
        return [...names]
          .filter(n => n.toLowerCase().startsWith(rest))
          .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))
          .map(n => tokens[0] + " " + n);
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

    const name = resolveCmd(tokens[0]);

    /* not a command: if it names a record, open it */
    if (!commands[name]) {
      const f = Archive.find(raw);
      if (f.exact) { Media.open(f.exact); return; }
      if (f.ambiguous || f.matches.length > 1) { openByName(raw, "OPEN <NAME>"); return; }
    }
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

  /* open by name: exact, or a unique partial; several matches show a pick list */
  function openByName(q, usage) {
    if (!q) { print("USAGE: " + usage + "   (TAB COMPLETES NAMES)", "err"); return null; }
    const f = Archive.find(q);
    if (f.exact) { Media.open(f.exact); return f.exact; }
    if (f.ambiguous) {
      print("MULTIPLE ENTRIES FOUND: \"" + q + "\"", "warning");
      f.matches.forEach(e => print("[" + Archive.location(e).toUpperCase() + "]"));
      print("Type 'open <category/subcategory> " + q + "' to specify - see location(s) above.", "dim");
      return null;
    }
    if (f.matches.length > 1) {
      print("MULTIPLE RECORDS MATCH. BE MORE SPECIFIC:", "warning");
      showResults(f.matches, "MATCHING \"" + q.toUpperCase() + "\"", [q], { flat: true });
      return null;
    }
    print("ERROR 0xA143", "err");
    print("FILE NOT FOUND", "err");
    return null;
  }

  cmd("HELP", "Show command help.", "HELP [command]",
    ({ args }) => {
      if (args[0]) {
        const c = commands[resolveCmd(args[0])];
        if (!c) { print("NO HELP ENTRY: " + args[0].toUpperCase(), "err"); return; }
        Sound.play("success");
        printBox(c.usage, c.desc);
        return;
      }
      Sound.play("success");
      print("APPROVED COMMANDS:", "success");
      printBox("SEARCH <term>", "search titles and file contents. Results appear here; the index stays put");
      printBox("OPEN <name>", "open a record in a viewer window. Clicking it in the index works too, and so does typing just the name. Use \"open <category> <name>\" if two records share a title");
      printBox("NEXT / PREV", "open the next or previous record");
      printBox("RELATED [name]", "list records linked to one (defaults to the last record opened)");
      printBox("MUTE / UNMUTE", "silence or restore all sound");
      printBox("CLEAR", "clear the screen");
      printBox("REBOOT", "replay the boot sequence");
      print("Tab completes (press again to cycle) \u00b7 \u2191 \u2193 recalls previous commands \u00b7 ESC closes the front window", "system");
    },
    ["MAN", "?"]);

  cmd("SEARCH", "Search titles and file contents.", "SEARCH <term>",
    ({ args }) => {
      const term = args.join(" ").trim();
      if (!term) { print("USAGE: search <term>", "err"); return; }
      const hits = Archive.search(term);
      if (!hits.length) { print("NO RESULTS FOR \"" + term + "\"", "err"); return; }
      showSearch(hits, term);
    },
    ["FIND", "GREP"]);

  cmd("OPEN", "Open a record in a viewer window.", "OPEN <name>",
    ({ args }) => { openByName(args.join(" "), "OPEN <NAME>"); },
    ["PLAY", "VIEW"]);

  cmd("NEXT", "Open the next record.", "NEXT",
    () => {
      if (!Media.lastOpenedKey) { print("NO RECORD OPEN. USE OPEN <NAME> FIRST.", "err"); return; }
      const n = Archive.neighbors(Media.lastOpenedKey).next;
      if (!n) { print("END OF INDEX. NO FURTHER RECORDS.", "warning"); return; }
      Media.open(n);
    },
    ["N"]);

  cmd("PREV", "Open the previous record.", "PREV",
    () => {
      if (!Media.lastOpenedKey) { print("NO RECORD OPEN. USE OPEN <NAME> FIRST.", "err"); return; }
      const p = Archive.neighbors(Media.lastOpenedKey).prev;
      if (!p) { print("START OF INDEX. NO EARLIER RECORDS.", "warning"); return; }
      Media.open(p);
    },
    ["PREVIOUS", "B", "BACK"]);

  cmd("RELATED", "List records linked to a record.", "RELATED [name]",
    ({ args }) => {
      const q = args.join(" ");
      let ev = q ? Archive.find(q).exact : Archive.byKey(Media.lastOpenedKey);
      if (!ev) {
        if (!q) print("NO RECORD OPEN. USE RELATED <NAME>.", "err");
        else print("NO RECORD ON FILE: " + q.toUpperCase(), "err");
        return;
      }
      const list = ev.related.map(t => Archive.byTitle(t)).filter(Boolean);
      if (!list.length) { print("NO LINKED RECORDS FOR " + ev.title.toUpperCase() + ".", "warning"); return; }
      showResults(list, "LINKED TO " + ev.title.toUpperCase(), null, { flat: true });
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

  cmd("REBOOT", "Replay the boot sequence.", "REBOOT", () => { clear(); Main.bootSequence(); });

  function init() {
    /* prompt is a plain ">" like the main terminal */
    input.addEventListener("keydown", onKey);
    refocus();
  }

  return {
    print, printHTML, printNode, printBox, echo, clear, execute, init, refocus,
    renderIndex, clearIndex,
    resetResults, progress, whenIdle, skipTyping,
    get resultsActive() { return resultsActive; }
  };
})();
