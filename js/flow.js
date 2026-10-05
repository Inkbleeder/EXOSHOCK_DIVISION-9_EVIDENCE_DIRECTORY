"use strict";
/* flow.js - the scrolling data column on the right, plus the ghost eye.
   Purely decorative: nothing else depends on it, and if anything in here
   throws, the rest of the site carries on.

   HOW IT IS DRAWN
   The whole column is painted on one <canvas>. The data scrolls smoothly
   and continuously; the eye is a stationary shape in the middle of that
   stream. Wherever the eye's lines are, the text is erased in a thin halo
   around them, so the stream appears to run into the eye and around its
   edges. The text stays visible inside the eye (no backdrop): the eye is
   carved out of the stream, not placed over it. When the eye fades in/out
   the carving fades with it.

   THE CIPHER
   Between two rows of "=", the stream repeats CIPHER_LINES every cycle.
   Layers: base64, then reversed, then a Vigenere shift. Edit CIPHER_LINES
   to change the message. A hidden copy of the stream is kept in the page
   (#flow-feed) so the lines also exist in the DOM.

   THE EYE
   Drawn from the same shape as the old SVG icon (100 x 64 units). LOOK
   sets how far the iris travels. If canvas is unavailable the column falls
   back to a plain text scroll with no eye. */

