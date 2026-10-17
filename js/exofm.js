"use strict";
/* exofm.js - EXOFM (hidden)
   Opened by typing  ExoFM  in the terminal. It is NOT in HELP or Tab completion.

   A small window with a vintage ASCII radio that plays a playlist of songs on
   loop. The speaker grille, the VU meter, the dial needle, the knobs and the
   lamps react to the radio's own audio and nothing else: it is read through
   an analyser that is connected only to the radio's player. Pause or stop it
   and everything settles. No synth, no static, no made-up animation.

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

  const W = 36;                       /* width of the radio in characters */
  const COLS = 28;                    /* speaker grille columns */
  const ROWS = 5;                     /* speaker grille rows */
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
  const center = s => {
    const n = W - s.length;
    if (n <= 0) return s.slice(0, W);
    const l = Math.floor(n / 2);
    return " ".repeat(l) + s + " ".repeat(n - l);
  };
  function term(text, cls) { if (typeof Term !== "undefined") Term.print(text, cls || "dim"); }

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
      const an = ctx.createAnalyser(); an.fftSize = 256; an.smoothingTimeConstant = 0.55; an.connect(master);
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
    G.lost = false; G.flat = 0;
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
    let bassT = 0, raw = 0;

    if (A) {
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

    /* the song is running but the meter reads nothing (page opened from disk?) */
    const a = G.audio;
    const running = G.state === "play" && !a.paused && !a.ended && a.currentTime > 1;
    if (running && raw < 0.003) G.flat += dt; else G.flat = 0;
  }

  /* ================= drawing ================= */

  function render() {
    const g = G, L = g.lvl;
    const out = [];
    const playing = g.state === "play";

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

    /* dial window: the needle sits on the song's place in the playlist and shivers with the bass */
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
    const lamp = playing ? (g.peak ? "*" : "o") : " ";
    out.push(line("  VU [" + "#".repeat(n) + "-".repeat(10 - n) + "]   ON AIR (" + lamp + ")"));
    out.push(" '" + "-".repeat(32) + "' ");
    out.push("  [__]" + " ".repeat(24) + "[__]  ");

    g.R.pre.textContent = out.join("\n");
  }

  function statusText() {
    if (!PLAYLIST.length) return "NO TAPE LOADED<br>&nbsp;<br>&nbsp;";
    const t = PLAYLIST[G.idx];
    const a = "TRACK " + pad2(G.idx + 1) + "/" + pad2(PLAYLIST.length) + " // " + t.label + " FM";
    let b;
    if (G.lost) b = "NO SIGNAL";
    else {
      const nm = t.name.length > 24 ? t.name.slice(0, 21) + "..." : t.name;
      b = (G.state === "play" ? "PLAYING: " : G.state === "pause" ? "PAUSED: " : "STOPPED: ") + esc(nm);
    }
    const dur = G.audio.duration;
    const c = G.flat > 2.5 ? "METER NEEDS HTTP (NOT FILE://)"
      : fmtT(G.audio.currentTime) + " / " + (isFinite(dur) ? fmtT(dur) : "--:--");
    return a + "<br>" + b + "<br>" + c;
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
      G.tune += (G.tuneTo - G.tune) * (1 - Math.exp(-dt / 0.25));
      G.volPh += dt * G.overall * 14;
      G.tunePh += dt * G.bass * 9;
      render();
      syncKeys();
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
      lvl: new Array(COLS).fill(0), bass: 0, overall: 0, peak: false,
      volPh: 0, tunePh: 0, flat: 0, statTxt: "", keyState: ""
    };

    G.win = WinMgr.create({
      title: "EXOFM", content: root, label: "EXOFM", tag: "exofm",
      w: 330, h: 530, onClose: teardown
    });

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
