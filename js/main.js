"use strict";
/* main.js - boot sequence, status bar, idle banner, global keys.
   (Interface sounds live in sound.js.) */

const Main = (() => {
  const statusRight = document.getElementById("status-right");
  const sysStatus = document.getElementById("sys-status");
  const cmdline = document.getElementById("cmdline");
  const appEl = document.getElementById("app");

  let skipBoot = false;
  let started = false;

  function sleep(ms) { return new Promise(res => setTimeout(res, ms)); }

  function setStatus(text, online) {
    sysStatus.textContent = text;
    sysStatus.style.color = online ? "var(--blue)" : "";
  }

  /* ---------- boot ---------- */

  async function bootSequence() {
    skipBoot = false;
    const records = Archive.visible().length;
    Term.clear();
    setStatus("BOOTING", false);
    Sound.play("startup");

    Term.print("BSLSK DIVISION-9 // EVIDENCE ARCHIVE  v" + (Archive.config.version || "1.0"), "boot");
    Term.print("(C)1994 DIVISION 9 - INTERNAL USE ONLY", "boot");
    Term.print("UNAUTHORIZED ACCESS WILL BE PROSECUTED.", "boot");
    Term.print("--------------------------------", "boot");
    await Term.progress("MOUNTING ARCHIVE", () => skipBoot);
    await Term.progress("INDEXING EVIDENCE", () => skipBoot);
    Term.print("");
    Term.print("CONNECTION ESTABLISHED", "success");
    Term.print(records + " RECORD" + (records === 1 ? "" : "S") + " LOADED", "success");
    Term.print("");
    Term.print("TYPE 'HELP' FOR A LIST OF COMMANDS", "system");
    Term.print("");
    await Term.whenIdle();

    setStatus("ONLINE", true);
    Term.refocus();
  }

  /* ---------- status clock ---------- */

  function statusClock() {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");
    const ss = String(now.getSeconds()).padStart(2, "0");
    statusRight.textContent = Archive.items.length + " REC | " + hh + ":" + mm + ":" + ss;
  }

  /* ---------- idle banner ----------
     After 5 minutes without input a bouncing logo takes over the
     terminal, like the main site's screensaver. Any key, click or
     touch dismisses it. Geometry is measured once and only the
     transform changes per frame (smooth on phones). */

  const IDLE_MS = 5 * 60 * 1000;
  const IDLE_SPEED = 90;   /* pixels per second */

  const IDLE_BANNER = [
    "█████       ████   ████ ",
    "█    █          █  █    █",
    "█    █  ████    █  █    █",
    "█    █          █   █████",
    "█████       ████       █ ",
    "                   ████  ",
    "",
    "EVIDENCE ARCHIVE"
  ].join("\n");

  const idleEl = document.getElementById("idle-banner");
  const idleText = document.getElementById("idle-banner-text");

  let lastActivity = Date.now();
  let idleVisible = false;
  let idleFrame = null;
  let idleLast = null;
  let ix = 0, iy = 0, ivx = IDLE_SPEED, ivy = IDLE_SPEED;
  let boxW = 0, boxH = 0, bw = 0, bh = 0;

  function registerActivity() {
    lastActivity = Date.now();
    if (idleVisible) hideIdle();
  }

  ["keydown", "mousedown", "touchstart", "click"].forEach(ev =>
    document.addEventListener(ev, registerActivity, { passive: true, capture: true }));

  setInterval(() => {
    if (!idleVisible && Date.now() - lastActivity >= IDLE_MS) showIdle();
  }, 1000);

  function showIdle() {
    if (idleVisible) return;
    const r = appEl.getBoundingClientRect();
    idleEl.style.left = r.left + "px";
    idleEl.style.top = r.top + "px";
    idleEl.style.width = r.width + "px";
    idleEl.style.height = r.height + "px";

    idleText.style.fontSize = "";
    idleText.textContent = IDLE_BANNER;
    idleEl.classList.add("visible");
    idleVisible = true;

    /* shrink (whole pixels) until the logo fits inside the terminal */
    let fs = parseFloat(getComputedStyle(idleText).fontSize);
    let b = idleText.getBoundingClientRect();
    while ((b.width > r.width * 0.92 || b.height > r.height * 0.8) && fs > 6) {
      fs -= 1;
      idleText.style.fontSize = fs + "px";
      b = idleText.getBoundingClientRect();
    }
    boxW = r.width; boxH = r.height; bw = b.width; bh = b.height;
    ix = Math.random() * Math.max(0, boxW - bw);
    iy = Math.random() * Math.max(0, boxH - bh);
    ivx = Math.random() < 0.5 ? -IDLE_SPEED : IDLE_SPEED;
    ivy = Math.random() < 0.5 ? -IDLE_SPEED : IDLE_SPEED;
    idleLast = null;
    idleFrame = requestAnimationFrame(stepIdle);
  }

  function stepIdle(now) {
    if (!idleVisible) return;
    if (idleLast === null) idleLast = now;
    const dt = Math.min((now - idleLast) / 1000, 0.05);
    idleLast = now;
    ix += ivx * dt; iy += ivy * dt;
    const maxX = Math.max(0, boxW - bw), maxY = Math.max(0, boxH - bh);
    if (ix <= 0) { ix = 0; ivx = Math.abs(ivx); }
    if (ix >= maxX) { ix = maxX; ivx = -Math.abs(ivx); }
    if (iy <= 0) { iy = 0; ivy = Math.abs(ivy); }
    if (iy >= maxY) { iy = maxY; ivy = -Math.abs(ivy); }
    idleText.style.transform = "translate3d(" + Math.round(ix) + "px," + Math.round(iy) + "px,0)";
    idleFrame = requestAnimationFrame(stepIdle);
  }

  function hideIdle() {
    idleVisible = false;
    if (idleFrame) cancelAnimationFrame(idleFrame);
    idleFrame = null;
    idleEl.classList.remove("visible");
  }

  window.addEventListener("resize", () => { if (idleVisible) { hideIdle(); showIdle(); } });

  /* ---------- keys ---------- */

  function globalKeys(e) {
    Sound.startAmbience();
    /* ESC closes the focused window; otherwise clears result selection */
    if (e.key === "Escape") {
      if (WinMgr.closeFocused()) return;
      if (Term.resultsActive) Term.resetResults();
      return;
    }
    /* clicking a window can blur the input - keep typing seamless */
    const t = e.target;
    const inField = t === cmdline || (t.closest && t.closest("input, textarea, iframe, audio, video"));
    if (!inField && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      Term.refocus();
    }
  }

  /* deep link: index.html?open=EV-003 auto-opens a record
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
      setStatus("DEGRADED", false);
      Term.refocus();
      return;
    }
    await bootSequence();
    deepLink();
    statusClock();
    setInterval(statusClock, 1000);
  }

  /* wait for the page to finish loading, then reveal the terminal
     (the "ready" class is what the inline styles in index.html wait
     for - this is what removes the grey startup flash) */
  function start() {
    if (started) return;
    started = true;
    document.documentElement.classList.add("ready");
    init();
  }

  document.addEventListener("keydown", globalKeys);

  /* any key or click during boot skips the waiting */
  document.addEventListener("pointerdown", () => { skipBoot = true; Term.skipTyping(); Sound.startAmbience(); });
  document.addEventListener("keydown", () => { skipBoot = true; });

  if (document.readyState === "complete") start();
  else {
    window.addEventListener("load", start);
    setTimeout(start, 2500);
  }

  return { bootSequence, init };
})();
