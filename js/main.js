"use strict";
/* main.js - boot sequence, sound, global keys, status clock. */

const Sound = (() => {
  let ctx = null;
  const mod = {
    enabled: false,
    blip(freq, dur) {
      if (!mod.enabled) return;
      try {
        ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = "square";
        o.frequency.value = freq || 520;
        g.gain.value = 0.05;
        o.connect(g); g.connect(ctx.destination);
        o.start();
        g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + (dur || 0.05));
        o.stop(ctx.currentTime + (dur || 0.05) + 0.02);
      } catch (e) { /* audio unavailable - stay silent */ }
    }
  };
  return mod;
})();

const Main = (() => {
  const statusRight = document.getElementById("status-right");
  const sysStatus = document.getElementById("sys-status");
  const cmdline = document.getElementById("cmdline");

  const BOOT_LINES = [
    ["DIVISION 9 ARCHIVE TERMINAL  v1.0", 60],
    ["(C)1994 DIVISION 9 - INTERNAL USE ONLY", 40],
    ["UNAUTHORIZED ACCESS WILL BE PROSECUTED.", 60],
    ["", 30],
    ["MEMORY CHECK .............. 640K OK", 90],
    ["EVIDENCE INDEX ............ {N} RECORDS LOADED", 120],
    ["DISPLAY ................... CRT-9 MONOCHROME / 720p", 90],
    ["UPLINK .................... STABLE", 120],
    ["", 60],
    ["READY. TYPE HELP FOR COMMANDS.", 140]
  ];

  let skipBoot = false;

  function sleep(ms) {
    return new Promise(res => {
      let t = setTimeout(done, ms);
      function done() { cleanup(); res(); }
      function cleanup() { clearTimeout(t); }
    });
  }

  async function bootSequence() {
    skipBoot = false;
    const records = Archive.visible().length;
    Term.clear();
    sysStatus.textContent = "BOOTING";
    for (const [line, delay] of BOOT_LINES) {
      if (skipBoot) break;
      Term.print(line.replace("{N}", String(records)));
      await sleep(delay);
    }
    if (skipBoot) {
      Term.clear();
      BOOT_LINES.forEach(([line]) => Term.print(line.replace("{N}", String(records)), "dim"));
      Term.print("");
      Term.print("BOOT SKIPPED.");
    }
    sysStatus.textContent = "SYSTEM ONLINE";
    Term.refocus();
  }

  function statusClock() {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");
    const ss = String(now.getSeconds()).padStart(2, "0");
    statusRight.textContent = Archive.items.length + " REC | " + hh + ":" + mm + ":" + ss;
  }

  function globalKeys(e) {
    /* ESC closes the focused window; otherwise clears result selection */
    if (e.key === "Escape") {
      if (WinMgr.closeFocused()) return;
      if (Term.resultsActive) Term.resetResults();
      return;
    }
    /* clicking a window can blur the input - keep typing seamless */
    const t = e.target;
    const inField = t === cmdline || t.closest("input, textarea, iframe, audio, video");
    if (!inField && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      Term.refocus();
    }
  }

  /* deep link support: index.html?open=EV-003 auto-opens a record
     (useful for puzzle redirects from the main site) */
  function deepLink() {
    const p = new URLSearchParams(location.search);
    const id = (p.get("open") || "").toUpperCase();
    if (id) {
      const ev = Archive.byId(id);
      if (ev) setTimeout(() => Media.open(ev), 400);
      else Term.print("DEEP LINK: RECORD " + id + " NOT FOUND IN INDEX.", "err");
    }
  }

  async function init() {
    await Archive.load();
    Term.init();
    if (!Archive.loaded) {
      /* index is the single point of failure - be loud about it */
      Term.print("FATAL: EVIDENCE INDEX FAILED TO LOAD.", "err");
      Term.print("REASON: " + Archive.loadError, "err");
      Term.print("Serve the folder over HTTP (see README). The terminal stays online.", "dim");
      sysStatus.textContent = "DEGRADED";
      Term.refocus();
      return;
    }
    await bootSequence();
    deepLink();
    statusClock();
    setInterval(statusClock, 1000);
  }

  document.addEventListener("keydown", globalKeys);
  document.addEventListener("pointerdown", () => { skipBoot = true; }, { once: false });

  return { bootSequence, init };
})();

Main.init();
