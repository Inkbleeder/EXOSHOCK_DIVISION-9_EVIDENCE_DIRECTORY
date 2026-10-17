"use strict";
/* exofm.js - EXOFM (hidden)
   Opened by typing  ExoFM  in the terminal. It is NOT in HELP or Tab completion.

   A small window with a vintage ASCII radio. The speaker grille, the VU meter,
   the dial needle, the knobs and the lamps all react to whatever is playing:
   the radio reads the live audio through an analyser, nothing is faked
   (except as a last-resort fallback, see below).

   STATIONS
   - Synth stations are built into this file. They are generated live with the
     Web Audio API, so the radio works with no audio files at all.
   - To add real audio, drop files into the site's normal audio/ folder and list
     them in TRACKS below. They are tuned in before the synth stations.
         { name: "Night Shift", file: "exofm_01.mp3" }
     (mp3 / wav / ogg play everywhere. The site must be served over HTTP:
     browsers silence the analyser for files opened straight from disk. If a
     file is playing but the analyser reads flat for 2 seconds, the radio falls
     back to a gentle made-up animation so it never looks dead.)

   CONTROLS
   POWER and TUNE buttons in the window, or typed:
     exofm            open (or bring to front)
     exofm next|prev  change station
     exofm off        power the radio off / on
     exofm close      close the window
   The site's MUTE silences it; the radio keeps moving.
   Needs: Term (terminal.js) and WinMgr (windows.js) for the window. */

