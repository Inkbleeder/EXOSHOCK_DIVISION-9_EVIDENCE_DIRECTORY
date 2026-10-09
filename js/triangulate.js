"use strict";
/* triangulate.js - BOARDING VECTOR SOLUTION (BVS-2)
   Hidden minigame. Opened by typing DefinitelyOfficeWork2 (the command is
   found in the data flow, see flow.js - it is NOT in HELP or Tab completion).

   LORE FRAME
   You are field-support staff. A contract is waiting on a ship that is hiding.
   Three listening nodes each give you a bearing; you triangulate the hull, then
   transmit the fix. A small Division 9 boarding vessel launches to those
   coordinates. If it finds the ship it docks and breaches. The analyst only
   ever sees: launch, docking, breach, and that the contract is in progress.
   Nothing is "captured" and nothing is "completed" on this screen.

   HOW IT PLAYS
   - Pick a node (NODE-01/02/03), turn the dial and LISTEN. The signal meter and
     tone rise as the dial nears the ship's bearing. Lock the bearing at the peak.
   - Each lock draws a wedge (its width is the reading's uncertainty).
   - Click the radar to place your estimate where the wedges cross. A pinned
     estimate reads back a signal strength: the ship sits at the signal peak, and
     the reading gets less noisy the closer you are. Unpin and try elsewhere.
   - The cone (wedge) is wide in early contracts and narrows every contract until
     it is a bare line: late contracts need a near-perfect bearing.
   - Fuel: clean fix = breach; near = vessel corrects course (costs more); miss =
     vessel recalled. Credits are earned per breach. Every 5th contract a supply
     depot offers fuel for credits. No fuel = shift over.

   CONTROLS (mouse, keyboard and typed - the terminal stays usable)
     dial: drag the knob, or buttons, or ArrowLeft / ArrowRight (Shift = x5)
     Space = lock   1 / 2 / 3 = pick node   Delete = unpin   (only while the input line is empty)
     right-click the radar = unpin
     typed: bearing <0-359>, node <1-3>, lock, reset, mark <x> <y>, unpin, transmit,
            resupply, decline, start, manual, ledger, skip, quit

   SOUNDS
   Everything has a built-in synthesised stand-in, so the game works with no
   files. To use real recordings, drop WAVs named exactly as in SOUNDS_FOR_CREATOR
   into the site's normal  audio/  folder with the prefix bvs_  (e.g.
   audio/bvs_radar_ping.wav). Any file found is used in place of its stand-in; a
   missing file silently falls back. Hiding-ship chatter is voice only: no text is
   ever shown for it. */

