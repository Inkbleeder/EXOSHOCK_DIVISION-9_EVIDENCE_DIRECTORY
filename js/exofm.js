"use strict";
/* exofm.js - EXOFM (hidden)
   Opened by typing  ExoFM  in the terminal. It is NOT in HELP or Tab completion.

   A small window that IS the radio: no drawn case, just the parts. A display
   with a scrolling song title, a tuning dial, a spectrum with peak-hold caps,
   two speakers that thump, a VU meter, and the five keys. The window's own
   frame and title bar pulse with the music. All of it reacts to the radio's own audio and nothing else: it is read
   through an analyser that is connected only to the radio's player. Pause or
   stop it and everything settles. No synth, no static, no made-up animation.

   PUNCH
   The analyser is tuned for bass (fine low-frequency resolution, fast attack,
   slower release). A kick detector fires on sudden bass / mid jumps: the left
   speaker thumps on the bass, the right on the mids, the lamps flash, the
   window glows and its title bar lights up for an instant. Colours follow the
   site theme.

   THE PLAYLIST
   Put the songs in  audio/exofm/  (next to index.html) and list them in
   TRACKS below, in the order they should play. When the last song ends the
   first one starts again. A plain file name is enough (the title is made from
   the file name), or give a title:
       "my_song.mp3",
       { name: "Night Shift", file: "night_shift.mp3" },
   mp3 / wav / ogg play in every browser. The site must be served over HTTP:
   browsers silence the radio's player when a page is opened straight from disk.

   THE KEYS  (each one sinks when pressed; PLAY / PAUSE / STOP stay down to show the mode)
     PLAY   start or resume          PAUSE  hold the song where it is
     STOP   stop and go back to the start of the song
     SKIP   next song, wraps around  PREV   restart the song if it is more than
                                            3 seconds in, otherwise the song before
   Typed (the terminal stays usable):
     exofm  [play|pause|stop|skip|prev|close]
   The site's MUTE silences the radio; the radio keeps moving.
   Needs: Term (terminal.js) and WinMgr (windows.js) for the window. */