const ExoFM = (() => {

  /* ================= config ================= */

  const W = 36;                       /* width of the radio in characters */
  const COLS = 28;                    /* speaker grille columns */
  const ROWS = 5;                     /* speaker grille rows */
  const AUDIO_DIR = "audio/";
  const MASTER_VOL = 0.7;

  /* real audio stations: { name, file }  (file inside audio/, or a full path / URL) */
  const TRACKS = [
    /* { name: "Night Shift", file: "exofm_01.mp3" }, */
  ];

  /* built-in synth stations */
  const SYNTH = [
    { name: "DRIFT",  root: 55.0, scale: [0, 3, 5, 7, 10, 12, 15], bpm: 78, wave: "triangle", arp: 0.55 },
    { name: "RELAY",  root: 49.0, scale: [0, 2, 3, 7, 8, 12, 14],  bpm: 96, wave: "sawtooth", arp: 0.70 },
    { name: "HOLLOW", root: 41.2, scale: [0, 2, 5, 7, 9, 12, 14],  bpm: 64, wave: "sine",     arp: 0.45 }
  ];

  const LABELS = ["88.5", "92.3", "94.1", "98.7", "101.7", "104.3", "106.9", "107.9"];

  const STATIONS = TRACKS.map(t => ({
    kind: "file",
    name: String(t.name || "UNNAMED").toUpperCase(),
    file: String(t.file || "").includes("/") ? String(t.file) : AUDIO_DIR + String(t.file || "")
  })).concat(SYNTH.map(s => Object.assign({ kind: "synth" }, s)));
  STATIONS.forEach((s, i) => { s.label = LABELS[i % LABELS.length]; });

  const KNOB = ["|", "/", "-", "\\"];

  /* ================= small helpers ================= */

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const pad2 = n => String(n).padStart(2, "0");
  const center = s => {
    const n = W - s.length;
    if (n <= 0) return s.slice(0, W);
    const l = Math.floor(n / 2);
    return " ".repeat(l) + s + " ".repeat(n - l);
  };
  function term(text, cls) { if (typeof Term !== "undefined") Term.print(text, cls || "dim"); }

  /* ================= state ================= */

  let G = null;     /* window state, null = closed */
  let A = null;     /* audio graph, null = no audio available */

  /* ================= audio engine ================= */

  function initAudio() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try {
      const ctx = new AC();
      const master = ctx.createGain(); master.gain.value = MASTER_VOL; master.connect(ctx.destination);
      const an = ctx.createAnalyser(); an.fftSize = 256; an.smoothingTimeConstant = 0.55; an.connect(master);
      const bus = ctx.createGain(); bus.gain.value = 1; bus.connect(an);

      const noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const d = noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

      /* the static between stations: silent until a tuning burst */
      const hissSrc = ctx.createBufferSource(); hissSrc.buffer = noise; hissSrc.loop = true;
      const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 3200; bp.Q.value = 0.5;
      const hiss = ctx.createGain(); hiss.gain.value = 0;
      hissSrc.connect(bp); bp.connect(hiss); hiss.connect(bus); hissSrc.start();

      return { ctx, master, an, bus, noise, hiss, hissSrc, buf: new Uint8Array(an.frequencyBinCount) };
    } catch (e) { return null; }
  }

  function burst(dur) {
    if (!A) return;
    try {
      const now = A.ctx.currentTime;
      A.hiss.gain.cancelScheduledValues(now);
      A.hiss.gain.setValueAtTime(0.3, now);
      A.hiss.gain.linearRampToValueAtTime(0, now + dur);
    } catch (e) {}
  }

  function note(freq, type, t, dur, vol, cutoff) {
    const c = A.ctx;
    const o = c.createOscillator(), f = c.createBiquadFilter(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    f.type = "lowpass"; f.frequency.value = cutoff || 2000;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f); f.connect(g); g.connect(A.bus);
    o.start(t); o.stop(t + dur + 0.05);
  }

  function kick(t) {
    const c = A.ctx;
    const o = c.createOscillator(), g = c.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(130, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.2);
    g.gain.setValueAtTime(0.55, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.24);
    o.connect(g); g.connect(A.bus);
    o.start(t); o.stop(t + 0.3);
  }

  function hat(t) {
    const c = A.ctx;
    const s = c.createBufferSource(); s.buffer = A.noise;
    const f = c.createBiquadFilter(); f.type = "highpass"; f.frequency.value = 7000;
    const g = c.createGain();
    g.gain.setValueAtTime(0.05, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    s.connect(f); f.connect(g); g.connect(A.bus);
    s.start(t, Math.random()); s.stop(t + 0.08);
  }

  function pad(freq, t, dur) {
    const c = A.ctx;
    [-7, 7].forEach(det => {
      const o = c.createOscillator(), f = c.createBiquadFilter(), g = c.createGain();
      o.type = "sawtooth"; o.frequency.value = freq; o.detune.value = det;
      f.type = "lowpass"; f.frequency.value = 520;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.045, t + dur * 0.4);
      g.gain.linearRampToValueAtTime(0.0001, t + dur);
      o.connect(f); f.connect(g); g.connect(A.bus);
      o.start(t); o.stop(t + dur + 0.05);
    });
  }

  function startSynth(st) {
    const stepS = 60 / st.bpm / 2;
    const sc = st.scale;
    const hz = i => st.root * Math.pow(2, sc[i % sc.length] / 12);
    const bassLine = [0, 0, 3, 2];
    let step = 0;
    G.seq = setInterval(() => {
      if (!A || !G || !G.on || A.ctx.state === "closed") return;
      const t = A.ctx.currentTime + 0.04;
      const deg = bassLine[Math.floor(step / 8) % 4];
      if (step % 4 === 0) kick(t);
      if (step % 2 === 1) hat(t);
      if (step % 8 === 0) note(hz(deg), "sine", t, stepS * 7.5, 0.34, 400);
      if (step % 32 === 0) pad(hz(deg) * 4, t, stepS * 30);
      if (Math.random() < st.arp) {
        const oct = Math.random() < 0.35 ? 8 : 4;
        note(hz(Math.floor(Math.random() * sc.length)) * oct, st.wave, t, stepS * 1.6, 0.09, 2400);
      }
      step++;
    }, stepS * 1000);
  }

  function startFile(st) {
    const a = new Audio();
    a.loop = true;
    a.preload = "auto";
    a.addEventListener("error", () => {
      if (!G || G.audio !== a) return;
      G.lost = true;
      setTimeout(() => { if (G && G.audio === a) tune(G.st + 1); }, 1200);
    });
    try {
      const src = A.ctx.createMediaElementSource(a);
      src.connect(A.bus);
      G.msrc = src;
    } catch (e) { G.msrc = null; }
    G.audio = a;
    a.src = st.file;
    a.play().catch(() => {});
  }

  function stopSource() {
    if (!G) return;
    clearInterval(G.seq); G.seq = 0;
    if (G.audio) {
      try { G.audio.pause(); } catch (e) {}
      try { if (G.msrc) G.msrc.disconnect(); } catch (e) {}
      G.audio = null; G.msrc = null;
    }
  }

  function startSource() {
    if (!G || !A) return;
    const st = STATIONS[G.st];
    G.lost = false;
    if (st.kind === "file") startFile(st); else startSynth(st);
  }

  /* start the current station after a short burst of static */
  function schedule() {
    const tok = ++G.tok;
    setTimeout(() => { if (G && G.tok === tok && G.on) startSource(); }, 450);
  }

  function tune(i) {
    if (!G) return;
    const n = STATIONS.length;
    G.st = ((i % n) + n) % n;
    G.tuneTo = n > 1 ? G.st / (n - 1) : 0.5;
    G.flat = 0; G.fake = false;
    stopSource();
    if (G.on) { burst(0.7); schedule(); } else G.tok++;
    if (A) A.ctx.resume().catch(() => {});
  }

  function power() {
    if (!G) return;
    G.on = !G.on;
    stopSource();
    G.tok++;
    if (G.on) { G.fake = false; G.flat = 0; burst(0.5); schedule(); }
    if (A) A.ctx.resume().catch(() => {});
  }

  /* ================= levels ================= */

  function sample(dt, tsec) {
    const L = G.lvl;
    const tgt = new Array(COLS).fill(0);
    let bassT = 0, raw = 0;

    if (G.fake) {
      if (G.on) for (let c = 0; c < COLS; c++) {
        tgt[c] = clamp(0.2 + 0.45 * Math.abs(Math.sin(tsec * 2.4 + c * 0.55)) * (0.6 + 0.4 * Math.sin(tsec * 1.3)), 0, 1);
      }
      bassT = G.on ? 0.3 + 0.4 * Math.abs(Math.sin(tsec * 2.1)) : 0;
      raw = 1;
    } else if (A) {
      A.an.getByteFrequencyData(A.buf);
      const b = A.buf;
      for (let c = 0; c < COLS; c++) {
        const s = 2 + Math.floor(Math.pow(c / COLS, 1.7) * 70);
        const e = Math.max(s + 1, 2 + Math.floor(Math.pow((c + 1) / COLS, 1.7) * 70));
        let sum = 0;
        for (let k = s; k < e; k++) sum += b[k];
        const v = sum / (e - s) / 255;
        raw += v;
        tgt[c] = clamp(v * 1.35, 0, 1);
      }
      raw /= COLS;
      bassT = clamp((b[1] + b[2] + b[3] + b[4]) / 4 / 255 * 1.3, 0, 1);
    }

    const up = 1 - Math.exp(-dt / 0.04), down = 1 - Math.exp(-dt / 0.22);
    let sum = 0;
    for (let c = 0; c < COLS; c++) {
      L[c] += (tgt[c] - L[c]) * (tgt[c] > L[c] ? up : down);
      sum += L[c];
    }
    G.overall = sum / COLS;
    G.bass += (bassT - G.bass) * (bassT > G.bass ? up : down);
    G.peak = G.bass > 0.62;

    /* file playing but the analyser reads flat (opened from disk?): animate anyway */
    const cur = STATIONS[G.st];
    if (cur.kind === "file" && G.on && G.audio && !G.audio.paused && G.audio.currentTime > 0.6 && !G.fake) {
      if (raw < 0.01) { G.flat += dt; if (G.flat > 2) G.fake = true; } else G.flat = 0;
    }
  }

  /* ================= drawing ================= */

  function render() {
    const g = G, L = g.lvl;
    const out = [];

    const line = s => " |" + s.padEnd(32).slice(0, 32) + "| ";
    const sub = s => line(" |" + s.padEnd(COLS).slice(0, COLS) + "| ");
    const subTop = line(" ." + "-".repeat(COLS) + ". ");
    const subBot = line(" '" + "-".repeat(COLS) + "' ");

    /* antenna */
    const tip = g.peak ? "*" : "o";
    out.push(center(tip + " ".repeat(14) + tip));
    out.push(center("\\" + " ".repeat(10) + "/"));
    out.push(center("\\" + " ".repeat(6) + "/"));
    out.push(" ." + "-".repeat(32) + ". ");

    /* dial window: the needle sits on the tuned station and shivers with the bass */
    const nc = clamp(Math.round(2 + g.tune * (COLS - 5) + clamp((g.bass - 0.35) * 1.5, -1, 1)), 1, COLS - 2);
    let ticks = "";
    for (let c = 0; c < COLS; c++) ticks += c === nc ? "|" : (c % 3 === 0 ? "." : " ");
    out.push(subTop);
    out.push(sub("FM 88  92  96 100 104 108"));
    out.push(sub(ticks));
    out.push(sub("AM 53  70  90 120 160 170"));
    out.push(subBot);
    out.push(line(""));

    /* speaker grille */
    out.push(subTop);
    for (let r = 0; r < ROWS; r++) {
      const th = (ROWS - r - 0.5) / ROWS;
      let row = "";
      for (let c = 0; c < COLS; c++) row += L[c] >= th ? "#" : ".";
      out.push(sub(row));
    }
    out.push(subBot);
    out.push(line(""));

    /* knobs, band switch, VU meter, lamp */
    const k1 = KNOB[Math.floor(g.volPh) % 4], k2 = KNOB[Math.floor(g.tunePh) % 4];
    out.push(line("  VOL" + " ".repeat(8) + "BAND" + " ".repeat(8) + "TUNE"));
    out.push(line("  (" + k1 + ")" + " ".repeat(7) + "AM|[FM]" + " ".repeat(7) + "(" + k2 + ")"));
    const n = Math.round(clamp(g.overall * 1.8, 0, 1) * 10);
    const lamp = g.on ? (g.peak ? "*" : "o") : " ";
    out.push(line("  VU [" + "#".repeat(n) + "-".repeat(10 - n) + "]   ON AIR (" + lamp + ")"));
    out.push(" '" + "-".repeat(32) + "' ");
    out.push("  [__]" + " ".repeat(24) + "[__]  ");

    g.R.pre.textContent = out.join("\n");
  }

  function statusText() {
    const s = STATIONS[G.st];
    const a = "STATION " + pad2(G.st + 1) + "/" + pad2(STATIONS.length) + " // " + s.label + " FM";
    const b = !G.on ? "STANDBY" : G.lost ? "NO SIGNAL" : "TUNED: " + s.name;
    return a + "<br>" + b;
  }

  /* ================= frame loop ================= */

  function frame(now) {
    if (!G) return;
    G.raf = requestAnimationFrame(frame);
    const dt = Math.min((now - G.last) / 1000, 0.1);
    G.last = now;
    if (G.win.minimized || document.hidden) return;
    try {
      if (A) A.master.gain.value = (typeof Sound !== "undefined" && Sound.muted) ? 0 : MASTER_VOL;
      sample(dt, now / 1000);
      G.tune += (G.tuneTo - G.tune) * (1 - Math.exp(-dt / 0.25));
      G.volPh += dt * G.overall * 14;
      G.tunePh += dt * G.bass * 9;
      render();
      const txt = statusText();
      if (txt !== G.statTxt) { G.statTxt = txt; G.R.stat.innerHTML = txt; }
    } catch (e) { /* decorative only */ }
  }

  /* ================= window ================= */

  function open() {
    if (G && G.win) {
      if (G.win.minimized) WinMgr.restore(G.win); else WinMgr.bringToFront(G.win);
      return;
    }
    const root = document.createElement("div");
    root.className = "exo-root";
    root.innerHTML =
      '<pre class="exo-pre" data-r="pre"></pre>' +
      '<div class="exo-stat" data-r="stat"></div>' +
      '<div class="exo-btns">' +
        '<button class="wbtn" data-a="power">POWER</button>' +
        '<button class="wbtn" data-a="prev">&lt;&lt; TUNE</button>' +
        '<button class="wbtn" data-a="next">TUNE &gt;&gt;</button>' +
      '</div>';
    const R = { root };
    root.querySelectorAll("[data-r]").forEach(n => { R[n.dataset.r] = n; });

    A = initAudio();
    G = {
      root, R, win: null, raf: 0, last: performance.now(),
      st: 0, tune: 0.5, tuneTo: STATIONS.length > 1 ? 0 : 0.5,
      on: true, seq: 0, audio: null, msrc: null, tok: 0, lost: false,
      lvl: new Array(COLS).fill(0), bass: 0, overall: 0, peak: false,
      volPh: 0, tunePh: 0, flat: 0, fake: false, statTxt: ""
    };

    G.win = WinMgr.create({
      title: "EXOFM", content: root, label: "EXOFM", tag: "exofm",
      w: 330, h: 480, onClose: teardown
    });

    root.addEventListener("click", e => {
      const b = e.target.closest("[data-a]");
      if (!b || !G) return;
      if (b.dataset.a === "power") power();
      else if (b.dataset.a === "next") tune(G.st + 1);
      else if (b.dataset.a === "prev") tune(G.st - 1);
    });

    if (A) A.ctx.resume().catch(() => {});
    else term("EXOFM: NO AUDIO DEVICE. THE RADIO WILL STAY SILENT.", "warning");
    burst(0.8);
    schedule();
    render();
    G.raf = requestAnimationFrame(frame);
    term("EXOFM CARRIER ACQUIRED.", "dim");
  }

  function teardown() {
    if (!G) return;
    cancelAnimationFrame(G.raf);
    G.tok++;
    stopSource();
    if (A) {
      try { A.hissSrc.stop(); } catch (e) {}
      try { A.ctx.close(); } catch (e) {}
      A = null;
    }
    G = null;
  }

  /* ================= typed commands (called by terminal.js) =================
     Returns true when the line was handled here. */

  function handleInput(raw) {
    const t = String(raw || "").trim().toLowerCase().split(/\s+/);
    if (t[0] !== "exofm") return false;
    const a = t[1] || "";
    if (G && G.win) {
      if (a === "next") tune(G.st + 1);
      else if (a === "prev") tune(G.st - 1);
      else if (a === "off" || a === "power") power();
      else if (a === "close") WinMgr.closeWin(G.win);
      else open();
    } else open();
    return true;
  }

  return { open, handleInput };
})();