const Flow = (() => {
  const panel  = document.getElementById("flow-panel");
  const feed   = document.getElementById("flow-feed");
  const canvas = document.getElementById("flow-canvas");
  if (!panel || !feed) return { start() {}, stop() {} };

  const reduced = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const WIDTH = 16;            /* characters per line */
  const MAX_LINES = 90;        /* cap on the hidden DOM copy and the line buffer */
  const TICK_MS = reduced ? 1400 : 320;     /* time to scroll one line */
  const FONT = '12px "Courier New", Courier, monospace';
  const TEXT_ALPHA = 0.5;
  const HALO_PX = 2.5;         /* gap of cleared stream around the eye's lines */
  const LOOK = { x: 10, y: 3 };             /* iris travel, in icon units */

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

  /* ---------- the stream (newest line first) ---------- */
  const lines = [];
  let queue = [];

  function nextLine() {
    if (!queue.length) {
      const run = 24 + Math.floor(Math.random() * 40);
      for (let i = 0; i < run; i++) queue.push({ t: noiseLine() });
      queue.push({ t: FENCE, c: true });
      CIPHER_LINES.forEach(l => queue.push({ t: l, c: true }));
      queue.push({ t: FENCE, c: true });
    }
    return queue.shift();
  }

  function pushLine() {
    try {
      const it = nextLine();
      lines.unshift(it);
      if (lines.length > MAX_LINES) lines.pop();
      const d = document.createElement("div");           /* hidden DOM copy of the stream */
      d.className = "f" + (it.c ? " c" : "");
      d.textContent = it.t;
      feed.appendChild(d);
      while (feed.childNodes.length > MAX_LINES) feed.removeChild(feed.firstChild);
    } catch (e) { /* decorative only */ }
  }

  /* ---------- canvas ---------- */
  let ctx = null;
  try { ctx = canvas && canvas.getContext ? canvas.getContext("2d") : null; } catch (e) { ctx = null; }

  let W = 0, H = 0, cw = 7.2, rh = 17.4, ink = "#00ff66", inkAt = 0;
  const PAD_B = 6;

  function resize() {
    if (!ctx) return;
    W = Math.floor(panel.clientWidth); H = Math.floor(panel.clientHeight);
    if (!W || !H) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.font = FONT;
    const m = ctx.measureText("0".repeat(WIDTH)).width;
    if (m > 0) cw = m / WIDTH;
    rh = 12 * 1.45;
  }

  function readInk(now) {
    if (now - inkAt < 500) return;
    inkAt = now;
    try {
      const v = getComputedStyle(document.documentElement).getPropertyValue("--green").trim();
      if (v) ink = v;
    } catch (e) { /* keep the last colour */ }
  }

  /* ---------- the eye: state ---------- */
  const ALMOND = (typeof Path2D !== "undefined") ? new Path2D("M5 32 C25 6 75 6 95 32 C75 58 25 58 5 32 Z") : null;
  let p = 0, pT = 0;               /* presence (fade) and its target */
  let lid = 0.05, lidT = 0.05;     /* eyelid openness */
  let ix = 0, iy = 0, tx = 0, ty = 0;   /* iris offset and target */

  function ease(cur, target, dt, tau) { return cur + (target - cur) * (1 - Math.exp(-dt / tau)); }

  function stepEye(dt) {
    lid = ease(lid, lidT, dt, 70);
    ix = ease(ix, tx, dt, 110);
    iy = ease(iy, ty, dt, 110);
    const d = pT - p, rate = dt / (pT > p ? 900 : 1000);
    p = Math.abs(d) <= rate ? pT : p + Math.sign(d) * rate;
  }

  /* one pass over the eye's lines. carve = erase the stream around them, else draw them */
  function eyePass(carve, sc) {
    ctx.globalCompositeOperation = carve ? "destination-out" : "source-over";
    ctx.globalAlpha = p;
    ctx.strokeStyle = carve ? "#000" : ink;
    ctx.lineWidth = carve ? 6 + (2 * HALO_PX) / sc : 6;
    ctx.lineJoin = "round"; ctx.lineCap = "round";
    ctx.stroke(ALMOND);
    ctx.save();
    ctx.clip(ALMOND);                                  /* the lid hides whatever of the iris it covers */
    ctx.translate(ix, iy);
    ctx.beginPath(); ctx.arc(50, 32, 12.5, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }

  function drawEye() {
    const eyeW = Math.min(W - 24, 104), sc = eyeW / 100;
    ctx.save();
    ctx.translate(W / 2 - eyeW / 2, H / 2 - 32 * sc);
    ctx.scale(sc, sc);
    ctx.translate(50, 32); ctx.scale(1, Math.max(lid, 0.05)); ctx.translate(-50, -32);
    eyePass(true, sc);                                 /* clear a thin halo in the data... */
    eyePass(false, sc);                                /* ...and draw the eye into it */
    ctx.restore();
  }

  /* ---------- frame loop ---------- */
  let running = false, rafId = 0, last = 0, phase = 0, timer = null, eyeTimer = null;

  function draw(now) {
    if (!ctx || !W || !H) return;
    readInk(now);
    ctx.setTransform(Math.min(window.devicePixelRatio || 1, 2), 0, 0, Math.min(window.devicePixelRatio || 1, 2), 0, 0);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, W, H);

    ctx.font = FONT; ctx.textBaseline = "middle"; ctx.fillStyle = ink; ctx.globalAlpha = TEXT_ALPHA;
    const x0 = Math.round((W - WIDTH * cw) / 2);
    for (let i = 0; i < lines.length; i++) {
      const cy = H - PAD_B + rh / 2 - phase - (i + 1) * rh + rh;     /* newest line rises in from the bottom */
      if (cy < -rh) break;
      if (cy > H + rh) continue;
      ctx.fillText(lines[i].t, x0, cy);
    }

    /* fade the top of the column out */
    ctx.globalCompositeOperation = "destination-out"; ctx.globalAlpha = 1;
    const g = ctx.createLinearGradient(0, 0, 0, H * 0.3);
    g.addColorStop(0, "rgba(0,0,0,1)"); g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H * 0.3);
    ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1;

    if (p > 0.003 && ALMOND) drawEye();
  }

  function frame(now) {
    if (!running) return;
    rafId = requestAnimationFrame(frame);
    const dt = Math.min(now - (last || now), 100); last = now;
    try {
      phase += dt * rh / TICK_MS;
      while (phase >= rh) { phase -= rh; pushLine(); }
      stepEye(dt);
      draw(now);
    } catch (e) { /* decorative only */ }
  }

  /* ---------- the eye: sequence ---------- */
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  async function eyeSequence() {
    if (!ctx || !ALMOND || document.hidden || !running) return;
    lidT = 0.05; lid = 0.05; tx = ty = 0; ix = iy = 0;
    pT = 1;                                          /* fades in shut, carved into the stream */
    await sleep(1100);
    const beats = [
      () => { lidT = 1; },                          400,
      () => { tx = -LOOK.x; ty = 0; },              900,
      () => { tx = -LOOK.x; ty = -LOOK.y; },        450,
      () => { tx = LOOK.x; ty = -LOOK.y; },         900,
      () => { tx = LOOK.x; ty = LOOK.y; },          450,
      () => { tx = 0; ty = 0; },                    600,
      () => { lidT = 0.05; },                       550
    ];
    for (let i = 0; i < beats.length && running; i += 2) { beats[i](); await sleep(beats[i + 1]); }
    pT = 0;                                          /* dissolves, the stream closes back over */
    await sleep(1200);
  }

  function scheduleEye(first) {
    if (reduced || !ctx || !ALMOND) return;
    const wait = first ? 12000 + Math.random() * 12000 : 25000 + Math.random() * 45000;
    eyeTimer = setTimeout(async () => {
      try { await eyeSequence(); } catch (e) { /* decorative only */ }
      if (running) scheduleEye(false);
    }, wait);
  }

  /* ---------- start / stop ---------- */
  let ro = null;

  function start() {
    if (running) return;
    running = true;
    panel.classList.add("on");
    if (ctx) {
      panel.classList.add("canvas");
      resize();
      if (window.ResizeObserver && !ro) { ro = new ResizeObserver(resize); ro.observe(panel); }
      else if (!ro) { window.addEventListener("resize", resize); ro = true; }
      const need = Math.ceil((H || 400) / rh) + 3;
      for (let i = 0; i < need; i++) pushLine();
      last = 0; phase = 0;
      rafId = requestAnimationFrame(frame);
      scheduleEye(true);
    } else {
      /* no canvas: plain text scroll, no eye */
      for (let i = 0; i < 20; i++) pushLine();
      timer = setInterval(pushLine, TICK_MS);
    }
  }

  function stop() {
    running = false;
    cancelAnimationFrame(rafId); clearInterval(timer); clearTimeout(eyeTimer);
    p = pT = 0; lid = lidT = 0.05;
    panel.classList.remove("on");
  }

  return { start, stop };
})();