const ExoFM = (() => {

  /* ================= config ================= */

  const W = 42;                       /* width of the radio in characters */
  const COLS = 28;                    /* analyser bands */
  const SPEC = 14;                    /* spectrum columns on screen (2 bands each) */
  const SROWS = 7;                    /* spectrum / speaker height */
  const DW = 42;                      /* dial width */
  const AUDIO_DIR = "audio/exofm/";
  const MASTER_VOL = 0.8;
  const RESTART_AFTER = 3;            /* seconds: PREV restarts a song once it is this far in */

  /* the playlist, in play order */
  const TRACKS = [
    { name: "Track 01", file: "track_01.mp3" },
    { name: "Track 02", file: "track_02.mp3" },
    { name: "Track 03", file: "track_03.mp3" },
    /* more:  "my_song.mp3",   or   { name: "Night Shift", file: "night_shift.mp3" }, */
  ];

  const LABELS = ["88.5", "92.3", "94.1", "98.7", "101.7", "104.3", "106.9", "107.9"];
  const KNOB = ["|", "/", "-", "\\"];

  /* analyser bands: 1 bin each in the lows (~47 Hz apart), then log-spaced up to ~13 kHz */
  const EDGES = [1];
  for (let c = 1; c <= COLS; c++) EDGES.push(Math.max(EDGES[c - 1] + 1, Math.floor(Math.pow(280, c / COLS))));

  /* "night_shift.mp3" -> "NIGHT SHIFT" */
  const prettify = f => String(f).split(/[?#]/)[0].split("/").pop()
    .replace(/\.[a-z0-9]+$/i, "").replace(/[_-]+/g, " ").trim().toUpperCase() || "UNTITLED";

  const PLAYLIST = TRACKS
    .map(t => (typeof t === "string" ? { file: t } : (t || {})))
    .filter(t => String(t.file || "").trim())
    .map(t => {
      const f = String(t.file).trim();
      return {
        name: t.name ? String(t.name).toUpperCase() : prettify(f),
        file: (/^(https?:)?\/\//i.test(f) || f.includes("/")) ? f : AUDIO_DIR + f
      };
    });
  PLAYLIST.forEach((t, i) => { t.label = LABELS[i % LABELS.length]; });

  /* ================= small helpers ================= */

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const pad2 = n => String(n).padStart(2, "0");
  const fmtT = s => { if (!isFinite(s) || s < 0) s = 0; return pad2(Math.floor(s / 60)) + ":" + pad2(Math.floor(s % 60)); };
  const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const fit = (s, n) => String(s).padEnd(n).slice(0, n);
  const clean = s => String(s).replace(/[@*~^&<>"]/g, " ");     /* those characters are drawing markers */
  function term(text, cls) { if (typeof Term !== "undefined") Term.print(text, cls || "dim"); }

  /* a fixed-width line you can drop strings into at a position */
  const cv = n => {
    const a = new Array(n).fill(" ");
    const o = { put(p, s) { for (let i = 0; i < s.length && p + i < n; i++) a[p + i] = s[i]; return o; }, str() { return a.join(""); } };
    return o;
  };

  /* ================= state ================= */

  let G = null;     /* window state, null = closed */
  let A = null;     /* audio graph (analyser only), null = not available */

  /* ================= audio ================= */

  /* The radio's one <audio> element feeds the analyser, and the analyser feeds
     the speakers. Nothing else on the site is connected to it. */
  function initAudio(el) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    let ctx = null;
    try {
      ctx = new AC();
      const master = ctx.createGain(); master.gain.value = MASTER_VOL; master.connect(ctx.destination);
      const an = ctx.createAnalyser(); an.fftSize = 1024; an.smoothingTimeConstant = 0.5; an.connect(master);
      const src = ctx.createMediaElementSource(el);
      src.connect(an);
      return { ctx, master, an, src, buf: new Uint8Array(an.frequencyBinCount) };
    } catch (e) {
      try { if (ctx) ctx.close(); } catch (x) {}
      return null;
    }
  }

  /* select a song (does not start it) */
  function load(i) {
    const n = PLAYLIST.length;
    G.idx = ((i % n) + n) % n;
    G.tuneTo = n > 1 ? G.idx / (n - 1) : 0.5;
    G.lost = false; G.flat = 0; G.scroll = 0;
    G.audio.src = PLAYLIST[G.idx].file;
  }

  function startPlayback() {
    const a = G.audio;
    G.state = "play";
    const p = a.play();
    if (p && p.catch) p.catch(err => {
      /* autoplay refused: sit stopped until a key is pressed. Anything else (a song
         swapped mid-load) is handled by the error / ended events. */
      if (G && G.audio === a && err && err.name === "NotAllowedError") G.state = "stop";
    });
  }

  function resumeCtx() { if (A) A.ctx.resume().catch(() => {}); }

  /* ---- the five keys ---- */

  function play() {
    if (!G || !PLAYLIST.length) return;
    resumeCtx();
    if (G.state === "play") return;
    if (G.lost) load(G.idx);                       /* try the song again */
    startPlayback();
  }

  function pause() {
    if (!G || !PLAYLIST.length || G.state !== "play") return;
    G.audio.pause();
    G.state = "pause";
  }

  function stop() {
    if (!G || !PLAYLIST.length || G.state === "stop") return;
    G.audio.pause();
    try { G.audio.currentTime = 0; } catch (e) {}
    G.state = "stop";
  }

  function skip() {
    if (!G || !PLAYLIST.length) return;
    resumeCtx();
    load(G.idx + 1);
    startPlayback();
  }

  function prev() {
    if (!G || !PLAYLIST.length) return;
    resumeCtx();
    if (!G.lost && G.audio.currentTime > RESTART_AFTER) {
      try { G.audio.currentTime = 0; } catch (e) {}
      return;
    }
    load(G.idx - 1);
    startPlayback();
  }

  /* the playlist loops: last song -> first (a one-song playlist repeats) */
  function onEnded() {
    if (!G) return;
    if (PLAYLIST.length === 1) { try { G.audio.currentTime = 0; } catch (e) {} startPlayback(); }
    else skip();
  }

  /* a song that will not load: skip it while playing, give up if none of them load */
  function onError() {
    if (!G || !G.audio.getAttribute("src")) return;
    const a = G.audio;
    G.fails++; G.lost = true;
    if (G.fails >= PLAYLIST.length) { G.state = "stop"; return; }
    if (G.state === "play") setTimeout(() => { if (G && G.audio === a && G.lost && G.state === "play") skip(); }, 900);
  }

  /* ================= levels ================= */

  function sample(dt) {
    const L = G.lvl;
    const tgt = new Array(COLS).fill(0);
    let bassT = 0, midT = 0, raw = 0;

    if (A) {
      A.an.getByteFrequencyData(A.buf);
      const b = A.buf;
      for (let c = 0; c < COLS; c++) {
        let sum = 0;
        const s = EDGES[c], e = EDGES[c + 1];
        for (let k = s; k < e; k++) sum += b[k];
        const v = sum / (e - s) / 255;
        raw += v;
        tgt[c] = clamp(v * 1.5 * (1 + 0.8 * c / COLS), 0, 1);     /* a little tilt: highs are quieter in music */
      }
      raw /= COLS;
      bassT = clamp((b[1] + b[2] + b[3] + b[4]) / 4 / 255 * 1.35, 0, 1);
      let m = 0;
      for (let k = 6; k <= 40; k++) m += b[k];
      midT = clamp(m / 35 / 255 * 1.6, 0, 1);
    }

    /* fast attack, slower release: this is what makes it hit */
    const up = 1 - Math.exp(-dt / 0.025), down = 1 - Math.exp(-dt / 0.16), slow = 1 - Math.exp(-dt / 0.5);
    let sum = 0;
    for (let c = 0; c < COLS; c++) {
      L[c] += (tgt[c] - L[c]) * (tgt[c] > L[c] ? up : down);
      sum += L[c];
    }
    G.overall = sum / COLS;
    G.bass += (bassT - G.bass) * (bassT > G.bass ? up : down);
    G.mid += (midT - G.mid) * (midT > G.mid ? up : down);

    /* kick detector: a sudden jump over the recent average, then a quick fade */
    G.bassAvg += (bassT - G.bassAvg) * slow;
    G.midAvg += (midT - G.midAvg) * slow;
    const kb = clamp((bassT - G.bassAvg) * 5 - 0.15, 0, 1);
    const km = clamp((midT - G.midAvg) * 5 - 0.15, 0, 1);
    G.kick = Math.max(G.kick * Math.exp(-dt / 0.11), kb);
    G.kickR = Math.max(G.kickR * Math.exp(-dt / 0.11), km);
    G.peak = G.kick > 0.5;

    /* spectrum peak-hold caps: hold a moment, then fall */
    for (let i = 0; i < SPEC; i++) {
      const v = Math.max(L[2 * i], L[2 * i + 1]);
      if (v >= G.pk[i]) { G.pk[i] = v; G.pkHold[i] = 0.2; }
      else if (G.pkHold[i] > 0) G.pkHold[i] -= dt;
      else G.pk[i] = Math.max(v, G.pk[i] - dt * 1.4);
    }

    /* the song is running but the meter reads nothing (page opened from disk?) */
    const a = G.audio;
    const running = G.state === "play" && !a.paused && !a.ended && a.currentTime > 1;
    if (running && raw < 0.003) G.flat += dt; else G.flat = 0;
  }

  /* ================= drawing ================= */

  /* one round speaker, 13 x 7 characters. Rings ripple outwards faster the harder
     it is hit, the rim and dust cap flare on the kick. */
  function speaker(rip, kick) {
    const rows = [];
    for (let y = 0; y < SROWS; y++) {
      let s = "";
      for (let x = 0; x < 13; x++) {
        const nx = (x - 6) / 6.6, ny = (y - 3) / 3.6;
        const d = Math.sqrt(nx * nx + ny * ny);
        if (d > 1.02) s += " ";
        else if (d > 0.8) s += kick > 0.4 ? "O" : "o";
        else if (d < 0.33) s += kick > 0.35 ? "@" : "O";
        else s += (Math.floor(d * 5 - rip) & 1) ? ":" : "#";
      }
      rows.push(s);
    }
    return rows;
  }

  /* markers -> colour: @ and * are hot lamps, ^ is a peak cap, ~ is the dial needle */
  function paint(text) {
    return text
      .replace(/[@*]/g, '<span class="exo-hot">$&</span>')
      .replace(/\^/g, '<span class="exo-pk">^</span>')
      .replace(/~/g, '<span class="exo-nd">|</span>');
  }

  function marquee(name, n, off) {
    if (name.length <= n) return fit(" ".repeat(Math.floor((n - name.length) / 2)) + name, n);
    const loop = name + "   ";
    const o = Math.floor(off) % loop.length;
    return (loop + loop).slice(o, o + n);
  }

  function frameLines() {
    const g = G, L = g.lvl;
    const playing = g.state === "play";
    const T = PLAYLIST[g.idx] || null;
    const rule = "-".repeat(W);
    const out = [];

    /* display: station, state, track, time, then the scrolling title */
    const freq = T ? T.label + " FM" : "--.- FM";
    const state = !T ? "----" : g.lost ? "LOST" : { play: "PLAY", pause: "PAUSE", stop: "STOP" }[g.state];
    const trk = T ? "TR " + pad2(g.idx + 1) + "/" + pad2(PLAYLIST.length) : "TR --/--";
    const dur = g.audio.duration;
    const time = T ? fmtT(g.audio.currentTime) + "/" + (isFinite(dur) ? fmtT(dur) : "--:--") : "--:--/--:--";
    const name = T ? clean(T.name) : "NO TAPE LOADED";
    out.push(cv(W).put(0, freq).put(11, state).put(20, trk).put(W - time.length, time).str());
    out.push(marquee(name, W, g.scroll));
    out.push(rule);

    /* dial: the needle sits on the song's place in the playlist and jolts on the kick */
    const shiv = Math.round(clamp((g.kick - 0.25) * 2.4, -1, 1));
    const nc = clamp(Math.round(2 + g.tune * (DW - 5)) + shiv, 1, DW - 2);
    let ticks = "";
    for (let c = 0; c < DW; c++) ticks += c === nc ? "~" : (c % 3 === 0 ? "." : " ");
    out.push(fit("FM 88    92    96   100   104   108", DW));
    out.push(ticks);
    out.push(fit("AM 53   70    90   120  160  170", DW));
    out.push(rule);

    /* speakers either side of the spectrum. left = bass, right = mids */
    const sl = speaker(g.ripL, g.kick), sr = speaker(g.ripR, g.kickR);
    for (let r = 0; r < SROWS; r++) {
      const t = (SROWS - r - 0.5) / SROWS;
      let sp = "";
      for (let i = 0; i < SPEC; i++) {
        const v = Math.max(L[2 * i], L[2 * i + 1]);
        const cap = SROWS - 1 - Math.min(SROWS - 1, Math.floor(g.pk[i] * SROWS));
        sp += v >= t ? "#" : (r === cap && g.pk[i] > 0.04 ? "^" : " ");
      }
      out.push(sl[r] + " " + sp + " " + sr[r]);
    }
    out.push(rule);

    /* knobs, VU meter, lamps */
    const k1 = KNOB[Math.floor(g.volPh) % 4], k3 = KNOB[Math.floor(g.tunePh) % 4];
    const n = Math.round(clamp(g.overall * 2.2, 0, 1) * 10);
    const lamp = playing ? (g.kick > 0.4 ? "*" : "o") : " ";
    out.push(cv(W).put(0, "(" + k1 + ")").put(4, "VU [" + "#".repeat(n) + "-".repeat(10 - n) + "]")
      .put(21, "ON AIR (" + lamp + ")").put(32, "PK(" + (g.kick > 0.5 ? "*" : "-") + ")").put(39, "(" + k3 + ")").str());
    return out;
  }

  function render() {
    const html = paint(frameLines().join("\n"));
    if (html !== G.html) { G.html = html; G.R.pre.innerHTML = html; }
  }

  /* the display already shows station, song and time: this line is only for problems */
  function statusText() {
    if (!PLAYLIST.length) return "NO TAPE LOADED";
    if (G.lost) return "NO SIGNAL";
    if (G.flat > 2.5) return "METER NEEDS HTTP (NOT FILE://)";
    return "";
  }

  /* PLAY / PAUSE / STOP stay down to show the mode */
  function syncKeys() {
    const key = G.state + (PLAYLIST.length ? "" : "-none");
    if (key === G.keyState) return;
    G.keyState = key;
    G.root.querySelectorAll(".exo-key").forEach(b => {
      const a = b.dataset.a;
      b.classList.toggle("latched", PLAYLIST.length > 0 && ((a === "play" && G.state === "play") ||
        (a === "pause" && G.state === "pause") || (a === "stop" && G.state === "stop")));
    });
  }

  /* a quick press animation for keys driven from the terminal */
  function tap(name) {
    const b = G && G.root.querySelector('.exo-key[data-a="' + name + '"]');
    if (!b) return;
    b.classList.add("tap");
    setTimeout(() => b.classList.remove("tap"), 160);
  }

  /* ================= frame loop ================= */

  function frame(now) {
    if (!G) return;
    G.raf = requestAnimationFrame(frame);
    const dt = Math.min((now - G.last) / 1000, 0.1);
    G.last = now;
    if (G.win.minimized || document.hidden) return;
    try {
      const muted = typeof Sound !== "undefined" && Sound.muted;
      if (A) A.master.gain.value = muted ? 0 : MASTER_VOL;
      else G.audio.muted = muted;
      sample(dt);
      G.tune += (G.tuneTo - G.tune) * (1 - Math.exp(-dt / 0.2));
      G.volPh += dt * G.overall * 16;
      G.balPh += dt * G.mid * 12;
      G.tunePh += dt * G.bass * 12;
      G.ripL += dt * (1.2 + G.bass * 10 + G.kick * 8);
      G.ripR += dt * (1.2 + G.mid * 10 + G.kickR * 8);
      G.reelPh += dt * (G.state === "play" ? 3 + G.overall * 16 : 0);
      G.scroll += dt * 5;

      /* the window itself glows and its title bar lights up with the hit (see .exo-win in style.css) */
      const kk = Math.max(G.kick, G.kickR * 0.7).toFixed(2);
      if (kk !== G.kk) { G.kk = kk; G.win.el.style.setProperty("--k", kk); }

      render();
      syncKeys();
      const txt = statusText();
      if (txt !== G.statTxt) { G.statTxt = txt; G.R.stat.textContent = txt; }
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
      '<div class="exo-keys">' +
        '<button class="exo-key" data-a="prev"><b>|&lt;&lt;</b><i>PREV</i></button>' +
        '<button class="exo-key" data-a="play"><b>&gt;</b><i>PLAY</i></button>' +
        '<button class="exo-key" data-a="pause"><b>||</b><i>PAUSE</i></button>' +
        '<button class="exo-key" data-a="stop"><b>[]</b><i>STOP</i></button>' +
        '<button class="exo-key" data-a="skip"><b>&gt;&gt;|</b><i>SKIP</i></button>' +
      '</div>';
    const R = { root };
    root.querySelectorAll("[data-r]").forEach(n => { R[n.dataset.r] = n; });

    const el = new Audio();
    el.preload = "auto";
    el.addEventListener("ended", onEnded);
    el.addEventListener("error", onError);
    el.addEventListener("playing", () => { if (G && G.audio === el) { G.fails = 0; G.lost = false; } });

    A = initAudio(el);
    G = {
      root, R, win: null, raf: 0, last: performance.now(), audio: el,
      state: "stop", idx: 0, tune: 0.5, tuneTo: 0.5, lost: false, fails: 0,
      lvl: new Array(COLS).fill(0), pk: new Array(SPEC).fill(0), pkHold: new Array(SPEC).fill(0),
      bass: 0, mid: 0, bassAvg: 0, midAvg: 0, kick: 0, kickR: 0, overall: 0, peak: false,
      volPh: 0, balPh: 0, tunePh: 0, ripL: 0, ripR: 0, reelPh: 0, scroll: 0,
      flat: 0, statTxt: "", keyState: "", html: "", kk: ""
    };

    G.win = WinMgr.create({
      title: "EXOFM", content: root, label: "EXOFM", tag: "exofm",
      w: 336, h: 360, onClose: teardown
    });
    G.win.el.classList.add("exo-win");

    root.addEventListener("click", e => {
      const b = e.target.closest("[data-a]");
      if (b && G) act(b.dataset.a);
    });

    if (PLAYLIST.length) { load(0); play(); }
    else {
      term("EXOFM: NO TAPE LOADED.", "warning");
      console.warn("[exofm] the playlist is empty - add songs to TRACKS in js/exofm.js (files go in " + AUDIO_DIR + ").");
    }
    render();
    syncKeys();
    G.raf = requestAnimationFrame(frame);
    term("EXOFM CARRIER ACQUIRED.", "dim");
  }

  function teardown() {
    if (!G) return;
    cancelAnimationFrame(G.raf);
    try { G.audio.pause(); G.audio.removeAttribute("src"); G.audio.load(); } catch (e) {}
    if (A) { try { A.ctx.close(); } catch (e) {} A = null; }
    G = null;
  }

  function act(a) {
    if (!G) return;
    if (a === "play") play();
    else if (a === "pause") pause();
    else if (a === "stop") stop();
    else if (a === "skip") skip();
    else if (a === "prev") prev();
  }

  /* ================= typed commands (called by terminal.js) =================
     Returns true when the line was handled here. */

  function handleInput(raw) {
    const t = String(raw || "").trim().toLowerCase().split(/\s+/);
    if (t[0] !== "exofm") return false;
    const a = t[1] || "";
    if (G && G.win) {
      const key = a === "next" ? "skip" : (a === "previous" || a === "back") ? "prev" : a === "off" ? "stop" : a;
      if (a === "close") WinMgr.closeWin(G.win);
      else if (["play", "pause", "stop", "skip", "prev"].includes(key)) { tap(key); act(key); }
      else open();
    } else open();
    return true;
  }

  return { open, handleInput };
})();
