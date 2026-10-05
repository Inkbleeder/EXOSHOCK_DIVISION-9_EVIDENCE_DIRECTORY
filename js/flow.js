"use strict";
/* flow.js - the scrolling data column on the right, plus the ghost eye.
   Purely decorative: nothing else depends on it, and if anything in here
   throws, the rest of the site carries on (everything is wrapped).

   The column prints endless corporate-looking noise (hex, numbers, letters,
   status tokens). Hidden in it, repeating every cycle between two rows of
   "=", is a ciphertext block (CIPHER_LINES). Its layers are: base64, then
   reversed, then a Vigenere shift. Edit CIPHER_LINES to change the message.

   The eye: every so often a solid eye icon (the SVG in index.html) fades in
   at the middle of the column, opens, looks around, closes and fades out.
   While it is there the data parts around it, row by row, like water round a
   rock. To use a different icon, replace the <svg id="flow-eye"> markup in
   index.html (keep the ids eye-lid and eye-iris) and adjust the numbers in
   LOOK below. */

const Flow = (() => {
  const panel = document.getElementById("flow-panel");
  const feed  = document.getElementById("flow-feed");
  const eyeEl = document.getElementById("flow-eye");
  const lidEl = document.getElementById("eye-lid");
  const irisEl = document.getElementById("eye-iris");
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
      d.dataset.t = it.t;
      d.textContent = it.t;
      feed.appendChild(d);
      while (feed.childNodes.length > MAX_LINES) feed.removeChild(feed.firstChild);
    } catch (e) { /* decorative only */ }
    if (running) timer = setTimeout(emit, TICK_MS);
  }

  /* ---------- parting the data around the eye ---------- */
  let p = 0;               /* eye presence 0..1 (opacity and size of the parting) */
  let lid = 0.05;          /* eyelid openness 0.05 (shut) .. 1 */
  let partActive = false;
  let rowH = 0, charW = 0;

  function measure() {
    const lh = parseFloat(getComputedStyle(feed).lineHeight);
    rowH = isFinite(lh) && lh > 0 ? lh : 17.4;
    const probe = document.createElement("div");
    probe.className = "f";
    probe.style.cssText = "position:absolute;visibility:hidden;width:auto";
    probe.textContent = "0".repeat(WIDTH);
    feed.appendChild(probe);
    const w = probe.getBoundingClientRect().width;
    feed.removeChild(probe);
    charW = w > 0 ? w / WIDTH : 7.2;
  }

  /* draw a row with chars [from,to) hidden; the text itself is untouched */
  function setGap(el, from, to) {
    const key = from >= to ? "" : from + "-" + to;
    if (el._g === key) return;
    el._g = key;
    const t = el.dataset.t || "";
    el.textContent = "";
    if (!key) { el.textContent = t; return; }
    const add = (cls, txt) => { const s = document.createElement("span"); if (cls) s.className = cls; s.textContent = txt; el.appendChild(s); };
    const L = t.slice(0, from), M = t.slice(from, to), R = t.slice(to);
    add("", L.slice(0, -1)); add("pe", L.slice(-1)); add("pg", M); add("pe", R.slice(0, 1)); add("", R.slice(1));
  }

  /* the eye is an almond: half-width at height dy is A * sqrt(1 - dy / B) */
  function applyParting() {
    const H = feed.clientHeight, n = feed.childNodes.length;
    if (!H || !n) return;
    if (!rowH) measure();
    const fr = feed.getBoundingClientRect(), er = eyeEl.getBoundingClientRect();
    const eyeCy = er.top + er.height / 2 - fr.top;
    const A = er.width / 2 + 6;
    const B = Math.max(1, (er.height / 2) * Math.max(lid, 0.05) + rowH * 0.6);
    const padB = 6;
    const kLo = Math.max(0, Math.floor((H - padB - (eyeCy + B + 2 * rowH)) / rowH));
    const kHi = Math.min(n - 1, Math.ceil((H - padB - (eyeCy - B - 2 * rowH)) / rowH));
    for (let k = kLo; k <= kHi; k++) {
      const row = feed.childNodes[n - 1 - k];
      if (!row || !row.dataset) continue;
      const cy = H - padB - (k + 0.5) * rowH;
      const dy = Math.abs(cy - eyeCy);
      let g = 0;
      if (p > 0.01 && dy < B) g = Math.min(WIDTH, Math.round((2 * A * Math.sqrt(1 - dy / B) * p) / charW));
      const from = Math.floor((WIDTH - g) / 2);
      setGap(row, g > 0 ? from : 0, g > 0 ? from + g : 0);
    }
  }

  function partLoop() {
    try { applyParting(); } catch (e) { /* decorative only */ }
    if (partActive) requestAnimationFrame(partLoop);
  }

  /* ---------- the eye ---------- */
  const LOOK = { x: 10, y: 3 };    /* how far the iris travels, in icon units */
  const setLid = v => { lid = v; lidEl.style.transform = "scaleY(" + v + ")"; };
  const setIris = (x, y) => { irisEl.style.transform = "translate(" + x + "px," + y + "px)"; };

  function ramp(to, ms) {
    return new Promise(res => {
      const from = p, t0 = performance.now();
      (function step(now) {
        const k = Math.min(1, (now - t0) / ms);
        p = from + (to - from) * k;
        eyeEl.style.opacity = String(p);
        if (k < 1 && running) requestAnimationFrame(step); else res();
      })(t0);
    });
  }

  const sleep = ms => new Promise(r => setTimeout(r, ms));

  async function eyeSequence() {
    if (!eyeEl || !lidEl || !irisEl || document.hidden || !running) return;
    partActive = true;
    requestAnimationFrame(partLoop);
    setLid(0.05); setIris(0, 0);
    await ramp(1, 900);                          /* fades in shut, the data parts around it */
    const beats = [
      () => setLid(1),                       400,
      () => setIris(-LOOK.x, 0),             900,
      () => setIris(-LOOK.x, -LOOK.y),       450,
      () => setIris(LOOK.x, -LOOK.y),        900,
      () => setIris(LOOK.x, LOOK.y),         450,
      () => setIris(0, 0),                   600,
      () => setLid(0.05),                    500
    ];
    for (let i = 0; i < beats.length && running; i += 2) { beats[i](); await sleep(beats[i + 1]); }
    await ramp(0, 1000);                         /* dissolves, the data closes back over */
    applyParting();                              /* p is 0: clears every parted row */
    partActive = false;
    setIris(0, 0);
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
    partActive = false; p = 0;
    if (eyeEl) eyeEl.style.opacity = "0";
    panel.classList.remove("on");
  }

  return { start, stop };
})();
