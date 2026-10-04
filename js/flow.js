"use strict";
/* flow.js - the scrolling data column on the right, plus the ghost eye.
   Purely decorative: nothing else depends on it, and if anything in here
   throws, the rest of the site carries on (everything is wrapped).

   The column prints endless corporate-looking noise (hex, numbers, letters,
   status tokens). Hidden in it, repeating every cycle between two rows of
   "=", is a ciphertext block (CIPHER_LINES). Its layers are: base64, then
   reversed, then a Vigenere shift. Edit CIPHER_LINES to change the message.

   The eye: every so often it fades in the middle of the column, opens,
   looks around, closes and vanishes. Change EYE to use a different icon:
   each frame is an array of equal-width lines. */

const Flow = (() => {
  const panel = document.getElementById("flow-panel");
  const feed  = document.getElementById("flow-feed");
  const eyeEl = document.getElementById("flow-eye");
  if (!panel || !feed) return { start() {}, stop() {} };

  const reduced = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const WIDTH = 16;            /* characters per line */
  const MAX_LINES = 90;        /* DOM cap */
  const TICK_MS = reduced ? 1400 : 320;

  /* base64( reverse( vigenere(message) ) ), split into WIDTH-char lines */
  const CIPHER_LINES = [
    "c1hWLSBsb2Fvc2Yg", "KTogem9mYyB3Ymx4", "bnogb3ppcSBhcSBl", "Ymcgb3JhIG5haSBv",
    "eWhqaHggdm5tYiBy", "cGQgdHZzaXR5ZiB3", "ZCB4a2tvIGJvdCBl", "eWEgLmJrY2xrcnAg",
    "ayBxdmsgZW11cHFk", "ZiBpIG9paXIgLHJ6", "b3UgYmVvIG13dmIg", "Ymh3aSBxbWRmaWcg",
    "aHdpIGZxcmcgb3h2", "ZHZiYSBwYiBiYmJu", "cHIgbXJnIHBxaHdi", "dWIgZGFtZyBod2kg",
    "c3E="
  ];
  const FENCE = "=".repeat(WIDTH);

  /* ---------- noise ---------- */
  const HEX = "0123456789ABCDEF", ALPHA = "ABCDEFGHIJKLMNOPQRSTUVWXYZ", DIG = "0123456789";
  const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const TOKENS = ["SYNC OK", "NODE 07 ACK", "PKT 4471 OK", "HASH VERIFIED", "RELAY 3 UP", "CRC PASS",
                  "SEQ RESET", "LINK STABLE", "BUFFER FLUSH", "AUTH 0 / 0", "QUEUE EMPTY", "LATENCY 12ms"];

  const pick = s => s[Math.floor(Math.random() * s.length)];
  const rnd = (set, n) => { let o = ""; for (let i = 0; i < n; i++) o += pick(set); return o; };

  function noiseLine() {
    const r = Math.random();
    if (r < 0.30) return rnd(HEX, WIDTH);
    if (r < 0.50) return rnd(DIG, 4) + " " + rnd(DIG, 4) + " " + rnd(DIG, 4);
    if (r < 0.65) return rnd(ALPHA, WIDTH);
    if (r < 0.80) return rnd(B64, WIDTH);             /* blends in with the cipher lines */
    if (r < 0.90) return "0x" + rnd(HEX, 8) + " " + pick(["OK", "OK", "--", "ACK"]);
    return pick(TOKENS);
  }

  /* ---------- stream ---------- */
  let timer = null, running = false, queue = [];

  function refill() {
    const run = 24 + Math.floor(Math.random() * 40);
    for (let i = 0; i < run; i++) queue.push({ t: noiseLine() });
    queue.push({ t: FENCE, c: true });
    CIPHER_LINES.forEach(l => queue.push({ t: l, c: true }));
    queue.push({ t: FENCE, c: true });
  }

  function emit() {
    try {
      if (!queue.length) refill();
      const it = queue.shift();
      const d = document.createElement("div");
      d.className = "f" + (it.c ? " c" : "");
      d.textContent = it.t;
      feed.appendChild(d);
      while (feed.childNodes.length > MAX_LINES) feed.removeChild(feed.firstChild);
    } catch (e) { /* decorative only */ }
    if (running) timer = setTimeout(emit, TICK_MS);
  }

  /* ---------- the eye ---------- */
  const EYE = (() => {
    const top = '  .-"""""-.  ', bot = "  '-.....-'  ", blank = " ".repeat(13);
    const open = inner => [top, "<" + inner + ">", bot];
    return {
      closed: [blank, " '-._____.-' ", blank],
      half:   [blank, "<-.........->", "  '-.___.-'  "],
      center: open("    (O)    "),
      left:   open(" (O)       "),
      right:  open("       (O) "),
      midL:   open("  (O)      "),
      midR:   open("      (O)  ")
    };
  })();

  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const show = f => { eyeEl.textContent = EYE[f].join("\n"); };

  async function eyeSequence() {
    if (!eyeEl || document.hidden || !running) return;
    const steps = [["closed", 700], ["half", 280], ["center", 550], ["left", 800], ["midL", 250],
                   ["right", 950], ["midR", 250], ["center", 450], ["half", 260], ["closed", 600]];
    show("closed");
    eyeEl.classList.add("show");
    await sleep(500);
    for (const [f, ms] of steps) { if (!running) break; show(f); await sleep(ms); }
    eyeEl.classList.remove("show");
    await sleep(900);
    eyeEl.textContent = "";
  }

  let eyeTimer = null;
  function scheduleEye(first) {
    if (reduced || !eyeEl) return;
    const wait = first ? 12000 + Math.random() * 12000 : 25000 + Math.random() * 45000;
    eyeTimer = setTimeout(async () => {
      try { await eyeSequence(); } catch (e) { /* decorative only */ }
      if (running) scheduleEye(false);
    }, wait);
  }

  function start() {
    if (running) return;
    running = true;
    panel.classList.add("on");
    emit();
    scheduleEye(true);
  }

  function stop() {
    running = false;
    clearTimeout(timer); clearTimeout(eyeTimer);
    panel.classList.remove("on");
  }

  return { start, stop };
})();
