"use strict";
/* sound.js - interface sounds. Same system as the main terminal:
   real .wav files, per-sound volume, native mute, looping ambience.

   Put copies of the main site's wav files in an audio/ folder next
   to index.html:

     audio/startup.wav    plays once on boot
     audio/keypress.wav   once per keystroke
     audio/error.wav      errors / unknown commands
     audio/success.wav    successful commands
     audio/ambience.wav   quiet looping background track (starts on
                          the first key press or click - browsers
                          block audio before that)

   SOUND_VOLUME: 0 (silent) to 1 (full volume) per sound.
   If a file is missing, the console says which one - nothing breaks. */

const Sound = (() => {

  const SOUND_FILES = {
    startup:  "audio/startup.wav",
    keypress: "audio/keypress.wav",
    error:    "audio/error.wav",
    success:  "audio/success.wav",
    ambience: "audio/ambience.wav"
  };

  const SOUND_VOLUME = {
    startup:  1,
    keypress: 0.6,
    error:    1,
    success:  1,
    ambience: 0.25
  };

  const sounds = {};
  let isMuted = false;
  let ambienceStarted = false;

  Object.keys(SOUND_FILES).forEach(name => {
    const el = document.getElementById(name);
    if (!el) return;
    el.src = SOUND_FILES[name];
    el.volume = SOUND_VOLUME[name] !== undefined ? SOUND_VOLUME[name] : 1;
    el.addEventListener("error", () => {
      console.warn('[audio] "' + name + '" failed to load - check that ' +
                   SOUND_FILES[name] + " exists and is a valid wav file.");
    });
    sounds[name] = el;
  });

  if (sounds.ambience) sounds.ambience.loop = true;

  function play(name) {
    if (isMuted) return;
    const s = sounds[name];
    if (!s) return;
    try {
      s.currentTime = 0;
      s.play().catch(() => {});   /* autoplay blocked before first interaction */
    } catch (e) {
      s.play().catch(() => {});
    }
  }

  /* Sets the native .muted flag on every <audio> element, so anything
     already looping (ambience) goes silent or returns immediately. */
  function setMuted(m) {
    isMuted = m;
    Object.values(sounds).forEach(s => { s.muted = isMuted; });
  }

  function startAmbience() {
    if (ambienceStarted || !sounds.ambience) return;
    ambienceStarted = true;
    sounds.ambience.play().catch(() => { ambienceStarted = false; });
  }

  /* Compatibility with older calls (Sound.blip(freq, dur)): low pitch
     means an error, anything higher is a success. */
  function blip(freq) { play(freq && freq <= 250 ? "error" : "success"); }

  return {
    play, blip, setMuted, startAmbience,
    get muted() { return isMuted; }
  };
})();
