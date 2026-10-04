"use strict";
/* media.js - evidence viewers/players inside windows. */

const Media = (() => {
  let lastOpenedId = null;
  let errorCount = 0;
  let loadedCount = 0;

  const statusOpen = document.getElementById("status-open");

  function fmtTime(s) {
    if (!isFinite(s) || s < 0) s = 0;
    const m = Math.floor(s / 60), sec = Math.floor(s % 60);
    return String(m).padStart(2, "0") + ":" + String(sec).padStart(2, "0");
  }

  function updateStatusLine() {
    const f = WinMgr.focused;
    if (f && f.evidenceId) {
      const ev = Archive.byId(f.evidenceId);
      statusOpen.textContent = "OPEN: " + f.evidenceId + (ev ? " \u2014 " + ev.title.toUpperCase() : "");
    } else {
      statusOpen.textContent = lastOpenedId ? "LAST OPEN: " + lastOpenedId : "NO FILE OPEN";
    }
  }

  function loadingOverlay(text) {
    const d = document.createElement("div");
    d.className = "load-ov";
    d.innerHTML = "<span class='blink'>" + (text || "LOADING") + "<span class='load-dots'></span></span>";
    return d;
  }

  function failBox(ev) {
    errorCount += 1;
    const d = document.createElement("div");
    d.className = "err-box";
    d.textContent = "ERROR: FILE NOT FOUND OR CORRUPTED\r\nPATH: " + (ev.file || "(none)") +
                     "\r\n\r\nThe record exists in the index, but the file could not be read. " +
                     "Contact the archive administrator.";
    return d;
  }

  function makeFooter(ev, opts) {
    const bar = document.createElement("div");
    bar.className = "win-footer";

    const stamp = document.createElement("span");
    stamp.className = "footer-stamp";
    stamp.textContent = ev.locked ? "RESTRICTED" : "BSLSK // INTERNAL USE ONLY";
    bar.appendChild(stamp);

    const time = document.createElement("span");
    time.className = "footer-time";
    bar.appendChild(time);

    const spacer = document.createElement("span");
    spacer.style.flex = "1";
    bar.appendChild(spacer);

    if (Archive.neighbors(ev.id).prev) {
      const b = document.createElement("button");
      b.className = "wbtn"; b.textContent = "<<PREV";
      b.addEventListener("click", () => openById(Archive.neighbors(ev.id).prev.id));
      bar.appendChild(b);
    }
    if (Archive.neighbors(ev.id).next) {
      const b = document.createElement("button");
      b.className = "wbtn"; b.textContent = "NEXT>>";
      b.addEventListener("click", () => openById(Archive.neighbors(ev.id).next.id));
      bar.appendChild(b);
    }
    return { bar, time };
  }

  /* ---------- per-type viewers ---------- */

  function imageViewer(ev, wrap, overlay) {
    const box = document.createElement("div");
    box.className = "media-box";
    const img = document.createElement("img");
    img.alt = ev.title;
    img.src = ev.file;
    img.onload = () => { overlay.remove(); loadedCount++; };
    img.onerror = () => { overlay.remove(); box.appendChild(failBox(ev)); };
    box.appendChild(img);
    wrap.appendChild(box);

    if (ev.type === "gif") {
      const note = document.createElement("div");
      note.className = "dim";
      note.textContent = "ANIMATED FILE - LOOPS AUTOMATICALLY";
      wrap.appendChild(note);
    }
    return { fullscreenTarget: () => img };
  }

  function videoViewer(ev, wrap, overlay) {
    const box = document.createElement("div");
    box.className = "media-box";
    const vid = document.createElement("video");
    vid.controls = true;
    vid.preload = "metadata";
    vid.src = ev.file;
    vid.addEventListener("loadedmetadata", () => { overlay.remove(); loadedCount++; });
    vid.addEventListener("error", () => { overlay.remove(); box.appendChild(failBox(ev)); });
    box.appendChild(vid);
    wrap.appendChild(box);
    return {
      timeUpdate: cb => vid.addEventListener("timeupdate", cb),
      duration: () => vid.duration,
      loopTarget: vid,
      fullscreenTarget: () => vid
    };
  }

  function audioViewer(ev, wrap, overlay) {
    const aud = document.createElement("audio");
    aud.controls = true;
    aud.preload = "metadata";
    aud.src = ev.file;
    let loaded = false;
    aud.addEventListener("loadedmetadata", () => { if (!loaded) { loaded = true; overlay.remove(); loadedCount++; } });
    aud.addEventListener("error", () => { if (!loaded) { loaded = true; overlay.remove(); wrap.appendChild(failBox(ev)); } });
    wrap.appendChild(aud);

    const row = document.createElement("div");
    const bStop = document.createElement("button");
    bStop.className = "wbtn"; bStop.textContent = "STOP";
    bStop.addEventListener("click", () => { aud.pause(); aud.currentTime = 0; });
    const bLoop = document.createElement("button");
    bLoop.className = "wbtn"; bLoop.textContent = "LOOP: OFF";
    bLoop.addEventListener("click", () => {
      aud.loop = !aud.loop;
      bLoop.textContent = "LOOP: " + (aud.loop ? "ON" : "OFF");
      bLoop.classList.toggle("on", aud.loop);
    });
    row.appendChild(bStop); row.appendChild(bLoop);
    wrap.appendChild(row);
    return { timeUpdate: cb => aud.addEventListener("timeupdate", cb), duration: () => aud.duration };
  }

  function docViewer(ev, wrap, overlay) {
    const box = document.createElement("div");
    box.className = "media-box";
    const fr = document.createElement("iframe");
    fr.className = "doc-frame";
    fr.src = ev.file;
    fr.addEventListener("load", () => { overlay.remove(); });
    /* iframes give no reliable error event - clear the spinner after a wait */
    setTimeout(() => { if (overlay.parentNode) overlay.remove(); }, 5000);
    box.appendChild(fr);
    wrap.appendChild(box);
    const note = document.createElement("div");
    note.className = "dim";
    note.textContent = "IF THE DOCUMENT FAILS TO DISPLAY, CONTACT THE ARCHIVE ADMINISTRATOR.";
    wrap.appendChild(note);
    return {};
  }

  function linkViewer(ev, wrap, overlay) {
    overlay.remove();
    const box = document.createElement("div");
    box.className = "media-box";
    const a = document.createElement("a");
    a.className = "wbtn";
    a.textContent = "OPEN EXTERNAL RESOURCE: " + (ev.externalUrl || ev.file || "");
    a.href = ev.externalUrl || ev.file || "#";
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    box.appendChild(a);
    wrap.appendChild(box);
    return {};
  }

  /* ---------- open ---------- */

  const BUILDERS = { image: imageViewer, gif: imageViewer, video: videoViewer,
                      audio: audioViewer, document: docViewer, link: linkViewer };

  const DEFAULT_SIZE = {
    image: { w: 640, h: 460 }, gif: { w: 560, h: 420 },
    video: { w: 640, h: 420 }, audio: { w: 520, h: 220 },
    document: { w: 620, h: 520 }, link: { w: 520, h: 240 }
  };

  function open(ev) {
    if (!ev) return;
    if (ev.locked) {
      Term.print("ACCESS RESTRICTED: " + ev.id + " REQUIRES CLEARANCE. RECORD SEALED BY ADMINISTRATOR.", "err");
      Sound.blip(180, 0.12);
      return;
    }
    const existing = WinMgr.findEvidence(ev.id);
    if (existing) { WinMgr.restore(existing); lastOpenedId = ev.id; updateStatusLine(); return; }

    const wrap = document.createElement("div");
    wrap.className = "viewer";
    const overlay = loadingOverlay("LOADING " + ev.id);
    wrap.appendChild(overlay);

    const builder = BUILDERS[ev.type] || imageViewer;
    const parts = builder(ev, wrap, overlay);

    const { bar, time } = makeFooter(ev);
    wrap.appendChild(bar);

    const size = DEFAULT_SIZE[ev.type] || DEFAULT_SIZE.image;
    const win = WinMgr.create({
      title: ev.id + " \u2014 " + ev.title.toUpperCase(),
      content: wrap,
      evidenceId: ev.id,
      tag: "ev-" + ev.id,
      w: size.w, h: size.h,
      onClose: () => { lastOpenedId = ev.id; }
    });

    /* wrap the overlay so it covers the window body */
    overlay.style.position = "absolute";
    overlay.style.inset = "0";

    if (parts.timeUpdate && parts.duration) {
      parts.timeUpdate(() => {
        const el = wrap.querySelector("audio, video");
        if (el) time.textContent = "TIME " + fmtTime(el.currentTime) + " / " + fmtTime(el.duration);
      });
    }
    if (parts.fullscreenTarget) {
      const b = document.createElement("button");
      b.className = "wbtn"; b.textContent = "FULL";
      b.addEventListener("click", () => {
        const t = parts.fullscreenTarget();
        if (t.requestFullscreen) t.requestFullscreen().catch(() => {});
      });
      bar.appendChild(b);
    }

    lastOpenedId = ev.id;
    updateStatusLine();
    if (ev.forceDownload && ev.file) download(ev);
    return win;
  }

  function openById(id) {
    const ev = Archive.byId(id);
    if (ev) open(ev);
    else Term.print("EVIDENCE NOT FOUND: " + id, "err");
    return ev;
  }

  /* ---------- download ---------- */

  function download(ev) {
    if (!ev.file) {
      Term.print("NO FILE ATTACHED TO RECORD " + ev.id + ".", "err");
      return false;
    }
    if (ev.externalUrl && !ev.file) { window.open(ev.externalUrl, "_blank", "noopener"); return true; }
    Term.print("DOWNLOAD INITIATED: " + (ev.filename || ev.file) + " ...", "dim");
    /* verify first so we can give honest feedback */
    fetch(ev.file, { method: "HEAD" }).then(res => {
      if (!res.ok) throw new Error("HTTP " + res.status);
      const a = document.createElement("a");
      a.href = ev.file;
      a.download = ev.filename || ev.file.split("/").pop();
      document.body.appendChild(a);
      a.click();
      a.remove();
      Term.print("TRANSFER COMPLETE: " + (ev.filename || ev.file), "ok");
      Sound.blip(760, 0.05);
    }).catch(() => {
      errorCount += 1;
      Term.print("TRANSFER FAILED: FILE NOT FOUND ON SERVER (" + ev.file + ")", "err");
      Sound.blip(180, 0.12);
    });
    return true;
  }

  return {
    open, openById, download, updateStatusLine, fmtTime,
    get lastOpenedId() { return lastOpenedId; },
    stats() { return { errors: errorCount, loaded: loadedCount }; }
  };
})();
