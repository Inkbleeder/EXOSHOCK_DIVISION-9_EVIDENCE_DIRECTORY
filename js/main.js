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

  /* ---------- compliance notice ticker ----------
     A slim line under the header. Normal notices rotate every 20s;
     the boot sequence takes it over to show a security alert. */

  const noticeEl = document.getElementById("notice");
  const noticeText = document.getElementById("notice-text");

  const NOTICES = [
    "ALL ARCHIVE ACCESS IS LOGGED AND REVIEWED BY INTERNAL SECURITY.",
    "REMINDER: COMPLIANCE IS A SHARED RESPONSIBILITY.",
    "DO NOT DISCUSS ARCHIVE CONTENTS WITH UNCLEARED PERSONNEL.",
    "REPORT ANOMALIES TO YOUR SUPERVISOR. DO NOT INVESTIGATE.",
    "THANK YOU FOR YOUR CONTINUED COOPERATION.",
    "BSLSK: SECURING A BETTER TOMORROW."
  ];

  let noticeIdx = 0;
  let noticeLocked = false;

  function setNotice(text, alert) {
    noticeText.textContent = text;
    noticeEl.classList.toggle("alert", !!alert);
  }

  setInterval(() => {
    if (noticeLocked) return;
    noticeIdx = (noticeIdx + 1) % NOTICES.length;
    setNotice(NOTICES[noticeIdx], false);
  }, 20000);

  /* ---------- boot: a backdoor into a locked system ----------
     The terminal is refused at the front door, finds a forgotten
     maintenance listener, and talks its way past the warning.
     Any key or click skips the waiting. */

  async function wait(ms) {
    await Term.whenIdle();
    if (!skipBoot) await sleep(ms);
  }

  async function bootSequence() {
    skipBoot = false;
    noticeLocked = true;
    const records = Archive.visible().length;
    const skip = () => skipBoot;

    Term.clear();
    Term.clearIndex("//-AWAITING INDEX");
    document.documentElement.classList.add("purple");   /* purple before a single line prints */
    appEl.classList.add("breach");
    setStatus("LOCKED", false);
    setNotice("RESTRICTED SYSTEM // AUTHORISED PERSONNEL ONLY", true);
    Sound.play("startup");

    /* 1. knock on the front door */
    Term.print("BSLSK DIVISION-9 // EVIDENCE DIRECTORY", "boot");
    Term.print("INTERNAL RECORDS NETWORK \u2014 NODE D9-EV-07", "boot");
    Term.print("--------------------------------", "boot");
    await Term.progress("ESTABLISHING LINK", skip);
    Term.print("");
    await wait(300);

    /* 2. refused - someone else is driving */
    Sound.play("error");
    setNotice("SECURITY ALERT // UNAUTHORISED ACCESS ATTEMPT IN PROGRESS", true);
    Term.print("//-ACCESS DENIED", "error");
    await wait(500);
    Term.print("//-RESTRICTED SYSTEM. CLEARANCE REQUIRED: LEVEL 9", "system");
    await wait(400);
    Term.print("//-CREDENTIALS SUPPLIED: NONE", "system");
    await wait(500);
    Term.print("//-ATTEMPT REFERRED TO INTERNAL SECURITY", "warning");
    await wait(900);

    /* 3. find the way in */
    Term.print("");
    Term.print("//-SCANNING FOR OPEN SERVICE PORTS", "system");
    await wait(500);
    Term.print("//-FOUND: MAINT-LISTENER (LEGACY)", "system");
    await wait(300);
    Term.print("//-TICKET #4471 STATUS: AWAITING REVIEW", "warning");
    await wait(300);
    Term.print("//-SERVICE CREDENTIALS: EXPIRED", "system");
    await wait(300);
    Term.print("//-SERVICE ACCOUNT: STILL ACTIVE", "warning");
    await wait(500);
    Term.print("//-ATTEMPTING OVERRIDE", "system");
    await wait(400);

    await Term.progress("INJECTING SESSION TOKEN", skip);
    await Term.progress("BYPASSING CLEARANCE CHECK", skip);
    await Term.progress("SUPPRESSING AUDIT TRAIL", skip);
    Term.print("");
    await wait(400);

    /* 4. warning overridden - back to green */
    appEl.classList.remove("breach");
    document.documentElement.classList.remove("purple");
    setStatus("BREACHED", false);
    sysStatus.style.color = "var(--yellow)";
    setNotice("WARNING OVERRIDDEN // ACCESS CONTROL BYPASSED", true);
    Sound.play("success");
    Term.print("//-[WARNING OVERRIDDEN]", "error");
    await wait(300);
    Term.print("//-ACCESS CONTROL BYPASSED", "warning");
    await wait(300);
    Term.print("//-MONITORING OFFLINE FOR THIS SESSION", "warning");
    await wait(600);

    /* 5. in */
    Term.print("");
    Term.print("//-BACKDOOR ACCEPTED. SESSION: UNREGISTERED", "success");
    Term.print(records + " RECORD" + (records === 1 ? "" : "S") + " LOADED", "success");
    Term.print("");
    Term.print("DIRECTORY CONTENTS ARE THE PROPERTY OF BSLSK CORP.", "system");
    Term.print("YOU WERE NEVER HERE.", "warning");
    Term.print("");
    Term.print("TYPE 'HELP' FOR A LIST OF COMMANDS", "system");
    Term.print("");
    await Term.whenIdle();

    /* the index and the data column come up as soon as the backdoor opens */
    Term.renderIndex();
    try { Flow.start(); } catch (e) { /* decorative only */ }

    setStatus("UNREGISTERED", false);
    sysStatus.style.color = "var(--yellow)";
    noticeLocked = false;
    noticeIdx = 0;
    setNotice(NOTICES[0], false);
    Term.refocus();
  }

  /* ---------- status clock ---------- */

  function statusClock() {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");
    const ss = String(now.getSeconds()).padStart(2, "0");
    statusRight.textContent = "SESSION UNREGISTERED | " + Archive.items.length + " REC | " + hh + ":" + mm + ":" + ss;
  }

  /* ---------- idle banner ----------
     After 5 minutes without input a bouncing logo takes over the
     terminal, like the main site's screensaver. Any key, click or
     touch dismisses it. Geometry is measured once and only the
     transform changes per frame (smooth on phones). */

  const IDLE_MS = 5 * 60 * 1000;
  const IDLE_SPEED = 90;   /* pixels per second */

  const IDLE_BANNER = [
    "█████        ████",
    "█    █      █    █",
    "█    █ ████  █████",
    "█    █           █",
    "█████        ████",
    "",
    "EVIDENCE DIRECTORY"
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

  /* deep link: index.html?open=Corridor%20Camera%20Loop auto-opens a record by title */
  function deepLink() {
    const p = new URLSearchParams(location.search);
    const q = p.get("open") || "";
    if (q) {
      const ev = Archive.byTitle(q);
      if (ev) setTimeout(() => Media.open(ev), 400);
      else Term.print("NO RECORD ON FILE: " + q.toUpperCase(), "err");
    }
  }

  async function init() {
    await Archive.load();
    Archive.loadText();   /* search can read document bodies once these arrive */
    Term.init();
    if (!Archive.loaded) {
      /* index is the single point of failure - be loud about it */
      console.error("[archive] evidence index failed to load: " + Archive.loadError +
                    " - serve the folder over HTTP and check js/evidence.js.");
      document.documentElement.classList.remove("purple");
      appEl.classList.remove("breach");
      Term.clearIndex("//-DIRECTORY INDEX UNAVAILABLE");
      Term.print("ARCHIVE INDEX OFFLINE.", "err");
      Term.print("RECORDS UNAVAILABLE. CONTACT THE SYSTEM ADMINISTRATOR.", "dim");
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