const Triangulate = (() => {

  /* ================= config ================= */

  const SECTOR = 100;                         /* sector is 100 x 100 km */
  const RES = 240;                            /* radar canvas internal pixels */
  const PX = RES / SECTOR;
  const NODE_COLOURS = ["#ffb347", "#55cfff", "#ff9de2"];
  const START_FUEL = 100;
  const FUEL_COST = { clean: 10, near: 20, miss: 35 };
  const RESUPPLY = 10;                        /* fuel refunded when a breach succeeds */
  const FINAL_CONTRACT = 14;                  /* from here on the cone is a bare line */
  const CONE_START = 24;                      /* wedge half-angle (deg) on contract 1 */
  const TOL_START = 7.0, TOL_END = 1.2;       /* clean-fix radius (km), first -> last */
  const CREDIT_CLEAN = 140, CREDIT_STREAK = 15, CREDIT_NEAR = 60;
  const DEPOT_EVERY = 5, DEPOT_COST = 300, DEPOT_FUEL = 50;
  const VESSEL_SPEED = 34;                    /* km per second */
  const BRIEF_S = 1.7;
  const RESULT_S = 4.2;
  const SWEEP_DEG_S = 48;
  const BEST_KEY = "d9-bvs-best";
  const AUDIO_DIR = "audio/";                 /* the site's normal audio folder */
  const AUDIO_PREFIX = "bvs_";                /* keeps game files apart from the site's own */

  /* ================= small maths ================= */

  const rnd = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rad = d => d * Math.PI / 180;
  const norm360 = d => ((d % 360) + 360) % 360;
  const angDiff = (a, b) => { const d = Math.abs(norm360(a) - norm360(b)); return d > 180 ? 360 - d : d; };
  const gauss = () => (Math.random() + Math.random() + Math.random() + Math.random() - 2) / 0.58;   /* ~N(0,1) */
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  /* compass bearing: 0 = up (north), clockwise */
  const bearingTo = (f, t) => norm360(Math.atan2(t.x - f.x, -(t.y - f.y)) * 180 / Math.PI);
  const pointAt = (f, b, r) => ({ x: f.x + r * Math.sin(rad(b)), y: f.y - r * Math.cos(rad(b)) });
  const pad = (n, w) => String(Math.max(0, Math.floor(n))).padStart(w, "0");
  const fmtT = s => pad(s / 60, 2) + ":" + pad(s % 60, 2);
  const fmtN = n => Math.round(n).toLocaleString("en-US");
  /* difficulty ramp: 0 on contract 1 -> 1 on the final contract */
  const ramp = n => clamp((n - 1) / (FINAL_CONTRACT - 1), 0, 1);
  const coneFor = n => n >= FINAL_CONTRACT ? 0 : CONE_START * Math.pow(1 - ramp(n), 1.4);
  const tolClean = n => TOL_START + (TOL_END - TOL_START) * ramp(n);
  const tolNear = n => tolClean(n) * 2.2;
  /* the boarding vessel launches from a random point on the sector's edge */
  function edgeDock() {
    const side = Math.floor(Math.random() * 4), k = rnd(8, 92), e = 4;
    return side === 0 ? { x: k, y: e } : side === 1 ? { x: 100 - e, y: k } : side === 2 ? { x: k, y: 100 - e } : { x: e, y: k };
  }

  /* Hiding-ship chatter is audio only (files bvs_<group>_NN.wav); nothing is printed.
     The count per group is all the code needs. */
  const VOICE_GROUPS = { pilot: 6, comms: 6, crew: 6, reaction: 6 };
  const VOICE_FILES = [];
  Object.keys(VOICE_GROUPS).forEach(g => { for (let i = 1; i <= VOICE_GROUPS[g]; i++) VOICE_FILES.push(g + "_" + pad(i, 2)); });
  const DISPATCH = {
    dispatch_fix_received:      "Fix received. Preparing boarding vessel.",
    dispatch_vessel_away:       "Boarding vessel away.",
    dispatch_on_approach:       "Vessel on approach.",
    dispatch_docked:            "Vessel docked.",
    dispatch_breach_confirmed:  "Breach confirmed. Contract in progress."
  };
  const SYS = {
    sys_node_online:     "Node online.",
    sys_signal_acquired: "Signal acquired.",
    sys_bearing_locked:  "Bearing locked.",
    sys_transmit_open:   "Transmission window open."
  };

  /* ================= sound engine ================= */

  const Sfx = (() => {
    let ctx = null, master = null, noiseBuf = null;
    const files = {};        /* name -> { ok: null|true|false, el } */
    const loops = {};        /* name -> handle */
    const lastPlay = {};

    function ac() {
      if (ctx) return ctx;
      try {
        ctx = new (window.AudioContext || window.webkitAudioContext)();
        master = ctx.createGain();
        master.gain.value = 0.5;
        master.connect(ctx.destination);
      } catch (e) { ctx = null; }
      return ctx;
    }
    function muted() { return typeof Sound !== "undefined" && Sound.muted; }
    function resume() { const c = ac(); if (c && c.state === "suspended") c.resume().catch(() => {}); }

    function probe(name) {
      if (files[name]) return files[name];
      const f = files[name] = { ok: null, el: null };
      try {
        const a = new Audio();
        a.preload = "auto";
        a.addEventListener("canplaythrough", () => { f.ok = true; }, { once: true });
        a.addEventListener("error", () => { f.ok = false; }, { once: true });
        a.src = AUDIO_DIR + AUDIO_PREFIX + name + ".wav";
        f.el = a;
      } catch (e) { f.ok = false; }
      return f;
    }

    function tone(freq, dur, o) {
      o = o || {};
      const c = ac(); if (!c || muted()) return;
      const t = c.currentTime + (o.delay || 0);
      const osc = c.createOscillator(), g = c.createGain();
      osc.type = o.type || "sine";
      osc.frequency.setValueAtTime(freq, t);
      if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(o.vol || 0.25, t + (o.attack || 0.006));
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(g); g.connect(master);
      osc.start(t); osc.stop(t + dur + 0.05);
    }

    function noiseBuffer() {
      if (noiseBuf) return noiseBuf;
      const c = ac();
      noiseBuf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      return noiseBuf;
    }

    function burst(dur, o) {
      o = o || {};
      const c = ac(); if (!c || muted()) return;
      const t = c.currentTime + (o.delay || 0);
      const src = c.createBufferSource(); src.buffer = noiseBuffer();
      const f = c.createBiquadFilter(); f.type = o.filter || "bandpass";
      f.frequency.setValueAtTime(o.f || 1500, t);
      if (o.fTo) f.frequency.exponentialRampToValueAtTime(o.fTo, t + dur);
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(o.vol || 0.2, t + (o.attack || 0.004));
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(f); f.connect(g); g.connect(master);
      src.start(t); src.stop(t + dur + 0.05);
    }

    /* one-shot stand-ins */
    const SYN = {
      ui_click:         () => tone(900, 0.03, { type: "square", vol: 0.1 }),
      dial_tick:        () => burst(0.02, { f: 2600, vol: 0.12 }),
      radar_ping:       () => { tone(1250, 0.5, { to: 880, vol: 0.12 }); tone(1250, 0.5, { to: 880, vol: 0.05, delay: 0.18 }); },
      lock_engage:      () => { tone(120, 0.14, { type: "square", vol: 0.28 }); tone(880, 0.1, { delay: 0.06, vol: 0.18 }); },
      marker_place:     o => tone(900 + 1200 * ((o && o.v) || 0), 0.06, { type: "square", vol: 0.12 }),
      credits_earned:   () => { tone(1320, 0.07, { type: "square", vol: 0.1 }); tone(1760, 0.12, { type: "square", vol: 0.1, delay: 0.08 }); },
      depot_open:       () => { tone(300, 0.1, { type: "triangle", vol: 0.14 }); tone(450, 0.14, { type: "triangle", vol: 0.14, delay: 0.1 }); },
      resupply_confirm: () => { burst(0.5, { f: 300, fTo: 1400, filter: "lowpass", vol: 0.2 }); tone(220, 0.4, { to: 440, type: "sawtooth", vol: 0.1 }); tone(880, 0.12, { type: "square", vol: 0.1, delay: 0.45 }); },
      chatter:          () => { for (let i = 0; i < 5; i++) { const d = i * 0.09; burst(0.07, { f: rnd(500, 1400), vol: 0.07, delay: d }); tone(rnd(160, 260), 0.07, { type: "sawtooth", vol: 0.04, delay: d }); } },
      bearing_clear:    () => tone(700, 0.2, { to: 240, type: "triangle", vol: 0.18 }),
      node_online:      () => tone(660, 0.09, { type: "square", vol: 0.1 }),
      contract_assigned:() => { tone(520, 0.08, { type: "square", vol: 0.12 }); tone(780, 0.1, { type: "square", vol: 0.12, delay: 0.11 }); },
      shift_start:      () => { tone(180, 0.7, { to: 720, type: "sawtooth", vol: 0.12 }); burst(0.5, { f: 400, fTo: 3000, vol: 0.12 }); },
      transmit_send:    () => { for (let i = 0; i < 9; i++) tone(rnd(900, 2200), 0.035, { type: "square", vol: 0.08, delay: i * 0.05 }); },
      vessel_launch:    () => { burst(0.9, { f: 160, fTo: 900, filter: "lowpass", vol: 0.3 }); tone(60, 0.9, { to: 150, type: "sawtooth", vol: 0.16 }); },
      vessel_dock:      () => { tone(95, 0.12, { type: "square", vol: 0.3 }); tone(80, 0.18, { type: "square", vol: 0.3, delay: 0.22 }); },
      breach_success:   () => { [392, 523, 659, 784].forEach((f, i) => tone(f, 0.16, { type: "triangle", vol: 0.2, delay: i * 0.09 })); tone(98, 0.5, { type: "sawtooth", vol: 0.18, delay: 0.3 }); },
      vessel_recall:    () => { tone(440, 0.2, { to: 330, type: "square", vol: 0.14 }); tone(330, 0.3, { to: 196, type: "square", vol: 0.14, delay: 0.24 }); },
      shift_over:       () => [440, 392, 349, 294, 196].forEach((f, i) => tone(f, 0.4, { type: "triangle", vol: 0.2, delay: i * 0.28 })),
      new_best_shift:   () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.14, { type: "square", vol: 0.12, delay: i * 0.08 }))
    };

    /* loop stand-ins: each returns { set(v), stop() } */
    function nodeLoop(build) {
      const c = ac(); if (!c) return null;
      const g = c.createGain(); g.gain.value = 0; g.connect(master);
      const parts = []; const set = build(c, g, parts);
      return {
        set: set || (() => {}),
        stop() {
          try { g.gain.setTargetAtTime(0.0001, c.currentTime, 0.08); } catch (e) {}
          setTimeout(() => parts.forEach(p => { try { p.stop(); } catch (e) {} }), 400);
        }
      };
    }

    const LOOPS = {
      ambience_space_loop: () => nodeLoop((c, g, parts) => {
        const lp = c.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 320; lp.connect(g);
        [[55, "sine", 0.5], [82.4, "sine", 0.3], [110.4, "triangle", 0.12]].forEach(([f, ty, v]) => {
          const o = c.createOscillator(), og = c.createGain(); o.type = ty; o.frequency.value = f; og.gain.value = v;
          o.connect(og); og.connect(lp); o.start(); parts.push(o);
        });
        const lfo = c.createOscillator(), lg = c.createGain(); lfo.frequency.value = 0.07; lg.gain.value = 0.05;
        lfo.connect(lg); lg.connect(g.gain); lfo.start(); parts.push(lfo);
        const n = c.createBufferSource(); n.buffer = noiseBuffer(); n.loop = true;
        const nf = c.createBiquadFilter(); nf.type = "lowpass"; nf.frequency.value = 500;
        const ng = c.createGain(); ng.gain.value = 0.05;
        n.connect(nf); nf.connect(ng); ng.connect(g); n.start(); parts.push(n);
        g.gain.value = 0.2;
      }),
      signal_tone_loop: () => nodeLoop((c, g, parts) => {
        const o = c.createOscillator(); o.type = "triangle"; o.frequency.value = 300; o.connect(g); o.start(); parts.push(o);
        return v => { o.frequency.setTargetAtTime(260 + 980 * v, c.currentTime, 0.04); g.gain.setTargetAtTime(v * v * 0.3, c.currentTime, 0.05); };
      }),
      static_loop: () => nodeLoop((c, g, parts) => {
        const n = c.createBufferSource(); n.buffer = noiseBuffer(); n.loop = true;
        const f = c.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = 1800; f.Q.value = 0.6;
        n.connect(f); f.connect(g); n.start(); parts.push(n);
        return v => g.gain.setTargetAtTime((1 - v) * 0.16, c.currentTime, 0.06);
      }),
      vessel_travel_loop: () => nodeLoop((c, g, parts) => {
        const o = c.createOscillator(); o.type = "sawtooth"; o.frequency.value = 68;
        const lp = c.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 200;
        o.connect(lp); lp.connect(g); o.start(); parts.push(o);
        const t = c.createOscillator(), tg = c.createGain(); t.frequency.value = 7; tg.gain.value = 0.04;
        t.connect(tg); tg.connect(g.gain); t.start(); parts.push(t);
        g.gain.value = 0.14;
      }),
      fuel_warning_loop: () => {
        const id = setInterval(() => tone(520, 0.12, { type: "square", vol: 0.1 }), 750);
        return { set() {}, stop() { clearInterval(id); } };
      }
    };

    const LOOP_VOL = { ambience_space_loop: 0.5, signal_tone_loop: 0.7, static_loop: 0.6, vessel_travel_loop: 0.6, fuel_warning_loop: 0.5 };

    function play(name, opts) {
      if (muted()) return;
      resume();
      const now = Date.now();
      if (lastPlay[name] && now - lastPlay[name] < 25) return;
      lastPlay[name] = now;
      const f = probe(name);
      if (f.ok && f.el) {
        try {
          const a = f.el.cloneNode();
          a.volume = clamp((opts && opts.volume) || 0.8, 0, 1);
          a.play().catch(() => {});
          return;
        } catch (e) { /* fall through to the stand-in */ }
      }
      if (SYN[name]) SYN[name](opts);
    }

    function loopStart(name) {
      if (loops[name]) return;
      resume();
      const f = probe(name);
      if (f.ok && f.el) {
        const a = f.el.cloneNode(); a.loop = true; a.volume = 0;
        a.play().catch(() => {});
        const h = { wav: a, base: LOOP_VOL[name] || 0.6 };
        h.set = v => {
          a.volume = clamp(v * h.base, 0, 1);
          if (name === "signal_tone_loop") a.playbackRate = 0.6 + 1.2 * v;
          if (name === "static_loop") a.volume = clamp((1 - v) * h.base, 0, 1);
        };
        h.stop = () => { try { a.pause(); } catch (e) {} };
        if (name === "ambience_space_loop" || name === "vessel_travel_loop" || name === "fuel_warning_loop") { h.fixed = true; a.volume = h.base * 0.5; }
        loops[name] = h;
        return;
      }
      if (LOOPS[name] && ac()) { const h = LOOPS[name](); if (h) loops[name] = h; }
    }
    function loopSet(name, v) {
      const h = loops[name];
      if (h) { try { h.set(muted() ? 0 : v); } catch (e) {} }
    }
    function loopStop(name) {
      const h = loops[name];
      if (h) { try { h.stop(); } catch (e) {} delete loops[name]; }
    }
    function stopAll() { Object.keys(loops).forEach(loopStop); }
    function voice(name, standIn) {
      if (muted()) return;
      resume();
      const f = probe(name);
      if (f.ok && f.el) { try { const a = f.el.cloneNode(); a.volume = 0.9; a.play().catch(() => {}); return; } catch (e) {} }
      if (standIn && SYN[standIn]) SYN[standIn]();
    }
    function preload(list) { list.forEach(probe); }

    /* called every frame: keep everything in step with the site's MUTE */
    function sync() {
      const m = muted();
      if (master) master.gain.value = m ? 0 : 0.5;
      Object.keys(loops).forEach(n => {
        const h = loops[n];
        if (h.wav && h.fixed) h.wav.volume = m ? 0 : h.base * 0.5;
        else if (h.wav && m) h.wav.volume = 0;
      });
    }

    return { play, loopStart, loopSet, loopStop, stopAll, voice, preload, resume, sync };
  })();

  /* ================= state ================= */

  let G = null;            /* null = window closed */

  function loadBest() {
    try { return JSON.parse(sessionStorage.getItem(BEST_KEY) || "null"); } catch (e) { return null; }
  }
  function saveBest(b) { try { sessionStorage.setItem(BEST_KEY, JSON.stringify(b)); } catch (e) {} }

  function ratingFor(v) {
    if (v >= 9000) return "EXEMPLARY";
    if (v >= 4500) return "COMMENDED";
    if (v >= 1800) return "SATISFACTORY";
    return "PROBATIONARY";
  }

  function newShift() {
    return { fuel: START_FUEL, credits: 0, earned: 0, value: 0, breaches: 0, clean: 0, recalls: 0, contracts: 0, streak: 0, newBest: false };
  }

  /* ================= contracts ================= */

  function makeContract(n) {
    let best = null;
    const cone = coneFor(n);
    const dock = edgeDock();
    for (let tries = 0; tries < 300 && !best; tries++) {
      const T = { x: rnd(24, 76), y: rnd(24, 76) };
      if (dist(T, dock) < 28) continue;
      const a0 = rnd(0, 360), a1 = a0 + rnd(62, 150), a2 = a1 + rnd(62, 150);
      if (360 - (a2 - a0) < 58) continue;
      const nodes = [];
      let ok = true;
      [a0, a1, a2].forEach((a, i) => {
        const r = rnd(26, 46);
        const p = pointAt(T, a, r);
        if (p.x < 6 || p.x > 94 || p.y < 6 || p.y > 94) ok = false;
        const d = dist(p, T);
        const biasDeg = cone * 0.3;                       /* reading error shrinks with the cone */
        nodes.push({
          i, x: p.x, y: p.y, colour: NODE_COLOURS[i],
          trueB: bearingTo(p, T),
          bias: gauss() * biasDeg * 0.7,
          biasDeg,
          jit: clamp(0.03 + (n - 1) * 0.006 + d / 600, 0.03, 0.12),
          decoyB: norm360(bearingTo(p, T) + (Math.random() < 0.5 ? -1 : 1) * rnd(70, 140)),
          decoy: n >= 4,
          phase: rnd(0, 6.28),
          dial: Math.round(rnd(0, 359)),
          locked: null, wedge: 0,
          noise: 0, sm: 0.15, raw: 0.15
        });
      });
      if (ok) best = { T, nodes };
    }
    if (!best) {             /* fallback: a fixed, valid layout */
      const T = { x: 55, y: 45 };
      best = { T, nodes: [0, 130, 250].map((a, i) => { const p = pointAt(T, a, 34); return {
        i, x: p.x, y: p.y, colour: NODE_COLOURS[i], trueB: bearingTo(p, T), bias: 0, biasDeg: cone * 0.3, jit: 0.05,
        decoyB: 0, decoy: false, phase: 0, dial: 0, locked: null, wedge: 0, noise: 0, sm: 0.15, raw: 0.15 }; }) };
    }
    return {
      n, id: "D9-C-" + pad(400 + n * 3 + Math.floor(rnd(0, 3)), 4),
      priority: n <= 3 ? "ROUTINE" : n <= 7 ? "PRIORITY" : "CRITICAL",
      target: best.T, nodes: best.nodes, dock, marker: null, found: false,
      elapsed: 0, said: {}, lastInterceptAt: -99
    };
  }

  /* the signal at a dial angle: a broad lobe so the dial can be swept by ear, plus a
     sharp peak at the ship that gets narrower every contract */
  function lobe(errDeg, n) {
    const t = ramp(n || 1);
    const c = (1 + Math.cos(rad(errDeg))) / 2;
    const broad = c * c * c;
    const w = 12 - 10 * t;                              /* degrees */
    const sharp = Math.exp(-Math.pow(errDeg / w, 2));
    return 0.12 + 0.88 * (0.55 * broad + 0.45 * sharp);
  }

  function nodeSignal(nd, dial, t, n) {
    let s = lobe(angDiff(dial, nd.trueB + nd.bias), n);
    if (nd.decoy) s = Math.max(s, 0.62 * lobe(angDiff(dial, nd.decoyB), n));
    if (n >= 6) s *= 0.7 + 0.3 * (0.5 + 0.5 * Math.sin(t * 1.1 + nd.phase));
    return clamp(s, 0, 1);
  }

  /* what a pinned estimate reads back: strongest AT the ship, and the reading gets
     less noisy the closer it is */
  function markerSignal(c, m) {
    const d = dist(m, c.target);
    const scale = 16 - 8 * ramp(c.n);
    return clamp(Math.exp(-d / scale) + gauss() * 0.06 * Math.min(1, d / 20), 0, 1);
  }

  /* ================= DOM ================= */

  const TEMPLATE = `
  <div class="tri">
    <div class="tri-top">
      <span class="tri-contract" data-r="contract">NO CONTRACT</span>
      <span class="tri-prio" data-r="prio"></span>
      <span class="tri-clock" data-r="clock">T+00:00</span>
    </div>
    <div class="tri-main">
      <div class="tri-left">
        <div class="tri-radar-wrap">
          <canvas class="tri-radar" data-r="radar" width="${RES}" height="${RES}"></canvas>
          <div class="tri-toast" data-r="toast"></div>
        </div>
        <div class="tri-readout"><span data-r="cursor">CURSOR --- / ---</span><span data-r="marker">PIN --- / ---</span></div>
      </div>
      <div class="tri-side">
        <div class="tri-nodes" data-r="nodes">
          <button class="tri-node" data-a="node0"><i></i><b>NODE-01</b><span data-r="n0">STANDBY</span></button>
          <button class="tri-node" data-a="node1"><i></i><b>NODE-02</b><span data-r="n1">STANDBY</span></button>
          <button class="tri-node" data-a="node2"><i></i><b>NODE-03</b><span data-r="n2">STANDBY</span></button>
        </div>
        <div class="tri-dialbox">
          <div class="tri-dial" data-r="dial"><div class="tri-dial-ptr" data-r="ptr"></div><span class="dn">N</span><span class="de">E</span><span class="ds">S</span><span class="dw">W</span></div>
          <div class="tri-dial-ctrl">
            <div class="tri-brg" data-r="brg">000.0&deg;</div>
            <div class="tri-steps"><button data-a="d-5">&lt;&lt;</button><button data-a="d-1">&lt;</button><button data-a="d+1">&gt;</button><button data-a="d+5">&gt;&gt;</button></div>
          </div>
        </div>
        <canvas class="tri-scope" data-r="scope" width="220" height="52"></canvas>
        <div class="tri-sig"><span>SIGNAL</span><div class="tri-bar"><i data-r="sigbar"></i></div><span data-r="sig">00%</span></div>
        <div class="tri-btns">
          <button class="tri-b" data-a="lock">LOCK BEARING</button>
          <button class="tri-b alt" data-a="reset">RESET</button>
          <button class="tri-b alt" data-a="unpin">UNPIN</button>
          <button class="tri-b go" data-a="transmit">TRANSMIT FIX</button>
        </div>
      </div>
    </div>
    <div class="tri-comm" data-r="comm"><span class="tri-comm-tag">COMMS</span><span data-r="commtext">NO TRAFFIC.</span></div>
    <div class="tri-hud">
      <span class="hud-fuel">FUEL <span class="tri-fuel" data-r="fuel"></span> <b data-r="fuelnum">100</b></span>
      <span>CREDITS <b data-r="credits">0</b></span>
      <span>VALUE <b data-r="value">0</b></span>
      <span>BEST SHIFT <b data-r="best">0</b></span>
      <span>BREACHES <b data-r="breaches">0</b></span>
    </div>
    <div class="tri-screen" data-r="screen"></div>
  </div>`;

  function el(tag, cls, html) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html !== undefined) e.innerHTML = html;
    return e;
  }

  function refsOf(root) {
    const r = { root };
    root.querySelectorAll("[data-r]").forEach(n => { r[n.dataset.r] = n; });
    return r;
  }

  function term(text, cls) { if (typeof Term !== "undefined") Term.print(text, cls || "dim"); }

  /* ================= window ================= */

  function open() {
    if (G && G.win) {
      if (G.win.minimized) WinMgr.restore(G.win); else WinMgr.bringToFront(G.win);
      return;
    }
    const root = el("div", "tri-root");
    root.innerHTML = TEMPLATE;
    const R = refsOf(root);
    G = {
      root, R, win: null, state: "MENU", t: 0, sweep: 0, raf: 0, last: 0,
      shift: newShift(), contract: null, active: 0, flight: null,
      timer: 0, toastT: 0, lastTick: -1, cursor: null,
      best: loadBest() || { value: 0, breaches: 0, clean: 0, rating: "" }
    };

    G.win = WinMgr.create({
      title: "BOARDING VECTOR SOLUTION",
      content: root, label: "BVS-2", tag: "game-bvs2",
      w: 800, h: 580,
      onClose: teardown
    });

    wire();
    Sfx.preload(["ambience_space_loop", "radar_ping", "dial_tick", "signal_tone_loop", "static_loop",
                 "lock_engage", "marker_place", "transmit_send", "vessel_launch", "vessel_travel_loop",
                 "vessel_dock", "breach_success", "vessel_recall", "shift_start", "contract_assigned",
                 "shift_over", "node_online", "new_best_shift", "fuel_warning_loop", "ui_click", "bearing_clear",
                 "credits_earned", "depot_open", "resupply_confirm"].concat(VOICE_FILES, Object.keys(DISPATCH), Object.keys(SYS)));
    Sfx.loopStart("ambience_space_loop");
    Sfx.loopSet("ambience_space_loop", 1);
    showMenu();
    renderHUD();
    G.last = performance.now();
    G.raf = requestAnimationFrame(frame);
    term("BOARDING VECTOR SOLUTION OPENED. TYPE  start  OR USE THE BUTTONS.", "dim");
  }

  function teardown() {
    if (!G) return;
    cancelAnimationFrame(G.raf);
    Sfx.stopAll();
    document.removeEventListener("keydown", onKey, true);
    G = null;
  }

  function closeGame() { if (G && G.win) WinMgr.closeWin(G.win); }

  function paused() {
    return !G || !G.win || G.win.minimized || document.hidden;
  }

  /* ================= screens ================= */

  function screen(html, cls) {
    G.R.screen.className = "tri-screen on" + (cls ? " " + cls : "");
    G.R.screen.innerHTML = html;
  }
  function hideScreen() { G.R.screen.className = "tri-screen"; G.R.screen.innerHTML = ""; }

  function toast(html, secs) {
    G.R.toast.innerHTML = html;
    G.R.toast.classList.add("on");
    G.toastT = secs || 0;
  }
  function hideToast() { G.R.toast.classList.remove("on"); G.toastT = 0; }

  function showMenu() {
    G.state = "MENU";
    hideToast();
    Sfx.loopStop("signal_tone_loop"); Sfx.loopStop("static_loop");
    const b = G.best;
    screen(`
      <div class="scr-head">BSLSK DIVISION-9 // FIELD SUPPORT</div>
      <div class="scr-title">BOARDING VECTOR SOLUTION</div>
      <div class="scr-sub">VESSEL LOCATION SERVICE &nbsp;&middot;&nbsp; BVS 2.1 &nbsp;&middot;&nbsp; PASSIVE TRIANGULATION</div>
      <div class="scr-list">
        <div><span>LISTENING NODES</span><b>3 ONLINE</b></div>
        <div><span>BOARDING VESSEL</span><b>DOCKED / READY</b></div>
        <div><span>FUEL RESERVE</span><b>${START_FUEL} UNITS</b></div>
        <div><span>ANALYST</span><b>UNREGISTERED</b></div>
        <div><span>BEST SHIFT THIS SESSION</span><b>${b.value ? fmtN(b.value) : "NONE ON FILE"}</b></div>
      </div>
      <div class="scr-btns">
        <button class="tri-b go" data-a="start">BEGIN SHIFT</button>
        <button class="tri-b" data-a="manual">OPERATOR MANUAL</button>
        <button class="tri-b" data-a="ledger">SHIFT LEDGER</button>
        <button class="tri-b alt" data-a="quit">CLOCK OUT</button>
      </div>
      <div class="scr-foot">Fixes are final. The boarding vessel launches to the coordinates you transmit.</div>`);
  }

  function showManual() {
    G.state = "MENU";
    screen(`
      <div class="scr-head">OPERATOR MANUAL</div>
      <div class="scr-body">
        <p><b>OBJECTIVE.</b> A contract is waiting on a ship that is hiding. Find it. Three listening nodes can each be turned toward the signal. Where their bearings cross, the ship is.</p>
        <p><b>1. LISTEN.</b> Pick a node. Turn its dial. The meter and tone rise as you near the ship. Lock the bearing at the peak. Each lock draws a cone: wide on early contracts, narrower every contract, and a bare line at the end. Late contracts need a near-perfect bearing.</p>
        <p><b>2. CROSS.</b> Lock at least two nodes (three is better). Click the radar where the cones meet to pin your estimate. The pin reads back a signal strength: the ship is at the peak, and the reading is steadier the closer you are. Right-click, UNPIN or Delete to lift it and try again.</p>
        <p><b>3. TRANSMIT.</b> The boarding vessel launches from a different point on the sector edge each contract and flies to your pin. If the ship is there, it docks and breaches. Near misses cost extra fuel. A miss is recalled.</p>
        <p><b>FUEL</b> is the main limit. Clean fix: no net cost. Near: 10. Miss: 35. At zero the shift ends. <b>CREDITS</b> are earned per breach. Every 5th contract the supply depot sells fuel (${DEPOT_FUEL} units for ${DEPOT_COST} credits).</p>
        <p class="legend"><span class="lg tri-sym" style="color:#ffb347">&#9650;</span> NODE &nbsp; <span class="lg sq">&#9632;</span> SHIP (once found) &nbsp; <span class="lg ci">&#9679;</span> BOARDING VESSEL &nbsp; <span class="lg" style="color:#fff">+</span> YOUR ESTIMATE</p>
        <p class="keys"><b>KEYS</b> ArrowLeft / ArrowRight turn the dial (Shift = x5) &middot; Space locks &middot; 1 2 3 pick a node &middot; Delete unpins &middot; only while the terminal line is empty.<br><b>TYPED</b> bearing 045 &middot; node 2 &middot; lock &middot; reset &middot; mark 42 63 &middot; unpin &middot; transmit &middot; resupply &middot; decline &middot; skip &middot; quit</p>
      </div>
      <div class="scr-btns"><button class="tri-b go" data-a="start">BEGIN SHIFT</button><button class="tri-b" data-a="menu">BACK</button></div>`);
  }

  function showLedger() {
    G.state = "MENU";
    const b = G.best;
    screen(`
      <div class="scr-head">SHIFT LEDGER</div>
      <div class="scr-list">
        <div><span>BEST SHIFT</span><b>${b.value ? fmtN(b.value) : "NONE ON FILE"}</b></div>
        <div><span>BREACHES</span><b>${b.value ? b.breaches : "-"}</b></div>
        <div><span>CLEAN FIXES</span><b>${b.value ? b.clean : "-"}</b></div>
        <div><span>PERFORMANCE</span><b>${b.value ? b.rating : "-"}</b></div>
      </div>
      <div class="scr-foot">Held in the session buffer. This session is unregistered; nothing here is filed.</div>
      <div class="scr-btns"><button class="tri-b" data-a="menu">BACK</button></div>`);
  }

  function showOver() {
    G.state = "OVER";
    hideToast();
    Sfx.loopStop("signal_tone_loop"); Sfx.loopStop("static_loop");
    Sfx.loopStop("fuel_warning_loop"); Sfx.loopStop("vessel_travel_loop");
    const s = G.shift;
    Sfx.play("shift_over");
    if (s.newBest) setTimeout(() => G && Sfx.play("new_best_shift"), 1500);
    screen(`
      <div class="scr-head">SHIFT TERMINATED</div>
      <div class="scr-title bad">FUEL RESERVE DEPLETED</div>
      <div class="scr-sub">NO FURTHER LAUNCHES AUTHORISED.</div>
      ${s.newBest ? '<div class="scr-new">&#9733; NEW BEST SHIFT &#9733;</div>' : ""}
      <div class="scr-list">
        <div><span>CONTRACT VALUE</span><b>${fmtN(s.value)}</b></div>
        <div><span>CREDITS EARNED</span><b>${fmtN(s.earned)}</b></div>
        <div><span>BEST SHIFT</span><b>${fmtN(G.best.value)}</b></div>
        <div><span>BREACHES</span><b>${s.breaches}</b></div>
        <div><span>CLEAN FIXES</span><b>${s.clean}</b></div>
        <div><span>LAUNCHES RECALLED</span><b>${s.recalls}</b></div>
        <div><span>PERFORMANCE</span><b>${ratingFor(s.value)}</b></div>
      </div>
      <div class="scr-foot">Your performance has been noted. (It has not been filed. This session does not exist.)</div>
      <div class="scr-btns"><button class="tri-b go" data-a="start">NEXT SHIFT</button><button class="tri-b alt" data-a="quit">CLOCK OUT</button></div>`, "over");
  }

  function showDepot() {
    G.state = "DEPOT";
    hideToast();
    Sfx.loopStop("signal_tone_loop"); Sfx.loopStop("static_loop"); Sfx.loopStop("fuel_warning_loop");
    Sfx.play("depot_open");
    const s = G.shift, gain = Math.min(DEPOT_FUEL, START_FUEL - Math.max(0, s.fuel));
    screen(`
      <div class="scr-head">SUPPLY DEPOT</div>
      <div class="scr-title">RESUPPLY AVAILABLE</div>
      <div class="scr-sub">${s.contracts} CONTRACTS ON FILE. FUEL FOR CREDITS.</div>
      <div class="scr-list">
        <div><span>FUEL RESERVE</span><b>${Math.max(0, Math.round(s.fuel))} / ${START_FUEL}</b></div>
        <div><span>CREDITS</span><b>${fmtN(s.credits)}</b></div>
        <div><span>OFFER</span><b>+${gain} FUEL</b></div>
        <div><span>COST</span><b>${fmtN(DEPOT_COST)} CREDITS</b></div>
      </div>
      <div class="scr-btns">
        <button class="tri-b go" data-a="resupply">RESUPPLY</button>
        <button class="tri-b alt" data-a="decline">DECLINE</button>
      </div>
      <div class="scr-foot">Type  resupply  or  decline.  The depot opens every ${DEPOT_EVERY}th contract.</div>`);
    renderHUD();
  }

  function resupply() {
    if (!G || G.state !== "DEPOT") return false;
    const s = G.shift;
    if (s.credits < DEPOT_COST) return false;
    s.credits -= DEPOT_COST;
    s.fuel = Math.min(START_FUEL, Math.max(0, s.fuel) + DEPOT_FUEL);
    Sfx.play("resupply_confirm");
    renderHUD();
    nextContract();
    return true;
  }

  function decline() {
    if (!G || G.state !== "DEPOT") return false;
    if (G.shift.fuel <= 0) showOver(); else nextContract();
    return true;
  }

  /* ================= flow of a shift ================= */

  function startShift() {
    G.shift = newShift();
    G.contract = null;
    hideScreen();
    Sfx.play("shift_start");
    renderHUD();
    nextContract();
  }

  function nextContract() {
    const n = G.shift.contracts + 1;
    G.contract = makeContract(n);
    G.active = 0;
    G.state = "BRIEF";
    G.timer = BRIEF_S;
    G.flight = null;
    hideScreen();
    Sfx.loopStop("vessel_travel_loop");
    Sfx.play("contract_assigned");
    toast(`<div class="t-head">CONTRACT ASSIGNED</div><div class="t-big">${G.contract.id}</div>
           <div class="t-sub">PRIORITY: ${G.contract.priority}</div><div class="t-sub">ONE VESSEL, HIDING. LOCATE AND TRANSMIT.</div>`);
    G.contract.nodes.forEach((nd, i) => setTimeout(() => G && Sfx.play("node_online"), 200 + i * 160));
    setTimeout(() => G && say("sys_node_online", SYS.sys_node_online, "SYSTEM"), 700);
    updateSide();
    renderHUD();
  }

  function beginSearch() {
    G.state = "SEARCH";
    hideToast();
    Sfx.loopStart("signal_tone_loop");
    Sfx.loopStart("static_loop");
    say("sys_transmit_open", SYS.sys_transmit_open, "SYSTEM");
    updateSide();
  }

  /* ================= actions ================= */

  function activeNode() { return G.contract.nodes[G.active]; }

  function selectNode(i) {
    if (!G || G.state !== "SEARCH") return false;
    G.active = clamp(i, 0, 2);
    Sfx.play("ui_click");
    updateSide();
    return true;
  }

  function setDial(deg, silent) {
    if (!G || !G.contract || (G.state !== "SEARCH" && G.state !== "BRIEF")) return false;
    const nd = activeNode();
    const old = nd.dial;
    nd.dial = norm360(deg);
    if (!silent && Math.floor(old / 4) !== Math.floor(nd.dial / 4)) Sfx.play("dial_tick");
    updateSide();
    return true;
  }

  function nudge(d) { if (G && G.contract) setDial(activeNode().dial + d); }

  function lock() {
    if (!G || G.state !== "SEARCH") return false;
    const nd = activeNode();
    const s = nd.sm;
    nd.locked = nd.dial;
    const cone = coneFor(G.contract.n);
    nd.wedge = cone > 0 ? cone * (1 + (1 - s) * 0.5) : 0;          /* a bare line at the climax */
    Sfx.play("lock_engage");
    say("sys_bearing_locked", SYS.sys_bearing_locked, "SYSTEM");
    updateSide();
    return true;
  }

  function resetLocks() {
    if (!G || G.state !== "SEARCH") return false;
    G.contract.nodes.forEach(nd => { nd.locked = null; nd.wedge = 0; });
    G.contract.marker = null;
    Sfx.play("bearing_clear");
    updateSide();
    return true;
  }

  function placeMarker(x, y) {
    if (!G || G.state !== "SEARCH") return false;
    const m = { x: clamp(x, 0, SECTOR), y: clamp(y, 0, SECTOR) };
    m.sig = markerSignal(G.contract, m);
    G.contract.marker = m;
    Sfx.play("marker_place", { v: m.sig });
    updateSide();
    return true;
  }

  function unpin() {
    if (!G || G.state !== "SEARCH" || !G.contract.marker) return false;
    G.contract.marker = null;
    Sfx.play("ui_click");
    updateSide();
    return true;
  }

  function lockedCount() { return G.contract.nodes.filter(n => n.locked !== null).length; }

  function canTransmit() {
    return G && G.state === "SEARCH" && G.contract.marker && lockedCount() >= 2;
  }

  function transmit() {
    if (!G || G.state !== "SEARCH") return false;
    if (!canTransmit()) {
      term(lockedCount() < 2 ? "LOCK AT LEAST TWO NODES BEFORE TRANSMITTING." : "PLACE YOUR ESTIMATE ON THE RADAR FIRST (CLICK, OR  mark <x> <y>).", "warning");
      Sfx.play("vessel_recall");
      return true;
    }
    const c = G.contract;
    const err = dist(c.marker, c.target);
    const outcome = err <= tolClean(c.n) ? "clean" : err <= tolNear(c.n) ? "near" : "miss";
    G.state = "FLIGHT";
    Sfx.loopStop("signal_tone_loop"); Sfx.loopStop("static_loop");
    Sfx.play("transmit_send");
    say("dispatch_fix_received", DISPATCH.dispatch_fix_received, "DISPATCH");
    G.flight = { outcome, err, phase: "wait", t: 1.1, x: c.dock.x, y: c.dock.y, locks: lockedCount(), said: {} };
    updateSide();
    return true;
  }

  /* ---- flight / result sequencing (driven from the frame loop) ---- */

  function moveVessel(f, to, speed, dt) {
    const d = dist(f, to);
    const step = speed * dt;
    if (d <= step) { f.x = to.x; f.y = to.y; return true; }
    f.x += (to.x - f.x) / d * step;
    f.y += (to.y - f.y) / d * step;
    return false;
  }

  function stepFlight(dt) {
    const f = G.flight, c = G.contract;
    f.t -= dt;
    if (f.phase === "wait") {
      if (f.t <= 0) {
        f.phase = "out";
        Sfx.play("vessel_launch");
        Sfx.loopStart("vessel_travel_loop");
        say("dispatch_vessel_away", DISPATCH.dispatch_vessel_away, "DISPATCH");
      }
    } else if (f.phase === "out") {
      if (!f.said.appr && dist(f, c.marker) < 20) { f.said.appr = 1; say("dispatch_on_approach", DISPATCH.dispatch_on_approach, "DISPATCH"); }
      if (moveVessel(f, c.marker, VESSEL_SPEED, dt)) {
        if (f.outcome === "clean") { f.phase = "found"; f.t = 0.7; foundShip(); }
        else if (f.outcome === "near") { f.phase = "correct"; f.t = 0; toast(`<div class="t-head">WITHIN TOLERANCE</div><div class="t-sub">VESSEL CORRECTING COURSE.</div>`); }
        else { f.phase = "hold"; f.t = 1.0; toast(`<div class="t-head">NO CONTACT AT COORDINATES</div><div class="t-sub">SCANNING...</div>`); }
      }
    } else if (f.phase === "correct") {
      if (moveVessel(f, c.target, VESSEL_SPEED * 0.55, dt)) { f.phase = "found"; f.t = 0.7; foundShip(); }
    } else if (f.phase === "found") {
      if (f.t <= 0) { f.phase = "dock"; f.t = 1.0; Sfx.play("vessel_dock"); say("dispatch_docked", DISPATCH.dispatch_docked, "DISPATCH"); }
    } else if (f.phase === "dock") {
      if (f.t <= 0) { f.phase = "breach"; f.t = 0.9; Sfx.loopStop("vessel_travel_loop"); Sfx.play("breach_success"); say("dispatch_breach_confirmed", DISPATCH.dispatch_breach_confirmed, "DISPATCH"); }
    } else if (f.phase === "breach") {
      if (f.t <= 0) finishContract();
    } else if (f.phase === "hold") {
      if (f.t <= 0) { f.phase = "return"; Sfx.play("vessel_recall"); }
    } else if (f.phase === "return") {
      if (moveVessel(f, c.dock, VESSEL_SPEED * 1.2, dt)) { Sfx.loopStop("vessel_travel_loop"); finishContract(); }
    }
  }

  function foundShip() {
    G.contract.found = true;
    say(voiceName("reaction"), "", "INTERCEPT");
  }

  /* picks one recorded line of a group; returns its file name (no text exists for it) */
  function voiceName(group) {
    return group + "_" + pad(1 + Math.floor(Math.random() * VOICE_GROUPS[group]), 2);
  }

  function finishContract() {
    const s = G.shift, c = G.contract, f = G.flight;
    s.contracts++;
    let pts = 0, cr = 0, lines, head;
    const mult = 1 + 0.1 * Math.min(s.streak, 5);

    if (f.outcome === "clean") {
      const lockB = f.locks >= 3 ? 250 : 0;
      const acc = Math.round((1 - f.err / tolClean(c.n)) * 250);
      const tb = Math.round(Math.max(0, 500 * (1 - c.elapsed / 90)));
      pts = Math.round((1000 + lockB + acc + tb) * mult);
      cr = CREDIT_CLEAN + CREDIT_STREAK * Math.min(s.streak, 5);
      s.streak++; s.clean++; s.breaches++;
      s.fuel -= FUEL_COST.clean - RESUPPLY;
      head = `FIX ACCEPTED <span class="dim">&middot; ERROR ${f.err.toFixed(1)} KM</span>`;
      lines = ["BOARDING VESSEL LAUNCHED.", "DOCKED. BREACH SUCCESSFUL.", "CONTRACT IN PROGRESS."];
    } else if (f.outcome === "near") {
      pts = 400 + (f.locks >= 3 ? 100 : 0);
      cr = CREDIT_NEAR;
      s.streak = 0; s.breaches++;
      s.fuel -= FUEL_COST.near - RESUPPLY;
      head = `WITHIN TOLERANCE <span class="dim">&middot; ERROR ${f.err.toFixed(1)} KM</span>`;
      lines = ["BOARDING VESSEL LAUNCHED.", "COURSE CORRECTED. DOCKED. BREACH SUCCESSFUL.", "CONTRACT IN PROGRESS."];
    } else {
      s.streak = 0; s.recalls++;
      s.fuel -= FUEL_COST.miss;
      head = "NO CONTACT AT COORDINATES";
      lines = ["BOARDING VESSEL RECALLED.", "CONTRACT OPEN."];
    }
    s.value += pts;
    s.credits += cr; s.earned += cr;
    if (cr) setTimeout(() => G && Sfx.play("credits_earned"), 700);
    if (s.value > G.best.value) {
      G.best = { value: s.value, breaches: s.breaches, clean: s.clean, rating: ratingFor(s.value) };
      saveBest(G.best);
      if (!s.newBest) { s.newBest = true; }
    }
    s.fuel = Math.max(0, s.fuel);
    renderHUD();
    G.state = "RESULT";
    G.timer = RESULT_S;
    const fuelNet = f.outcome === "clean" ? 0 : f.outcome === "near" ? -(FUEL_COST.near - RESUPPLY) : -FUEL_COST.miss;
    toast(`<div class="t-head">${head}</div>${lines.map(l => `<div class="t-line">${l}</div>`).join("")}
           <div class="t-stats"><span>${pts ? "+" + fmtN(pts) + " VALUE" + (mult > 1 && f.outcome === "clean" ? " (x" + mult.toFixed(1) + ")" : "") : "NO VALUE"}</span><span>${cr ? "+" + cr + " CR" : "NO CREDITS"}</span><span>FUEL ${fuelNet >= 0 ? "+" : ""}${fuelNet}</span></div>
           <div class="t-sub">${depotDue() ? "SUPPLY DEPOT: " + (s.credits >= DEPOT_COST ? "OPEN NEXT." : "CLOSED (INSUFFICIENT CREDITS).") : ""}</div>
           <div class="t-sub">${s.fuel > 0 || depotDue() ? "NEXT CONTRACT SHORTLY. (CLICK OR TYPE skip)" : ""}</div>`);
    updateSide();
  }

  function depotDue() { return G.shift.contracts > 0 && G.shift.contracts % DEPOT_EVERY === 0; }

  function afterResult() {
    hideToast();
    const s = G.shift;
    if (depotDue() && s.credits >= DEPOT_COST) showDepot();
    else if (s.fuel <= 0) showOver();
    else nextContract();
  }

  /* ================= voices / comms ================= */

  function say(file, text, label) {
    if (!G) return;
    if (label === "INTERCEPT") {                          /* ship chatter: sound only, no words */
      G.R.commtext.innerHTML = `<b>INTERCEPT</b> &rsaquo; <span class="dim">VOICE TRAFFIC &middot; AUDIO ONLY</span>`;
      G.R.comm.classList.add("intercept");
      Sfx.voice(file, "chatter");
      return;
    }
    G.R.commtext.innerHTML = `<b>${label}</b> &rsaquo; ${text}`;
    G.R.comm.classList.remove("intercept");
    Sfx.voice(file);
  }

  function intercept() {
    const groups = ["pilot", "comms", "crew"];
    say(voiceName(groups[Math.floor(Math.random() * groups.length)]), "", "INTERCEPT");
  }

  /* ================= HUD / side panel ================= */

  function renderHUD() {
    if (!G) return;
    const R = G.R, s = G.shift;
    const segs = 20, on = Math.ceil(clamp(s.fuel, 0, 100) / 5);
    R.fuel.innerHTML = Array.from({ length: segs }, (_, i) => `<i class="${i < on ? "on" : ""}${s.fuel <= 25 && i < on ? " low" : ""}"></i>`).join("");
    R.fuelnum.textContent = Math.max(0, Math.round(s.fuel));
    R.credits.textContent = fmtN(s.credits);
    R.value.textContent = fmtN(s.value);
    R.best.textContent = fmtN(G.best.value);
    R.breaches.textContent = s.breaches;
    if (s.fuel <= 25 && s.fuel > 0 && (G.state === "SEARCH" || G.state === "BRIEF" || G.state === "RESULT")) Sfx.loopStart("fuel_warning_loop");
    else Sfx.loopStop("fuel_warning_loop");
  }

  function updateSide() {
    if (!G) return;
    const R = G.R, c = G.contract;
    R.contract.textContent = c ? "CONTRACT " + c.id : "NO CONTRACT";
    R.prio.textContent = c ? "PRIORITY: " + c.priority : "";
    const live = G.state === "SEARCH";
    R.root.classList.toggle("live", live);
    [0, 1, 2].forEach(i => {
      const b = R.nodes.children[i];
      const nd = c ? c.nodes[i] : null;
      b.classList.toggle("sel", live && G.active === i);
      b.style.setProperty("--nc", NODE_COLOURS[i]);
      b.disabled = !live;
      R["n" + i].textContent = !nd ? "STANDBY" : nd.locked !== null ? "LOCKED " + nd.locked.toFixed(1) + "\u00b0 \u00b1" + nd.wedge.toFixed(0) : (live && G.active === i ? "LISTENING" : "ONLINE");
    });
    if (c) {
      const nd = activeNode();
      R.brg.innerHTML = pad(nd.dial, 3) + "." + Math.round((nd.dial % 1) * 10) + "&deg;";
      R.ptr.style.transform = "rotate(" + nd.dial + "deg)";
      R.brg.style.color = NODE_COLOURS[G.active];
    }
    const mk = c && c.marker;
    R.marker.textContent = mk ? "PIN " + pad(mk.x, 3) + " / " + pad(mk.y, 3) + " \u00b7 SIG " + pad(mk.sig * 100, 2) + "%" : "PIN --- / ---";
    R.root.querySelector('[data-a="unpin"]').disabled = !(live && mk);
    R.root.querySelector('[data-a="transmit"]').disabled = !canTransmit();
    R.root.querySelector('[data-a="lock"]').disabled = !live;
    R.root.querySelector('[data-a="reset"]').disabled = !live;
    R.root.querySelectorAll('[data-a^="d"]').forEach(b => { b.disabled = !live; });
  }

  /* ================= radar drawing ================= */

  function inkColour() {
    try { return getComputedStyle(document.documentElement).getPropertyValue("--green").trim() || "#00ff66"; }
    catch (e) { return "#00ff66"; }
  }
  function withAlpha(hex, a) {
    const m = /^#([0-9a-f]{6})$/i.exec(hex);
    if (!m) return hex;
    const n = parseInt(m[1], 16);
    return "rgba(" + (n >> 16) + "," + ((n >> 8) & 255) + "," + (n & 255) + "," + a + ")";
  }

  const WORLD = p => ({ x: p.x * PX, y: p.y * PX });

  function drawRadar() {
    const cv = G.R.radar;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const ink = inkColour();
    const c = G.contract;
    ctx.imageSmoothingEnabled = false;
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#010603";
    ctx.fillRect(0, 0, RES, RES);

    /* grid + range rings */
    ctx.lineWidth = 1;
    ctx.strokeStyle = withAlpha(ink, 0.1);
    ctx.beginPath();
    for (let k = 10; k < SECTOR; k += 10) {
      const p = Math.round(k * PX) + 0.5;
      ctx.moveTo(p, 0); ctx.lineTo(p, RES);
      ctx.moveTo(0, p); ctx.lineTo(RES, p);
    }
    ctx.stroke();
    ctx.strokeStyle = withAlpha(ink, 0.16);
    [20, 40].forEach(r => { ctx.beginPath(); ctx.arc(RES / 2, RES / 2, r * PX, 0, Math.PI * 2); ctx.stroke(); });
    ctx.strokeStyle = withAlpha(ink, 0.5);
    ctx.strokeRect(0.5, 0.5, RES - 1, RES - 1);
    /* edge ticks */
    ctx.beginPath();
    for (let k = 0; k <= SECTOR; k += 5) {
      const p = Math.round(k * PX) + 0.5, l = k % 10 === 0 ? 5 : 2;
      ctx.moveTo(p, 0); ctx.lineTo(p, l); ctx.moveTo(p, RES); ctx.lineTo(p, RES - l);
      ctx.moveTo(0, p); ctx.lineTo(l, p); ctx.moveTo(RES, p); ctx.lineTo(RES - l, p);
    }
    ctx.stroke();
    ctx.fillStyle = withAlpha(ink, 0.7);
    ctx.font = '8px "Courier New", monospace';
    ctx.textBaseline = "top";
    ctx.fillText("N", RES / 2 - 3, 7);

    /* sweep */
    const sw = G.sweep;
    for (let i = 0; i < 22; i++) {
      const a = rad(sw - i * 1.6);
      ctx.strokeStyle = withAlpha(ink, 0.3 * (1 - i / 22));
      ctx.beginPath();
      ctx.moveTo(RES / 2, RES / 2);
      ctx.lineTo(RES / 2 + Math.sin(a) * RES, RES / 2 - Math.cos(a) * RES);
      ctx.stroke();
    }

    /* dock (random point on the sector edge, new every contract) */
    if (c) {
      const d = WORLD(c.dock);
      ctx.strokeStyle = withAlpha(ink, 0.7);
      ctx.strokeRect(Math.round(d.x) - 4.5, Math.round(d.y) - 4.5, 9, 9);
      ctx.fillStyle = withAlpha(ink, 0.7);
      ctx.fillText("D9", clamp(Math.round(d.x) + 7, 2, RES - 18), clamp(Math.round(d.y) - 4, 2, RES - 10));
    }

    if (c) {
      /* wedges (locked) */
      c.nodes.forEach(nd => {
        if (nd.locked === null) return;
        const p = WORLD(nd), len = RES * 1.6;
        const a1 = pointAt({ x: 0, y: 0 }, nd.locked - nd.wedge, len), a2 = pointAt({ x: 0, y: 0 }, nd.locked + nd.wedge, len);
        ctx.fillStyle = withAlpha(nd.colour, 0.17);
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + a1.x, p.y + a1.y); ctx.lineTo(p.x + a2.x, p.y + a2.y); ctx.closePath(); ctx.fill();
        const m = pointAt({ x: 0, y: 0 }, nd.locked, len);
        ctx.strokeStyle = withAlpha(nd.colour, 0.85);
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + m.x, p.y + m.y); ctx.stroke();
      });

      /* live pointer of the active node */
      if (G.state === "SEARCH") {
        const nd = activeNode(), p = WORLD(nd), len = RES * 1.6;
        const m = pointAt({ x: 0, y: 0 }, nd.dial, len);
        ctx.setLineDash([3, 3]);
        ctx.strokeStyle = withAlpha(nd.colour, 0.75);
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + m.x, p.y + m.y); ctx.stroke();
        ctx.setLineDash([]);
      }

      /* flight trail */
      if (G.flight && G.flight.phase !== "wait") {
        ctx.setLineDash([2, 4]);
        ctx.strokeStyle = withAlpha(ink, 0.45);
        const v = WORLD(G.flight), dd = WORLD(c.dock);
        ctx.beginPath(); ctx.moveTo(dd.x, dd.y); ctx.lineTo(v.x, v.y); ctx.stroke();
        ctx.setLineDash([]);
      }

      /* nodes: triangles in their own colour */
      c.nodes.forEach(nd => {
        const p = WORLD(nd), x = Math.round(p.x), y = Math.round(p.y);
        const act = G.state === "SEARCH" && G.active === nd.i;
        ctx.fillStyle = nd.colour;
        ctx.strokeStyle = nd.colour;
        ctx.beginPath(); ctx.moveTo(x, y - 6); ctx.lineTo(x + 5.5, y + 4); ctx.lineTo(x - 5.5, y + 4); ctx.closePath();
        if (act) ctx.fill(); else { ctx.lineWidth = 1.5; ctx.stroke(); ctx.lineWidth = 1; }
        ctx.fillText("0" + (nd.i + 1), x + 8, y - 3);
        if (act) { ctx.strokeStyle = withAlpha(nd.colour, 0.5); ctx.strokeRect(x - 9.5, y - 9.5, 19, 19); }
      });

      /* your estimate */
      if (c.marker) {
        const p = WORLD(c.marker), x = Math.round(p.x) + 0.5, y = Math.round(p.y) + 0.5;
        ctx.strokeStyle = "#ffffff";
        ctx.beginPath(); ctx.moveTo(x - 7, y); ctx.lineTo(x - 2, y); ctx.moveTo(x + 2, y); ctx.lineTo(x + 7, y);
        ctx.moveTo(x, y - 7); ctx.lineTo(x, y - 2); ctx.moveTo(x, y + 2); ctx.lineTo(x, y + 7); ctx.stroke();
        ctx.strokeRect(x - 3.5, y - 3.5, 7, 7);
      }

      /* the ship: only once the vessel has found it */
      if (c.found) {
        const p = WORLD(c.target), x = Math.round(p.x), y = Math.round(p.y);
        const pulse = 0.5 + 0.5 * Math.sin(G.t * 6);
        ctx.fillStyle = ink;
        ctx.fillRect(x - 4, y - 4, 8, 8);
        ctx.strokeStyle = withAlpha(ink, 0.35 + 0.4 * pulse);
        ctx.strokeRect(x - 7.5, y - 7.5, 15, 15);
      }

      /* boarding vessel: green circle */
      if (G.flight) {
        const p = WORLD(G.flight), x = Math.round(p.x), y = Math.round(p.y);
        ctx.fillStyle = ink;
        ctx.beginPath(); ctx.arc(x, y, 3.6, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = withAlpha(ink, 0.5);
        ctx.beginPath(); ctx.arc(x, y, 6.5, 0, Math.PI * 2); ctx.stroke();
      }
    }

    /* faint scanline texture */
    ctx.fillStyle = "rgba(0,0,0,.14)";
    for (let y = 0; y < RES; y += 3) ctx.fillRect(0, y, RES, 1);
  }

  function drawScope() {
    const cv = G.R.scope, ctx = cv.getContext("2d");
    if (!ctx) return;
    const ink = inkColour(), W = cv.width, H = cv.height;
    ctx.fillStyle = "#010603"; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = withAlpha(ink, 0.15);
    ctx.beginPath(); ctx.moveTo(0, H / 2 + 0.5); ctx.lineTo(W, H / 2 + 0.5); ctx.stroke();
    const c = G.contract;
    const nd = c && G.state === "SEARCH" ? activeNode() : null;
    const r = nd ? nd.sm : 0.05;
    ctx.strokeStyle = nd ? nd.colour : withAlpha(ink, 0.4);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let x = 0; x < W; x += 2) {
      const ph = x * 0.09 + G.t * (4 + r * 14);
      const y = H / 2 + Math.sin(ph) * r * (H / 2 - 4) * 0.9 + (Math.random() - 0.5) * (1 - r) * 12;
      if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.lineWidth = 1;
  }

  /* ================= frame loop ================= */

  function frame(now) {
    if (!G) return;
    G.raf = requestAnimationFrame(frame);
    const dt = Math.min((now - G.last) / 1000, 0.1);
    G.last = now;
    if (paused()) { Sfx.loopSet("signal_tone_loop", 0); Sfx.loopSet("static_loop", 1); return; }
    try { tick(dt); } catch (e) { console.warn("[bvs] tick error", e); }
  }

  function tick(dt) {
    G.t += dt;
    Sfx.sync();
    const prev = G.sweep;
    G.sweep = (G.sweep + SWEEP_DEG_S * dt) % 360;
    if (G.sweep < prev && G.state !== "MENU") Sfx.play("radar_ping");

    if (G.toastT > 0) { G.toastT -= dt; }

    if (G.state === "BRIEF") {
      G.timer -= dt;
      if (G.timer <= 0) beginSearch();
    }
    else if (G.state === "SEARCH") {
      const c = G.contract;
      c.elapsed += dt;
      G.R.clock.textContent = "T+" + fmtT(c.elapsed);
      c.nodes.forEach(nd => {
        if (Math.floor(G.t / 0.07) !== nd.lastN) { nd.lastN = Math.floor(G.t / 0.07); nd.noise = (Math.random() * 2 - 1) * nd.jit; }
        const raw = clamp(nodeSignal(nd, nd.dial, G.t, c.n) + nd.noise, 0, 1);
        nd.raw = raw;
        nd.sm += (raw - nd.sm) * (1 - Math.exp(-dt / 0.12));
      });
      const nd = activeNode();
      Sfx.loopSet("signal_tone_loop", nd.sm);
      Sfx.loopSet("static_loop", nd.sm);
      G.R.sig.textContent = pad(nd.sm * 100, 2) + "%";
      G.R.sigbar.style.width = Math.round(nd.sm * 100) + "%";
      G.R.sigbar.style.background = nd.colour;
      /* first strong reading: acquired; strong readings now and then let the ship's own chatter through */
      if (nd.sm > 0.72 && !c.said["a" + nd.i]) { c.said["a" + nd.i] = 1; say("sys_signal_acquired", SYS.sys_signal_acquired, "SYSTEM"); }
      if (nd.sm > 0.88 && G.t - c.lastInterceptAt > 7 && !c.said["i" + nd.i]) { c.said["i" + nd.i] = 1; c.lastInterceptAt = G.t; intercept(); }
    }
    else if (G.state === "FLIGHT") {
      stepFlight(dt);
      G.R.sig.textContent = "--%"; G.R.sigbar.style.width = "0%";
    }
    else if (G.state === "RESULT") {
      G.timer -= dt;
      if (G.timer <= 0) afterResult();
    }

    drawRadar();
    drawScope();
  }

  /* ================= input wiring ================= */

  function act(a) {
    if (!G) return;
    Sfx.resume();
    if (a === "start") { if (G.state === "MENU" || G.state === "OVER") startShift(); }
    else if (a === "manual") showManual();
    else if (a === "ledger") showLedger();
    else if (a === "menu") showMenu();
    else if (a === "quit") closeGame();
    else if (a === "lock") lock();
    else if (a === "reset") resetLocks();
    else if (a === "unpin") unpin();
    else if (a === "resupply") resupply();
    else if (a === "decline") decline();
    else if (a === "transmit") transmit();
    else if (a === "skip") skip();
    else if (a.startsWith("node")) selectNode(parseInt(a.slice(4), 10));
    else if (a[0] === "d") nudge(parseInt(a.slice(1), 10));
    if (G) updateSide();
  }

  function skip() {
    if (!G) return false;
    if (G.state === "RESULT") { afterResult(); return true; }
    if (G.state === "BRIEF") { beginSearch(); return true; }
    return false;
  }

  function wire() {
    const R = G.R;
    R.root.addEventListener("click", e => {
      const b = e.target.closest("[data-a]");
      if (b && !b.disabled) { Sfx.play("ui_click"); act(b.dataset.a); }
      else if (e.target.closest(".tri-toast.on")) skip();
    });

    /* place the estimate */
    R.radar.addEventListener("contextmenu", e => { e.preventDefault(); unpin(); });
    R.radar.addEventListener("pointerdown", e => {
      if (e.button === 2) return;
      const r = R.radar.getBoundingClientRect();
      placeMarker((e.clientX - r.left) / r.width * SECTOR, (e.clientY - r.top) / r.height * SECTOR);
    });
    R.radar.addEventListener("pointermove", e => {
      const r = R.radar.getBoundingClientRect();
      const x = clamp((e.clientX - r.left) / r.width * SECTOR, 0, SECTOR), y = clamp((e.clientY - r.top) / r.height * SECTOR, 0, SECTOR);
      R.cursor.textContent = "CURSOR " + pad(x, 3) + " / " + pad(y, 3);
    });

    /* drag the dial */
    let dragging = false;
    const angleOf = e => {
      const r = R.dial.getBoundingClientRect();
      return Math.atan2(e.clientX - (r.left + r.width / 2), -(e.clientY - (r.top + r.height / 2))) * 180 / Math.PI;
    };
    R.dial.addEventListener("pointerdown", e => { dragging = true; try { R.dial.setPointerCapture(e.pointerId); } catch (x) {} setDial(angleOf(e)); e.preventDefault(); });
    R.dial.addEventListener("pointermove", e => { if (dragging) setDial(angleOf(e)); });
    const end = () => { dragging = false; };
    R.dial.addEventListener("pointerup", end);
    R.dial.addEventListener("pointercancel", end);

    document.addEventListener("keydown", onKey, true);
  }

  /* keyboard: only when this window is in front and the terminal line is empty */
  function onKey(e) {
    if (!G || !G.win || paused() || !G.win.el.classList.contains("focused")) return;
    const inp = document.getElementById("cmdline");
    if (inp && inp.value !== "") return;
    if (G.state !== "SEARCH") { if (e.key === " " && G.state === "RESULT") { skip(); e.preventDefault(); } return; }
    if (e.key === "ArrowLeft") { nudge(e.shiftKey ? -5 : -1); e.preventDefault(); e.stopPropagation(); }
    else if (e.key === "ArrowRight") { nudge(e.shiftKey ? 5 : 1); e.preventDefault(); e.stopPropagation(); }
    else if (e.key === " ") { lock(); e.preventDefault(); e.stopPropagation(); }
    else if (e.key === "Delete" || e.key === "Backspace") { unpin(); e.preventDefault(); e.stopPropagation(); }
    else if (e.key === "1" || e.key === "2" || e.key === "3") { selectNode(parseInt(e.key, 10) - 1); e.preventDefault(); e.stopPropagation(); }
  }

  /* ================= typed commands (called by terminal.js) =================
     Returns true when the line was handled here. */

  function handleInput(raw) {
    const line = String(raw || "").trim();
    if (!line) return false;
    if (line.toLowerCase().replace(/\s+/g, "") === "definitelyofficework2") { open(); return true; }
    if (!G) return false;
    const t = line.toLowerCase().split(/\s+/);
    const cmd = t[0], arg = t.slice(1);
    const need = (ok, msg) => { if (!ok) term(msg || "NOT AVAILABLE RIGHT NOW.", "warning"); return true; };

    switch (cmd) {
      case "start": case "begin":
        if (G.state === "MENU" || G.state === "OVER") startShift();
        else term("A SHIFT IS ALREADY IN PROGRESS.", "warning");
        return true;
      case "manual":  showManual(); return true;
      case "ledger":  showLedger(); return true;
      case "skip":    return need(skip(), "NOTHING TO SKIP.");
      case "quit": case "exit": case "close": case "clockout": closeGame(); return true;
      case "bearing": case "brg": {
        const v = parseFloat(arg[0]);
        if (!isFinite(v)) { term("USAGE: bearing <0-359>", "err"); return true; }
        return need(setDial(v), "BEARING CAN ONLY BE SET DURING A CONTRACT.");
      }
      case "node": {
        const v = parseInt(arg[0], 10);
        if (!(v >= 1 && v <= 3)) { term("USAGE: node <1-3>", "err"); return true; }
        return need(selectNode(v - 1), "NODES CAN ONLY BE SELECTED DURING A CONTRACT.");
      }
      case "lock":     return need(lock(), "NOTHING TO LOCK RIGHT NOW.");
      case "reset":    return need(resetLocks(), "NOTHING TO RESET RIGHT NOW.");
      case "mark": {
        const x = parseFloat(arg[0]), y = parseFloat(arg[1]);
        if (!isFinite(x) || !isFinite(y)) { term("USAGE: mark <x> <y>   (0-100 EACH)", "err"); return true; }
        return need(placeMarker(x, y), "MARKERS CAN ONLY BE PLACED DURING A CONTRACT.");
      }
      case "unpin": case "unmark": return need(unpin(), "NO PIN TO LIFT.");
      case "resupply": case "buy": case "refuel": {
        if (G.state !== "DEPOT") return need(false, "THE SUPPLY DEPOT IS NOT OPEN.");
        return need(resupply(), "NOT ENOUGH CREDITS.");
      }
      case "decline": case "pass": return need(decline(), "THE SUPPLY DEPOT IS NOT OPEN.");
      case "transmit": case "send": return need(transmit(), "NOTHING TO TRANSMIT RIGHT NOW.");
      default: return false;
    }
  }

  /* exported for tests */
  const _test = {
    makeContract, lobe, nodeSignal, bearingTo, pointAt, angDiff, ratingFor,
    get G() { return G; }, tolClean, tolNear, coneFor, edgeDock, markerSignal, DEPOT_COST, DEPOT_FUEL, finishContract, newShift
  };

  return { open, handleInput, _test };
})();
