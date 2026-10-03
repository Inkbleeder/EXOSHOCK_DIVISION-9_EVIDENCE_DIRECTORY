"use strict";
/* windows.js - DOS-style draggable window manager with taskbar. */

const WinMgr = (() => {
  const desktop = document.getElementById("desktop");
  const taskItems = document.getElementById("task-items");
  const taskEmpty = document.getElementById("task-empty");

  let seq = 0;
  let zTop = 100;
  const wins = new Map();       // winId -> win
  const posMemory = new Map();  // tag -> {x, y}  (session lifetime)
  let cascade = 0;

  function clampIntoView(el) {
    const dw = desktop.clientWidth, dh = desktop.clientHeight;
    const w = el.offsetWidth, h = el.offsetHeight;
    let x = el.offsetLeft, y = el.offsetTop;
    x = Math.max(0, Math.min(x, dw - Math.min(w, 80)));   /* keep at least 80px visible */
    y = Math.max(0, Math.min(y, dh - 26));                /* keep title bar reachable */
    if (w > dw) x = 0;
    if (h > dh) y = 0;
    el.style.left = x + "px";
    el.style.top = y + "px";
  }

  function bringToFront(win) {
    zTop += 1;
    win.el.style.zIndex = zTop;
    wins.forEach(w => w.el.classList.remove("focused"));
    win.el.classList.add("focused");
    Module.focused = win;
  }

  function topmostVisible() {
    let best = null, z = -1;
    wins.forEach(w => {
      if (!w.minimized && parseInt(w.el.style.zIndex, 10) > z) { z = parseInt(w.el.style.zIndex, 10); best = w; }
    });
    return best;
  }

  function focusTopmost() {
    const w = topmostVisible();
    Module.focused = w || null;
    if (w) { w.el.classList.add("focused"); }
    wins.forEach(x => { if (x !== w) x.el.classList.remove("focused"); });
    Media.updateStatusLine();
  }

  function refreshTaskbar() {
    taskItems.innerHTML = "";
    const min = [...wins.values()].filter(w => w.minimized);
    if (!min.length) {
      const s = document.createElement("span");
      s.id = "task-empty"; s.textContent = "NONE";
      taskItems.appendChild(s);
      return;
    }
    min.forEach(w => {
      const b = document.createElement("button");
      b.className = "task-item";
      b.textContent = (w.evidenceId || w.title).slice(0, 22);
      b.addEventListener("click", () => restore(w));
      taskItems.appendChild(b);
    });
  }

  function restore(win) {
    win.minimized = false;
    win.el.style.display = "";
    refreshTaskbar();
    bringToFront(win);
  }

  function minimize(win) {
    win.minimized = true;
    win.el.style.display = "none";
    refreshTaskbar();
    focusTopmost();
  }

  function closeWin(win) {
    if (!win || !wins.has(win.id)) return;
    if (win.onClose) { try { win.onClose(); } catch (e) {} }
    win.el.remove();
    wins.delete(win.id);
    refreshTaskbar();
    focusTopmost();
  }

  function closeFocused() {
    if (Module.focused && !Module.focused.minimized) { closeWin(Module.focused); return true; }
    return false;
  }

  function makeDraggable(win) {
    const header = win.el.querySelector(".win-header");
    let dragging = false, startX = 0, startY = 0, origX = 0, origY = 0, moved = false;

    header.addEventListener("pointerdown", (ev) => {
      if (ev.target.closest("button")) return;
      dragging = true; moved = false;
      startX = ev.clientX; startY = ev.clientY;
      origX = win.el.offsetLeft; origY = win.el.offsetTop;
      header.setPointerCapture(ev.pointerId);
      bringToFront(win);
      ev.preventDefault();
    });

    header.addEventListener("pointermove", (ev) => {
      if (!dragging) return;
      const dx = ev.clientX - startX, dy = ev.clientY - startY;
      if (Math.abs(dx) + Math.abs(dy) > 2) moved = true;
      win.el.style.left = (origX + dx) + "px";
      win.el.style.top = (origY + dy) + "px";
      clampIntoView(win.el);
    });

    const end = () => {
      if (dragging && moved && win.tag) posMemory.set(win.tag, { x: win.el.offsetLeft, y: win.el.offsetTop });
      dragging = false;
    };
    header.addEventListener("pointerup", end);
    header.addEventListener("pointercancel", end);
  }

  function create(opts) {
    const w = Math.min(opts.w || 520, Math.max(240, desktop.clientWidth - 20));
    const h = Math.min(opts.h || 380, Math.max(160, desktop.clientHeight - 20));

    const el = document.createElement("div");
    el.className = "d9-window";
    el.style.width = w + "px";
    el.style.height = h + "px";

    /* position: remembered if we had this window before this session */
    const mem = opts.tag ? posMemory.get(opts.tag) : null;
    if (mem) { el.style.left = mem.x + "px"; el.style.top = mem.y + "px"; }
    else {
      cascade = (cascade + 1) % 8;
      el.style.left = (14 + cascade * 26) + "px";
      el.style.top = (10 + cascade * 22) + "px";
    }

    const header = document.createElement("div");
    header.className = "win-header";
    const t = document.createElement("span");
    t.className = "win-title"; t.textContent = opts.title || "WINDOW";
    const btns = document.createElement("span");
    btns.className = "win-btns";
    const bMin = document.createElement("button");
    bMin.textContent = "_"; bMin.title = "Minimize";
    bMin.addEventListener("click", (e) => { e.stopPropagation(); minimize(win); });
    const bX = document.createElement("button");
    bX.textContent = "X"; bX.title = "Close";
    bX.addEventListener("click", (e) => { e.stopPropagation(); closeWin(win); });
    if (!opts.noMinimize) btns.appendChild(bMin);
    btns.appendChild(bX);
    header.appendChild(t); header.appendChild(btns);

    const body = document.createElement("div");
    body.className = "win-body";
    if (opts.content) body.appendChild(opts.content);

    el.appendChild(header);
    el.appendChild(body);
    desktop.appendChild(el);
    clampIntoView(el);

    const win = {
      id: ++seq, el, body, header,
      title: opts.title || "WINDOW",
      evidenceId: opts.evidenceId || null,
      tag: opts.tag || null,
      minimized: false,
      onClose: opts.onClose || null
    };

    /* clicking the window brings it to front; clicking non-interactive
       areas keeps the terminal input focused so typing still works. */
    el.addEventListener("pointerdown", (ev) => {
      bringToFront(win);
      const interactive = ev.target.closest("button, a, input, video, audio, iframe, [contenteditable]");
      if (!interactive) setTimeout(() => Term.refocus(), 0);
    });

    wins.set(win.id, win);
    makeDraggable(win);
    bringToFront(win);
    refreshTaskbar();
    return win;
  }

  /* keep every window reachable when the viewport shrinks */
  window.addEventListener("resize", () => wins.forEach(x => clampIntoView(x.el)));

  const Module = {
    create, closeWin, closeFocused, restore, minimize, bringToFront, focusTopmost,
    refreshTaskbar,
    get focused() { return Module._focused || null; },
    set focused(v) { Module._focused = v; },
    count() { return wins.size; },
    openCount() { return [...wins.values()].filter(w => !w.minimized).length; },
    findEvidence(id) {
      id = String(id).toUpperCase();
      return [...wins.values()].find(w => w.evidenceId === id) || null;
    },
    getPos(tag) { return posMemory.get(tag) || null; }
  };
  return Module;
})();
