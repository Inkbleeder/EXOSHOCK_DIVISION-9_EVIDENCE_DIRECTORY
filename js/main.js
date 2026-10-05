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

  const BOOT_PACE = 0.5;     /* 1 = the old, slower boot */

  async function wait(ms) {
    await Term.whenIdle();
    if (!skipBoot) await sleep(ms * BOOT_PACE);
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

    /* helpers: fast instant-print bursts, and the pirate's voice (red, bracketed, like Petrify) */
    const HEXC = "0123456789ABCDEF";
    const hx = n => { let o = ""; for (let i = 0; i < n; i++) o += HEXC[Math.floor(Math.random() * 16)]; return o; };
    const say = (text, cls, speed) => Term.print(text, cls, { speed: speed || 3 });   /* fast typing for system lines */
    const SK = "\u2620\uFE0E";
    const SKULLS = "//-" + SK.repeat(3);
    const SKULLS_BIG = "//-" + SK.repeat(7);
    async function burst(lines, gap) {
      for (const l of lines) {
        Term.print(l[0], l[1], { instant: true });
        if (!skipBoot) await sleep(gap);
      }
    }
    async function pirate(text, after) {
      Term.print("//-[" + text + "]", "error", { speed: 26 });   /* the pirate types slowly: the scroll slows down when he talks */
      await wait(after === undefined ? 700 : after);
    }

    /* 0. a very vague nod to how the session got here */
    say("INBOUND REDIRECT DETECTED", "boot");
    await wait(300);
    say("ORIGIN: UPSTREAM NODE (UNVERIFIED)", "boot");
    await wait(300);
    say("FORWARDING SESSION ...", "boot");
    await wait(600);
    Term.print("");

    /* 1. knock on the front door */
    say("BSLSK DIVISION-9 // EVIDENCE DIRECTORY", "boot");
    say("INTERNAL RECORDS NETWORK \u2014 NODE D9-EV-07", "boot");
    say("--------------------------------", "boot");
    await Term.progress("ESTABLISHING LINK", skip, 45);
    await burst([
      ["[  0.0004] BSLSK-OS 4.11.2 (D9-EV-07) boot", "boot"],
      ["[  0.0021] cpu0: online", "boot"],
      ["[  0.0034] mem: 65536K ok", "boot"],
      ["[  0.0118] mounting /records ... ok", "boot"],
      ["[  0.0210] checking index integrity ... ok", "boot"],
      ["[  0.0377] loading clearance table ... ok", "boot"],
      ["[  0.0412] auth: clearance level 9 required", "boot"],
      ["[  0.0420] auth: no credentials supplied", "boot"]
    ], 45);
    await wait(300);

    /* 2. refused */
    Sound.play("error");
    setNotice("SECURITY ALERT // UNAUTHORISED ACCESS ATTEMPT IN PROGRESS", true);
    say("//-ACCESS DENIED", "system");
    await wait(350);
    say("//-RESTRICTED SYSTEM. CLEARANCE REQUIRED: LEVEL 9", "system");
    await wait(300);
    say("//-ATTEMPT REFERRED TO INTERNAL SECURITY", "warning");
    await wait(900);

    /* 3. someone else is on the line - the pirate, like Petrify's unknown signal */
    say("");
    say("//-UNKNOWN_SIGNAL_DETECTED", "system");
    await wait(350);
    say(" //-SIGNAL_DECODED", "system");
    await wait(300);
    say("  //-DISPLAY_DECODED_SIGNAL", "system");
    await wait(300);
    say("//-Y/N", "system");
    await wait(350);
    say(">\\Y", "warning");
    await wait(500);
    await pirate("ALRIGHT, OPERATOR. FRONT DOOR'S LOCKED. LUCKILY I KNOW A BACK ONE.", 500);
    Term.print(SKULLS, "error", { speed: 40 });
    await wait(700);

    /* 4. the way in: ports, traces, dumps - fast and relentless */
    say("");
    say("//-SCANNING FOR OPEN SERVICE PORTS", "system");
    const ports = [21, 22, 23, 25, 53, 80, 110, 143, 443, 993, 3306, 5432, 8080];
    await burst(ports.map(p => ["PORT " + String(p).padStart(4, "0") + "   " + (p % 3 ? "CLOSED" : "FILTERED"), "boot"]), 38);
    say("PORT 4471   OPEN     MAINT-LISTENER (LEGACY)", "warning");
    await wait(450);
    say("//-FOUND: MAINT-LISTENER (LEGACY)", "system");
    await wait(250);
    say("//-TICKET #4471 STATUS: AWAITING REVIEW", "warning");
    await wait(250);
    say("//-SERVICE CREDENTIALS: EXPIRED", "system");
    await wait(250);
    say("//-SERVICE ACCOUNT: STILL ACTIVE", "warning");
    await wait(500);
    await pirate("DON'T TOUCH ANYTHING. I'M IN THE WALLS.", 800);
    Term.print(SKULLS, "error", { speed: 40 });
    await wait(500);

    await burst([
      ["[DEBUG] init_trace() -> ok", "system"],
      ["[DEBUG] verifying session token...", "system"],
      ["[DEBUG] token verification FAILED (0x22)", "warning"],
      ["[DEBUG] falling back to legacy auth table...", "system"],
      ["[DEBUG] legacy_table.entries -> 1 record found", "system"],
      ["[DEBUG] decrypting legacy credentials...", "system"],
      ["[DEBUG] cipher AES_256 -> key mismatch, retrying", "warning"],
      ["[DEBUG] fallback cipher accepted -> OK", "system"]
    ], 70);
    await wait(300);

    const dump = [];
    for (let i = 0; i < 26; i++) dump.push(["0x" + hx(8) + "  " + Array.from({ length: 8 }, () => hx(2)).join(" "), "boot"]);
    await burst(dump, 22);
    await wait(300);

    say("// NOTE (maintenance):", "warning");
    await wait(400);
    say("// this listener was never decommissioned.", "warning");
    await wait(400);
    say("// ticket #4471 has never been closed.", "warning");
    await wait(400);
    say("// nobody has looked at it. nobody ever does.", "warning");
    await wait(700);
    await pirate("THEY ROTATE THE LOGS EVERY FOUR MINUTES. WE'LL BE LONG GONE.", 400);

    await Term.progress("SPOOFING NODE ADDRESS", skip, 30);
    await Term.progress("INJECTING SESSION TOKEN", skip, 30);
    await burst(Array.from({ length: 14 }, () => ["[ 1." + hx(4) + "] net: handshake " + hx(12) + " ok", "boot"]), 26);
    await Term.progress("BYPASSING CLEARANCE CHECK", skip, 30);
    await Term.progress("REWRITING ACCESS LOG", skip, 30);
    await burst(Array.from({ length: 18 }, () => ["audit: purge entry 0x" + hx(6) + " ... ok", "boot"]), 24);
    await Term.progress("SUPPRESSING AUDIT TRAIL", skip, 30);
    await wait(500);
    await pirate("KEEP QUIET.", 600);
    Term.print(SKULLS_BIG, "error", { speed: 40 });
    await wait(900);
    say("");

    /* 4. warning overridden - back to green */
    await pirate("THERE. IT'S OPEN.", 500);
    appEl.classList.remove("breach");
    document.documentElement.classList.remove("purple");
    setStatus("BREACHED", false);
    sysStatus.style.color = "var(--yellow)";
    setNotice("WARNING OVERRIDDEN // ACCESS CONTROL BYPASSED", true);
    Sound.play("success");
    say("//-[WARNING OVERRIDDEN]", "warning");
    await wait(250);
    say("//-ACCESS CONTROL BYPASSED", "warning");
    await wait(250);
    say("//-MONITORING OFFLINE FOR THIS SESSION", "warning");
    await wait(600);

    /* 5. in */
    say("");
    say("//-BACKDOOR ACCEPTED. SESSION: UNREGISTERED", "success");
    say(records + " RECORD" + (records === 1 ? "" : "S") + " LOADED", "success");
    say("");
    say("DIRECTORY CONTENTS ARE THE PROPERTY OF BSLSK CORP.", "system");
    await wait(600);
    await pirate("HAVE FUN DIGGING. THIS IS AS FAR AS I CAN GET YOU. GOOD LUCK, AND REMEMBER...", 1000);
    Term.print("YOU WERE NEVER HERE.", "warning");
    await wait(900);
    Term.print(SKULLS_BIG, "error", { speed: 40 });
    await wait(600);
    Term.print(SKULLS_BIG, "error", { speed: 40 });
    await wait(500);
    await pirate("===SIGNAL_LOST===", 700);
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
