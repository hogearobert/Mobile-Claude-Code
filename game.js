(() => {
  'use strict';

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  // ---------- Bloom post-processing (offscreen blur buffer) ----------
  // A quarter-resolution copy of the frame is blurred and added back additively,
  // giving every neon source a soft glow halo — the modern synthwave look.
  // Cheap (small buffer, GPU filter) and feature-detected so old browsers just
  // get the original render.
  const bloomCanvas = document.createElement('canvas');
  const bctx = bloomCanvas.getContext('2d');
  let bloomOK = false;
  (function detectBloom() {
    try {
      if (bctx && 'filter' in bctx) {
        bctx.filter = 'blur(2px)';
        bloomOK = bctx.filter === 'blur(2px)';
        bctx.filter = 'none';
      }
    } catch (_) { bloomOK = false; }
  })();
  const BLOOM_SCALE = 0.25;   // bloom buffer = 1/4 of canvas in each axis
  const BLOOM_BLUR = 4;       // blur radius in bloom-buffer pixels

  // ---------- Audio (procedural Web Audio, no asset files) ----------
  const audio = (() => {
    let ac, master;
    let muted = (function () { try { return localStorage.getItem('glitchrun.v1.mute') === '1' || localStorage.getItem('neon-dash-mute') === '1'; } catch (_) { return false; } })();
    function ensure() {
      if (ac) return ac;
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        ac = new AC();
        master = ac.createGain();
        master.gain.value = 0.35;
        master.connect(ac.destination);
      } catch (_) {}
      return ac;
    }
    function blip(freq, dur, type, vol, slide) {
      if (muted) return;
      const c = ensure();
      if (!c) return;
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = type || 'square';
      o.frequency.setValueAtTime(freq, c.currentTime);
      if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(1, slide), c.currentTime + dur);
      g.gain.setValueAtTime(0, c.currentTime);
      g.gain.linearRampToValueAtTime(vol || 0.25, c.currentTime + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
      o.connect(g).connect(master);
      o.start();
      o.stop(c.currentTime + dur + 0.02);
    }
    function noise(dur, vol, lp) {
      if (muted) return;
      const c = ensure();
      if (!c) return;
      const buf = c.createBuffer(1, Math.floor(c.sampleRate * dur), c.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
      const src = c.createBufferSource();
      src.buffer = buf;
      const g = c.createGain();
      g.gain.value = vol || 0.4;
      const f = c.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = lp || 2000;
      src.connect(f).connect(g).connect(master);
      src.start();
    }
    return {
      resume() { const c = ensure(); if (c && c.state === 'suspended') c.resume(); },
      jump() { blip(420, 0.12, 'square', 0.22, 760); },
      djump() { blip(620, 0.14, 'sawtooth', 0.2, 1100); },
      coin(step) {
        // Pitch climbs a pentatonic ladder with the combo for a rising-streak feel
        const ladder = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
        const semi = ladder[Math.min(step || 0, ladder.length - 1)];
        const f = 880 * Math.pow(2, semi / 12);
        blip(f, 0.06, 'sine', 0.25);
        setTimeout(() => blip(f * 1.5, 0.1, 'sine', 0.22), 50);
      },
      nearmiss() { blip(1320, 0.05, 'sine', 0.12, 1760); },
      thunder() {
        // Distant rumble: a crack of filtered noise rolling into a low boom
        noise(0.18, 0.22, 3500);
        setTimeout(() => noise(0.9, 0.3, 600), 90);
        setTimeout(() => blip(70, 1.1, 'sine', 0.22, 38), 120);
      },
      hit() { noise(0.35, 0.5, 1200); blip(110, 0.4, 'sawtooth', 0.35, 55); },
      meteor() {
        // Descending whistle — high to low — for incoming meteors
        blip(1400, 0.55, 'triangle', 0.18, 220);
      },
      over() {
        blip(440, 0.18, 'sawtooth', 0.28);
        setTimeout(() => blip(330, 0.18, 'sawtooth', 0.28), 130);
        setTimeout(() => blip(220, 0.5, 'sawtooth', 0.3, 110), 260);
      },
      power() {
        blip(523, 0.08, 'triangle', 0.25);
        setTimeout(() => blip(784, 0.1, 'triangle', 0.22), 60);
        setTimeout(() => blip(1046, 0.14, 'sine', 0.22), 120);
      },
      levelup() {
        blip(440, 0.1, 'square', 0.2);
        setTimeout(() => blip(660, 0.1, 'square', 0.2), 80);
        setTimeout(() => blip(880, 0.2, 'sine', 0.25), 160);
      },
      toggle() {
        muted = !muted;
        try { localStorage.setItem('glitchrun.v1.mute', muted ? '1' : '0'); } catch (_) {}
        return muted;
      },
      isMuted: () => muted,
      ac: () => ac,
      master: () => master
    };
  })();

  // ---------- Procedural music — one synthwave track per level ----------
  const music = (() => {
    const NOTE_FREQ = { C:261.63, 'C#':277.18, D:293.66, 'D#':311.13, E:329.63, F:349.23, 'F#':369.99, G:392.00, 'G#':415.30, A:440.00, 'A#':466.16, B:493.88 };
    function nf(n, oct) { return NOTE_FREQ[n] * Math.pow(2, (oct || 4) - 4); }

    // 6 tracks — one per level. 4 chords × 16 16th-note steps per loop.
    const KICK_A = [1,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,1,0]; // chill 4-on-floor
    const KICK_B = [1,0,0,0, 0,0,1,0, 1,0,0,0, 0,1,0,0]; // driving
    const KICK_C = [1,0,0,0, 0,0,0,0, 0,0,1,0, 0,0,0,0]; // sparse
    const SONGS = [
      // 0 — ORIGIN: classic synthwave Am-F-C-G
      { bpm:108, chords:[['A','C','E'],['F','A','C'],['C','E','G'],['G','B','D']], bass:['A','F','C','G'], bassOct:2, leadOct:5, kick:KICK_A, leadDensity:0.5 },
      // 1 — INFERNO: aggressive Dm-Bb-F-C
      { bpm:132, chords:[['D','F','A'],['A#','D','F'],['F','A','C'],['C','E','G']], bass:['D','A#','F','C'], bassOct:2, leadOct:5, kick:KICK_B, leadDensity:0.65 },
      // 2 — VERDANT: mellow Em-C-G-D
      { bpm:100, chords:[['E','G','B'],['C','E','G'],['G','B','D'],['D','F#','A']], bass:['E','C','G','D'], bassOct:2, leadOct:5, kick:KICK_C, leadDensity:0.4 },
      // 3 — GLACIAL: cold Gm-D#-A#-F
      { bpm:96,  chords:[['G','A#','D'],['D#','G','A#'],['A#','D','F'],['F','A','C']], bass:['G','D#','A#','F'], bassOct:2, leadOct:5, kick:KICK_C, leadDensity:0.35 },
      // 4 — CRIMSON: dark Fm-C#-G#-D#
      { bpm:128, chords:[['F','G#','C'],['C#','F','G#'],['G#','C','D#'],['D#','G','A#']], bass:['F','C#','G#','D#'], bassOct:2, leadOct:5, kick:KICK_B, leadDensity:0.6 },
      // 5 — SOLAR: epic uplifting Cm-G#-D#-A#
      { bpm:118, chords:[['C','D#','G'],['G#','C','D#'],['D#','G','A#'],['A#','D','F']], bass:['C','G#','D#','A#'], bassOct:2, leadOct:5, kick:KICK_A, leadDensity:0.55 },
      // 6 — NEBULA: dreamy spacey Am-Em-F-C
      { bpm:92,  chords:[['A','C','E'],['E','G','B'],['F','A','C'],['C','E','G']], bass:['A','E','F','C'], bassOct:2, leadOct:6, kick:KICK_C, leadDensity:0.3 },
      // 7 — ACID: bouncy glitchy Em-G-D-C
      { bpm:122, chords:[['E','G','B'],['G','B','D'],['D','F#','A'],['C','E','G']], bass:['E','G','D','C'], bassOct:2, leadOct:5, kick:KICK_A, leadDensity:0.62 },
      // 8 — MIDNIGHT: calm mysterious Dm-A-A#-F
      { bpm:88,  chords:[['D','F','A'],['A','C#','E'],['A#','D','F'],['F','A','C']], bass:['D','A','A#','F'], bassOct:2, leadOct:6, kick:KICK_C, leadDensity:0.28 },
      // 9 — MAGMA: heavy aggressive Fm-C#-Fm-G#
      { bpm:140, chords:[['F','G#','C'],['C#','F','G#'],['F','G#','C'],['G#','C','D#']], bass:['F','C#','F','G#'], bassOct:2, leadOct:5, kick:KICK_B, leadDensity:0.72 },
      // 10 — AURORA: flowing uplifting A-E-F#m-D
      { bpm:112, chords:[['A','C#','E'],['E','G#','B'],['F#','A','C#'],['D','F#','A']], bass:['A','E','F#','D'], bassOct:2, leadOct:5, kick:KICK_A, leadDensity:0.5 },
      // 11 — ULTRA: epic climactic Cm-G#-D#-G
      { bpm:126, chords:[['C','D#','G'],['G#','C','D#'],['D#','G','A#'],['G','A#','D']], bass:['C','G#','D#','G'], bassOct:2, leadOct:5, kick:KICK_B, leadDensity:0.68 }
    ];

    let muted = (function(){ try { return localStorage.getItem('glitchrun.v1.muteMusic') === '1'; } catch (_) { return false; } })();
    let ac = null, master = null, bassGain, padGain, leadGain, drumGain;
    let active = false;
    let intense = false;  // OVERDRIVE-driven: extra hats + denser lead
    let song = null, bpm = 108, stepDur = 0;
    let stepIndex = 0;
    let nextTime = 0;
    let scheduler = null;
    let currentIdx = -1;

    function ensure() {
      if (ac) return;
      const a = audio.ac && audio.ac();
      if (a) {
        ac = a;
        master = ac.createGain();
        master.gain.value = 0;
        master.connect(audio.master ? audio.master() : ac.destination);
      } else {
        try {
          const AC = window.AudioContext || window.webkitAudioContext;
          ac = new AC();
          master = ac.createGain();
          master.gain.value = 0;
          master.connect(ac.destination);
        } catch (_) { return; }
      }
      bassGain = ac.createGain(); bassGain.gain.value = 0.55;
      padGain = ac.createGain(); padGain.gain.value = 0.22;
      leadGain = ac.createGain(); leadGain.gain.value = 0.32;
      drumGain = ac.createGain(); drumGain.gain.value = 0.45;
      bassGain.connect(master);
      padGain.connect(master);
      leadGain.connect(master);
      drumGain.connect(master);
    }

    function blip(dest, freq, when, dur, type, attack, vol, slide) {
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, when);
      if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(1, slide), when + dur);
      g.gain.setValueAtTime(0, when);
      g.gain.linearRampToValueAtTime(vol, when + (attack || 0.01));
      g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
      o.connect(g).connect(dest);
      o.start(when);
      o.stop(when + dur + 0.03);
    }

    function playKick(when) {
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(150, when);
      o.frequency.exponentialRampToValueAtTime(40, when + 0.16);
      g.gain.setValueAtTime(0.7, when);
      g.gain.exponentialRampToValueAtTime(0.001, when + 0.2);
      o.connect(g).connect(drumGain);
      o.start(when);
      o.stop(when + 0.22);
    }

    function playHat(when, vol) {
      const buf = ac.createBuffer(1, Math.floor(ac.sampleRate * 0.04), ac.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
      const src = ac.createBufferSource();
      src.buffer = buf;
      const g = ac.createGain();
      g.gain.value = vol || 0.08;
      const flt = ac.createBiquadFilter();
      flt.type = 'highpass';
      flt.frequency.value = 6000;
      src.connect(flt).connect(g).connect(drumGain);
      src.start(when);
    }

    function playBass(freq, when, dur) {
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.type = 'square';
      o.frequency.value = freq;
      g.gain.setValueAtTime(0, when);
      g.gain.linearRampToValueAtTime(0.35, when + 0.01);
      g.gain.linearRampToValueAtTime(0.25, when + dur * 0.5);
      g.gain.linearRampToValueAtTime(0, when + dur);
      const flt = ac.createBiquadFilter();
      flt.type = 'lowpass';
      flt.frequency.value = 700;
      o.connect(flt).connect(g).connect(bassGain);
      o.start(when);
      o.stop(when + dur + 0.05);
    }

    function playPad(freq, when, dur) {
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.type = 'sawtooth';
      o.frequency.value = freq;
      g.gain.setValueAtTime(0, when);
      g.gain.linearRampToValueAtTime(0.13, when + 0.12);
      g.gain.linearRampToValueAtTime(0.09, when + dur - 0.15);
      g.gain.linearRampToValueAtTime(0, when + dur);
      const flt = ac.createBiquadFilter();
      flt.type = 'lowpass';
      flt.frequency.value = 1400;
      flt.Q.value = 2;
      o.connect(flt).connect(g).connect(padGain);
      o.start(when);
      o.stop(when + dur + 0.05);
    }

    function schedule(when) {
      const beatsPerBar = 16;
      const barIdx = Math.floor(stepIndex / beatsPerBar) % song.chords.length;
      const stepInBar = stepIndex % beatsPerBar;

      // Bass: hits on 0, 4, 8, 12 (every quarter)
      if (stepInBar % 4 === 0) {
        playBass(nf(song.bass[barIdx], song.bassOct), when, stepDur * 3.5);
      }
      // Pad: full bar chord on step 0
      if (stepInBar === 0) {
        const chord = song.chords[barIdx];
        for (let i = 0; i < chord.length; i++) {
          playPad(nf(chord[i], 4), when, stepDur * beatsPerBar * 0.95);
        }
      }
      // Lead arpeggio: every 8th note with random pickup (denser during OVERDRIVE)
      const leadProb = intense ? Math.min(0.95, song.leadDensity * 1.6) : song.leadDensity;
      if (stepInBar % 2 === 0 && Math.random() < leadProb) {
        const chord = song.chords[barIdx];
        const note = chord[Math.floor(Math.random() * chord.length)];
        const oct = Math.random() < 0.25 ? song.leadOct + 1 : song.leadOct;
        blip(leadGain, nf(note, oct), when, stepDur * 1.2, 'triangle', 0.005, 0.28);
      }
      // Drums — hats every step during OVERDRIVE; otherwise off-beats only.
      if (song.kick[stepInBar]) playKick(when);
      const hatStep = intense ? 0 : 1;     // 0 = every step lights a hat
      if (stepInBar % 2 === hatStep) playHat(when, 0.06);
      if (stepInBar === 4 || stepInBar === 12) playHat(when, 0.15); // snare-ish
      // Extra kick on the off-beat during fever for double-time drive
      if (intense && (stepInBar === 6 || stepInBar === 14)) playKick(when);
    }

    function loop() {
      if (!active || !ac) return;
      const now = ac.currentTime;
      while (nextTime < now + 0.12) {
        schedule(nextTime);
        nextTime += stepDur;
        stepIndex++;
      }
      scheduler = setTimeout(loop, 25);
    }

    function targetVol() { return muted ? 0 : 0.36; }

    function fadeMasterTo(v, secs) {
      if (!ac || !master) return;
      master.gain.cancelScheduledValues(ac.currentTime);
      master.gain.setValueAtTime(master.gain.value, ac.currentTime);
      master.gain.linearRampToValueAtTime(v, ac.currentTime + (secs || 0.4));
    }

    return {
      start(levelIdx) {
        ensure();
        if (!ac) return;
        // Defensive: if AudioContext was auto-suspended during an ad / pause,
        // resume it before scheduling notes (otherwise fades and oscillators stall).
        if (ac.state === 'suspended') { try { ac.resume(); } catch (_) {} }
        currentIdx = levelIdx % SONGS.length;
        song = SONGS[currentIdx];
        bpm = song.bpm;
        stepDur = 60 / bpm / 4;
        stepIndex = 0;
        nextTime = ac.currentTime + 0.1;
        active = true;
        fadeMasterTo(targetVol(), 0.6);
        if (scheduler) clearTimeout(scheduler);
        loop();
      },
      stop() {
        active = false;
        if (scheduler) { clearTimeout(scheduler); scheduler = null; }
        fadeMasterTo(0, 0.3);
      },
      pause() {
        active = false;
        if (scheduler) { clearTimeout(scheduler); scheduler = null; }
        fadeMasterTo(0, 0.15);
      },
      resumePlay() {
        if (!song || !ac) return;
        if (ac.state === 'suspended') { try { ac.resume(); } catch (_) {} }
        nextTime = ac.currentTime + 0.05;
        active = true;
        fadeMasterTo(targetVol(), 0.25);
        if (scheduler) clearTimeout(scheduler);
        loop();
      },
      setLevel(idx) {
        if (currentIdx === (idx % SONGS.length)) return;
        if (active) {
          // Quick crossfade: fade out, then start new
          fadeMasterTo(0, 0.25);
          setTimeout(() => { if (active || song) this.start(idx); }, 260);
        } else {
          currentIdx = idx % SONGS.length;
        }
      },
      setMuted(m) {
        muted = m;
        try { localStorage.setItem('glitchrun.v1.muteMusic', muted ? '1' : '0'); } catch (_) {}
        if (active) fadeMasterTo(targetVol(), 0.2);
      },
      toggle() { this.setMuted(!muted); return muted; },
      setIntense(on) { intense = !!on; },
      isMuted() { return muted; },
      isPlaying() { return active; },
      // Duck the music briefly so big SFX/events punch through, then swell back.
      duck() {
        if (!active || muted || !ac || !master) return;
        const now = ac.currentTime;
        master.gain.cancelScheduledValues(now);
        master.gain.setValueAtTime(master.gain.value, now);
        master.gain.linearRampToValueAtTime(targetVol() * 0.35, now + 0.05);
        master.gain.linearRampToValueAtTime(targetVol(), now + 0.55);
      }
    };
  })();
  const overlay = document.getElementById('overlay');
  const gameoverEl = document.getElementById('gameover');
  const startBtn = document.getElementById('startBtn');
  const retryBtn = document.getElementById('retryBtn');
  const scoreEl = document.getElementById('score');
  const bestEl = document.getElementById('best');
  const coinsEl = document.getElementById('coins');
  const finalScoreEl = document.getElementById('finalScore');
  const finalBestEl = document.getElementById('finalBest');
  const finalCoinsEl = document.getElementById('finalCoins');

  // Logical resolution — game world coordinates. Canvas scales to viewport.
  const W = 540;
  let H = 960;
  let DPR = 1;

  // Ground line (in world units from top)
  let GROUND;

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const aspect = vw / vh;
    H = Math.round(W / aspect);
    GROUND = H - 110;
    canvas.width = Math.round(vw * DPR);
    canvas.height = Math.round(vh * DPR);
    canvas.style.width = vw + 'px';
    canvas.style.height = vh + 'px';
    bloomCanvas.width = Math.max(2, Math.round(canvas.width * BLOOM_SCALE));
    bloomCanvas.height = Math.max(2, Math.round(canvas.height * BLOOM_SCALE));
    const scale = (vw / W) * DPR;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    try {
      if (state !== STATE.PLAY && player) {
        player.y = GROUND - player.h;
      }
    } catch (_) { /* called before state/player are defined */ }
  }
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 150));
  resize();

  // ---------- Game state ----------
  const STATE = { MENU: 0, PLAY: 1, OVER: 2, PAUSED: 3 };
  let state = STATE.MENU;

  // Storage: namespaced keys with one-time migration from legacy
  const NS = 'glitchrun.v1.';
  const SK = {
    best: NS + 'best',
    coins: NS + 'coins',
    mute: NS + 'mute',
    dailyBest: NS + 'dailyBest',
    dailyDate: NS + 'dailyDate',
    achievements: NS + 'achievements',
    runs: NS + 'runs',
    tutorial: NS + 'tutorialDone',
    deathScores: NS + 'deathScores',
    loginDate: NS + 'loginDate',
    loginStreak: NS + 'loginStreak',
    xp: NS + 'xp',
    skinUnlocked: NS + 'skinUnlocked',
    lifeSlams: NS + 'lifeSlams',
    lifePhases: NS + 'lifePhases',
    bestCombo: NS + 'bestCombo'
  };
  function readLS(k, dflt) { try { return localStorage.getItem(k) ?? dflt; } catch (_) { return dflt; } }
  function writeLS(k, v) { try { localStorage.setItem(k, v); } catch (_) {} }
  // One-shot cleanup of the now-removed Ghost Runner persistence
  try { localStorage.removeItem('glitchrun.v1.ghostRun'); } catch (_) {}
  (function migrate() {
    const legacy = { 'neon-dash-best': SK.best, 'neon-dash-coins': SK.coins, 'neon-dash-mute': SK.mute };
    for (const old in legacy) {
      try {
        const v = localStorage.getItem(old);
        if (v != null && localStorage.getItem(legacy[old]) == null) {
          localStorage.setItem(legacy[old], v);
          localStorage.removeItem(old);
        }
      } catch (_) {}
    }
  })();

  let best = parseInt(readLS(SK.best, '0'), 10);
  let totalCoins = parseInt(readLS(SK.coins, '0'), 10);
  let totalRuns = parseInt(readLS(SK.runs, '0'), 10);
  let lifeSlams = parseInt(readLS(SK.lifeSlams, '0'), 10);
  let lifePhases = parseInt(readLS(SK.lifePhases, '0'), 10);
  let bestCombo = parseInt(readLS(SK.bestCombo, '0'), 10);
  let totalXP = parseInt(readLS(SK.xp, '0'), 10) || 0;
  bestEl.textContent = best;
  coinsEl.textContent = totalCoins;

  // ---------- Pilot rank (lifetime XP → levels → milestone star rewards) ----------
  // XP accrues from every run's score. The curve is quadratic so early ranks
  // come fast (dopamine) and later ranks are a long-tail chase.
  const PILOT_TITLES = ['Novice', 'Cadet', 'Pilot', 'Veteran', 'Ace', 'Elite', 'Maestru', 'Legendă', 'Mit', 'Zeu'];
  function xpForRank(r) { return Math.round(400 * r + 120 * r * r); } // cumulative XP needed to REACH rank r
  function rankFromXP(xp) {
    let r = 0;
    while (xpForRank(r + 1) <= xp) r++;
    return r;
  }
  function rankTitle(r) { return PILOT_TITLES[Math.min(r, PILOT_TITLES.length - 1)] + (r >= PILOT_TITLES.length ? ' +' + (r - PILOT_TITLES.length + 1) : ''); }
  let pilotRank = rankFromXP(totalXP);
  // Award XP at run end; surface any rank-ups with a reward + toast.
  function awardXP(amount) {
    if (amount <= 0) return;
    const before = pilotRank;
    totalXP += amount;
    writeLS(SK.xp, totalXP);
    const now = rankFromXP(totalXP);
    if (now > before) {
      pilotRank = now;
      // Reward scales with the rank reached
      for (let r = before + 1; r <= now; r++) {
        const reward = 50 + r * 25;
        totalCoins += reward;
        writeLS(SK.coins, totalCoins);
      }
      coinsEl.textContent = totalCoins;
      const topReward = 50 + now * 25;
      showToast('⭐ RANG NOU · ' + rankTitle(now), 'Pilot nivel ' + now + '  ·  +' + topReward + ' ★');
      audio.levelup && audio.levelup();
      // In-canvas burst so the rank-up reads even when the player is looking
      // at the centred game-over panel instead of the corner toast.
      for (let i = 0; i < 80; i++) {
        const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.6;
        const v = Math.random() * 12 + 5;
        pushParticle(W / 2 + (Math.random() - 0.5) * 60, GROUND - 120,
          Math.cos(a) * v, Math.sin(a) * v, 90,
          ['#ffe14a', '#19f0ff', '#ff3df0', '#fff'][i & 3], Math.random() * 4 + 2);
      }
      addRing(W / 2, GROUND - 120, 300, '255,225,74', 50);
      addRing(W / 2, GROUND - 120, 220, '255,61,240', 40);
      flashFrame = frame;
      if (navigator.vibrate) { try { navigator.vibrate([30, 60, 30, 60, 150]); } catch (_) {} }
    }
  }

  const player = {
    x: 110,
    y: 0,
    vy: 0,
    w: 48,
    h: 64,
    onGround: true,
    jumps: 0,
    maxJumps: 2,
    rot: 0,
    trail: [],
    sliding: false,
    slideT: 0
  };

  let obstacles = [];
  let coinsArr = [];
  let meteors = []; // METEOR setpiece — falling projectiles with telegraphed shadows
  let particles = [];
  let stars = [];
  let mountains = [];
  let buildings = [];
  let nebula = [];          // far soft colour clouds (atmospheric depth)
  let shootingStars = [];   // occasional sky streaks
  let rings = [];           // expanding shockwave rings on pickups
  let fgShafts = [];        // foreground light shafts (fast parallax, occluding)
  let fgMotes = [];         // foreground dust motes drifting close to camera
  function addRing(x, y, maxR, rgb, life) {
    rings.push({ x, y, r: 7, maxR: maxR, life: life || 24, maxLife: life || 24, rgb: rgb });
  }

  // Particle pool — avoid GC pressure from hot loops
  const MAX_PARTICLES = 220;
  function pushParticle(x, y, vx, vy, life, color, r) {
    if (particles.length >= MAX_PARTICLES) {
      // Recycle the oldest (FIFO eviction is acceptable visually)
      const p = particles.shift();
      p.x = x; p.y = y; p.vx = vx; p.vy = vy;
      p.life = life; p.color = color; p.r = r;
      particles.push(p);
      return;
    }
    particles.push({ x, y, vx, vy, life, color, r });
  }

  let scrollX = 0;
  let speed = 6;
  const baseSpeed = 4.6;
  const BASE_GRAVITY = 0.95;
  let gravity = BASE_GRAVITY;
  const jumpV = -17;

  let score = 0;
  let dist = 0;            // pacing driver (distance run) — decoupled from coins
  let runCoins = 0;
  let frame = 0;
  let nextObstacleAt = 60;
  let nextCoinAt = 90;
  let nextPowerupAt = 600;
  let shake = 0;
  let lastJumpFrame = -100;
  let inputGraceUntil = 0;
  // Roll angle for the grounded ball — accumulates in radians at a rate that
  // matches the world scroll, so the orb visually rolls "without slipping".
  // Pure visual; collision uses the unrotated circle.
  let groundRoll = 0;
  let airframes = 0;
  // Per-run telemetry shown on the game-over breakdown
  let runMaxCombo = 0;
  let runNearMisses = 0;
  let runAirBonus = 0;
  let runXpBanked = 0; // XP already credited this run (prevents double-count on revive)
  let recordBrokenThisRun = false;
  let nextScoreMilestone = 2500; // next big-score celebration threshold

  // ---------- Levels (palette + difficulty) ----------
  const LEVELS = [
    { name: 'ORIGIN',   sky: ['#0a0e2a', '#1a0a2e', '#2a0a3a'], sun: '#ff3df0', sunRGB: '255,80,200',  mountainHue: 280, accent: '25,240,255',  ground: '#06081a', weather: 'none' },
    { name: 'INFERNO',  sky: ['#1a0612', '#3d0a1f', '#5a0f2a'], sun: '#ff7a3d', sunRGB: '255,150,80',  mountainHue: 20,  accent: '255,180,80',  ground: '#1a0612', weather: 'embers' },
    { name: 'VERDANT',  sky: ['#06140a', '#0a3d1f', '#0a5a2a'], sun: '#3dff7a', sunRGB: '100,255,160', mountainHue: 130, accent: '120,255,180', ground: '#06140a', weather: 'leaves' },
    { name: 'GLACIAL',  sky: ['#06141f', '#0a2a3d', '#0a3d52'], sun: '#3df0ff', sunRGB: '100,230,255', mountainHue: 200, accent: '120,200,255', ground: '#06141f', weather: 'snow' },
    { name: 'CRIMSON',  sky: ['#1a0608', '#3d0a14', '#5a0a14'], sun: '#ff0a3d', sunRGB: '255,60,90',   mountainHue: 350, accent: '255,80,80',   ground: '#1a0608', weather: 'rain' },
    { name: 'SOLAR',    sky: ['#1a1408', '#3d2e0f', '#5a4a0a'], sun: '#ffe14a', sunRGB: '255,225,100', mountainHue: 45,  accent: '255,225,100', ground: '#1a1408', weather: 'dust' },
    { name: 'NEBULA',   sky: ['#0a0420', '#1c0a40', '#2e0a55'], sun: '#b478ff', sunRGB: '180,120,255', mountainHue: 270, accent: '180,130,255', ground: '#0a0420', weather: 'dust' },
    { name: 'ACID',     sky: ['#0a1505', '#163d0a', '#1f5a0a'], sun: '#c8ff3d', sunRGB: '200,255,80',  mountainHue: 80,  accent: '200,255,90',  ground: '#0a1505', weather: 'rain' },
    { name: 'MIDNIGHT', sky: ['#020512', '#060f2e', '#0a1640'], sun: '#7da8ff', sunRGB: '125,168,255', mountainHue: 230, accent: '140,170,255', ground: '#020512', weather: 'snow' },
    { name: 'MAGMA',    sky: ['#160404', '#3d0a06', '#5a1404'], sun: '#ff5a14', sunRGB: '255,100,30',  mountainHue: 12,  accent: '255,120,40',  ground: '#160404', weather: 'embers' },
    { name: 'AURORA',   sky: ['#04140f', '#0a3d3a', '#0a3d52'], sun: '#3dffd0', sunRGB: '100,255,210', mountainHue: 165, accent: '120,255,220', ground: '#04140f', weather: 'snow' },
    { name: 'ULTRA',    sky: ['#1a0a1a', '#3d0a3d', '#52145a'], sun: '#ff3df0', sunRGB: '255,80,240',  mountainHue: 300, accent: '255,120,255', ground: '#1a0a1a', weather: 'leaves' },
    // PRISM — endgame rainbow biome, palette is a placeholder; the actual sky
    // hue cycles every frame inside drawBackground for a living spectrum effect.
    { name: 'PRISM',    sky: ['#0a0418', '#1a063a', '#3a0a52'], sun: '#ffffff', sunRGB: '255,255,255', mountainHue: 0,   accent: '255,255,255', ground: '#0a0418', weather: 'none', prism: true }
  ];
  const LEVEL_SCORE = 500;
  let levelIdx = 0;
  let palette = LEVELS[0];

  // ---------- Combo ----------
  let combo = 0;
  let lastCoinFrame = -1000;
  let lastCoinX = 0, lastCoinY = 0; // for chain-link visual between consecutive pickups
  let coinChains = []; // fading electric arcs between consecutive coin grabs
  // Window scales with combo: tight when cold (0.8s), generous when hot (2.5s).
  function comboWindow() { return Math.round((48 + Math.min(combo, 15) * 7) * (1 + upgLvl('combo') * 0.15) * (1 + perkVal('combo'))); }
  function comboMult() { return combo >= 15 ? 4 : combo >= 10 ? 3 : combo >= 5 ? 2 : 1; }

  // ---------- Power-ups ----------
  let powerups = [];
  let springs = [];
  let magnetFrames = 0;
  let shieldActive = false;
  let sprintFrames = 0;
  let phaseFrames = 0;       // PHASE power-up — ghost through obstacles, shatter them
  let phaseStreak = 0;       // obstacles vaporised in the current phase window
  let timewarpFrames = 0;    // TIME WARP — slows obstacles, NOT the player (skill expression window)
  let lifeTimewarps = parseInt(readLS('glitchrun.v1.lifeTimewarps', '0'), 10) || 0;
  function sprintMult() { return sprintFrames > 0 ? 1.5 : 1; }
  // Obstacle/coin/meteor scroll multiplier — TIME WARP halves world velocity
  // while leaving the player's vertical physics untouched. Pure skill-window.
  function worldSlow() { return timewarpFrames > 0 ? 0.42 : 1; }
  let shieldFlashFrame = -1000;
  let invincibleUntil = -1;
  let reviveUsed = false;

  // ---------- OVERDRIVE / Fever (build-a-meter → multiplier frenzy) ----------
  // Coins, near-misses and combo milestones charge the meter. Full = OVERDRIVE:
  // auto-magnet, tripled score, doubled coins and the screen goes wild. The
  // craving to re-trigger it is the core "one more run" hook.
  let feverMeter = 0;       // 0..1 charge
  let feverActive = false;
  let feverFrames = 0;      // frames remaining while active
  const FEVER_DUR = 60 * 8; // 8 seconds of overdrive
  const FEVER_MULT = 3;
  function feverScoreMult() { return feverActive ? FEVER_MULT : 1; }
  function addFever(amt) {
    if (feverActive || feverMeter >= 1) return;
    feverMeter = Math.min(1, feverMeter + amt);
    if (feverMeter >= 1) startFever();
  }
  function startFever() {
    feverActive = true;
    feverFrames = FEVER_DUR;
    feverMeter = 1;
    magnetFrames = Math.max(magnetFrames, FEVER_DUR + 30);
    music.setIntense && music.setIntense(true);
    popText('⚡ OVERDRIVE ⚡', player.x + player.w / 2, GROUND - 220, '#ff3df0', 1.9);
    flashFrame = frame;
    glitchFrame = frame;
    zoomPunch = Math.max(zoomPunch, 0.11);
    shake = Math.max(shake, 13);
    slowmoFrames = Math.max(slowmoFrames, 16); // brief dramatic entry
    addRing(player.x + player.w / 2, player.y + player.h / 2, 250, '255,61,240', 46);
    music.duck();
    audio.power();
    audio.levelup();
    if (navigator.vibrate) { try { navigator.vibrate([20, 40, 20, 40, 70]); } catch (_) {} }
    missionEvent('overdrive');
    if (!hasAch('overdrive')) unlock('overdrive');
    for (let i = 0; i < 40; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = Math.random() * 8 + 3;
      pushParticle(player.x + player.w / 2, player.y + player.h / 2,
        Math.cos(a) * v, Math.sin(a) * v, 50,
        ['#ff3df0', '#19f0ff', '#ffe14a', '#fff'][i % 4], Math.random() * 3 + 2);
    }
  }
  function endFever() {
    if (!feverActive) return;
    feverActive = false;
    feverMeter = 0;
    feverFrames = 0;
    music.setIntense && music.setIntense(false);
    popText('COMBO PĂSTRAT!', player.x + player.w / 2, GROUND - 200, '#19f0ff', 1.2);
    zoomPunch = Math.max(zoomPunch, 0.04);
  }
  function updateFeverUI() {
    if (!feverFillEl) return;
    const f = feverActive ? feverFrames / FEVER_DUR : feverMeter;
    feverFillEl.style.transform = 'scaleX(' + Math.max(0, Math.min(1, f)) + ')';
    if (feverBarEl) {
      feverBarEl.classList.toggle('charged', feverMeter >= 1 && !feverActive);
      feverBarEl.classList.toggle('active', feverActive);
      feverBarEl.classList.toggle('hidden', feverMeter <= 0 && !feverActive);
    }
  }

  // ---------- Floating texts ----------
  let texts = [];
  function popText(msg, x, y, color, scale) {
    texts.push({ msg, x, y, color: color || '#ffe14a', scale: scale || 1, life: 50 });
  }

  // ---------- Game-feel: slow-mo, screen flash, chromatic glitch ----------
  let slowmoFrames = 0;     // frames of remaining slow-mo
  let flashFrame = -1000;   // last frame a white flash was triggered
  let glitchFrame = -1000;  // last frame a chromatic glitch was triggered
  let levelWarpFrame = -1000; // last frame a biome-transition warp was triggered
  let zoomPunch = 0;        // camera zoom-punch amount, decays to 0
  let landBounce = 0;       // landing squash impulse, decays to 0

  // ---------- Mode & difficulty (2026 standards: dynamic difficulty + daily) ----------
  let dailyMode = false;
  let dailyDate = '';
  let dailyBest = parseInt(readLS(SK.dailyBest, '0'), 10);
  let storedDailyDate = readLS(SK.dailyDate, '');
  function todayStr() {
    const d = new Date();
    return d.getUTCFullYear() + '-' + (d.getUTCMonth() + 1) + '-' + d.getUTCDate();
  }
  if (storedDailyDate !== todayStr()) {
    dailyBest = 0;
    writeLS(SK.dailyBest, '0');
    writeLS(SK.dailyDate, todayStr());
  }
  // Seeded RNG for daily challenge (mulberry32)
  let dailyRng = null;
  function makeRng(seedStr) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < seedStr.length; i++) {
      h = Math.imul(h ^ seedStr.charCodeAt(i), 16777619) >>> 0;
    }
    return function () {
      h |= 0; h = (h + 0x6D2B79F5) | 0;
      let t = Math.imul(h ^ (h >>> 15), 1 | h);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function rnd() { return dailyMode && dailyRng ? dailyRng() : Math.random(); }

  // Dynamic difficulty: track last 3 deaths' scores, scale spawn rate down if struggling
  let deathScores = [];
  try { deathScores = JSON.parse(readLS(SK.deathScores, '[]')) || []; } catch (_) { deathScores = []; }
  function difficultyEase() {
    if (deathScores.length < 3) return 1;  // neutral until we know the player
    const last3 = deathScores.slice(-3);
    const avg = last3.reduce((a, b) => a + b, 0) / last3.length;
    if (avg < 200) return 1.4;    // very easy — wider gaps
    if (avg < 500) return 1.15;   // forgiving
    if (avg > 1500) return 0.85;  // tighter
    return 1.0;
  }

  // ---------- Daily login streak (escalating reward = strong retention loop) ----------
  const STREAK_REWARDS = [10, 20, 35, 55, 80, 120, 180, 260, 350, 450, 600, 800, 1100, 1500];
  let streakInfo = null; // { day, reward } if reward pending this session
  (function processLogin() {
    const today = todayStr();
    const prev = readLS(SK.loginDate, '');
    let streak = parseInt(readLS(SK.loginStreak, '0'), 10) || 0;
    if (prev === today) return; // already counted today
    const yesterday = (function () {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() - 1);
      return d.getUTCFullYear() + '-' + (d.getUTCMonth() + 1) + '-' + d.getUTCDate();
    })();
    streak = prev === yesterday ? streak + 1 : 1;
    const reward = STREAK_REWARDS[Math.min(streak - 1, STREAK_REWARDS.length - 1)];
    totalCoins += reward;
    writeLS(SK.coins, totalCoins);
    writeLS(SK.loginDate, today);
    writeLS(SK.loginStreak, streak);
    streakInfo = { day: streak, reward };
  })();

  // ---------- Set-pieces (special sections — Coin Rush / Gauntlet) ----------
  let setpiece = null;
  let setpieceCount = 0;
  let nextSetpieceAt = 1800;
  const SETPIECE_TYPES = ['coinrush', 'gauntlet', 'lowg', 'meteor', 'storm', 'tornado', 'hyperspace'];
  function startSetpiece() {
    const type = SETPIECE_TYPES[setpieceCount % SETPIECE_TYPES.length];
    setpieceCount++;
    nextSetpieceAt += 1300;
    const dur = type === 'coinrush' ? 440 : type === 'tornado' ? 620 : type === 'lowg' ? 520 : type === 'meteor' ? 540 : type === 'storm' ? 480 : type === 'hyperspace' ? 460 : 560;
    setpiece = { type, t: 0, dur, spawnTimer: 30, vortex: 0 };
    obstacles = obstacles.filter((o) => o.x < W * 0.55);
    powerups = powerups.filter((p) => p.x < W * 0.55);
    // LOW-G: float section — soften gravity for a dreamy, hang-time coin harvest
    if (type === 'lowg') { gravity = BASE_GRAVITY * 0.42; showTipOnce('lowg', '🌙 LOW-G', 'Gravitație redusă — sari mult mai sus!'); }
    if (type === 'meteor') { showTipOnce('meteor', '☄ METEOR', 'Evită zonele marcate cu portocaliu pe sol!'); }
    if (type === 'storm') { showTipOnce('storm', '⛈ STORM', 'Toate tipurile de obstacole în același timp — supraviețuiește!'); }
    if (type === 'hyperspace') {
      showTipOnce('hyperspace', '🌌 HYPERSPACE', 'Tunel de stele — colectează tot ce poți!');
      // Hyperspace skips obstacles entirely; clear everything in front so the
      // tunnel reads as a clean burst of momentum.
      obstacles = obstacles.filter((o) => o.x < W * 0.30);
      meteors = [];
    }
    const label = type === 'coinrush' ? '★ COIN RUSH ★'
                : type === 'tornado' ? '🌪 TORNADO 🌪'
                : type === 'lowg' ? '🌙 LOW-G 🌙'
                : type === 'meteor' ? '☄ METEOR SHOWER ☄'
                : type === 'storm' ? '⛈ STORM ⛈'
                : type === 'hyperspace' ? '🌌 HYPERSPACE 🌌'
                : '⚡ GAUNTLET ⚡';
    const col = type === 'coinrush' ? '#ffe14a'
              : type === 'tornado' ? '#b478ff'
              : type === 'lowg' ? '#8ad8ff'
              : type === 'meteor' ? '#ff7a3d'
              : type === 'storm' ? '#19f0ff'
              : type === 'hyperspace' ? '#b478ff'
              : '#ff3d6e';
    popText(label, W / 2, GROUND - 210, col, 1.7);
    shake = Math.max(shake, 9);
    flashFrame = frame;
    zoomPunch = Math.max(zoomPunch, type === 'tornado' ? 0.08 : 0.05);
    audio.levelup();
  }
  function updateSetpiece() {
    setpiece.t++;
    setpiece.spawnTimer--;
    if (setpiece.type === 'coinrush') {
      if (setpiece.spawnTimer <= 0) {
        const baseY = GROUND - 70 - rnd() * 130;
        for (let i = 0; i < 3; i++) {
          coinsArr.push({ x: W + 30 + i * 30, y: baseY + Math.sin(i * 1.3) * 22, r: 14, picked: false, type: rollGem(), t: Math.random() * 6.28 });
        }
        setpiece.spawnTimer = 20;
      }
    } else if (setpiece.type === 'tornado') {
      // Boss vortex grows in, hovers, throws fast debris the player must dodge
      setpiece.vortex += (1 - setpiece.vortex) * 0.05;
      const settling = setpiece.t < 70 || setpiece.t > setpiece.dur - 70;
      if (!settling && setpiece.spawnTimer <= 0) {
        const r = rnd();
        if (r < 0.5) {
          // ground spike debris — jump
          obstacles.push({ type: 'spike', x: W + 20, y: GROUND - 34, w: 36, h: 34, vx: 3 });
        } else if (r < 0.8) {
          // low flyer — slide
          obstacles.push({ type: 'overhang', x: W + 20, y: GROUND - 78, w: 42, h: 48, vx: 3 });
        } else {
          // bonus coin arc through the chaos
          const by = GROUND - 90 - rnd() * 80;
          for (let i = 0; i < 3; i++) coinsArr.push({ x: W + 30 + i * 28, y: by, r: 14, picked: false, type: rollGem(), t: rnd() * 6.28 });
        }
        setpiece.spawnTimer = 42 + Math.floor(rnd() * 16);
      }
    } else if (setpiece.type === 'meteor') {
      // METEOR SHOWER — projectiles fall from the sky toward telegraphed
      // ground positions. The shadow shows the impact x for ~50 frames before
      // the meteor lands, so the player can read where to be (and where NOT).
      // Reward arc coins between waves so you fight for ground when it's safe.
      const settling = setpiece.t < 50 || setpiece.t > setpiece.dur - 70;
      if (!settling && setpiece.spawnTimer <= 0) {
        const r = rnd();
        if (r < 0.85) {
          // Telegraph a meteor: pick an impact x, spawn meteor far above.
          const tx = 220 + rnd() * (W - 360); // never spawns at the screen edge
          const ttl = 56;                     // frames until impact
          const fallH = 460;                  // pixels falling
          meteors.push({
            tx,                               // impact x (screen coords)
            y: GROUND - fallH,                // current y
            vy: fallH / ttl,                  // linear-ish drop
            ttl,                              // frames remaining until impact
            t: 0,
            r: 22 + rnd() * 6,                // visual radius
            impact: 0                         // post-impact danger countdown
          });
          if (audio.meteor) audio.meteor();
          setpiece.spawnTimer = 30 + Math.floor(rnd() * 18);
        } else {
          // Reward coin arc between waves
          const baseY = GROUND - 140 - rnd() * 80;
          for (let i = 0; i < 4; i++) {
            coinsArr.push({ x: W + 30 + i * 28, y: baseY - Math.sin((i / 3) * Math.PI) * 40, r: 14, picked: false, type: rollGem(), t: rnd() * 6.28 });
          }
          setpiece.spawnTimer = 50;
        }
      }
    } else if (setpiece.type === 'storm') {
      // STORM — every hazard type at high cadence with lightning flickers, plus
      // occasional bonus coin arcs to reward steady reads. Tests the player's
      // ability to switch mechanics on the fly: jump, slide, dive-slam.
      if (setpiece.spawnTimer <= 0) {
        const r = rnd();
        if (r < 0.30) makeObstacle('spike', W + 20);
        else if (r < 0.55) makeObstacle('overhang', W + 20);
        else if (r < 0.75) makeObstacle('flying', W + 20);
        else if (r < 0.92) makeObstacle('block', W + 20);
        else {
          // bonus coin pickup arc
          const by = GROUND - 110 - rnd() * 80;
          for (let i = 0; i < 4; i++) coinsArr.push({ x: W + 30 + i * 28, y: by, r: 14, picked: false, type: rollGem(), t: rnd() * 6.28 });
        }
        setpiece.spawnTimer = 38 + Math.floor(rnd() * 18);
      }
      // Random lightning crack adds chaos atmosphere — purely visual
      if (rnd() < 0.012) { lightningFrame = frame; makeBolt && makeBolt(); if (audio.thunder) audio.thunder(); }
    } else if (setpiece.type === 'hyperspace') {
      // HYPERSPACE — pure dopamine zone: dense coin streams at multiple altitudes,
      // no obstacles, auto-magnet topped up. Visual tunnel is in draw().
      magnetFrames = Math.max(magnetFrames, 8);
      if (setpiece.spawnTimer <= 0) {
        const lane = Math.floor(rnd() * 3); // 3 altitude lanes
        const baseY = lane === 0 ? GROUND - 70 : lane === 1 ? GROUND - 170 : GROUND - 270;
        const n = 5 + Math.floor(rnd() * 4);
        for (let i = 0; i < n; i++) {
          coinsArr.push({
            x: W + 30 + i * 26,
            y: baseY + Math.sin(i * 0.7 + setpiece.t * 0.02) * 22,
            r: 14, picked: false,
            type: rollGem(),
            t: rnd() * 6.28
          });
        }
        setpiece.spawnTimer = 14 + Math.floor(rnd() * 8);
      }
      // Occasional gem cluster for big bonus
      if (rnd() < 0.012) {
        const baseY = GROUND - 130 - rnd() * 120;
        for (let i = 0; i < 4; i++) {
          coinsArr.push({
            x: W + 60 + i * 22, y: baseY,
            r: 14, picked: false,
            type: rnd() < 0.5 ? 'blue' : 'star',
            t: rnd() * 6.28
          });
        }
      }
    } else if (setpiece.type === 'lowg') {
      // Floaty harvest — tall coin arcs reachable thanks to the long hang-time,
      // with the occasional wide-spaced hazard so it isn't a pure freebie.
      if (setpiece.spawnTimer <= 0) {
        const r = rnd();
        if (r < 0.78) {
          const baseY = GROUND - 90 - rnd() * 180;
          const n = 4 + Math.floor(rnd() * 3);
          for (let i = 0; i < n; i++) {
            coinsArr.push({ x: W + 30 + i * 30, y: baseY - Math.sin((i / (n - 1)) * Math.PI) * 70, r: 14, picked: false, type: rollGem(), t: rnd() * 6.28 });
          }
          setpiece.spawnTimer = 26;
        } else {
          obstacles.push(rnd() < 0.5
            ? { type: 'spike', x: W + 20, y: GROUND - 34, w: 36, h: 34 }
            : { type: 'flying', x: W + 20, y: GROUND - 150, w: 56, h: 32, baseY: GROUND - 150, bobAmp: 16, bobPh: rnd() * 6.28, bobSp: 0.05 });
          setpiece.spawnTimer = 60 + Math.floor(rnd() * 24);
        }
      }
    } else {
      if (setpiece.spawnTimer <= 0) {
        if (rnd() < 0.5) {
          obstacles.push({ type: 'overhang', x: W + 20, y: GROUND - 80, w: 46, h: 50 });
        } else {
          obstacles.push({ type: 'spike', x: W + 20, y: GROUND - 34, w: 36, h: 34 });
        }
        setpiece.spawnTimer = 50 + Math.floor(rnd() * 18);
      }
    }
    if (setpiece.t >= setpiece.dur) {
      if (setpiece.type === 'gauntlet') {
        runCoins += 80;
        popText('+80 ★  SURVIVED!', W / 2, GROUND - 200, '#19f0ff', 1.5);
        audio.power();
      } else if (setpiece.type === 'tornado') {
        runCoins += 150;
        popText('+150 ★  BOSS DOWN!', W / 2, GROUND - 200, '#b478ff', 1.6);
        addRing(W / 2, GROUND - 120, 220, '180,120,255', 40);
        music.duck();
        shake = Math.max(shake, 12);
        zoomPunch = Math.max(zoomPunch, 0.08);
        audio.power();
      } else if (setpiece.type === 'lowg') {
        gravity = BASE_GRAVITY; // restore normal weight
        runCoins += 60;
        popText('+60 ★  GRAVITY ON', W / 2, GROUND - 200, '#8ad8ff', 1.4);
        addRing(W / 2, GROUND - 120, 180, '140,210,255', 32);
        audio.power();
      } else if (setpiece.type === 'meteor') {
        runCoins += 100;
        popText('+100 ★  CER SENIN!', W / 2, GROUND - 200, '#ff7a3d', 1.5);
        addRing(W / 2, GROUND - 120, 200, '255,140,60', 36);
        shake = Math.max(shake, 10);
        audio.power();
        if (!hasAch('meteor_dodge')) unlock('meteor_dodge');
      } else if (setpiece.type === 'storm') {
        runCoins += 120;
        popText('+120 ★  STORM CALM!', W / 2, GROUND - 200, '#19f0ff', 1.55);
        addRing(W / 2, GROUND - 120, 220, '120,230,255', 36);
        addFever(0.2);
        shake = Math.max(shake, 11);
        audio.power();
      } else if (setpiece.type === 'hyperspace') {
        runCoins += 90;
        popText('+90 ★  HYPER COMPLETE!', W / 2, GROUND - 200, '#b478ff', 1.6);
        addRing(W / 2, GROUND - 120, 240, '180,120,255', 40);
        addRing(W / 2, GROUND - 120, 180, '120,230,255', 32);
        addFever(0.18);
        shake = Math.max(shake, 9);
        audio.power();
        if (!hasAch('hyperspace')) unlock('hyperspace');
      }
      setpiece = null;
      nextObstacleAt = frame + 75;
      nextCoinAt = frame + 90;
      nextPowerupAt = Math.max(nextPowerupAt, frame + 400);
      nextMysteryAt = Math.max(nextMysteryAt, frame + 600);
    }
  }

  // ---------- Mystery box (rare variable reward — dopamine hit) ----------
  let mysteryBoxes = [];
  let nextMysteryAt = 1800; // around 30s in
  function spawnMystery() {
    mysteryBoxes.push({
      x: W + 30,
      y: GROUND - 220,
      vy: 1.6,
      r: 26,
      t: 0,
      glow: 0,
      picked: false
    });
  }
  function openMystery() {
    missionEvent('mystery');
    // Variable reward: small / medium / big with weighted probabilities
    const r = rnd();
    let reward;
    if (r < 0.45) {
      reward = { coins: 10 + Math.floor(rnd() * 15), msg: 'BONUS!', col: '#ffe14a' };
    } else if (r < 0.72) {
      reward = { coins: 30 + Math.floor(rnd() * 25), msg: 'MEGA BONUS!', col: '#ff3df0', extra: 'shield' };
    } else if (r < 0.88) {
      // TIME WARP — 4 seconds of dramatic slowmo so the player can thread
      // through everything coming at them. A rare, exciting variable reward.
      reward = { coins: 50 + Math.floor(rnd() * 30), msg: '⏱ TIME WARP!', col: '#19f0ff', extra: 'timewarp' };
    } else if (r < 0.97) {
      reward = { coins: 80 + Math.floor(rnd() * 40), msg: 'JACKPOT!', col: '#19f0ff', extra: 'magnet' };
    } else {
      reward = { coins: 300, msg: 'MEGA JACKPOT!!', col: '#fff' };
    }
    runCoins += reward.coins;
    if (reward.extra === 'shield') shieldActive = true;
    else if (reward.extra === 'timewarp') {
      slowmoFrames = Math.max(slowmoFrames, 60 * 4);
      glitchFrame = frame;
    }
    else if (reward.extra === 'magnet') magnetFrames = 60 * 6;
    popText(reward.msg + ' +' + reward.coins + '★', player.x + player.w / 2, GROUND - 220, reward.col, 1.4);
    audio.power();
    music.duck();
    addRing(player.x + player.w / 2, GROUND - 220, 130, '255,225,74', 34);
    flashFrame = frame;
    zoomPunch = Math.max(zoomPunch, 0.055);
    shake = Math.max(shake, 10);
    for (let i = 0; i < 30; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = Math.random() * 6 + 2;
      pushParticle(
        player.x + player.w / 2, GROUND - 220,
        Math.cos(a) * v, Math.sin(a) * v,
        45, reward.col, Math.random() * 3 + 2
      );
    }
  }

  // ---------- Achievements ----------
  const ACHIEVEMENTS = [
    { id: 'first_jump',    name: 'Primul salt',         desc: 'Sari pentru prima dată',      reward: 5 },
    { id: 'score_500',     name: 'Cinci sute',          desc: 'Atinge 500 scor',             reward: 25 },
    { id: 'score_2000',    name: 'Două mii',            desc: 'Atinge 2000 scor',            reward: 75 },
    { id: 'score_5000',    name: 'Veteran',             desc: 'Atinge 5000 scor',            reward: 200 },
    { id: 'combo_10',      name: 'Combo Maestru',       desc: 'Atinge 10 combo',             reward: 30 },
    { id: 'combo_20',      name: 'Imparabil',           desc: 'Atinge 20 combo',             reward: 80 },
    { id: 'magnet',        name: 'Atracție magnetică',  desc: 'Folosește un magnet',         reward: 15 },
    { id: 'shield_save',   name: 'Salvare scut',        desc: 'Scutul absoarbe o lovitură',  reward: 20 },
    { id: 'level_3',       name: 'Glacial',             desc: 'Ajunge la nivelul 4',         reward: 40 },
    { id: 'level_6',       name: 'Călătorul cosmic',    desc: 'Ajunge la nivelul 6',         reward: 100 },
    { id: 'coins_100',     name: 'Sută de stele',       desc: 'Adună 100 de stele în total', reward: 25 },
    { id: 'revive',        name: 'A doua șansă',        desc: 'Folosește un revive',         reward: 15 },
    // Expansion — new feature trophies + variety chases
    { id: 'gem_blue',      name: 'Cristal Albastru',    desc: 'Colectează un cristal albastru', reward: 30 },
    { id: 'gem_red',       name: 'Rubin Rar',           desc: 'Colectează un rubin (rar!)',     reward: 100 },
    { id: 'overdrive',     name: 'OVERDRIVE',           desc: 'Declanșează OVERDRIVE',          reward: 50 },
    { id: 'sprint_first',  name: 'Vitezomanul',         desc: 'Folosește un Sprint',            reward: 25 },
    { id: 'spring_first',  name: 'Săritor',             desc: 'Folosește o catapultă',          reward: 25 },
    { id: 'nm_clutch',     name: 'Sânge Rece',          desc: '10 near-miss într-un run',       reward: 80 },
    { id: 'air_big',       name: 'Aerian',              desc: 'Bonus air-time +40 într-un salt', reward: 50 },
    { id: 'slam_first',    name: 'Seismic',             desc: 'Distruge un obstacol cu Dive-Slam', reward: 30 },
    { id: 'slam_triple',   name: 'Cutremur',            desc: 'Distruge 3 obstacole dintr-un Slam', reward: 90 },
    { id: 'phase_first',   name: 'Fantomă',             desc: 'Activează PHASE',                reward: 25 },
    { id: 'phase_streak',  name: 'Intangibil',          desc: 'Treci prin 5 obstacole într-un PHASE', reward: 90 },
    { id: 'combo_50',      name: 'Legendă Combo',       desc: 'Atinge 50 combo',               reward: 250 },
    { id: 'slam_master',   name: 'Maestrul Slam',       desc: '100 de obstacole distruse cu Slam', reward: 200 },
    { id: 'phase_lord',    name: 'Stăpânul Fantomă',    desc: '25 de Phase-uri folosite',      reward: 200 },
    { id: 'meteor_dodge',  name: 'Cer Senin',           desc: 'Supraviețuiește unui Meteor Shower', reward: 120 },
    { id: 'score_10000',   name: 'Astronautul',         desc: 'Atinge 10.000 scor',             reward: 300 },
    { id: 'timewarp_first', name: 'Cronomancer',        desc: 'Activează TIME WARP',           reward: 30 },
    { id: 'timewarp_master', name: 'Stăpân al Timpului', desc: '20 de TIME WARP folosite',     reward: 220 },
    { id: 'hyperspace',    name: 'Hyperspeed',           desc: 'Supraviețuiește un HYPERSPACE', reward: 110 },
    { id: 'prism_biome',   name: 'Spectrum',             desc: 'Ajunge la biomul PRISM',        reward: 350 }
  ];
  const achKey = (id) => SK.achievements + '.' + id;
  // In-memory unlock cache — avoids a synchronous localStorage read per trophy
  // on every frame (the achievement checks run inside the hot update loop).
  const achState = (function () {
    const s = {};
    for (const a of ACHIEVEMENTS) s[a.id] = readLS(achKey(a.id), '0') === '1';
    return s;
  })();
  function hasAch(id) { return achState[id] === true; }
  function unlock(id) {
    if (achState[id]) return;
    achState[id] = true;
    writeLS(achKey(id), '1');
    const a = ACHIEVEMENTS.find((x) => x.id === id);
    if (!a) return;
    if (a.reward) {
      totalCoins += a.reward;
      writeLS(SK.coins, totalCoins);
      coinsEl.textContent = totalCoins;
    }
    showToast('🏆 ' + a.name, a.desc + (a.reward ? '  ·  +' + a.reward + ' ★' : ''));
    // In-game spectacle when unlocking mid-run — a confetti burst + ring +
    // ding so the moment lands instead of just a quiet toast at the corner.
    if (state === STATE.PLAY) {
      const cx = player.x + player.w / 2;
      const cy = player.y + player.h / 2;
      addRing(cx, cy, 130, '255,225,74', 28);
      addRing(cx, cy, 90, '255,255,255', 22);
      addFever(0.06);
      for (let i = 0; i < 28; i++) {
        const ang = -Math.PI / 2 + (Math.random() - 0.5) * 2.4;
        const v = Math.random() * 7 + 3;
        pushParticle(cx, cy, Math.cos(ang) * v, Math.sin(ang) * v, 60,
          ['#ffe14a', '#ff3df0', '#19f0ff', '#fff'][i & 3], Math.random() * 3 + 1.5);
      }
      flashFrame = frame;
      audio.power && audio.power();
      if (navigator.vibrate) { try { navigator.vibrate([15, 30, 60]); } catch (_) {} }
    }
  }
  // ---------- Skins (cosmetic progression unlocked with stars) ----------
  const SKINS = [
    { id: 'cyan',    name: 'CYAN',    cost: 0,    locked: false, core:['#fff','#a8f6ff','#19f0ff','#0b94ad'], halo:['rgba(120,230,255,0.55)','rgba(255,80,220,0.18)'], ring:'rgba(255,90,220,0.6)',  trail:'120,230,255', perk:{ type:'combo',   val:0.10, label:'+10% fereastră combo' } },
    { id: 'plasma',  name: 'PLASMA',  cost: 200,  locked: true,  core:['#fff','#caffd2','#3dff7a','#0a4d20'], halo:['rgba(100,255,180,0.55)','rgba(180,255,100,0.2)'], ring:'rgba(120,255,180,0.7)', trail:'100,255,180', perk:{ type:'air',     val:0.20, label:'+20% bonus air-time' } },
    { id: 'solar',   name: 'SOLAR',   cost: 500,  locked: true,  core:['#fff','#fff5d0','#ffd64a','#a86b00'], halo:['rgba(255,225,100,0.6)','rgba(255,120,40,0.25)'], ring:'rgba(255,200,80,0.75)', trail:'255,225,100', perk:{ type:'gem',     val:0.5,  label:'+50% șansă gem' } },
    { id: 'crimson', name: 'CRIMSON', cost: 1500, locked: true,  core:['#fff','#ffcad0','#ff3d6e','#8a0a20'], halo:['rgba(255,80,120,0.55)','rgba(255,40,60,0.25)'],  ring:'rgba(255,120,140,0.75)', trail:'255,100,140', perk:{ type:'nm',      val:15,   label:'+15 scor / near-miss' } },
    { id: 'cosmic',  name: 'COSMIC',  cost: 3500, locked: true,  core:['#fff','#e0d0ff','#b04dff','#3a0a8c'], halo:['rgba(180,80,255,0.55)','rgba(120,40,255,0.25)'], ring:'rgba(200,120,255,0.75)', trail:'180,100,255', perk:{ type:'magnet',  val:3,    label:'Start cu 3s magnet' } },
    { id: 'glitch',  name: 'GLITCH',  cost: 0,    locked: true, adOnly: true, animated: true, core:['#fff','#ffd0ff','#ff3df0','#5a0a8c'], halo:['rgba(255,61,240,0.6)','rgba(180,40,200,0.22)'], ring:'rgba(255,200,255,0.85)', trail:'255,140,255', perk:{ type:'feverNm', val:0.04, label:'+OVERDRIVE per near-miss' } },
    { id: 'nebula',  name: 'NEBULA',  cost: 2200, locked: true, core:['#fff','#e8d8ff','#a874ff','#3a1a7a'], halo:['rgba(180,120,255,0.55)','rgba(120,80,220,0.22)'], ring:'rgba(220,180,255,0.8)', trail:'180,130,255', perk:{ type:'sprint',  val:2,    label:'+2s la Sprint' } },
    { id: 'aurora',  name: 'AURORA',  cost: 4500, locked: true, core:['#fff','#ccffe8','#3dffd0','#0a6e5a'], halo:['rgba(100,255,210,0.6)','rgba(60,200,255,0.22)'], ring:'rgba(140,255,220,0.8)', trail:'100,255,210', perk:{ type:'coin',    val:1,    label:'+1 stea / coin' } },
    { id: 'titan',   name: 'TITAN',   cost: 6000, locked: true, core:['#fff','#ffe0b0','#ff8a1e','#7a3200'], halo:['rgba(255,140,40,0.6)','rgba(255,80,20,0.25)'],   ring:'rgba(255,170,90,0.8)',  trail:'255,150,60',  perk:{ type:'slam',    val:0.7,  label:'+70% rază Dive-Slam' } },
    { id: 'phantom', name: 'PHANTOM', cost: 7500, locked: true, animated: true, core:['#fff','#dccfff','#9876ff','#2a0f6e'], halo:['rgba(160,110,255,0.6)','rgba(100,60,200,0.25)'], ring:'rgba(200,160,255,0.85)', trail:'200,160,255', perk:{ type:'phase',   val:2,    label:'+2s la PHASE' } },
    // Rank-gated reward skin — earned by reaching pilot rank, not bought
    { id: 'void',    name: 'VOID',    cost: 0, locked: true, rankReq: 5, animated: true, core:['#fff','#d8c8ff','#7a3dff','#1a0640'], halo:['rgba(140,80,255,0.6)','rgba(80,40,200,0.25)'], ring:'rgba(180,120,255,0.9)', trail:'160,110,255', perk:{ type:'gem', val:1.0, label:'+100% șansă gem' } },
    // TEMPO — premium time-warp skin
    { id: 'tempo',   name: 'TEMPO',   cost: 5500, locked: true, animated: true, core:['#fff','#d4f0ff','#19f0ff','#0a4a6e'], halo:['rgba(120,230,255,0.65)','rgba(80,200,255,0.25)'], ring:'rgba(180,240,255,0.85)', trail:'130,230,255', perk:{ type:'timewarp', val:1, label:'+1s la TIME WARP' } },
    // PRISM — rainbow rank-gated endgame trophy skin (rank 8 — long-tail goal)
    { id: 'prism',   name: 'PRISM',   cost: 0, locked: true, rankReq: 8, animated: true, core:['#fff','#ffe0ff','#ff80c0','#3a0a52'], halo:['rgba(255,180,255,0.65)','rgba(100,200,255,0.25)'], ring:'rgba(255,255,255,0.95)', trail:'255,180,255', perk:{ type:'combo', val:0.20, label:'+20% fereastră combo' } }
  ];
  function perkVal(type) {
    const sk = currentSkin();
    return sk && sk.perk && sk.perk.type === type ? sk.perk.val : 0;
  }
  function ownedSkin(id) {
    if (id === 'cyan') return true;
    const sk = SKINS.find((s) => s.id === id);
    if (sk && sk.rankReq != null && pilotRank >= sk.rankReq) return true; // earned via pilot rank
    return readLS(SK.skinUnlocked + '.' + id, '0') === '1';
  }
  let currentSkinId = readLS(SK.skinUnlocked + '.current', 'cyan');
  if (!ownedSkin(currentSkinId)) currentSkinId = 'cyan';
  function currentSkin() { return SKINS.find((s) => s.id === currentSkinId) || SKINS[0]; }

  // ---------- Daily missions (3 active, reset daily) ----------
  const MISSION_TEMPLATES = [
    { id: 'score_x',    type: 'final', mk: () => ({ n: 200 + Math.floor(Math.random()*600), goal: 1 }),     label: (m) => 'Atinge ' + m.n + ' scor într-un run', reward: 50 },
    { id: 'coins_x',    type: 'event', mk: () => ({ goal: 20 + Math.floor(Math.random()*30) }), label: (m) => 'Colectează ' + m.goal + ' stele',    reward: 35 },
    { id: 'combo_x',    type: 'final', mk: () => ({ n: 5 + Math.floor(Math.random()*10), goal: 1 }),       label: (m) => 'Atinge combo ' + m.n,           reward: 40 },
    { id: 'powerup_x',  type: 'event', mk: () => ({ goal: 1 + Math.floor(Math.random()*3) }),              label: (m) => 'Folosește ' + m.goal + ' power-ups', reward: 35 },
    { id: 'runs_x',     type: 'event', mk: () => ({ goal: 3 + Math.floor(Math.random()*5) }),              label: (m) => 'Joacă ' + m.goal + ' runs',     reward: 45 },
    { id: 'mystery_x',  type: 'event', mk: () => ({ goal: 1 + Math.floor(Math.random()*2) }),              label: (m) => 'Deschide ' + m.goal + ' mystery box', reward: 60 },
    { id: 'level_x',    type: 'final', mk: () => ({ n: 2 + Math.floor(Math.random()*3), goal: 1 }),         label: (m) => 'Ajunge la nivelul ' + (m.n + 1), reward: 55 },
    // Expansion — five new mission shapes for more variety in the daily rotation
    { id: 'spring_x',   type: 'event', mk: () => ({ goal: 2 + Math.floor(Math.random()*3) }),              label: (m) => 'Folosește ' + m.goal + ' catapulte', reward: 40 },
    { id: 'gem_blue_x', type: 'event', mk: () => ({ goal: 1 + Math.floor(Math.random()*2) }),              label: (m) => 'Colectează ' + m.goal + ' cristale albastre', reward: 55 },
    { id: 'sprint_x',   type: 'event', mk: () => ({ goal: 1 + Math.floor(Math.random()*2) }),              label: (m) => 'Folosește ' + m.goal + ' Sprint', reward: 40 },
    { id: 'overdrive_x', type: 'event', mk: () => ({ goal: 1 }),                                            label: () => 'Declanșează OVERDRIVE', reward: 60 },
    { id: 'near_miss_x', type: 'event', mk: () => ({ goal: 5 + Math.floor(Math.random()*5) }),             label: (m) => 'Fă ' + m.goal + ' near-miss', reward: 50 },
    { id: 'phase_x',    type: 'event', mk: () => ({ goal: 1 + Math.floor(Math.random()*2) }),              label: (m) => 'Activează PHASE de ' + m.goal + ' ori', reward: 55 },
    { id: 'slam_x',     type: 'event', mk: () => ({ goal: 3 + Math.floor(Math.random()*4) }),              label: (m) => 'Distruge ' + m.goal + ' obstacole cu Dive-Slam', reward: 50 },
    { id: 'timewarp_x', type: 'event', mk: () => ({ goal: 1 + Math.floor(Math.random()*2) }),              label: (m) => 'Activează TIME WARP de ' + m.goal + ' ori', reward: 55 }
  ];
  const MK = { current: SK.skinUnlocked + '.current' };

  // ---------- Persistent upgrades (the meta-progression engine) ----------
  // Stars buy permanent power growth that carries between runs — the loop that
  // turns "one more run" into "one more level". Costs ramp so each tier feels
  // earned. Effects are applied at the consumption site (look for upgLvl()).
  const UPGRADES = [
    { id: 'magnet',  name: 'MAGNET +',  desc: '+2s la durata magnetului',  costs: [60, 180, 450],  icon: '🧲' },
    { id: 'combo',   name: 'COMBO +',   desc: '+15% fereastră de combo',   costs: [70, 200, 500],  icon: '🔥' },
    { id: 'stars',   name: 'STAR +',    desc: '+1 stea per pickup',         costs: [80, 250, 700],  icon: '★'  },
    { id: 'air',     name: 'AIR +',     desc: '+25% bonus air-time',        costs: [70, 200, 500],  icon: '🪂' },
    { id: 'sprint',  name: 'BOOST +',   desc: '+1s la durata Sprint-ului', costs: [90, 280, 700],  icon: '⚡' }
  ];
  const upgKey = (id) => NS + 'upg.' + id;
  function upgLvl(id) { return parseInt(readLS(upgKey(id), '0'), 10) || 0; }
  function upgSet(id, lvl) { writeLS(upgKey(id), String(lvl)); }
  function upgNextCost(u) { const lvl = upgLvl(u.id); return lvl >= u.costs.length ? null : u.costs[lvl]; }
  function loadMissions() {
    const today = todayStr();
    const saved = (function(){ try { return JSON.parse(readLS(NS + 'missions', 'null')); } catch (_) { return null; } })();
    if (saved && saved.date === today && saved.list && saved.list.length === 3) return saved.list;
    // Generate 3 unique missions
    const pool = MISSION_TEMPLATES.slice().sort(() => Math.random() - 0.5);
    const list = pool.slice(0, 3).map((tpl) => {
      const m = Object.assign({ id: tpl.id, reward: tpl.reward, progress: 0, claimed: false, done: false }, tpl.mk());
      m.label = tpl.label(m);
      return m;
    });
    writeLS(NS + 'missions', JSON.stringify({ date: today, list }));
    return list;
  }
  let missions = loadMissions();
  function saveMissions() {
    writeLS(NS + 'missions', JSON.stringify({ date: todayStr(), list: missions }));
  }
  function missionEvent(type, value) {
    let any = false;
    for (const m of missions) {
      if (m.done) continue;
      let inc = 0;
      if (m.id === 'coins_x' && type === 'coin') inc = 1;
      else if (m.id === 'powerup_x' && type === 'powerup') inc = 1;
      else if (m.id === 'runs_x' && type === 'gameover') inc = 1;
      else if (m.id === 'mystery_x' && type === 'mystery') inc = 1;
      else if (m.id === 'spring_x' && type === 'spring') inc = 1;
      else if (m.id === 'gem_blue_x' && type === 'gem_blue') inc = 1;
      else if (m.id === 'sprint_x' && type === 'sprint') inc = 1;
      else if (m.id === 'near_miss_x' && type === 'near_miss') inc = 1;
      else if (m.id === 'overdrive_x' && type === 'overdrive') inc = 1;
      else if (m.id === 'phase_x' && type === 'phase') inc = 1;
      else if (m.id === 'slam_x' && type === 'slam') inc = value || 1;
      else if (m.id === 'timewarp_x' && type === 'timewarp') inc = 1;
      else if (m.id === 'score_x' && type === 'gameover' && value >= m.n) { m.progress = 1; m.done = true; any = true; }
      else if (m.id === 'combo_x' && type === 'combo' && value >= m.n) { m.progress = 1; m.done = true; any = true; }
      else if (m.id === 'level_x' && type === 'level' && value >= m.n) { m.progress = 1; m.done = true; any = true; }
      if (inc) {
        m.progress += inc;
        if (m.progress >= m.goal) { m.progress = m.goal; m.done = true; any = true; }
      }
    }
    if (any) {
      saveMissions();
      updateMissionsBadge();
    }
  }
  function updateMissionsBadge() {
    const dot = document.getElementById('missionsBadge');
    if (!dot) return;
    const any = missions.some((m) => m.done && !m.claimed);
    dot.style.display = any ? 'block' : 'none';
  }
  // Lights up when the player can afford a NEW skin they don't already own.
  // Encourages a shop visit the moment a milestone purchase becomes possible.
  function updateShopBadge() {
    const dot = document.getElementById('shopBadge');
    if (!dot) return;
    const any = SKINS.some((s) => !ownedSkin(s.id) && !s.adOnly && s.rankReq == null && s.cost > 0 && totalCoins >= s.cost);
    dot.style.display = any ? 'block' : 'none';
  }

  // ---------- Screen navigation ----------
  function showScreen(name) {
    // Hide ALL overlays — main menu, shop, missions, stats, game over, ad
    document.querySelectorAll('.overlay').forEach((o) => o.classList.remove('show'));
    // Return to attract mode so the synthwave scene breathes behind every menu
    // screen instead of freezing on the game-over frame (never overrides a run).
    if (state !== STATE.PLAY) state = STATE.MENU;
    // Menu ambience — once audio is unlocked (post-game), let a soft synthwave
    // track underscore the menus. No-op while the AudioContext is still
    // suspended (fresh load, pre-gesture), so it never fights autoplay policy.
    if (state === STATE.MENU && music.isPlaying && !music.isPlaying()) {
      try { music.start(0); } catch (_) {}
    }
    if (name === 'home') {
      document.getElementById('overlay').classList.add('show');
    } else if (name === 'shop') {
      document.getElementById('shopOverlay').classList.add('show');
      renderShop();
    } else if (name === 'missions') {
      document.getElementById('missionsOverlay').classList.add('show');
      renderMissions();
    } else if (name === 'stats') {
      document.getElementById('statsOverlay').classList.add('show');
      renderStats();
    }
    document.querySelectorAll('.nav-btn').forEach((b) => {
      b.classList.toggle('active', b.getAttribute('data-screen') === name);
    });
  }

  function renderShop() {
    const grid = document.getElementById('skinGrid');
    const cc = document.getElementById('shopCoins');
    if (cc) cc.textContent = totalCoins;
    if (!grid) return;
    grid.innerHTML = '';
    for (const s of SKINS) {
      const owned = ownedSkin(s.id);
      const equipped = s.id === currentSkinId;
      const div = document.createElement('div');
      div.className = 'skin-card' + (equipped ? ' equipped' : owned ? ' owned' : ' locked');

      const previewEl = document.createElement('div');
      previewEl.className = 'skin-preview';
      previewEl.style.background = 'radial-gradient(circle at 30% 30%, ' + s.core[0] + ', ' + s.core[2] + ' 60%, ' + s.core[3] + ')';
      previewEl.style.boxShadow = '0 0 20px ' + s.halo[0];

      const nameEl = document.createElement('div');
      nameEl.className = 'skin-name';
      nameEl.textContent = s.name;

      const rankLocked = !owned && s.rankReq != null;
      const costEl = document.createElement('div');
      costEl.className = 'skin-cost ' + (equipped ? 'equipped' : owned ? 'owned' : rankLocked ? 'rank' : s.adOnly ? 'ad' : '');
      costEl.textContent = equipped ? 'ECHIPAT' : owned ? 'TAP PT ECHIPARE' : rankLocked ? ('RANG ' + s.rankReq) : s.adOnly ? 'GRATUIT VIA AD' : (s.cost + ' ★');

      div.appendChild(previewEl);
      div.appendChild(nameEl);
      if (s.perk && s.perk.label) {
        const perkEl = document.createElement('div');
        perkEl.className = 'skin-perk';
        perkEl.textContent = '✦ ' + s.perk.label;
        div.appendChild(perkEl);
      }
      div.appendChild(costEl);

      div.addEventListener('click', () => {
        if (owned) {
          currentSkinId = s.id;
          writeLS(MK.current, s.id);
          audio.coin();
          renderShop();
        } else if (s.rankReq != null) {
          // Earned by pilot rank, not purchasable
          showToast('🔒 Blocat · RANG ' + s.rankReq, 'Ajungi la nivelul ' + s.rankReq + ' de pilot');
        } else if (s.adOnly) {
          // Trigger rewarded ad stub for free skin
          showRewardedAd(() => {
            writeLS(SK.skinUnlocked + '.' + s.id, '1');
            currentSkinId = s.id;
            writeLS(MK.current, s.id);
            audio.power();
            renderShop();
          });
        } else if (totalCoins >= s.cost) {
          totalCoins -= s.cost;
          writeLS(SK.coins, totalCoins);
          coinsEl.textContent = totalCoins;
          writeLS(SK.skinUnlocked + '.' + s.id, '1');
          currentSkinId = s.id;
          writeLS(MK.current, s.id);
          audio.levelup();
          showToast('🎉 ' + s.name + ' deblocat', 'Skin echipat');
          renderShop();
          updateShopBadge();
        } else {
          showToast('Nu ai destule stele', 'Îți trebuie ' + (s.cost - totalCoins) + ' ★');
        }
      });
      grid.appendChild(div);
    }
    renderUpgrades();
  }

  function renderUpgrades() {
    const list = document.getElementById('upgradeList');
    if (!list) return;
    list.innerHTML = '';
    for (const u of UPGRADES) {
      const lvl = upgLvl(u.id);
      const maxed = lvl >= u.costs.length;
      const cost = maxed ? null : u.costs[lvl];
      const card = document.createElement('div');
      card.className = 'upg-card' + (maxed ? ' maxed' : '');
      const dots = u.costs.map((_, i) => '<span class="dot' + (i < lvl ? ' filled' : '') + '"></span>').join('');
      card.innerHTML =
        '<div class="upg-icon">' + u.icon + '</div>' +
        '<div class="upg-body">' +
          '<div class="upg-head"><span class="upg-name">' + u.name + '</span>' +
            '<span class="upg-dots">' + dots + '</span></div>' +
          '<div class="upg-desc">' + u.desc + '</div>' +
        '</div>' +
        '<button class="upg-buy"' + (maxed ? ' disabled' : '') + '>' +
          (maxed ? 'MAX' : (cost + ' ★')) + '</button>';
      const btn = card.querySelector('.upg-buy');
      if (btn && !maxed) btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (totalCoins < cost) {
          showToast('Nu ai destule stele', 'Îți trebuie ' + (cost - totalCoins) + ' ★');
          return;
        }
        totalCoins -= cost;
        writeLS(SK.coins, totalCoins);
        coinsEl.textContent = totalCoins;
        upgSet(u.id, lvl + 1);
        audio.levelup();
        showToast('🚀 ' + u.name + ' Lv.' + (lvl + 1), u.desc);
        renderUpgrades();
        // Refresh the shop coin badge too
        const cc = document.getElementById('shopCoins'); if (cc) cc.textContent = totalCoins;
      });
      list.appendChild(card);
    }
  }

  function renderMissions() {
    missions = loadMissions(); // pick up daily reset
    const list = document.getElementById('missionsList');
    const cc = document.getElementById('missionsCoins');
    if (cc) cc.textContent = totalCoins;
    if (!list) return;
    list.innerHTML = '';
    for (const m of missions) {
      const pct = Math.min(100, (m.progress / m.goal) * 100);
      const div = document.createElement('div');
      div.className = 'mission' + (m.done ? ' done' : '') + (m.claimed ? ' claimed' : '');
      div.innerHTML =
        '<div class="mission-head"><span class="mission-name">' + m.label + '</span>' +
        '<span class="mission-reward">+' + m.reward + '★</span></div>' +
        '<div class="mission-bar"><div class="mission-fill" style="width:' + pct + '%"></div></div>' +
        '<div class="mission-progress">' + Math.min(m.progress, m.goal) + ' / ' + m.goal + '</div>' +
        (m.done && !m.claimed ? '<button class="mission-claim">RIDICĂ +' + m.reward + ' ★</button>' : '');
      const claim = div.querySelector('.mission-claim');
      if (claim) claim.addEventListener('click', () => {
        m.claimed = true;
        totalCoins += m.reward;
        writeLS(SK.coins, totalCoins);
        coinsEl.textContent = totalCoins;
        saveMissions();
        audio.coin();
        showToast('+' + m.reward + ' ★', m.label);
        renderMissions();
        updateMissionsBadge();
      });
      list.appendChild(div);
    }
    // Reset timer
    const rt = document.getElementById('resetTimer');
    if (rt) {
      const d = new Date();
      const ms = (24 - d.getUTCHours()) * 3600 - d.getUTCMinutes() * 60 - d.getUTCSeconds();
      const h = Math.floor(ms / 3600), m = Math.floor((ms % 3600) / 60), s = ms % 60;
      rt.textContent = (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
    }
  }

  function renderStats() {
    const cc = document.getElementById('statsCoins');
    if (cc) cc.textContent = totalCoins;
    const sb = document.getElementById('sBest'); if (sb) sb.textContent = best;
    const sr = document.getElementById('sRuns'); if (sr) sr.textContent = totalRuns;
    const ss = document.getElementById('sStars'); if (ss) ss.textContent = totalCoins;
    const sk = document.getElementById('sStreak'); if (sk) sk.textContent = parseInt(readLS(SK.loginStreak, '0'), 10) || 0;
    const sCombo = document.getElementById('sCombo'); if (sCombo) sCombo.textContent = bestCombo;
    const sSlam = document.getElementById('sSlam'); if (sSlam) sSlam.textContent = lifeSlams;
    const sPhase = document.getElementById('sPhase'); if (sPhase) sPhase.textContent = lifePhases;
    // Pilot rank banner — current rank + progress to the next
    {
      const cur = pilotRank;
      const curBase = xpForRank(cur);
      const span = Math.max(1, xpForRank(cur + 1) - curBase);
      const into = Math.max(0, totalXP - curBase);
      const ratio = Math.min(1, into / span);
      const rl = document.getElementById('pilotRankLabel'); if (rl) rl.textContent = 'NIVEL ' + cur + ' · ' + rankTitle(cur);
      const rx = document.getElementById('pilotXpText'); if (rx) rx.textContent = into + ' / ' + span + ' XP';
      const rf = document.getElementById('pilotXpFill'); if (rf) rf.style.transform = 'scaleX(' + ratio.toFixed(4) + ')';
    }
    const list = document.getElementById('achList');
    if (!list) return;
    list.innerHTML = '';
    for (const a of ACHIEVEMENTS) {
      const unlocked = hasAch(a.id);
      const div = document.createElement('div');
      div.className = 'ach-item ' + (unlocked ? 'unlocked' : 'locked');
      div.innerHTML = '<div class="ach-icon">' + (unlocked ? '🏆' : '🔒') + '</div>' +
        '<div class="ach-text"><div class="ach-name">' + a.name + '</div><div class="ach-desc">' + a.desc + '</div></div>';
      list.appendChild(div);
    }
  }

  function showRewardedAd(onComplete) {
    const ov = document.getElementById('adOverlay');
    const co = document.getElementById('adCountdown');
    if (!ov) { onComplete(); return; }
    ov.classList.add('show');
    let s = 5;
    if (co) co.textContent = s;
    const t = setInterval(() => {
      s--;
      if (co) co.textContent = s;
      if (s <= 0) { clearInterval(t); ov.classList.remove('show'); onComplete(); }
    }, 1000);
  }

  // Interstitial stub: triggers at natural breaks (every 3rd game over)
  let interstitialCounter = 0;
  function maybeShowInterstitial() {
    interstitialCounter++;
    if (interstitialCounter >= 3) {
      interstitialCounter = 0;
      // In production this is where AdMob.showInterstitial() goes.
      // For now: brief delay simulates ad close, no UI to avoid annoying users in dev.
      // Reserve hook only — no actual interstitial in PWA build.
    }
  }

  function showToast(title, desc) {
    if (!toastEl) return;
    toastEl.querySelector('.t-title').textContent = title;
    toastEl.querySelector('.t-desc').textContent = desc;
    toastEl.classList.add('show');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => toastEl.classList.remove('show'), 3500);
  }
  // One-time contextual tip — teaches a new mechanic the first time it appears.
  function showTipOnce(key, title, desc) {
    const k = NS + 'tip.' + key;
    if (readLS(k, '0') === '1') return;
    writeLS(k, '1');
    showToast(title, desc);
  }

  // ---------- Init parallax ----------
  function initParallax() {
    stars = [];
    for (let i = 0; i < 60; i++) {
      stars.push({
        x: Math.random() * W,
        y: Math.random() * (GROUND - 100),
        r: Math.random() * 1.6 + 0.4,
        s: Math.random() * 0.3 + 0.1,
        tw: Math.random() * Math.PI * 2
      });
    }
    mountains = [];
    let mx = 0;
    while (mx < W + 200) {
      const w = 180 + Math.random() * 160;
      mountains.push({ x: mx, w, h: 120 + Math.random() * 100, hue: 280 + Math.random() * 40 });
      mx += w * 0.6;
    }
    buildings = [];
    let bx = 0;
    while (bx < W + 200) {
      const w = 50 + Math.random() * 80;
      buildings.push({
        x: bx,
        w,
        h: 80 + Math.random() * 180,
        windows: Math.random() > 0.3,
        seed: (Math.random() * 0x7fffffff) | 0
      });
      bx += w + 8;
    }
    nebula = [];
    for (let i = 0; i < 4; i++) {
      nebula.push({
        x: Math.random() * (W + 200) - 100,
        y: 40 + Math.random() * (GROUND - 200),
        r: 130 + Math.random() * 130,
        tint: i % 2,
        tw: Math.random() * Math.PI * 2
      });
    }
    shootingStars = [];
    // Foreground light shafts — tall, soft, fast parallax, pass in front
    fgShafts = [];
    let fx = Math.random() * 400;
    while (fx < W + 500) {
      fgShafts.push({ x: fx, w: 24 + Math.random() * 46 });
      fx += 280 + Math.random() * 320;
    }
    // Foreground dust motes — closest layer, gentle float
    fgMotes = [];
    for (let i = 0; i < 18; i++) {
      fgMotes.push({
        x: Math.random() * W,
        y: Math.random() * H,
        r: 1 + Math.random() * 2.4,
        sp: 1.3 + Math.random() * 1.2,
        tw: Math.random() * Math.PI * 2
      });
    }
  }
  initParallax();

  // ---------- Dynamic weather (per level) ----------
  let weatherP = [];
  let lightningFrame = -1000;
  let lightningBolt = null;
  // Build a jagged bolt polyline (with a couple of forked branches) from a
  // random sky point down toward the horizon — regenerated on each strike.
  function makeBolt() {
    const x0 = W * (0.2 + Math.random() * 0.6);
    const segs = 7 + Math.floor(Math.random() * 4);
    const endY = GROUND - 20 - Math.random() * 60;
    const main = [{ x: x0, y: -10 }];
    let x = x0, y = -10;
    const step = (endY + 10) / segs;
    for (let i = 1; i <= segs; i++) {
      y += step;
      x += (Math.random() - 0.5) * 70;
      main.push({ x, y });
    }
    const branches = [];
    for (let b = 0; b < 2; b++) {
      const start = main[2 + Math.floor(Math.random() * (main.length - 3))];
      let bx = start.x, by = start.y;
      const bpts = [{ x: bx, y: by }];
      const bn = 2 + Math.floor(Math.random() * 3);
      for (let i = 0; i < bn; i++) {
        bx += (Math.random() - 0.5) * 60;
        by += 25 + Math.random() * 30;
        bpts.push({ x: bx, y: by });
      }
      branches.push(bpts);
    }
    lightningBolt = { main, branches };
  }
  function initWeather() {
    weatherP = [];
    const w = palette.weather;
    if (!w || w === 'none') return;
    const count = w === 'rain' ? 70 : w === 'snow' ? 55 : w === 'embers' ? 40 : w === 'leaves' ? 26 : 34;
    for (let i = 0; i < count; i++) {
      weatherP.push({
        x: Math.random() * W,
        y: Math.random() * H,
        ph: Math.random() * Math.PI * 2,
        sz: Math.random()
      });
    }
  }
  function updateWeather() {
    const w = palette.weather;
    if (!w || w === 'none') return;
    for (const p of weatherP) {
      p.ph += 0.05;
      if (w === 'rain') {
        p.x -= 4 + speed * 0.3; p.y += 16;
        if (p.y > H) { p.y = -10; p.x = Math.random() * (W + 100); }
        if (p.x < -20) p.x += W + 40;
      } else if (w === 'snow') {
        p.x -= 0.6 + Math.sin(p.ph) * 0.8; p.y += 1.4 + p.sz;
        if (p.y > H) { p.y = -8; p.x = Math.random() * W; }
        if (p.x < -8) p.x = W + 8;
      } else if (w === 'embers') {
        p.x -= 0.4 + Math.sin(p.ph) * 0.6; p.y -= 1.3 + p.sz * 1.2;
        if (p.y < -10) { p.y = H + 8; p.x = Math.random() * W; }
        if (p.x < -8) p.x = W + 8;
      } else if (w === 'leaves') {
        p.x -= 1 + Math.sin(p.ph) * 1.4; p.y += 0.9 + Math.cos(p.ph * 0.7) * 0.5;
        if (p.y > H) { p.y = -10; p.x = Math.random() * W; }
        if (p.x < -12) p.x = W + 12;
      } else if (w === 'dust') {
        p.x -= 0.5 + speed * 0.15; p.y += Math.sin(p.ph) * 0.3;
        if (p.x < -8) { p.x = W + 8; p.y = Math.random() * H; }
      }
    }
    // Lightning on rain levels — also fire a thunder rumble + sky bolt
    if (w === 'rain' && Math.random() < 0.004) {
      lightningFrame = frame;
      makeBolt();
      if (audio.thunder) audio.thunder();
    }
  }
  function drawWeather() {
    const w = palette.weather;
    if (!w || w === 'none' || !weatherP.length) return;
    if (w === 'rain') {
      ctx.strokeStyle = 'rgba(150, 200, 255, 0.35)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (const p of weatherP) {
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - 4, p.y + 14);
      }
      ctx.stroke();
    } else if (w === 'snow') {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
      for (const p of weatherP) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 1.4 + p.sz * 1.8, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (w === 'embers') {
      for (const p of weatherP) {
        const a = 0.4 + Math.sin(p.ph) * 0.3;
        ctx.fillStyle = 'rgba(255, ' + Math.floor(120 + p.sz * 80) + ', 40, ' + a + ')';
        ctx.beginPath();
        ctx.arc(p.x, p.y, 1.2 + p.sz * 2, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (w === 'leaves') {
      for (const p of weatherP) {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.ph);
        ctx.fillStyle = 'rgba(' + Math.floor(120 + p.sz * 80) + ', 220, 120, 0.7)';
        ctx.beginPath();
        ctx.ellipse(0, 0, 4 + p.sz * 3, 2 + p.sz * 1.5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    } else if (w === 'dust') {
      ctx.fillStyle = 'rgba(255, 225, 150, 0.25)';
      for (const p of weatherP) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 1 + p.sz * 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // Lightning — full-sky flash + a glowing jagged bolt that flickers out
    const la = frame - lightningFrame;
    if (la >= 0 && la < 12) {
      // Double-flash: bright on strike, a dim echo a few frames later
      const flash = la < 4 ? (1 - la / 4) : (la < 7 ? 0 : 0.5 * (1 - (la - 7) / 5));
      if (flash > 0) {
        ctx.fillStyle = 'rgba(200, 220, 255, ' + (0.45 * flash) + ')';
        ctx.fillRect(0, 0, W, H);
      }
      if (lightningBolt && la < 8) {
        const k = 1 - la / 8;
        ctx.save();
        ctx.shadowColor = 'rgba(180,210,255,' + k + ')';
        ctx.shadowBlur = 18;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        const draw = (pts, wMul) => {
          ctx.beginPath();
          ctx.moveTo(pts[0].x, pts[0].y);
          for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
          ctx.stroke();
          void wMul;
        };
        // Outer cyan glow stroke
        ctx.strokeStyle = 'rgba(120,200,255,' + (0.5 * k) + ')';
        ctx.lineWidth = 6;
        draw(lightningBolt.main);
        for (const b of lightningBolt.branches) { ctx.lineWidth = 3; draw(b); }
        // Bright white core
        ctx.shadowBlur = 8;
        ctx.strokeStyle = 'rgba(255,255,255,' + (0.95 * k) + ')';
        ctx.lineWidth = 2.2;
        draw(lightningBolt.main);
        ctx.strokeStyle = 'rgba(235,245,255,' + (0.7 * k) + ')';
        ctx.lineWidth = 1.2;
        for (const b of lightningBolt.branches) draw(b);
        ctx.restore();
      }
    }
  }
  initWeather();

  function reset() {
    gravity = BASE_GRAVITY; // clear any LOW-G set-piece leftover from a prior run
    player.x = 110;
    player.y = GROUND - player.h;
    player.vy = 0;
    player.onGround = true;
    player.jumps = 0;
    player.rot = 0;
    player.sliding = false;
    player.slideT = 0;
    player.trail = [];
    pendingJump = false;
    ptrDown = false;
    obstacles = [];
    coinsArr = [];
    meteors = [];
    particles = [];
    rings = [];
    scrollX = 0;
    speed = baseSpeed;
    score = 0;
    dist = 0;
    runCoins = 0;
    frame = 0;
    nextObstacleAt = 60;
    nextCoinAt = 90;
    nextPowerupAt = 600;
    nextMysteryAt = 1800;
    mysteryBoxes = [];
    setpiece = null;
    setpieceCount = 0;
    nextSetpieceAt = 1800;
    shake = 0;
    lastJumpFrame = -100;
    inputGraceUntil = 4;
    groundRoll = 0;
    airframes = 0;
    runMaxCombo = 0;
    runNearMisses = 0;
    runAirBonus = 0;
    runXpBanked = 0;
    recordBrokenThisRun = false;
    nextScoreMilestone = 2500;
    levelIdx = 0;
    palette = LEVELS[0];
    skyGradient = null;
    skyGradientH = -1;
    combo = 0;
    lastCoinFrame = -1000;
    lastCoinX = 0; lastCoinY = 0;
    coinChains = [];
    powerups = [];
    springs = [];
    // COSMIC skin: kick off the run with a free magnet window
    magnetFrames = 60 * perkVal('magnet');
    phaseFrames = 0;
    phaseStreak = 0;
    shieldActive = false;
    sprintFrames = 0;
    timewarpFrames = 0;
    shieldFlashFrame = -1000;
    invincibleUntil = -1;
    reviveUsed = false;
    feverMeter = 0;
    feverActive = false;
    feverFrames = 0;
    if (music.setIntense) music.setIntense(false);
    updateFeverUI();
    updatePowerHud();
    updateRecordProgress();
    texts = [];
    slowmoFrames = 0;
    flashFrame = -1000;
    glitchFrame = -1000;
    levelWarpFrame = -1000;
    slamFlash = -1000;
    slamCracks = [];
    zoomPunch = 0;
    landBounce = 0;
    scoreEl.textContent = '0';
    coinsEl.textContent = totalCoins;
    if (levelEl) levelEl.textContent = palette.name;
    setComboUI('');
    if (titleSubEl) titleSubEl.textContent = dailyMode ? 'DAILY · ' + todayStr() : '';
    initParallax();
    initWeather();
  }

  function jump() {
    if (state !== STATE.PLAY) return;
    if (frame < inputGraceUntil) return;
    if (frame - lastJumpFrame < 3) return;
    if (player.jumps >= player.maxJumps) return;
    lastJumpFrame = frame;
    // Slide-bounce: jumping out of a grounded slide launches higher (skill tech)
    const slideBoost = (player.sliding && player.onGround && player.slideT > 0.4) ? 1.28 : 1;
    player.vy = jumpV * (player.jumps === 0 ? 1 : 0.85) * slideBoost;
    player.onGround = false;
    player.jumps++;
    if (slideBoost > 1) { player.sliding = false; audio.djump(); }
    else if (player.jumps === 1) audio.jump(); else audio.djump();
    if (player.jumps === 1) unlock('first_jump');
    const jumpColor = slideBoost > 1 ? '#ffe14a' : (player.jumps === 1 ? '#19f0ff' : '#ff3df0');
    const burst = slideBoost > 1 ? 18 : 10;
    if (slideBoost > 1) popText('BOOST!', player.x + player.w / 2, player.y, '#ffe14a', 1.1);
    for (let i = 0; i < burst; i++) {
      pushParticle(
        player.x + player.w / 2,
        player.y + player.h,
        (Math.random() - 0.5) * (slideBoost > 1 ? 6 : 4),
        Math.random() * 3 + 1,
        24, jumpColor, Math.random() * 3 + 1
      );
    }
    // Quick launch ring at the feet — sells the upward push, scales with the
    // jump type (regular / double / slide-bounce boost).
    const ringRGB = slideBoost > 1 ? '255,225,74'
                  : player.jumps === 1 ? '120,230,255'
                  :                      '255,80,220';
    addRing(player.x + player.w / 2, player.y + player.h, slideBoost > 1 ? 60 : 40, ringRGB, 14);
  }

  function startGame() {
    overlay.classList.remove('show');
    gameoverEl.classList.remove('show');
    const ss = document.getElementById('shopOverlay'); if (ss) ss.classList.remove('show');
    const mm = document.getElementById('missionsOverlay'); if (mm) mm.classList.remove('show');
    const st = document.getElementById('statsOverlay'); if (st) st.classList.remove('show');
    const bn = document.getElementById('bottomNav'); if (bn) bn.classList.remove('show');
    if (doubleCoinsBtn) { doubleCoinsBtn.disabled = false; doubleCoinsBtn.style.display = ''; }
    reset();
    state = STATE.PLAY;
    music.start(0);
    // Tutorial: show once for new players (flag set first to avoid retrigger on reload)
    if (tutorialEl && readLS(SK.tutorial, '0') !== '1') {
      writeLS(SK.tutorial, '1');
      tutorialEl.classList.add('show');
      setTimeout(() => tutorialEl.classList.remove('show'), 2400);
    }
  }

  function gameOver() {
    state = STATE.OVER;
    score = Math.floor(score);
    shake = 18;
    zoomPunch = 0.09;
    music.stop();
    if (music.setIntense) music.setIntense(false); // don't leak OVERDRIVE intensity into menu ambience
    audio.hit();
    setTimeout(() => audio.over(), 220);
    if (navigator.vibrate) { try { navigator.vibrate([40, 60, 90]); } catch (_) {} }
    let newRecord = false;
    let goalMsg = '';
    if (dailyMode) {
      if (score > dailyBest) {
        dailyBest = score;
        writeLS(SK.dailyBest, dailyBest);
        newRecord = true;
        if (typeof refreshDailyBtnLabel === 'function') refreshDailyBtnLabel();
      }
    } else {
      if (score > best) {
        const prevBest = best;
        best = score;
        writeLS(SK.best, best);
        bestEl.textContent = best;
        newRecord = true;
        if (prevBest > 0) goalMsg = '+' + (score - prevBest) + ' peste recordul anterior!';
      } else if (best > 0) {
        const diff = best - score;
        if (diff <= 50) goalMsg = 'Atât de aproape! ' + diff + ' până la record';
        else if (score > best * 0.8) goalMsg = 'Aproape de record (' + diff + ' rămase)';
        else if (score > best * 0.5) goalMsg = best + ' este recordul tău';
      }
      // Themed superlatives — only fire when there's no record-themed message
      // already in flight, so the most important news wins the slot.
      if (!goalMsg) {
        if (runMaxCombo >= 30) goalMsg = '🔥 LEGENDARY combo ' + runMaxCombo + '!';
        else if (runMaxCombo >= 20) goalMsg = '🔥 Imparabil! Combo ' + runMaxCombo;
        else if (runNearMisses >= 8) goalMsg = '💀 ' + runNearMisses + ' near-miss — sânge rece';
        else if (runAirBonus >= 200) goalMsg = '🚀 Aerian! +' + runAirBonus + ' bonus zbor';
      }
    }
    const goalEl = document.getElementById('goalMsg');
    if (goalEl) goalEl.textContent = goalMsg;
    const recordBadge = document.getElementById('recordBadge');
    if (recordBadge) recordBadge.style.display = newRecord ? 'block' : 'none';
    if (newRecord) {
      // confetti-like celebration particles
      for (let i = 0; i < 60; i++) {
        const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.2;
        const v = Math.random() * 10 + 4;
        pushParticle(
          W / 2 + (Math.random() - 0.5) * 100,
          GROUND - 100,
          Math.cos(a) * v, Math.sin(a) * v,
          80,
          ['#ffe14a', '#19f0ff', '#ff3df0', '#fff'][i % 4],
          Math.random() * 3 + 2
        );
      }
      audio.levelup();
    }
    // Animate score reveal
    if (finalScoreEl) {
      let cur = 0;
      const total = score;
      const dur = Math.min(1400, 350 + total * 0.4);
      const startT = performance.now();
      clearInterval(finalScoreEl._timer);
      finalScoreEl.textContent = '0';
      finalScoreEl._timer = setInterval(() => {
        const t = Math.min(1, (performance.now() - startT) / dur);
        const eased = 1 - Math.pow(1 - t, 3);
        cur = Math.floor(total * eased);
        finalScoreEl.textContent = cur;
        if (t >= 1) { clearInterval(finalScoreEl._timer); finalScoreEl.textContent = total; }
      }, 32);
    }
    // Track death score for dynamic difficulty
    deathScores.push(score);
    if (deathScores.length > 10) deathScores.shift();
    writeLS(SK.deathScores, JSON.stringify(deathScores));
    totalRuns++;
    writeLS(SK.runs, totalRuns);
    const earned = runCoins;
    totalCoins += runCoins;
    runCoins = 0;
    writeLS(SK.coins, totalCoins);
    coinsEl.textContent = totalCoins;
    awardXP(score - runXpBanked); // only the new portion since any prior revive
    runXpBanked = score;          // so a revived run never double-credits XP
    finalScoreEl.textContent = score;
    finalBestEl.textContent = best;
    finalCoinsEl.textContent = '+' + earned;
    // Per-run breakdown (combo, near-miss, air-time bonus) shown when meaningful
    const rb = document.getElementById('runBreakdown');
    if (rb) {
      const meaningful = runMaxCombo > 0 || runNearMisses > 0 || runAirBonus > 0;
      rb.style.display = meaningful ? 'flex' : 'none';
      const c = document.getElementById('rbCombo'); if (c) c.textContent = 'x' + runMaxCombo;
      const n = document.getElementById('rbNm');    if (n) n.textContent = runNearMisses;
      const a = document.getElementById('rbAir');   if (a) a.textContent = '+' + runAirBonus;
    }
    if (reviveBtn) reviveBtn.style.display = reviveUsed ? 'none' : 'inline-block';
    if (doubleCoinsBtn) { doubleCoinsBtn.disabled = false; doubleCoinsBtn.style.display = earned > 0 ? '' : 'none'; }
    missionEvent('gameover', score);
    updateShopBadge();
    setTimeout(() => {
      gameoverEl.classList.add('show');
      const bn = document.getElementById('bottomNav'); if (bn) bn.classList.add('show');
    }, 280);
    maybeShowInterstitial();
    const expColors = ['#ff3df0', '#19f0ff', '#ffe14a'];
    for (let i = 0; i < 40; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = Math.random() * 8 + 2;
      pushParticle(
        player.x + player.w / 2,
        player.y + player.h / 2,
        Math.cos(a) * v, Math.sin(a) * v,
        50, expColors[i % 3], Math.random() * 4 + 2
      );
    }
  }

  // ---------- Input ----------
  // Tap = jump · Swipe down = slide. On the ground the jump is deferred a few
  // frames so the start of a swipe-down isn't mistaken for a tap (no phantom hop).
  let ptrDown = false;
  let ptrStartY = 0;
  let gestureConsumed = false;
  let pendingJump = false;
  let pendingJumpFrame = 0;
  const JUMP_DEFER = 3; // frames (~50ms) to disambiguate tap vs swipe
  function startSlide() {
    if (state !== STATE.PLAY) return;
    player.sliding = true;
  }
  function endSlide() {
    player.sliding = false;
  }
  function onPointerDown(e) {
    if (e.cancelable) e.preventDefault();
    audio.resume();
    if (state !== STATE.PLAY) return;
    // A new touch means any still-pending jump was definitely a tap — commit it.
    if (pendingJump) { pendingJump = false; jump(); }
    ptrDown = true;
    gestureConsumed = false;
    ptrStartY = e.clientY || 0;
    if (player.onGround) {
      // Defer briefly to tell a tap from the start of a swipe-down
      pendingJump = true;
      pendingJumpFrame = frame;
    } else {
      jump(); // airborne: double-jump fires instantly
    }
  }
  function onPointerMove(e) {
    if (!ptrDown || gestureConsumed || state !== STATE.PLAY) return;
    const dy = (e.clientY || 0) - ptrStartY;
    if (dy > 30) {
      // Swipe down → slide. Cancel the pending hop (ground) / abort an air-hop.
      pendingJump = false;
      if (frame - lastJumpFrame <= 9 && player.vy < 0) player.vy = 7;
      startSlide();
      gestureConsumed = true;
    }
  }
  function onPointerUp() {
    ptrDown = false;
    endSlide();
  }
  canvas.addEventListener('pointerdown', onPointerDown, { passive: false });
  canvas.addEventListener('pointermove', onPointerMove, { passive: false });
  window.addEventListener('pointerup', onPointerUp, { passive: false });
  window.addEventListener('pointercancel', onPointerUp, { passive: false });
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' || e.code === 'ArrowUp') {
      e.preventDefault();
      if (e.repeat) return;
      if (state === STATE.MENU) startGame();
      else if (state === STATE.OVER) startGame();
      else jump();
    } else if (e.code === 'ArrowDown') {
      e.preventDefault();
      startSlide();
    }
  });
  window.addEventListener('keyup', (e) => {
    if (e.code === 'ArrowDown') endSlide();
  });
  // Bottom navigation
  document.querySelectorAll('.nav-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      audio.resume();
      const screen = btn.getAttribute('data-screen');
      showScreen(screen);
    });
  });
  const bottomNav = document.getElementById('bottomNav');
  if (bottomNav) bottomNav.classList.add('show');
  updateMissionsBadge();
  updateShopBadge();

  // 2x coins rewarded ad
  const doubleCoinsBtn = document.getElementById('doubleCoinsBtn');
  if (doubleCoinsBtn) doubleCoinsBtn.addEventListener('click', () => {
    audio.resume();
    if (doubleCoinsBtn.disabled) return;
    doubleCoinsBtn.disabled = true;
    doubleCoinsBtn.style.display = 'none';
    const earned = parseInt((finalCoinsEl.textContent || '+0').replace(/[^0-9]/g, ''), 10) || 0;
    showRewardedAd(() => {
      totalCoins += earned;
      writeLS(SK.coins, totalCoins);
      coinsEl.textContent = totalCoins;
      finalCoinsEl.textContent = '+' + (earned * 2);
      audio.power();
      popText('+' + earned + ' BONUS', W / 2, GROUND - 240, '#ffe14a', 1.4);
      showToast('🎉 +' + earned + ' ★', 'Stele dublate');
    });
  });

  startBtn.addEventListener('click', () => { audio.resume(); dailyMode = false; dailyRng = null; startGame(); });
  retryBtn.addEventListener('click', () => {
    audio.resume();
    // Exit daily mode when retrying — daily is one-shot per day
    if (dailyMode) { dailyMode = false; dailyRng = null; }
    startGame();
  });

  // Share button — Web Share API on supported browsers, clipboard fallback
  const shareBtn = document.getElementById('shareBtn');
  if (shareBtn) shareBtn.addEventListener('click', async () => {
    audio.resume();
    const txt = '🌌 Am făcut ' + score + ' puncte în Glitch Run! Poți să mă bați?';
    // Prefer the native share sheet when available. Treat ANY resolution of
    // navigator.share (success or user-cancel via AbortError) as terminal —
    // we must NOT fall through to clipboard, or cancelling the dialog will
    // silently overwrite the clipboard and falsely toast 'Copiat!'.
    if (navigator.share) {
      try { await navigator.share({ title: 'Glitch Run', text: txt, url: location.href }); }
      catch (_) { /* user cancelled or share failed — respect it, do nothing */ }
      return;
    }
    try {
      await navigator.clipboard.writeText(txt + ' ' + location.href);
      showToast('Copiat!', 'Scorul tău e în clipboard — lipește unde vrei');
    } catch (_) { showToast('Hmm', 'Browser-ul tău nu permite share automat'); }
  });

  const muteBtn = document.getElementById('muteBtn');
  const pauseBtn = document.getElementById('pauseBtn');
  const levelEl = document.getElementById('level');
  const comboEl = document.getElementById('combo');
  const comboTextEl = document.getElementById('comboText');
  const comboFillEl = document.getElementById('comboFill');
  const feverBarEl = document.getElementById('feverBar');
  const feverFillEl = document.getElementById('feverFill');
  const pwMagnetEl = document.getElementById('pwMagnet');
  const pwShieldEl = document.getElementById('pwShield');
  const pwSprintEl = document.getElementById('pwSprint');
  const pwPhaseEl = document.getElementById('pwPhase');
  const pwTimewarpEl = document.getElementById('pwTimewarp');
  const recordBadgeEl = bestEl ? bestEl.closest('.badge') : null;
  const recProgFillEl = document.getElementById('recProgFill');
  function updateRecordProgress() {
    if (!recProgFillEl || !recordBadgeEl) return;
    if (dailyMode || best <= 0 || state !== STATE.PLAY) {
      recProgFillEl.style.transform = 'scaleX(0)';
      recordBadgeEl.classList.remove('close');
      return;
    }
    const ratio = Math.min(1, score / best);
    recProgFillEl.style.transform = 'scaleX(' + ratio + ')';
    recordBadgeEl.classList.toggle('close', ratio > 0.85 && ratio <= 0.95);
    recordBadgeEl.classList.toggle('imminent', ratio > 0.95 && ratio < 1);
  }
  function updatePowerHud() {
    if (pwMagnetEl) {
      const on = magnetFrames > 0;
      pwMagnetEl.classList.toggle('hidden', !on);
      if (on) {
        const f = pwMagnetEl.querySelector('.pf');
        if (f) f.style.transform = 'scaleX(' + Math.min(1, magnetFrames / (60 * 8)) + ')';
      }
    }
    if (pwShieldEl) pwShieldEl.classList.toggle('hidden', !shieldActive);
    if (pwSprintEl) {
      const on = sprintFrames > 0;
      pwSprintEl.classList.toggle('hidden', !on);
      if (on) {
        const f = pwSprintEl.querySelector('.pf');
        if (f) f.style.transform = 'scaleX(' + Math.min(1, sprintFrames / (60 * 5)) + ')';
      }
    }
    if (pwPhaseEl) {
      const on = phaseFrames > 0;
      pwPhaseEl.classList.toggle('hidden', !on);
      if (on) {
        const f = pwPhaseEl.querySelector('.pf');
        if (f) f.style.transform = 'scaleX(' + Math.min(1, phaseFrames / (60 * 5)) + ')';
      }
    }
    if (pwTimewarpEl) {
      const on = timewarpFrames > 0;
      pwTimewarpEl.classList.toggle('hidden', !on);
      if (on) {
        const f = pwTimewarpEl.querySelector('.pf');
        if (f) f.style.transform = 'scaleX(' + Math.min(1, timewarpFrames / (60 * 5)) + ')';
      }
    }
  }
  function setComboUI(text) {
    if (comboTextEl) comboTextEl.textContent = text || '';
    if (comboEl) comboEl.classList.toggle('hidden', !text);
  }
  const reviveBtn = document.getElementById('reviveBtn');
  const adOverlay = document.getElementById('adOverlay');
  const adCountdown = document.getElementById('adCountdown');
  const dailyBtn = document.getElementById('dailyBtn');
  const tutorialEl = document.getElementById('tutorial');
  const toastEl = document.getElementById('toast');
  const titleSubEl = document.getElementById('runTitle');
  function refreshMuteIcon() { if (muteBtn) muteBtn.textContent = audio.isMuted() ? '🔇' : '🔊'; }
  refreshMuteIcon();
  if (muteBtn) muteBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    audio.resume();
    const m = audio.toggle();
    music.setMuted(m);
    refreshMuteIcon();
  });
  // Apply persisted mute to music engine at boot
  music.setMuted(audio.isMuted());
  if (pauseBtn) pauseBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (state === STATE.PLAY) { state = STATE.PAUSED; pauseBtn.textContent = '▶'; music.pause(); }
    else if (state === STATE.PAUSED) { state = STATE.PLAY; pauseBtn.textContent = '⏸'; inputGraceUntil = frame + 2; music.resumePlay(); }
  });

  // Show daily streak banner on menu if a reward was processed at load
  if (streakInfo) {
    const sb = document.getElementById('streakBanner');
    const sd = document.getElementById('streakDay');
    const sn = document.getElementById('streakNum');
    const sr = document.getElementById('streakReward');
    if (sb && sd && sn && sr) {
      sd.textContent = streakInfo.day;
      sn.textContent = streakInfo.day;
      sr.textContent = streakInfo.reward;
      sb.style.display = 'flex';
      coinsEl.textContent = totalCoins;
    }
  }

  if (dailyBtn) dailyBtn.addEventListener('click', () => {
    audio.resume();
    dailyMode = true;
    dailyRng = makeRng('glitchrun-daily-' + todayStr());
    startGame();
  });
  // Surface today's daily best directly on the button so players see their bar
  function refreshDailyBtnLabel() {
    if (!dailyBtn) return;
    dailyBtn.innerHTML = dailyBest > 0
      ? '⚡ DAILY CHALLENGE<span class="daily-best">Cel mai bun azi: ' + dailyBest + '</span>'
      : '⚡ DAILY CHALLENGE';
  }
  refreshDailyBtnLabel();

  if (reviveBtn) reviveBtn.addEventListener('click', () => {
    audio.resume();
    if (reviveUsed) return;
    if (!adOverlay) { doRevive(); return; }
    gameoverEl.classList.remove('show');
    adOverlay.classList.add('show');
    let secs = 5;
    if (adCountdown) adCountdown.textContent = secs;
    const tick = setInterval(() => {
      secs--;
      if (adCountdown) adCountdown.textContent = secs;
      if (secs <= 0) {
        clearInterval(tick);
        adOverlay.classList.remove('show');
        audio.resume();
        doRevive();
      }
    }, 1000);
  });

  function doRevive() {
    reviveUsed = true;
    feverActive = false;
    feverMeter = 0;
    feverFrames = 0;
    if (music.setIntense) music.setIntense(false);
    updateFeverUI();
    obstacles = obstacles.filter((o) => o.x > W * 0.55);
    powerups = powerups.filter((p) => p.x > W * 0.55);
    springs = springs.filter((s) => s.x > W * 0.55);
    player.y = GROUND - player.h - 40;
    player.vy = -8;
    player.jumps = 0;
    player.onGround = false;
    invincibleUntil = frame + 120;
    inputGraceUntil = frame + 10;
    slowmoFrames = 30;
    flashFrame = frame;
    shake = 6;
    if (reviveBtn) reviveBtn.style.display = 'none';
    state = STATE.PLAY;
    music.start(levelIdx);
    audio.power();
    popText('REVIVED!', player.x + player.w / 2, GROUND - 200, '#19f0ff', 1.4);
    unlock('revive');
  }

  // ---------- Spawning ----------
  // One obstacle by type at a given x (used by the pattern spawner)
  function makeObstacle(t, x) {
    if (t === 'spike')   obstacles.push({ type: t, x, y: GROUND - 30, w: 36, h: 30 });
    else if (t === 'block')   obstacles.push({ type: t, x, y: GROUND - 44, w: 44, h: 44 });
    else if (t === 'tall')    obstacles.push({ type: t, x, y: GROUND - 80, w: 32, h: 80 });
    else if (t === 'flying')  obstacles.push({ type: t, x, y: GROUND - 140, w: 56, h: 32, baseY: GROUND - 140, bobAmp: 18 + rnd() * 12, bobPh: rnd() * 6.28, bobSp: 0.05 + rnd() * 0.02 });
    else if (t === 'overhang')obstacles.push({ type: t, x, y: GROUND - 80, w: 46, h: 50 });
  }

  // Telegraphed, hand-designed obstacle PATTERNS — fair & learnable, not random.
  // dx = pixel offset within the pattern; `coins` = optional reward arc above.
  // minScore gates complexity so the run teaches before it tests.
  const PATTERNS = [
    { id: 'single',     minScore: 0,    span: 0,   obs: [{ t: 'spike', dx: 0 }] },
    { id: 'block',      minScore: 0,    span: 0,   obs: [{ t: 'block', dx: 0 }] },
    { id: 'tall',       minScore: 120,  span: 0,   obs: [{ t: 'tall', dx: 0 }] },
    { id: 'flyer',      minScore: 180,  span: 0,   obs: [{ t: 'flying', dx: 0 }] },
    { id: 'double',     minScore: 240,  span: 150, obs: [{ t: 'spike', dx: 0 }, { t: 'spike', dx: 150 }] },
    { id: 'overhang',   minScore: 300,  span: 0,   obs: [{ t: 'overhang', dx: 0 }], coins: { dx: 0, lowArc: true } },
    { id: 'jump_slide', minScore: 420,  span: 230, obs: [{ t: 'spike', dx: 0 }, { t: 'overhang', dx: 230 }] },
    { id: 'slide_jump', minScore: 520,  span: 230, obs: [{ t: 'overhang', dx: 0 }, { t: 'spike', dx: 230 }] },
    { id: 'stairs',     minScore: 640,  span: 200, obs: [{ t: 'block', dx: 0 }, { t: 'tall', dx: 200 }], coins: { dx: 100, arc: true } },
    { id: 'corridor',   minScore: 900,  span: 440, obs: [{ t: 'spike', dx: 0 }, { t: 'overhang', dx: 220 }, { t: 'spike', dx: 440 }] },
    { id: 'flyer_run',  minScore: 1100, span: 320, obs: [{ t: 'flying', dx: 0 }, { t: 'spike', dx: 320 }], coins: { dx: 0, midArc: true } },
    { id: 'gauntlet3',  minScore: 1500, span: 560, obs: [{ t: 'overhang', dx: 0 }, { t: 'spike', dx: 230 }, { t: 'overhang', dx: 440 }, { t: 'spike', dx: 560 }] },
    // Extra variety — all telegraphed with proven, clearable spacing.
    { id: 'triple_hop', minScore: 700,  span: 320, obs: [{ t: 'spike', dx: 0 }, { t: 'spike', dx: 160 }, { t: 'spike', dx: 320 }], coins: { dx: 80, arc: true } },
    { id: 'double_slide', minScore: 820, span: 300, obs: [{ t: 'overhang', dx: 0 }, { t: 'overhang', dx: 300 }], coins: { dx: 0, lowArc: true } },
    { id: 'flyer_pair', minScore: 1000, span: 360, obs: [{ t: 'flying', dx: 0 }, { t: 'flying', dx: 360 }], coins: { dx: 120, lowArc: true } },
    { id: 'weave',      minScore: 1300, span: 680, obs: [{ t: 'spike', dx: 0 }, { t: 'overhang', dx: 220 }, { t: 'spike', dx: 440 }, { t: 'overhang', dx: 680 }] },
    // Spike field — clear it spike-by-spike, or jump high and Dive-Slam the cluster
    { id: 'spike_field', minScore: 1600, span: 200, obs: [{ t: 'spike', dx: 0 }, { t: 'spike', dx: 100 }, { t: 'spike', dx: 200 }], coins: { dx: 60, arc: true } },
    // Late-game variety — escalating heights, sustained slides, flyer weaves.
    { id: 'stair_up',   minScore: 1800, span: 340, obs: [{ t: 'spike', dx: 0 }, { t: 'block', dx: 160 }, { t: 'tall', dx: 340 }], coins: { dx: 80, arc: true } },
    { id: 'flyer_weave', minScore: 1900, span: 540, obs: [{ t: 'flying', dx: 0 }, { t: 'spike', dx: 180 }, { t: 'flying', dx: 360 }, { t: 'spike', dx: 540 }], coins: { dx: 60, arc: true } },
    { id: 'slide_run',  minScore: 2100, span: 600, obs: [{ t: 'overhang', dx: 0 }, { t: 'overhang', dx: 200 }, { t: 'overhang', dx: 400 }, { t: 'spike', dx: 600 }], coins: { dx: 0, lowArc: true } },
    // Even-later variety: dense weaves, sky-walls, and a spring escape.
    { id: 'sky_wall',   minScore: 2400, span: 280, obs: [{ t: 'tall', dx: 0 }, { t: 'spike', dx: 140 }, { t: 'tall', dx: 280 }], coins: { dx: 60, arc: true } },
    { id: 'flyer_storm', minScore: 2600, span: 720, obs: [{ t: 'flying', dx: 0 }, { t: 'flying', dx: 200 }, { t: 'flying', dx: 400 }, { t: 'flying', dx: 600 }, { t: 'spike', dx: 720 }], coins: { dx: 0, lowArc: true } },
    { id: 'spring_storm', minScore: 2800, span: 460, obs: [{ t: 'overhang', dx: 0 }, { t: 'spike', dx: 460 }], spring: { dx: 180 }, coins: { dx: 180, springArc: true } },
    // Jump-pad patterns — the high coin arcs are only reachable via the spring,
    // so the player has to commit to the launch to claim the reward.
    { id: 'spring_high',  minScore: 400, span: 220, obs: [], spring: { dx: 30 }, coins: { dx: 30, springArc: true } },
    { id: 'spring_dodge', minScore: 900, span: 460, obs: [{ t: 'spike', dx: 460 }], spring: { dx: 30 }, coins: { dx: 30, springArc: true } }
  ];

  // Gem variant chooser — rare colour gems pay out multiplied stars + score.
  // 88% gold star (default), 10% blue (5x), 2% red (10x). Uses the seeded rng
  // so the daily challenge stays fully deterministic.
  function rollGem() {
    const r = rnd();
    const boost = 1 + perkVal('gem'); // SOLAR skin: +50% gem chance
    if (r < 0.02 * boost) return 'red';
    if (r < 0.12 * boost) return 'blue';
    return 'star';
  }
  function gemMult(t) { return t === 'red' ? 10 : t === 'blue' ? 5 : 1; }

  function spawnPattern() {
    const pool = PATTERNS.filter((p) => dist >= p.minScore);
    const p = pool[Math.floor(rnd() * pool.length)];
    const x0 = W + 20;
    for (const o of p.obs) makeObstacle(o.t, x0 + o.dx);
    if (p.spring) springs.push({ x: x0 + p.spring.dx, y: GROUND - 14, w: 60, h: 14, used: 0, t: rnd() * Math.PI * 2 });
    // Optional reward coins woven into the pattern
    if (p.coins) {
      const cx0 = x0 + (p.coins.dx || 0);
      if (p.coins.lowArc) {
        // coins to grab while sliding under the overhang
        for (let i = 0; i < 3; i++) coinsArr.push({ x: cx0 + i * 26, y: GROUND - 22, r: 13, picked: false, type: rollGem(), t: rnd() * 6.28 });
      } else if (p.coins.springArc) {
        // High arc — only reachable after the jump-pad launch
        for (let i = 0; i < 6; i++) {
          coinsArr.push({ x: cx0 + i * 34, y: GROUND - 230 - Math.sin((i / 5) * Math.PI) * 70, r: 13, picked: false, type: rollGem(), t: rnd() * 6.28 });
        }
      } else if (p.coins.arc || p.coins.midArc) {
        const baseY = GROUND - (p.coins.midArc ? 150 : 120);
        for (let i = 0; i < 5; i++) {
          coinsArr.push({ x: cx0 + i * 30, y: baseY - Math.sin((i / 4) * Math.PI) * 50, r: 13, picked: false, type: rollGem(), t: rnd() * 6.28 });
        }
      }
    }
    return p.span; // pixel length of the pattern (0 for singles)
  }

  // Lift a coin (or pickup) so it doesn't spawn inside / next to any obstacle.
  // Since coins & obstacles scroll at the same speed, their relative X is preserved
  // forever — overlap at spawn = overlap forever. We bump Y above the obstacle.
  function avoidObstacleOverlap(item, pad) {
    pad = pad || 4;
    for (let iter = 0; iter < 4; iter++) {
      let shifted = false;
      for (const o of obstacles) {
        const oxL = o.x - pad;
        const oxR = o.x + o.w + pad;
        if (item.x + item.r > oxL && item.x - item.r < oxR) {
          const oyT = o.y - pad;
          const oyB = o.y + o.h + pad;
          if (item.y + item.r > oyT && item.y - item.r < oyB) {
            if (o.type === 'overhang') {
              // Drop into the slide gap below the overhang (collect by sliding)
              item.y = GROUND - item.r - 4;
            } else {
              item.y = Math.max(60, o.y - item.r - 14);
            }
            shifted = true;
          }
        }
      }
      if (!shifted) break;
    }
  }

  function spawnCoin() {
    const pattern = Math.floor(rnd() * 3);
    const baseY = GROUND - 80 - rnd() * 100;
    const batch = [];
    if (pattern === 0) {
      batch.push({ x: W + 30, y: baseY, r: 14, picked: false, type: rollGem(), t: rnd() * Math.PI * 2 });
    } else if (pattern === 1) {
      for (let i = 0; i < 5; i++) {
        const px = W + 30 + i * 36;
        const py = baseY - Math.sin((i / 4) * Math.PI) * 60;
        batch.push({ x: px, y: py, r: 14, picked: false, type: rollGem(), t: rnd() * Math.PI * 2 });
      }
    } else {
      for (let i = 0; i < 4; i++) {
        batch.push({ x: W + 30 + i * 32, y: baseY, r: 14, picked: false, type: rollGem(), t: rnd() * Math.PI * 2 });
      }
    }
    for (const c of batch) {
      avoidObstacleOverlap(c);
      coinsArr.push(c);
    }
  }

  function spawnPowerup() {
    // Weighted pool — PHASE (ghost mode) is the rare, exciting drop.
    // TIME WARP is uncommon: slows the world, hugely empowering at high speed.
    const pool = ['magnet', 'magnet', 'shield', 'shield', 'sprint', 'sprint', 'phase', 'timewarp'];
    const t = pool[Math.floor(rnd() * pool.length)];
    const p = {
      type: t,
      x: W + 30,
      y: GROUND - 100 - rnd() * 60,
      r: 22,
      t: 0,
      picked: false
    };
    avoidObstacleOverlap(p, 8);
    powerups.push(p);
  }

  function tryLevelUp() {
    const target = Math.min(LEVELS.length - 1, Math.floor(dist / LEVEL_SCORE));
    if (target !== levelIdx) {
      levelIdx = target;
      palette = LEVELS[levelIdx];
      skyGradient = null;
      skyGradientH = -1;
      initWeather();
      shake = Math.max(shake, 8);
      popText('LEVEL ' + (levelIdx + 1) + ' · ' + palette.name, W / 2, GROUND - 180, palette.sun, 1.4);
      if (levelEl) levelEl.textContent = palette.name;
      for (let i = 0; i < 30; i++) {
        const a = Math.random() * Math.PI * 2;
        const v = Math.random() * 5 + 2;
        pushParticle(
          player.x + player.w / 2,
          player.y + player.h / 2,
          Math.cos(a) * v, Math.sin(a) * v,
          50, palette.sun, Math.random() * 3 + 1
        );
      }
      audio.levelup && audio.levelup();
      flashFrame = frame;
      levelWarpFrame = frame;
      zoomPunch = Math.max(zoomPunch, 0.08);
      slowmoFrames = Math.max(slowmoFrames, 10); // brief dramatic beat on biome change
      addRing(player.x + player.w / 2, player.y + player.h / 2, 160, palette.accent, 38);
      music.duck();
      missionEvent('level', levelIdx);
      music.setLevel(levelIdx);
      if (palette.prism) {
        // PRISM is the new endgame cap — extra cinematic burst beyond ULTRA's.
        if (!hasAch('prism_biome')) unlock('prism_biome');
        popText('🌈 PRISM — SPECTRUM ZONE 🌈', W / 2, GROUND - 290, '#fff', 1.9);
        addRing(W / 2, GROUND - 180, 360, '255,140,255', 56);
        addRing(W / 2, GROUND - 180, 280, '120,230,255', 48);
        addRing(W / 2, GROUND - 180, 200, '255,225,74',  40);
        addFever(0.30);
        slowmoFrames = Math.max(slowmoFrames, 20);
        for (let i = 0; i < 80; i++) {
          const a = Math.random() * Math.PI * 2;
          const v = Math.random() * 12 + 5;
          const hue = (i * 137) % 360;
          pushParticle(W / 2, GROUND - 160, Math.cos(a) * v, Math.sin(a) * v, 95,
            'hsl(' + hue + ',95%,70%)', Math.random() * 4 + 2);
        }
        if (navigator.vibrate) { try { navigator.vibrate([30, 60, 30, 60, 30, 60, 300]); } catch (_) {} }
      }
      // Final-biome milestone — extra spectacle when the player reaches ULTRA,
      // marking the cap of the level progression. Fires once per level-up, not
      // every frame.
      if (levelIdx === LEVELS.length - 1) {
        popText('✨ ULTRA — BIOM MAX ✨', W / 2, GROUND - 260, '#ff3df0', 1.8);
        addRing(W / 2, GROUND - 160, 320, '255,61,240', 50);
        addRing(W / 2, GROUND - 160, 240, '25,240,255', 42);
        addFever(0.25);
        slowmoFrames = Math.max(slowmoFrames, 16);
        for (let i = 0; i < 60; i++) {
          const a = Math.random() * Math.PI * 2;
          const v = Math.random() * 10 + 4;
          pushParticle(W / 2, GROUND - 140, Math.cos(a) * v, Math.sin(a) * v, 80,
            ['#ff3df0', '#19f0ff', '#ffe14a', '#fff'][i & 3], Math.random() * 4 + 2);
        }
        if (navigator.vibrate) { try { navigator.vibrate([20, 50, 20, 50, 200]); } catch (_) {} }
      }
    }
  }

  // ---------- Precise collision helpers (player is a circle) ----------
  function circleRectHit(cx, cy, cr, rx, ry, rw, rh) {
    const nx = cx < rx ? rx : (cx > rx + rw ? rx + rw : cx);
    const ny = cy < ry ? ry : (cy > ry + rh ? ry + rh : cy);
    const dx = cx - nx, dy = cy - ny;
    return dx * dx + dy * dy < cr * cr;
  }
  function circleEllipseHit(cx, cy, cr, ex, ey, erx, ery) {
    // Minkowski-sum approximation: inflate the ellipse by the circle radius
    const dx = (cx - ex) / (erx + cr);
    const dy = (cy - ey) / (ery + cr);
    return dx * dx + dy * dy <= 1;
  }
  function segDist2(px, py, x1, y1, x2, y2) {
    const vx = x2 - x1, vy = y2 - y1;
    const wx = px - x1, wy = py - y1;
    const len2 = vx * vx + vy * vy || 1;
    let t = (wx * vx + wy * vy) / len2;
    t = t < 0 ? 0 : (t > 1 ? 1 : t);
    const ex = x1 + t * vx - px, ey = y1 + t * vy - py;
    return ex * ex + ey * ey;
  }
  function circleTriHit(cx, cy, cr, ax, ay, bx, by, cx2, cy2) {
    const s = (px, py, qx, qy, rx, ry) => (px - rx) * (qy - ry) - (qx - rx) * (py - ry);
    const d1 = s(cx, cy, ax, ay, bx, by);
    const d2 = s(cx, cy, bx, by, cx2, cy2);
    const d3 = s(cx, cy, cx2, cy2, ax, ay);
    const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
    const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
    if (!(hasNeg && hasPos)) return true; // centre inside triangle
    const r2 = cr * cr;
    return segDist2(cx, cy, ax, ay, bx, by) < r2 ||
           segDist2(cx, cy, bx, by, cx2, cy2) < r2 ||
           segDist2(cx, cy, cx2, cy2, ax, ay) < r2;
  }
  // Test the player circle against one obstacle, using its true drawn shape.
  function obstacleHit(o, cx, cy, cr) {
    if (o.type === 'spike') {
      return circleTriHit(cx, cy, cr, o.x, o.y + o.h, o.x + o.w / 2, o.y, o.x + o.w, o.y + o.h);
    }
    if (o.type === 'flying') {
      return circleEllipseHit(cx, cy, cr, o.x + o.w / 2, o.y + o.h / 2, o.w / 2, o.h / 2);
    }
    return circleRectHit(cx, cy, cr, o.x, o.y, o.w, o.h);
  }

  // ---------- Dive-Slam shockwave ----------
  // Detonates on a committed dive-landing. Shatters nearby low obstacles, but
  // never the one you're touching (that still kills you) — so it rewards a
  // precise landing in the gap, not diving blindly onto hazards.
  let slamFlash = -1000;
  let slamCracks = []; // lingering ground-crack marks where slams landed
  function doDiveSlam(power) {
    const cx = player.x + player.w / 2;
    const cyP = player.y + player.h / 2;
    const pr = player.w / 2;
    const R = Math.min(170, 92 + power * 3) * (1 + perkVal('slam')); // TITAN skin widens the wave
    let destroyed = 0;
    for (const o of obstacles) {
      if (o.x < -100) continue;
      // Only ground-level hazards are shatterable; flyers/overhangs are immune.
      if (o.type !== 'spike' && o.type !== 'block') continue;
      const ocx = o.x + o.w / 2;
      if (Math.abs(ocx - cx) > R) continue;
      // Spare anything the orb is currently overlapping — that one still kills.
      if (obstacleHit(o, cx, cyP, pr + 2)) continue;
      o.x = -9999; // remove from play
      destroyed++;
      const dcol = o.type === 'spike' ? '255,61,110' : '255,177,61';
      for (let i = 0; i < 12; i++) {
        const a = Math.random() * Math.PI - Math.PI; // upward fan
        const v = 2 + Math.random() * 5;
        pushParticle(ocx, o.y + o.h / 2, Math.cos(a) * v, Math.sin(a) * v - 1,
          22 + Math.random() * 10, 'rgba(' + dcol + ',0.9)', Math.random() * 3 + 1.5);
      }
      addRing(ocx, GROUND - 10, 50, dcol, 18);
    }
    if (destroyed > 0) {
      slamFlash = frame;
      const gain = destroyed * 15 * feverScoreMult();
      score += gain;
      addFever(0.05 + destroyed * 0.04);
      shake = Math.max(shake, 9 + destroyed * 2);
      zoomPunch = Math.max(zoomPunch, 0.05);
      // Lingering ground crack — three procedural lightning-style fissures
      // radiating from the impact point. Scrolls with the world; fades over
      // ~90 frames. Sells the weight of the slam even after the flash is gone.
      const crack = { x: cx, life: 90, segs: [] };
      for (let k = 0; k < 3; k++) {
        const baseA = -Math.PI + (k - 1) * 0.5 + (Math.random() - 0.5) * 0.4;
        const segs = 3 + (destroyed > 1 ? 1 : 0);
        const pts = [{ x: 0, y: 0 }];
        let lx = 0, ly = 0;
        for (let s = 1; s <= segs; s++) {
          const step = 16 + Math.random() * 14;
          lx += Math.cos(baseA + (Math.random() - 0.5) * 0.6) * step;
          ly += Math.abs(Math.sin(baseA + (Math.random() - 0.5) * 0.4)) * step * -0.4; // hug ground
          pts.push({ x: lx, y: ly });
        }
        crack.segs.push(pts);
      }
      slamCracks.push(crack);
      addRing(cx, GROUND, 90 + destroyed * 30, '255,255,255', 26);
      addRing(cx, GROUND, 60, '255,225,74', 20);
      popText('SLAM! +' + gain + (destroyed > 1 ? '  ×' + destroyed : ''),
        cx, GROUND - 70, '#ffe14a', 1.1 + destroyed * 0.12);
      audio.hit();
      audio.power();
      if (navigator.vibrate) { try { navigator.vibrate([18, 24, 40]); } catch (_) {} }
      // Sideways shock dust along the ground
      for (let i = 0; i < 18; i++) {
        const dir = i % 2 === 0 ? 1 : -1;
        pushParticle(cx, GROUND - 3, dir * (3 + Math.random() * 6), -Math.random() * 2,
          20, 'rgba(255,240,200,0.7)', Math.random() * 2.5 + 1);
      }
      missionEvent('slam', destroyed);
      lifeSlams += destroyed; writeLS(SK.lifeSlams, lifeSlams);
      if (!hasAch('slam_first')) unlock('slam_first');
      if (destroyed >= 3 && !hasAch('slam_triple')) unlock('slam_triple');
      if (lifeSlams >= 100 && !hasAch('slam_master')) unlock('slam_master');
    }
  }

  // Parallax / atmosphere scroll — shared by gameplay and the attract menu so
  // the title scene is alive instead of frozen. Uses the outer `speed`.
  function updateScenery() {
    stars.forEach((s) => {
      s.x -= speed * s.s;
      s.tw += 0.05;
      if (s.x < -5) s.x = W + 5;
    });
    // Nebula — very slow far drift + breathing
    nebula.forEach((nb) => {
      nb.x -= speed * 0.05;
      nb.tw += 0.012;
      if (nb.x + nb.r < -40) { nb.x = W + nb.r + Math.random() * 120; nb.y = 40 + Math.random() * (GROUND - 200); }
    });
    // Shooting stars — spawn rarely, fly diagonally
    if (rnd() < 0.012 && shootingStars.length < 2) {
      shootingStars.push({
        x: W * (0.3 + rnd() * 0.7),
        y: rnd() * (GROUND - 240),
        vx: -(5 + rnd() * 4),
        vy: 2 + rnd() * 2,
        life: 26
      });
    }
    shootingStars.forEach((ss) => { ss.x += ss.vx; ss.y += ss.vy; ss.life--; });
    shootingStars = shootingStars.filter((ss) => ss.life > 0 && ss.x > -60);
    // Rings — expand + fade
    rings.forEach((rg) => { rg.r += (rg.maxR - rg.r) * 0.16; rg.life--; });
    rings = rings.filter((rg) => rg.life > 0);
    // Foreground shafts — fast parallax (1.8x), wrap around
    fgShafts.forEach((sh) => {
      sh.x -= speed * 1.8;
      if (sh.x + sh.w < -20) sh.x += (W + 600);
    });
    // Foreground motes — closest, drift fastest + bob
    fgMotes.forEach((mo) => {
      mo.x -= speed * mo.sp;
      mo.tw += 0.04;
      mo.y += Math.sin(mo.tw) * 0.4;
      if (mo.x < -6) { mo.x = W + 6; mo.y = Math.random() * H; }
    });
    mountains.forEach((m) => {
      m.x -= speed * 0.15;
    });
    if (mountains.length && mountains[0].x + mountains[0].w < -50) mountains.shift();
    while (mountains.length < 20 && mountains[mountains.length - 1].x + mountains[mountains.length - 1].w < W + 200) {
      const last = mountains[mountains.length - 1];
      const w = 180 + Math.random() * 160;
      mountains.push({ x: last.x + last.w * 0.6, w, h: 120 + Math.random() * 100, hue: 280 + Math.random() * 40 });
    }
    buildings.forEach((b) => (b.x -= speed * 0.4));
    if (buildings.length && buildings[0].x + buildings[0].w < -10) buildings.shift();
    while (buildings.length < 30 && buildings[buildings.length - 1].x + buildings[buildings.length - 1].w < W + 100) {
      const last = buildings[buildings.length - 1];
      const w = 50 + Math.random() * 80;
      buildings.push({
        x: last.x + last.w + 8,
        w,
        h: 80 + Math.random() * 180,
        windows: Math.random() > 0.3,
        seed: (Math.random() * 0x7fffffff) | 0
      });
    }
  }

  // Attract mode — gently scroll the synthwave scene behind the title/menu so
  // it breathes. No player physics, spawns, or collisions; purely ambient.
  function updateAttract() {
    frame++;
    speed = 2.4;
    scrollX += speed;
    updateScenery();
    updateWeather();
    texts.forEach((t) => { t.y -= 0.8; t.life--; });
    texts = texts.filter((t) => t.life > 0);
    particles.forEach((p) => { p.x += p.vx; p.y += p.vy; p.vy += 0.15; p.life--; });
    particles = particles.filter((p) => p.life > 0);
  }

  // ---------- Update ----------
  function update() {
    frame++;
    // Commit a deferred jump once the tap-vs-swipe window has passed
    if (pendingJump && frame - pendingJumpFrame >= JUMP_DEFER) {
      pendingJump = false;
      jump();
    }
    const slowmoT = slowmoFrames > 0 ? 0.35 : 1.0;
    if (slowmoFrames > 0) slowmoFrames--;
    // Gentle ramp spread across all 12 levels: ~4.6 at start, reaches the
    // 15 cap only around score ~4780 (level 10). Levels 11-12 hold max intensity.
    // SPRINT multiplies *visual* speed (1.3x) — pacing/dist still ticks at
    // the normal rate so spawn rhythm stays fair while the screen feels nitro.
    const sprintBoost = sprintFrames > 0 ? 1.3 : 1;
    speed = (baseSpeed + Math.min(dist / 520, 10.4)) * slowmoT * sprintBoost;
    scrollX += speed;
    updateWeather();
    if (landBounce > 0.01) landBounce *= 0.8; else landBounce = 0;

    // Player physics — sliding in air = fast-fall dive. CHARGE JUMP: holding
    // the screen while ascending shortly after a jump halves gravity, letting
    // skilled players sustain a higher arc. Released → normal gravity → snappy
    // hop. Pure additive skill expression; a normal tap-and-release is unchanged.
    const charging = ptrDown && !player.sliding && !player.onGround
      && player.vy < 0 && (frame - lastJumpFrame) < 14;
    const gMul = (player.sliding && !player.onGround) ? 2.4 : (charging ? 0.45 : 1);
    player.vy += gravity * gMul;
    // Tiny upward boost-flame motes while charge-holding — telegraphs the tech
    if (charging && (frame & 1) === 0) {
      const cx = player.x + player.w / 2;
      const cy = player.y + player.h;
      pushParticle(cx + (Math.random() - 0.5) * 8, cy,
        (Math.random() - 0.5) * 1.2, 1.4 + Math.random() * 1.2,
        14, 'rgba(255,225,120,0.85)', Math.random() * 1.8 + 1);
    }
    const fallVy = player.vy;
    player.y += player.vy;
    if (player.y + player.h >= GROUND) {
      player.y = GROUND - player.h;
      player.vy = 0;
      if (!player.onGround) {
        lastJumpFrame = -100;
        // Landing dust puff — kicks sideways, scaled by fall speed
        const dust = Math.min(14, 4 + Math.floor(fallVy));
        const fy = GROUND - 2;
        for (let i = 0; i < dust; i++) {
          const dir = i % 2 === 0 ? 1 : -1;
          pushParticle(
            player.x + player.w / 2 + dir * 6,
            fy,
            dir * (1 + Math.random() * 2.5),
            -Math.random() * 1.4,
            18, 'rgba(200,210,235,0.6)', Math.random() * 2 + 1
          );
        }
        addRing(player.x + player.w / 2, GROUND, 40, '255,255,255', 16);
        landBounce = Math.min(1, 0.35 + fallVy * 0.04); // squash impulse scales with impact
        // DIVE-SLAM — landing a committed dive (swipe-down in air) detonates a
        // ground shockwave that shatters nearby low obstacles (spike/block). It
        // deliberately spares anything currently overlapping the orb, so you
        // can't cheese a dive straight onto a spike — you must stick the landing
        // in the gap and let the wave clear the threats around you.
        if (player.sliding && fallVy >= 15) doDiveSlam(fallVy);
        // Air-time bonus — rewards committed long jumps (also covers double jumps,
        // since airframes counts continuous time off the floor)
        if (airframes > 35) {
          const baseBonus = Math.min(60, Math.floor(airframes / 1.2));
          const bonus = Math.floor(baseBonus * (1 + upgLvl('air') * 0.25) * (1 + perkVal('air')));
          score += bonus * feverScoreMult();
          runAirBonus += bonus * feverScoreMult();
          if (bonus >= 40 && !hasAch('air_big')) unlock('air_big');
          popText('+' + (bonus * feverScoreMult()) + ' AIR!', player.x + player.w / 2, GROUND - 80, '#ffe14a', 1.05);
          addRing(player.x + player.w / 2, GROUND - 18, 46, '255,225,74', 18);
          audio.coin(3);
          addFever(0.05);
        }
        airframes = 0;
      }
      player.onGround = true;
      player.jumps = 0;
      player.rot = 0;
    } else {
      player.onGround = false;
      player.rot += 0.15;
      airframes++;
    }
    // Accumulate rolling angle when grounded — angle/frame = speed / radius
    // so the orb rolls without slipping (one full turn per ~circumference px).
    if (player.onGround && !player.sliding) {
      groundRoll += speed / 22;
    }
    // Jump-pad launch — if grounded AND stood/rolled onto a spring, fire upward.
    // Cooldown frames on the spring stop the orb re-bouncing on the same step.
    // jumps is reset to 0 so the player can still double-jump from the apex,
    // turning the launch into a high-arc air play.
    if (player.onGround && !player.sliding) {
      for (const s of springs) {
        if (s.used > 0) continue;
        if (player.x + player.w > s.x + 4 && player.x + 4 < s.x + s.w) {
          s.used = 10;
          player.vy = jumpV * 1.55;
          player.onGround = false;
          player.jumps = 0;
          airframes = 1;
          audio.power();
          if (navigator.vibrate) { try { navigator.vibrate(25); } catch (_) {} }
          shake = Math.max(shake, 4);
          addRing(s.x + s.w / 2, GROUND, 70, '255,255,255', 20);
          popText('LAUNCH!', s.x + s.w / 2, GROUND - 90, '#fff', 1.1);
          if (!hasAch('spring_first')) unlock('spring_first');
          missionEvent('spring');
          for (let i = 0; i < 14; i++) {
            const a = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 0.9;
            const v = Math.random() * 5 + 2;
            pushParticle(s.x + s.w / 2 + (Math.random() - 0.5) * 30, GROUND - 4,
              Math.cos(a) * v, Math.sin(a) * v, 30, '#fff', Math.random() * 2 + 1);
          }
          break;
        }
      }
    }

    // Slide squash animation (0 = standing, 1 = fully crouched)
    const slideTarget = player.sliding && player.onGround ? 1 : 0;
    player.slideT += (slideTarget - player.slideT) * 0.35;

    // Running dust — tiny motes kicked up from under the orb at speed. Density
    // ramps in smoothly above speed 6.5; capped at one mote per other-frame so
    // it never starves the shared particle pool. Goes hot-pink during OVERDRIVE
    // so the trail visibly screams the multiplier.
    if (player.onGround && !player.sliding && speed > 6.5 && (frame & 1) === 0) {
      const intensity = Math.min(1, (speed - 6.5) / 7);
      if (Math.random() < intensity * 0.7) {
        const col = feverActive ? 'rgba(255, 180, 255, 0.55)' : 'rgba(210, 220, 240, 0.5)';
        pushParticle(
          player.x + player.w / 2 + (Math.random() - 0.5) * 12,
          GROUND - 2,
          -(2.5 + Math.random() * 3.5),
          -Math.random() * 1.4,
          20, col, 0.9 + Math.random() * 1.5
        );
      }
    }

    // Trail — length scales with combo (longer = hotter streak). Cap at 28
    // segments so memory + draw cost stay bounded. Sample every frame at high
    // combo for a denser, smoother streak.
    const trailCap = 12 + Math.min(16, Math.floor(combo / 4));
    const sampleEvery = combo >= 20 ? 1 : 2;
    if (frame % sampleEvery === 0) {
      player.trail.push({ x: player.x + player.w / 2, y: player.y + player.h / 2, life: 20 });
      if (player.trail.length > trailCap) player.trail.shift();
    }
    player.trail.forEach((t) => t.life--);
    player.trail = player.trail.filter((t) => t.life > 0);

    // Set-piece trigger (special section every ~2000 score)
    if (!setpiece && dist >= nextSetpieceAt) startSetpiece();

    if (setpiece) {
      updateSetpiece();
    } else {
      // Normal spawning (with dynamic difficulty ease)
      const ease = difficultyEase();
      // Safety net: if the next-spawn time ever became non-finite or drifted too
      // far (a stall), force it back into range so the track can never go empty.
      if (!isFinite(nextObstacleAt) || nextObstacleAt > frame + 180) {
        nextObstacleAt = frame + 1;
      }
      if (frame >= nextObstacleAt) {
        let span = spawnPattern();
        if (!isFinite(span)) span = 0;
        // Recovery gap (reaction time) is constant in frames; add the time it
        // takes the pattern's pixel span to clear so the breather stays fair.
        const breather = Math.max(40, (88 - dist / 90 - levelIdx * 2) * (ease || 1));
        const spanFrames = span / Math.max(1, speed);
        let gap = breather + spanFrames + rnd() * 20;
        if (!isFinite(gap)) gap = 70;
        nextObstacleAt = frame + Math.min(gap, 170);
      }
      if (frame >= nextCoinAt) {
        spawnCoin();
        nextCoinAt = frame + 90 + rnd() * 80;
      }
      if (frame >= nextPowerupAt) {
        spawnPowerup();
        nextPowerupAt = frame + 900 + rnd() * 600;
      }
      if (frame >= nextMysteryAt) {
        spawnMystery();
        nextMysteryAt = frame + 2400 + rnd() * 1800;
      }
    }

    // Move obstacles — TIME WARP slows world scroll without touching the player
    const wSlow = worldSlow();
    const wSpeed = speed * wSlow;
    obstacles.forEach((o) => {
      o.x -= wSpeed + (o.vx || 0) * wSlow;
      // Flyers gently bob on a sine path — adds life; stays within run-under clearance
      if (o.bobAmp) o.y = o.baseY + Math.sin(frame * o.bobSp + o.bobPh) * o.bobAmp;
    });
    obstacles = obstacles.filter((o) => o.x + o.w > -50);
    springs.forEach((s) => { s.x -= wSpeed; s.t += 0.15; if (s.used > 0) s.used--; });
    springs = springs.filter((s) => s.x + s.w > -30);
    // Slam cracks scroll + fade
    if (slamCracks.length) {
      for (const c of slamCracks) { c.x -= wSpeed; c.life--; }
      slamCracks = slamCracks.filter((c) => c.life > 0 && c.x > -120);
    }
    // Coin-chain arcs scroll + fade. We also drift the stored last-pickup point
    // so a follow-up coin computes its delta in the same scrolled frame.
    if (coinChains.length) {
      for (const c of coinChains) { c.x1 -= wSpeed; c.x2 -= wSpeed; c.life--; }
      coinChains = coinChains.filter((c) => c.life > 0);
    }
    if (lastCoinFrame > 0) lastCoinX -= wSpeed;

    // METEOR update — meteors drift left with scroll AND fall toward their tx,
    // because the shadow stays world-anchored. On impact: flash, ring, dust,
    // brief danger window (player still has ~14 frames to clear the zone, but
    // the impact-frame itself is the lethal moment). On exit they're cleaned up.
    if (meteors.length) {
      for (const m of meteors) {
        m.t++;
        m.tx -= wSpeed;       // shadow scrolls with the world (slowed by time-warp)
        m.y += m.vy * wSlow;  // fall slowed by time-warp too
        m.ttl--;
        if (m.ttl <= 0 && m.impact === 0) {
          m.impact = 14;
          m.y = GROUND - 4;
          shake = Math.max(shake, 8);
          addRing(m.tx, GROUND, 90, '255,140,60', 22);
          addRing(m.tx, GROUND, 50, '255,225,74', 18);
          for (let k = 0; k < 14; k++) {
            const a = Math.random() * Math.PI - Math.PI;
            const v = 2 + Math.random() * 5;
            pushParticle(m.tx, GROUND - 2, Math.cos(a) * v, Math.sin(a) * v - 1, 26,
              'rgba(255,160,60,0.85)', Math.random() * 3 + 1.5);
          }
          if (audio.hit) audio.hit();
        }
        if (m.impact > 0) m.impact--;
      }
      // Keep meteors alive until both the falling body AND the post-impact
      // bloom (14 frames after landing) have finished — otherwise the orange
      // crater fade is truncated when the meteor is filtered out at ttl=-8.
      meteors = meteors.filter((m) => m.tx > -80 && (m.ttl > 0 || m.impact > 0));
    }

    // Player collision circle — matches the drawn orb; shrinks & drops while sliding
    const sTc = player.slideT;
    const pcx = player.x + player.w / 2;
    const standCy = player.y + player.h / 2;
    const pcy = standCy + ((GROUND - 14) - standCy) * sTc;
    const pcr = 20 - 9 * sTc; // 20 standing, 11 fully slid
    coinsArr.forEach((c) => {
      c.x -= wSpeed;
      c.t += 0.15;
      if (magnetFrames > 0) {
        const dx = pcx - c.x;
        const dy = pcy - c.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < 200 * 200) {
          const f = 0.12;
          c.x += dx * f;
          c.y += dy * f;
        }
      }
    });
    coinsArr = coinsArr.filter((c) => c.x > -30 && !c.picked);

    // Move powerups
    powerups.forEach((p) => { p.x -= wSpeed; p.t += 0.08; });
    powerups = powerups.filter((p) => p.x > -40 && !p.picked);

    // Move mystery boxes (fall + scroll), land on ground OR on top of obstacles
    mysteryBoxes.forEach((m) => {
      m.x -= wSpeed;
      m.y += m.vy;
      m.t += 0.1;
      m.glow = (Math.sin(m.t * 2) + 1) * 0.5;
      if (m.y + m.r > GROUND - 4) { m.y = GROUND - 4 - m.r; m.vy = 0; }
      if (m.vy > 0) {
        for (const o of obstacles) {
          if (m.x + m.r > o.x && m.x - m.r < o.x + o.w &&
              m.y + m.r > o.y && m.y - m.r < o.y + o.h) {
            m.y = o.y - m.r - 2;
            m.vy = 0;
            break;
          }
        }
      }
    });
    mysteryBoxes = mysteryBoxes.filter((m) => m.x > -50 && !m.picked);

    // Decay magnet
    if (magnetFrames > 0) magnetFrames--;
    if (sprintFrames > 0) sprintFrames--;
    if (timewarpFrames > 0) {
      timewarpFrames--;
      // Brief outro pulse when time-warp ends
      if (timewarpFrames === 0) {
        addRing(player.x + player.w / 2, player.y + player.h / 2, 120, '25,240,255', 24);
        popText('TIME ON', player.x + player.w / 2, player.y - 30, '#19f0ff', 1.0);
      }
    }
    if (phaseFrames > 0) {
      phaseFrames--;
      if (phaseFrames === 0) {
        // Phase collapse — brief grace so you don't reappear inside an obstacle
        invincibleUntil = Math.max(invincibleUntil, frame + 18);
        addRing(player.x + player.w / 2, player.y + player.h / 2, 80, '180,130,255', 22);
        if (phaseStreak >= 3) popText('PHASE ×' + phaseStreak, player.x + player.w / 2, player.y - 30, '#c8a8ff', 1.3);
      }
    }
    // Combo decay + live meter fill (drains as the window runs out)
    if (combo > 0) {
      if (frame - lastCoinFrame > comboWindow()) {
        combo = 0;
        setComboUI('');
      } else if (comboFillEl) {
        const rem = 1 - (frame - lastCoinFrame) / comboWindow();
        comboFillEl.style.transform = 'scaleX(' + Math.max(0, rem) + ')';
      }
    }
    // Floating texts
    texts.forEach((t) => { t.y -= 0.8; t.life--; });
    texts = texts.filter((t) => t.life > 0);

    updateScenery();

    // Particles
    particles.forEach((p) => {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.15;
      p.life--;
    });
    particles = particles.filter((p) => p.life > 0);

    // PHASE — ghost mode: vaporise any obstacle the orb passes through for a
    // streak of bonus score, instead of dying. Runs while the power is active.
    if (phaseFrames > 0) {
      for (const o of obstacles) {
        if (o.x < -100 || o.phased) continue;
        if (obstacleHit(o, pcx, pcy, pcr + 6)) {
          o.phased = true;
          o.x = -9999;
          phaseStreak++;
          const gain = 20 * feverScoreMult();
          score += gain;
          addFever(0.03);
          shake = Math.max(shake, 5);
          const col = o.type === 'spike' ? '255,61,110' : o.type === 'flying' ? '255,90,200' : '180,130,255';
          addRing(pcx, pcy, 56, '200,150,255', 16);
          popText('+' + gain, pcx + 20, pcy - 30, '#c8a8ff', 0.95);
          for (let i = 0; i < 14; i++) {
            const a = Math.random() * Math.PI * 2;
            const v = 2 + Math.random() * 5;
            pushParticle(pcx, pcy, Math.cos(a) * v, Math.sin(a) * v, 26,
              'rgba(' + col + ',0.9)', Math.random() * 3 + 1.5);
          }
          if (phaseStreak === 5 && !hasAch('phase_streak')) unlock('phase_streak');
        }
      }
    }

    // Collisions — player is a circle, each obstacle tested by its true shape
    if (frame > invincibleUntil) {
      for (const o of obstacles) {
        if (obstacleHit(o, pcx, pcy, pcr)) {
          if (shieldActive) {
            shieldActive = false;
            shieldFlashFrame = frame;
            invincibleUntil = frame + 60;
            slowmoFrames = 30;
            glitchFrame = frame;
            flashFrame = frame;
            zoomPunch = Math.max(zoomPunch, 0.07);
            addRing(pcx, pcy, 110, '25,240,255', 30);
            o.x = -999;
            shake = Math.max(shake, 14);
            audio.hit();
            popText('SCUT!', pcx, pcy - 40, '#19f0ff', 1.4);
            if (navigator.vibrate) { try { navigator.vibrate(40); } catch (_) {} }
            unlock('shield_save');
            break;
          }
          gameOver();
          return;
        }
      }
      // Meteor collision — the meteor body itself (mid-fall) and a brief impact
      // bloom on landing both kill. Shield absorbs (consistent with obstacles).
      for (const m of meteors) {
        const hitBody = m.ttl > 0 && circleRectHit(pcx, pcy, pcr, m.tx - m.r, m.y - m.r, m.r * 2, m.r * 2);
        const hitImpact = m.impact > 8 && Math.abs(pcx - m.tx) < 44 && pcy > GROUND - 38;
        if (hitBody || hitImpact) {
          if (shieldActive) {
            shieldActive = false; shieldFlashFrame = frame; invincibleUntil = frame + 60;
            slowmoFrames = 30; glitchFrame = frame; flashFrame = frame;
            zoomPunch = Math.max(zoomPunch, 0.07);
            addRing(pcx, pcy, 110, '25,240,255', 30);
            m.ttl = -100; m.impact = 0; // consume the meteor
            shake = Math.max(shake, 14); audio.hit();
            popText('SCUT!', pcx, pcy - 40, '#19f0ff', 1.4);
            if (navigator.vibrate) { try { navigator.vibrate(40); } catch (_) {} }
            unlock('shield_save');
            break;
          }
          gameOver();
          return;
        }
      }
    }
    // Near-miss reward — a barely-dodged hazard gives a small score bonus + juice.
    // Fires once, the frame an obstacle's trailing edge clears the player's centre.
    for (const o of obstacles) {
      if (o.nearChecked) continue;
      if (o.x + o.w < pcx) {
        o.nearChecked = true;
        if (frame <= invincibleUntil) continue;
        const nx = o.x < pcx ? (pcx > o.x + o.w ? o.x + o.w : pcx) : o.x;
        const ny = o.y < pcy ? (pcy > o.y + o.h ? o.y + o.h : pcy) : o.y;
        const gdx = pcx - nx, gdy = pcy - ny;
        const gap = Math.sqrt(gdx * gdx + gdy * gdy) - pcr;
        const nmSkinBonus = perkVal('nm');       // CRIMSON: flat score / near-miss
        const nmFeverBonus = perkVal('feverNm'); // GLITCH:  extra fever / near-miss
        if (gap > 0 && gap < 7) {
          // Razor-thin pass — extra reward + slow-mo flicker as a "clutch" cue
          const gain = (25 + nmSkinBonus) * feverScoreMult();
          score += gain;
          popText('FOARTE APROAPE! +' + gain, pcx, pcy - 48, '#ff3df0', 1.2);
          addRing(pcx, pcy, 60, '255,61,240', 24);
          audio.nearmiss();
          slowmoFrames = Math.max(slowmoFrames, 8);
          glitchFrame = frame;
          shake = Math.max(shake, 6);
          addFever(0.12 + nmFeverBonus);
          runNearMisses++;
          missionEvent('near_miss');
          if (runNearMisses >= 10 && !hasAch('nm_clutch')) unlock('nm_clutch');
        } else if (gap > 0 && gap < 18) {
          const gain = (10 + nmSkinBonus) * feverScoreMult();
          score += gain;
          popText('APROAPE! +' + gain, pcx, pcy - 46, '#19f0ff', 1.0);
          addRing(pcx, pcy, 46, '120,230,255', 16);
          audio.nearmiss();
          addFever(0.05 + nmFeverBonus);
          runNearMisses++;
          missionEvent('near_miss');
          if (runNearMisses >= 10 && !hasAch('nm_clutch')) unlock('nm_clutch');
        }
      }
    }
    for (const c of coinsArr) {
      const dx = c.x - pcx;
      const dy = c.y - pcy;
      if (dx * dx + dy * dy < (c.r + pcr + 6) * (c.r + pcr + 6)) {
        c.picked = true;
        const gm = gemMult(c.type);
        runCoins += ((feverActive ? 2 : 1) + upgLvl('stars') + perkVal('coin')) * gm;
        missionEvent('coin');
        if (frame - lastCoinFrame < comboWindow()) {
          combo++;
          // Chain arc from the previous pickup to this one — only when the
          // combo is alive AND points are close enough that the line reads
          // as a single tight pickup streak (not a teleport across the screen).
          const ddx = c.x - lastCoinX, ddy = c.y - lastCoinY;
          if (combo >= 2 && (ddx * ddx + ddy * ddy) < 220 * 220) {
            coinChains.push({ x1: lastCoinX, y1: lastCoinY, x2: c.x, y2: c.y, life: 14 });
            if (coinChains.length > 24) coinChains.shift();
          }
        } else combo = 1;
        lastCoinFrame = frame;
        lastCoinX = c.x; lastCoinY = c.y;
        const m = comboMult();
        const gain = 5 * m * feverScoreMult() * sprintMult() * gm;
        score += gain;
        audio.coin(combo - 1);
        if (gm > 1) {
          popText('+' + gain, c.x, c.y - 20, c.type === 'red' ? '#ff3df0' : '#19f0ff', 1.1);
          addRing(c.x, c.y, 44, c.type === 'red' ? '255,61,240' : '120,230,255', 24);
          if (c.type === 'blue') { missionEvent('gem_blue'); if (!hasAch('gem_blue')) unlock('gem_blue'); }
          if (c.type === 'red') {
            // Red gem = 10× jackpot, very rare — give it a proper celebration
            if (!hasAch('gem_red')) unlock('gem_red');
            popText('JACKPOT! ×10', c.x, c.y - 52, '#ffe14a', 1.4);
            flashFrame = frame;
            glitchFrame = frame;
            slowmoFrames = Math.max(slowmoFrames, 10);
            zoomPunch = Math.max(zoomPunch, 0.07);
            shake = Math.max(shake, 8);
            addRing(c.x, c.y, 120, '255,61,240', 34);
            addRing(c.x, c.y, 80, '255,225,74', 28);
            addFever(0.18);
            audio.power && audio.power();
            if (navigator.vibrate) { try { navigator.vibrate([15, 30, 60]); } catch (_) {} }
            for (let i = 0; i < 26; i++) {
              const a = Math.random() * Math.PI * 2;
              const v = Math.random() * 7 + 2;
              pushParticle(c.x, c.y, Math.cos(a) * v, Math.sin(a) * v, 46,
                ['#ff3df0', '#ffe14a', '#fff'][i % 3], Math.random() * 3 + 1.5);
            }
          }
        }
        const ringCol = c.type === 'red' ? '255,61,240' : c.type === 'blue' ? '120,230,255' : (feverActive ? '255,61,240' : '255,225,74');
        addRing(c.x, c.y, 30, ringCol, 18);
        setComboUI(combo >= 2 ? ('x' + combo + (m > 1 ? '  ' + m + '×' : '')) : '');
        if (combo > runMaxCombo) runMaxCombo = combo;
        if (combo > bestCombo) { bestCombo = combo; writeLS(SK.bestCombo, bestCombo); }
        addFever(0.035);
        if (combo === 5 || combo === 10 || combo === 15 || combo === 20 || combo === 30 || combo === 50) {
          // Escalating, named combo tiers — each milestone feels distinctly
          // bigger than the last instead of repeating "N COMBO!".
          const tier = combo >= 50 ? { name: 'LEGENDARY!',  col: '#ff3df0', sz: 2.2, sh: 16, rings: 3, fever: 0.22 }
                     : combo >= 30 ? { name: 'GODLIKE!',    col: '#ff3df0', sz: 1.9, sh: 13, rings: 2, fever: 0.16 }
                     : combo >= 20 ? { name: 'UNSTOPPABLE!', col: '#ffe14a', sz: 1.6, sh: 10, rings: 2, fever: 0.12 }
                     : combo >= 15 ? { name: 'ON FIRE!',    col: '#ffe14a', sz: 1.4, sh:  7, rings: 1, fever: 0.10 }
                     : combo >= 10 ? { name: 'HOT! ' + combo, col: '#ff7a3d', sz: 1.25, sh: 6, rings: 1, fever: 0.09 }
                     :               { name: combo + ' COMBO!', col: palette.sun, sz: 1.1, sh: 4, rings: 1, fever: 0.08 };
          popText(tier.name, c.x, c.y - 24, tier.col, tier.sz);
          shake = Math.max(shake, tier.sh);
          for (let k = 0; k < tier.rings; k++) addRing(c.x, c.y, 50 + k * 24, '255,225,74', 22 + k * 6);
          missionEvent('combo', combo);
          addFever(tier.fever);
          // Big tiers get a screen flash + slow-mo flicker so they READ
          if (combo >= 15) { flashFrame = frame; }
          if (combo >= 20) { slowmoFrames = Math.max(slowmoFrames, 8); zoomPunch = Math.max(zoomPunch, 0.05); }
          if (combo >= 30) { glitchFrame = frame; zoomPunch = Math.max(zoomPunch, 0.08); }
          if (navigator.vibrate && combo >= 15) { try { navigator.vibrate([10, 20, 40]); } catch (_) {} }
        }
        for (let i = 0; i < 8; i++) {
          const a = Math.random() * Math.PI * 2;
          const v = Math.random() * 3 + 1;
          pushParticle(c.x, c.y, Math.cos(a) * v, Math.sin(a) * v - 1, 24, '#ffe14a', Math.random() * 2 + 1);
        }
      }
    }
    // Mystery box pickups
    for (const m of mysteryBoxes) {
      if (m.picked) continue;
      const dx = m.x - pcx;
      const dy = m.y - pcy;
      if (dx * dx + dy * dy < (m.r + pcr + 4) * (m.r + pcr + 4)) {
        m.picked = true;
        openMystery();
      }
    }
    // Powerup pickups
    for (const p of powerups) {
      if (p.picked) continue;
      const dx = p.x - pcx;
      const dy = p.y - pcy;
      if (dx * dx + dy * dy < (p.r + pcr + 6) * (p.r + pcr + 6)) {
        p.picked = true;
        if (p.type === 'magnet') {
          const dur = 60 * (8 + upgLvl('magnet') * 2);
          magnetFrames = dur;
          popText('MAGNET ' + (dur / 60).toFixed(0) + 's', p.x, p.y - 20, '#ffe14a', 1.2);
          addRing(p.x, p.y, 70, '255,225,74', 28);
        } else if (p.type === 'shield') {
          shieldActive = true;
          popText('SHIELD', p.x, p.y - 20, '#19f0ff', 1.2);
          addRing(p.x, p.y, 70, '25,240,255', 28);
        } else if (p.type === 'sprint') {
          const dur = 60 * (5 + upgLvl('sprint') + perkVal('sprint'));
          sprintFrames = dur;
          popText('SPRINT ' + (dur / 60).toFixed(0) + 's', p.x, p.y - 20, '#fff', 1.3);
          addRing(p.x, p.y, 80, '255,255,255', 30);
          zoomPunch = Math.max(zoomPunch, 0.06);
          shake = Math.max(shake, 5);
          music.duck();
          missionEvent('sprint');
          if (!hasAch('sprint_first')) unlock('sprint_first');
        } else if (p.type === 'timewarp') {
          // TIME WARP — slows obstacles + meteors, leaves player input fully reactive.
          // PRISM skin extends the duration; upgrade-agnostic for now (room to grow).
          const dur = 60 * (4 + perkVal('timewarp'));
          timewarpFrames = Math.max(timewarpFrames, dur);
          popText('⏱ TIME WARP', p.x, p.y - 24, '#19f0ff', 1.5);
          addRing(p.x, p.y, 110, '120,230,255', 34);
          addRing(p.x, p.y, 70, '255,255,255', 26);
          flashFrame = frame;
          glitchFrame = frame;
          zoomPunch = Math.max(zoomPunch, 0.07);
          shake = Math.max(shake, 6);
          slowmoFrames = Math.max(slowmoFrames, 10);
          music.duck();
          missionEvent('timewarp');
          lifeTimewarps++; writeLS('glitchrun.v1.lifeTimewarps', lifeTimewarps);
          if (!hasAch('timewarp_first')) unlock('timewarp_first');
          if (lifeTimewarps >= 20 && !hasAch('timewarp_master')) unlock('timewarp_master');
          showTipOnce('timewarp', '⏱ TIME WARP', 'Lumea încetinește — tu nu. Folosește momentul!');
        } else if (p.type === 'phase') {
          const dur = 60 * (5 + perkVal('phase')); // PHANTOM skin: +2s
          phaseFrames = Math.max(phaseFrames, dur);
          phaseStreak = 0;
          invincibleUntil = Math.max(invincibleUntil, frame + dur);
          magnetFrames = Math.max(magnetFrames, dur); // sweep up the spoils mid-phase
          popText('⚡ PHASE ⚡', p.x, p.y - 24, '#c8a8ff', 1.5);
          addRing(p.x, p.y, 90, '180,130,255', 32);
          addRing(p.x, p.y, 60, '255,255,255', 26);
          flashFrame = frame;
          glitchFrame = frame;
          zoomPunch = Math.max(zoomPunch, 0.08);
          shake = Math.max(shake, 7);
          music.duck();
          missionEvent('phase');
          lifePhases++; writeLS(SK.lifePhases, lifePhases);
          if (lifePhases >= 25 && !hasAch('phase_lord')) unlock('phase_lord');
          showTipOnce('phase', '👻 PHASE', 'Treci prin obstacole — fără frică!');
          if (!hasAch('phase_first')) unlock('phase_first');
        }
        audio.power && audio.power();
        missionEvent('powerup');
        const pcol = p.type === 'magnet' ? '#ffe14a' : p.type === 'shield' ? '#19f0ff' : p.type === 'phase' ? '#c8a8ff' : p.type === 'timewarp' ? '#19f0ff' : '#fff';
        for (let i = 0; i < 16; i++) {
          const a = Math.random() * Math.PI * 2;
          const v = Math.random() * 4 + 2;
          pushParticle(p.x, p.y, Math.cos(a) * v, Math.sin(a) * v, 40, pcol, Math.random() * 3 + 1);
        }
      }
    }

    // OVERDRIVE countdown — keep the magnet topped up, end with a flourish.
    if (feverActive) {
      magnetFrames = Math.max(magnetFrames, 2);
      if (--feverFrames <= 0) endFever();
    }
    if (frame % 2 === 0) { updateFeverUI(); updatePowerHud(); updateRecordProgress(); }

    // dist drives all pacing (level / speed / spawns) — steady, coin-independent.
    dist += 1;
    // Passive score climbs with depth: +1 at L1 up to +2.1 at L12 (feels like ascent)
    score += (1 + levelIdx * 0.1) * feverScoreMult() * sprintMult();
    tryLevelUp();
    // Mid-run record celebration — fires the frame the player crosses their
    // previous best. Single-shot via the flag; only meaningful when there IS
    // a previous best (skip on the first-ever run).
    if (!recordBrokenThisRun && !dailyMode && best > 0 && score > best) {
      recordBrokenThisRun = true;
      popText('🏆 RECORD NOU!', W / 2, GROUND - 240, '#ffe14a', 1.9);
      flashFrame = frame;
      glitchFrame = frame;
      zoomPunch = Math.max(zoomPunch, 0.10);
      shake = Math.max(shake, 9);
      slowmoFrames = Math.max(slowmoFrames, 14);
      addRing(W / 2, GROUND - 140, 280, '255,225,74', 50);
      addRing(W / 2, GROUND - 140, 220, '255,61,240', 44);
      audio.power();
      audio.levelup();
      music.duck();
      addFever(0.25);
      for (let i = 0; i < 36; i++) {
        const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.6;
        const v = Math.random() * 11 + 5;
        pushParticle(W / 2, GROUND - 110, Math.cos(a) * v, Math.sin(a) * v, 70,
          ['#ffe14a', '#ff3df0', '#19f0ff', '#fff'][i % 4], Math.random() * 4 + 2);
      }
      if (navigator.vibrate) { try { navigator.vibrate([40, 80, 40, 80, 200]); } catch (_) {} }
    }
    // Score milestones — a celebratory beat + small star bonus every 2500 pts,
    // giving long runs rhythm independent of biome level-ups. One fire per
    // threshold even if a coin burst leaps past several at once.
    if (score >= nextScoreMilestone) {
      const ms = Math.floor(score / 2500) * 2500;
      nextScoreMilestone = ms + 2500;
      const bonus = 10 + Math.floor(ms / 2500) * 5;
      runCoins += bonus;
      popText('🔥 ' + ms + '!  +' + bonus + ' ★', W / 2, GROUND - 230, '#ffe14a', 1.6);
      flashFrame = frame;
      zoomPunch = Math.max(zoomPunch, 0.06);
      shake = Math.max(shake, 6);
      addRing(W / 2, GROUND - 130, 240, '255,225,74', 40);
      addFever(0.15);
      audio.power && audio.power();
      if (navigator.vibrate) { try { navigator.vibrate([20, 40, 80]); } catch (_) {} }
    }
    // Achievements (use >= because combo multipliers can skip exact values)
    if (score >= 500 && !hasAch('score_500')) unlock('score_500');
    if (score >= 2000 && !hasAch('score_2000')) unlock('score_2000');
    if (score >= 5000 && !hasAch('score_5000')) unlock('score_5000');
    if (score >= 10000 && !hasAch('score_10000')) unlock('score_10000');
    if (combo >= 10 && !hasAch('combo_10')) unlock('combo_10');
    if (combo >= 20 && !hasAch('combo_20')) unlock('combo_20');
    if (combo >= 50 && !hasAch('combo_50')) unlock('combo_50');
    if (magnetFrames > 0 && !hasAch('magnet')) unlock('magnet');
    if (levelIdx >= 3 && !hasAch('level_3')) unlock('level_3');
    if (levelIdx >= 5 && !hasAch('level_6')) unlock('level_6');
    if (totalCoins + runCoins >= 100 && !hasAch('coins_100')) unlock('coins_100');
    if (frame % 4 === 0) scoreEl.textContent = Math.floor(score);

    if (shake > 0) shake *= 0.9;
  }

  // ---------- Draw ----------
  let skyGradient = null;
  let skyGradientH = -1;
  let skyGradientPal = null;
  // Cached environment gradients — rebuilt only when palette or height changes
  let envCache = { pal: null, h: -1, haze: null, refl: null };
  function ensureEnvGradients() {
    if (envCache.pal === palette && envCache.h === H) return;
    const haze = ctx.createLinearGradient(0, GROUND - 60, 0, GROUND + 30);
    haze.addColorStop(0, 'rgba(' + palette.sunRGB + ', 0)');
    haze.addColorStop(0.7, 'rgba(' + palette.sunRGB + ', 0.10)');
    haze.addColorStop(1, 'rgba(' + palette.sunRGB + ', 0.20)');
    const refl = ctx.createLinearGradient(0, GROUND, 0, H);
    refl.addColorStop(0, 'rgba(' + palette.sunRGB + ', 0.22)');
    refl.addColorStop(0.5, 'rgba(' + palette.sunRGB + ', 0.07)');
    refl.addColorStop(1, 'rgba(' + palette.sunRGB + ', 0)');
    envCache = { pal: palette, h: H, haze, refl };
  }
  function drawBackground() {
    if (palette.prism) {
      // PRISM biome — sky is a constantly drifting spectrum. Three hue-shifted
      // bands stacked vertically read as a living aurora-tinted sky. Built each
      // frame (cheap) instead of caching, so the colour actually moves.
      const baseHue = (frame * 0.6) % 360;
      const sg = ctx.createLinearGradient(0, 0, 0, H);
      sg.addColorStop(0, 'hsl(' + (baseHue) % 360 + ',60%,8%)');
      sg.addColorStop(0.45, 'hsl(' + (baseHue + 60) % 360 + ',75%,18%)');
      sg.addColorStop(1, 'hsl(' + (baseHue + 130) % 360 + ',85%,28%)');
      ctx.fillStyle = sg;
      ctx.fillRect(0, 0, W, H);
    } else {
      if (skyGradientH !== H || skyGradientPal !== palette) {
        skyGradient = ctx.createLinearGradient(0, 0, 0, H);
        skyGradient.addColorStop(0, palette.sky[0]);
        skyGradient.addColorStop(0.6, palette.sky[1]);
        skyGradient.addColorStop(1, palette.sky[2]);
        skyGradientH = H;
        skyGradientPal = palette;
      }
      ctx.fillStyle = skyGradient;
      ctx.fillRect(0, 0, W, H);
    }

    // Nebula clouds — far atmospheric depth, additive soft blobs
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const nb of nebula) {
      const breath = 1 + Math.sin(nb.tw) * 0.12;
      const r = nb.r * breath;
      const rgb = nb.tint === 0 ? palette.sunRGB : palette.accent;
      const ng = ctx.createRadialGradient(nb.x, nb.y, 0, nb.x, nb.y, r);
      ng.addColorStop(0, 'rgba(' + rgb + ', 0.10)');
      ng.addColorStop(0.5, 'rgba(' + rgb + ', 0.045)');
      ng.addColorStop(1, 'rgba(' + rgb + ', 0)');
      ctx.fillStyle = ng;
      ctx.fillRect(nb.x - r, nb.y - r, r * 2, r * 2);
    }
    ctx.restore();

    // MIDNIGHT biome — a soft pale moon rising in the upper-left sky, distinct
    // from the synthwave sun on the right. Sells the calm-mysterious vibe.
    if (palette.name === 'MIDNIGHT') {
      const mcx = W * 0.22, mcy = GROUND - 360, mr = 38;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const halo = ctx.createRadialGradient(mcx, mcy, mr * 0.5, mcx, mcy, mr * 3.4);
      halo.addColorStop(0, 'rgba(180,200,255,0.40)');
      halo.addColorStop(0.5, 'rgba(140,170,255,0.14)');
      halo.addColorStop(1, 'rgba(140,170,255,0)');
      ctx.fillStyle = halo;
      ctx.fillRect(mcx - mr * 3.4, mcy - mr * 3.4, mr * 6.8, mr * 6.8);
      ctx.restore();
      // Moon disk with subtle terminator (right side slightly darker, like a waxing gibbous)
      ctx.fillStyle = '#e8eeff';
      ctx.beginPath();
      ctx.arc(mcx, mcy, mr, 0, Math.PI * 2);
      ctx.fill();
      const term = ctx.createLinearGradient(mcx - mr, mcy, mcx + mr, mcy);
      term.addColorStop(0, 'rgba(255,255,255,0)');
      term.addColorStop(0.55, 'rgba(255,255,255,0)');
      term.addColorStop(1, 'rgba(40,40,80,0.30)');
      ctx.fillStyle = term;
      ctx.beginPath();
      ctx.arc(mcx, mcy, mr, 0, Math.PI * 2);
      ctx.fill();
      // A few craters — tiny dimples for character
      ctx.fillStyle = 'rgba(140,150,180,0.35)';
      ctx.beginPath(); ctx.arc(mcx - 9, mcy - 6, 3, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(mcx + 4, mcy + 8, 2.4, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(mcx - 4, mcy + 14, 1.8, 0, Math.PI * 2); ctx.fill();
    }

    // PRISM biome — rainbow ribbons sweeping the sky on alternating phases.
    // Each ribbon is a hue-shifted sine band. Sells the spectrum theme without
    // breaking play readability (drawn behind the sun).
    if (palette.prism) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const ribbons = [
        { cy: GROUND - 380, amp: 50, ph: frame * 0.014,       hueOff: 0,    alpha: 0.35 },
        { cy: GROUND - 320, amp: 40, ph: frame * 0.022 + 1.4, hueOff: 80,   alpha: 0.32 },
        { cy: GROUND - 260, amp: 32, ph: frame * 0.018 + 2.7, hueOff: 180,  alpha: 0.28 },
        { cy: GROUND - 200, amp: 24, ph: frame * 0.025 + 4.1, hueOff: 260,  alpha: 0.22 }
      ];
      for (const r of ribbons) {
        const hue = (frame * 0.9 + r.hueOff) % 360;
        ctx.beginPath();
        for (let x = 0; x <= W; x += 10) {
          const y = r.cy + Math.sin(x * 0.014 + r.ph) * r.amp + Math.sin(x * 0.045 + r.ph * 1.7) * 7;
          if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.lineTo(W, r.cy + 90);
        ctx.lineTo(0, r.cy + 90);
        ctx.closePath();
        const g = ctx.createLinearGradient(0, r.cy - 30, 0, r.cy + 90);
        g.addColorStop(0, 'hsla(' + hue + ',95%,70%,0)');
        g.addColorStop(0.4, 'hsla(' + hue + ',95%,68%,' + r.alpha + ')');
        g.addColorStop(1, 'hsla(' + hue + ',95%,70%,0)');
        ctx.fillStyle = g;
        ctx.fill();
      }
      ctx.restore();
    }

    // AURORA biome — sweeping ribbons of green/cyan light waving across the sky.
    // Three overlapping bands at different heights, each a sine-warped horizontal
    // strip with vertical falloff. Sells the biome name beyond just palette.
    if (palette.name === 'AURORA') {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const bands = [
        { cy: GROUND - 360, amp: 36, ph: frame * 0.012,         col: '100,255,200', alpha: 0.45 },
        { cy: GROUND - 320, amp: 48, ph: frame * 0.018 + 1.7,   col: '120,200,255', alpha: 0.35 },
        { cy: GROUND - 280, amp: 28, ph: frame * 0.010 + 3.1,   col: '180,255,220', alpha: 0.28 }
      ];
      for (const b of bands) {
        ctx.beginPath();
        for (let x = 0; x <= W; x += 12) {
          const y = b.cy + Math.sin(x * 0.013 + b.ph) * b.amp + Math.sin(x * 0.04 + b.ph * 2) * 6;
          if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        // close band into a vertical strip
        ctx.lineTo(W, b.cy + 80);
        ctx.lineTo(0, b.cy + 80);
        ctx.closePath();
        const g = ctx.createLinearGradient(0, b.cy - 30, 0, b.cy + 80);
        g.addColorStop(0, 'rgba(' + b.col + ',0)');
        g.addColorStop(0.4, 'rgba(' + b.col + ',' + b.alpha + ')');
        g.addColorStop(1, 'rgba(' + b.col + ',0)');
        ctx.fillStyle = g;
        ctx.fill();
      }
      ctx.restore();
    }

    // Stars
    for (const s of stars) {
      const a = 0.5 + Math.sin(s.tw) * 0.4;
      ctx.fillStyle = `rgba(255,255,255,${a})`;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }

    // Shooting stars — bright head + fading tail
    for (const ss of shootingStars) {
      const a = Math.min(1, ss.life / 12);
      const tx = ss.x - ss.vx * 6;
      const ty = ss.y - ss.vy * 6;
      const sg = ctx.createLinearGradient(ss.x, ss.y, tx, ty);
      sg.addColorStop(0, 'rgba(255,255,255,' + a + ')');
      sg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.strokeStyle = sg;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(ss.x, ss.y);
      ctx.lineTo(tx, ty);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,' + a + ')';
      ctx.beginPath();
      ctx.arc(ss.x, ss.y, 2, 0, Math.PI * 2);
      ctx.fill();
    }

    // ── Synthwave sun (iconic Outrun look: solid top, banded bottom, multi-color gradient) ──
    const cx = W * 0.78;
    const cy = GROUND - 280;
    const sunR = 48;
    // During OVERDRIVE the synthwave sun pulses harder + larger — the iconic
    // backdrop literally throbs with the multiplier. Subtle in normal play
    // (±2.5%), dramatic during fever (±9%).
    const pulse = feverActive
      ? 1 + Math.sin(frame * 0.18) * 0.09
      : 1 + Math.sin(frame * 0.04) * 0.025;
    const R = sunR * pulse;

    // Outer atmospheric glow (3 stacked halos, additive)
    ctx.globalCompositeOperation = 'lighter';
    const halo1 = ctx.createRadialGradient(cx, cy, R * 0.4, cx, cy, R * 3.4);
    halo1.addColorStop(0, 'rgba(' + palette.sunRGB + ', 0.55)');
    halo1.addColorStop(0.4, 'rgba(' + palette.sunRGB + ', 0.18)');
    halo1.addColorStop(1, 'rgba(' + palette.sunRGB + ', 0)');
    ctx.fillStyle = halo1;
    ctx.fillRect(cx - R * 3.4, cy - R * 3.4, R * 6.8, R * 6.8);
    const halo2 = ctx.createRadialGradient(cx, cy, R * 0.6, cx, cy, R * 1.7);
    halo2.addColorStop(0, 'rgba(255, 200, 120, 0.35)');
    halo2.addColorStop(1, 'rgba(255, 200, 120, 0)');
    ctx.fillStyle = halo2;
    ctx.fillRect(cx - R * 1.7, cy - R * 1.7, R * 3.4, R * 3.4);
    ctx.globalCompositeOperation = 'source-over';

    // Sun body with rich vertical gradient (top bright → bottom saturated)
    const body = ctx.createLinearGradient(0, cy - R, 0, cy + R);
    body.addColorStop(0,    '#fffbe6');
    body.addColorStop(0.18, '#ffe14a');
    body.addColorStop(0.5,  palette.sun);
    body.addColorStop(0.82, 'rgba(' + palette.sunRGB + ', 0.95)');
    body.addColorStop(1,    'rgba(' + palette.sunRGB + ', 0.55)');
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.fill();

    // Subtle inner highlight (gives 3D feel)
    const hl = ctx.createRadialGradient(cx - R * 0.35, cy - R * 0.4, 0, cx - R * 0.35, cy - R * 0.4, R * 0.9);
    hl.addColorStop(0, 'rgba(255, 255, 255, 0.55)');
    hl.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = hl;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.fill();

    // Iconic bottom bands — tapered to sun silhouette, progressively thicker
    ctx.fillStyle = palette.sky[0];
    const bandDefs = [
      { d: 0.08, h: 2 },
      { d: 0.22, h: 2.6 },
      { d: 0.38, h: 3.2 },
      { d: 0.56, h: 3.8 },
      { d: 0.78, h: 4.4 }
    ];
    for (const b of bandDefs) {
      const by = cy + R * b.d;
      const dy = by - cy;
      const w = Math.sqrt(Math.max(0, R * R - dy * dy)) * 2;
      if (w < 4) continue;
      ctx.fillRect(cx - w / 2, by, w, b.h);
    }

    // Thin rim light (top arc only, for that Outrun "neon edge" feel)
    ctx.strokeStyle = 'rgba(255, 245, 210, 0.7)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy, R, Math.PI * 1.1, Math.PI * 1.9);
    ctx.stroke();

    // Mountains
    const mh = palette.mountainHue;
    for (const m of mountains) {
      ctx.fillStyle = `hsl(${mh + (m.hue - 280) * 0.3}, 50%, 14%)`;
      ctx.beginPath();
      ctx.moveTo(m.x, GROUND);
      ctx.lineTo(m.x + m.w / 2, GROUND - m.h);
      ctx.lineTo(m.x + m.w, GROUND);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = `hsla(${mh + 40}, 90%, 60%, 0.5)`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(m.x, GROUND);
      ctx.lineTo(m.x + m.w / 2, GROUND - m.h);
      ctx.lineTo(m.x + m.w, GROUND);
      ctx.stroke();
    }

    // Buildings (closer parallax)
    for (const b of buildings) {
      ctx.fillStyle = palette.ground;
      ctx.fillRect(b.x, GROUND - b.h, b.w, b.h);
      ctx.strokeStyle = 'rgba(' + palette.accent + ', 0.4)';
      ctx.lineWidth = 1;
      ctx.strokeRect(b.x + 0.5, GROUND - b.h + 0.5, b.w - 1, b.h - 1);
      if (b.windows) {
        // Window grid with a STABLE per-window seed (independent of b.x, which
        // shifts every frame as the city scrolls). Hashes the per-building
        // seed with the local row/col index so each window stays the same
        // colour/tone, with a slow flicker tick toggling a few at a time.
        const flickerTick = Math.floor(frame / 18);
        let row = 0;
        for (let wy = GROUND - b.h + 12; wy < GROUND - 20; wy += 14) {
          let col = 0;
          for (let wx = b.x + 6; wx < b.x + b.w - 6; wx += 12) {
            const seed = ((b.seed ^ (col * 73856093) ^ (row * 19349663)) >>> 0);
            col++;
            if (seed % 100 < 55) continue; // ~55% dark walls, 45% lit windows
            // Slow flicker: a small fraction toggles each tick
            if (((seed ^ flickerTick) % 47) < 4) continue;
            // Warm yellow vs cool cyan vs hot pink (rare) — biome-agnostic city
            const tone = seed % 100;
            const cl = tone < 70 ? '255, 225, 74'
                     : tone < 92 ? '120, 230, 255'
                     :             '255, 80, 220';
            const a = 0.45 + ((seed >> 4) % 30) / 100; // 0.45..0.75
            ctx.fillStyle = 'rgba(' + cl + ',' + a + ')';
            ctx.fillRect(wx, wy, 5, 6);
          }
          row++;
        }
      }
    }
  }

  // Horizontal speed streaks — intensity scales with run speed
  function drawSpeedLines() {
    const intensity = Math.max(0, (speed - 8) / 7); // 0 at speed 8, 1 at 15
    if (intensity <= 0.02) return;
    const n = Math.floor(4 + intensity * 8);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < n; i++) {
      const seed = (i * 137 + Math.floor(scrollX / 18)) % 1000;
      const y = (seed / 1000) * GROUND;
      const len = 40 + (seed % 90);
      const x = W - ((scrollX * (2.2 + (seed % 5) * 0.4) + seed * 9) % (W + 160));
      const a = intensity * (0.10 + (seed % 4) * 0.04);
      const g = ctx.createLinearGradient(x, y, x + len, y);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(0.5, 'rgba(' + palette.accent + ',' + a + ')');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x, y, len, 1.5);
    }
    ctx.restore();
  }

  function drawGround() {
    ctx.fillStyle = palette.ground;
    ctx.fillRect(0, GROUND, W, H - GROUND);

    ensureEnvGradients();
    // Atmospheric haze band at the horizon
    ctx.fillStyle = envCache.haze;
    ctx.fillRect(0, GROUND - 60, W, 90);

    // Sun light reflection shimmering down the floor
    const sunCx = W * 0.78;
    ctx.fillStyle = envCache.refl;
    const reflW = 90 + Math.sin(frame * 0.08) * 10;
    ctx.beginPath();
    ctx.moveTo(sunCx - reflW * 0.4, GROUND);
    ctx.lineTo(sunCx + reflW * 0.4, GROUND);
    ctx.lineTo(sunCx + reflW, H);
    ctx.lineTo(sunCx - reflW, H);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = palette.sun;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, GROUND);
    ctx.lineTo(W, GROUND);
    ctx.stroke();

    // Dive-Slam ground shock — a bright horizon flare racing outward from impact
    const slamAge = frame - slamFlash;
    if (slamAge >= 0 && slamAge < 16) {
      const k = 1 - slamAge / 16;
      const fcx = player.x + player.w / 2;
      const span = 120 + slamAge * 55;
      const g = ctx.createLinearGradient(fcx - span, 0, fcx + span, 0);
      g.addColorStop(0, 'rgba(255,225,74,0)');
      g.addColorStop(0.5, 'rgba(255,240,180,' + (0.85 * k) + ')');
      g.addColorStop(1, 'rgba(255,225,74,0)');
      ctx.save();
      ctx.strokeStyle = g;
      ctx.lineWidth = 3 + k * 5;
      ctx.shadowColor = 'rgba(255,225,120,' + k + ')';
      ctx.shadowBlur = 24 * k;
      ctx.beginPath();
      ctx.moveTo(fcx - span, GROUND);
      ctx.lineTo(fcx + span, GROUND);
      ctx.stroke();
      ctx.restore();
    }

    ctx.strokeStyle = 'rgba(' + palette.accent + ', 0.18)';
    ctx.lineWidth = 1;
    const offset = scrollX % 40;
    for (let x = -offset; x < W; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, GROUND);
      ctx.lineTo((x - W / 2) * 3 + W / 2, H);
      ctx.stroke();
    }
    for (let y = GROUND + 20; y < H; y += 30) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }
  }

  function drawPlayer() {
    const sk = currentSkin();
    // Light pool the orb casts on the ground (sells dynamic lighting).
    // When grounded it pulses with the roll cycle and stretches forward with
    // run speed, so the shadow visibly feels the motion instead of sitting still.
    {
      const grounded = player.onGround;
      const lx = player.x + player.w / 2;
      const air = Math.max(0, GROUND - (player.y + player.h));
      const rollPulse  = grounded ? (1 + Math.sin(groundRoll * 2) * 0.10) : 1;
      const speedStretch = grounded ? 1 + Math.min(speed / 30, 0.40) : 1;
      const lxOff = grounded ? Math.sin(groundRoll * 2) * 1.6 : 0;
      const spread = 34 + Math.min(air * 0.25, 30);
      const la = 0.5 * Math.max(0.2, 1 - air / 260);
      const sx = spread * speedStretch * rollPulse;
      const sy = spread * 0.32 / Math.max(0.9, speedStretch) * rollPulse;
      const lg = ctx.createRadialGradient(lx + lxOff, GROUND, 0, lx + lxOff, GROUND, sx);
      lg.addColorStop(0, 'rgba(' + sk.trail + ', ' + (la * 0.7) + ')');
      lg.addColorStop(1, 'rgba(' + sk.trail + ', 0)');
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = lg;
      ctx.beginPath();
      ctx.ellipse(lx + lxOff, GROUND, sx, sy, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    // High-combo electric crackle — short jagged arcs flickering around the
    // orb at combo ≥ 10. Reads instantly as "you're in the zone". Arc count
    // and brightness scale with the tier the player is currently holding.
    if (combo >= 10) {
      const acx = player.x + player.w / 2;
      const acy = player.y + player.h / 2;
      const arcN = combo >= 30 ? 5 : combo >= 20 ? 4 : combo >= 15 ? 3 : 2;
      const hot = combo >= 30 ? '255,61,240' : combo >= 20 ? '255,140,60' : '255,225,74';
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = 'rgba(' + hot + ',0.85)';
      ctx.lineWidth = 1.5;
      ctx.lineCap = 'round';
      for (let i = 0; i < arcN; i++) {
        const baseA = (frame * 0.13 + i * 2.094) % (Math.PI * 2);
        const r0 = 24 + (i % 2) * 4;
        const r1 = r0 + 14 + Math.random() * 10;
        let x = acx + Math.cos(baseA) * r0;
        let y = acy + Math.sin(baseA) * r0;
        const segs = 3;
        ctx.beginPath();
        ctx.moveTo(x, y);
        for (let s = 1; s <= segs; s++) {
          const t = s / segs;
          const ang = baseA + (Math.random() - 0.5) * 0.6;
          const r = r0 + (r1 - r0) * t;
          x = acx + Math.cos(ang) * r;
          y = acy + Math.sin(ang) * r;
          ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      ctx.restore();
    }

    // Trail — soft glow without shadowBlur (skin-tinted). During OVERDRIVE the
    // tint hue-cycles per segment so the streak literally screams the multiplier.
    for (let i = 0; i < player.trail.length; i++) {
      const t = player.trail[i];
      const a = Math.max(0, t.life / 20);
      const r = 18 * a;
      let trailRGB = sk.trail;
      if (feverActive) {
        const hue = (frame * 8 + i * 18) % 360;
        // Cheap hsl-ish: convert hue to rough rgb tuple via fixed conversion
        const h6 = (hue / 60) % 6;
        const X = 255 * (1 - Math.abs((h6 % 2) - 1));
        const map = [[255, X, 0], [X, 255, 0], [0, 255, X], [0, X, 255], [X, 0, 255], [255, 0, X]];
        const m = map[Math.floor(h6)];
        trailRGB = (m[0] | 0) + ',' + (m[1] | 0) + ',' + (m[2] | 0);
      }
      const grad = ctx.createRadialGradient(t.x, t.y, 0, t.x, t.y, r);
      grad.addColorStop(0, 'rgba(' + trailRGB + ', ' + (a * 0.5) + ')');
      grad.addColorStop(1, 'rgba(' + trailRGB + ', 0)');
      ctx.fillStyle = grad;
      ctx.fillRect(t.x - r, t.y - r, r * 2, r * 2);
    }

    // PHASE ghost aura — translucent purple echoes streaming behind the orb,
    // plus a pulsing halo. Reads instantly as "intangible" without touching the
    // core orb render. Dims out over the final half-second as the power expires.
    if (phaseFrames > 0) {
      const gcx = player.x + player.w / 2;
      const gcy = player.y + player.h / 2;
      const fade = Math.min(1, phaseFrames / 30);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 1; i <= 4; i++) {
        const ex = gcx - i * (6 + speed * 0.6);
        const a = 0.22 * fade * (1 - i / 5);
        const r = 22 + i * 2;
        const eg = ctx.createRadialGradient(ex, gcy, 0, ex, gcy, r);
        eg.addColorStop(0, 'rgba(200,150,255,' + a + ')');
        eg.addColorStop(1, 'rgba(200,150,255,0)');
        ctx.fillStyle = eg;
        ctx.beginPath();
        ctx.arc(ex, gcy, r, 0, Math.PI * 2);
        ctx.fill();
      }
      const pr = 30 + Math.sin(frame * 0.4) * 4;
      ctx.strokeStyle = 'rgba(210,170,255,' + (0.55 * fade) + ')';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(gcx, gcy, pr, 0, Math.PI * 2);
      ctx.stroke();
      // Chromatic split echoes — short cyan/magenta horizontal slices behind
      // the orb, jittering each frame. Sells the "out of phase" effect by
      // RGB-splitting the silhouette itself instead of just the aura.
      const split = 3 + Math.sin(frame * 0.5) * 1.5;
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = 'rgba(25,240,255,' + (0.4 * fade) + ')';
      ctx.beginPath();
      ctx.arc(gcx - split, gcy + 1.5, 20, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,61,240,' + (0.4 * fade) + ')';
      ctx.beginPath();
      ctx.arc(gcx + split, gcy - 1.5, 20, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    const cx = player.x + player.w / 2;
    const sT = player.slideT;
    // Subtle vertical bob in the roll cycle — small (~1px) but reads as life.
    // Zero while airborne or sliding so it never fights other animations.
    const groundedBob = (player.onGround && sT < 0.15) ? Math.sin(groundRoll * 2) * 1.0 : 0;
    // When sliding, the orb drops to the floor and squashes into a flat ellipse
    const cy = (player.y + player.h / 2) + ((GROUND - 16) - (player.y + player.h / 2)) * sT + groundedBob;
    const baseR = 22;

    // SPRINT jet-stream — big bright horizontal streak trailing the orb during
    // the boost. Drawn first so the orb sits on top of its own exhaust.
    if (sprintFrames > 0) {
      const intensity = Math.min(1, sprintFrames / 30);
      const len = 120 + Math.sin(frame * 0.6) * 18;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const jet = ctx.createLinearGradient(cx - len, cy, cx + 4, cy);
      jet.addColorStop(0, 'rgba(255,255,255,0)');
      jet.addColorStop(0.5, 'rgba(255,255,255,' + (0.20 * intensity).toFixed(3) + ')');
      jet.addColorStop(0.85, 'rgba(' + sk.trail + ',' + (0.55 * intensity).toFixed(3) + ')');
      jet.addColorStop(1, 'rgba(255,255,255,' + (0.7 * intensity).toFixed(3) + ')');
      ctx.fillStyle = jet;
      ctx.beginPath();
      ctx.ellipse(cx - len / 2, cy, len / 2, 12 + 4 * intensity, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Motion smears — short horizontal streaks trailing behind the orb when
    // running fast (speed > 8). Sells the speed without spamming particles.
    if (player.onGround && speed > 8 && sT < 0.4) {
      const smearN = Math.min(3, Math.floor((speed - 8) / 2) + 1);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < smearN; i++) {
        const off = (i + 1) * 14;
        const a = (0.22 - i * 0.05) * Math.min(1, (speed - 8) / 5);
        ctx.strokeStyle = 'rgba(' + sk.trail + ',' + a.toFixed(3) + ')';
        ctx.lineWidth = 2 - i * 0.4;
        ctx.beginPath();
        ctx.moveTo(cx - baseR * 1.2 - off, cy);
        ctx.lineTo(cx - baseR * 1.2 - off - 22, cy);
        ctx.stroke();
      }
      ctx.restore();
    }
    const pulse = (1 + Math.sin(frame * 0.18) * 0.06);
    // Combine slide squash with a transient landing squash-bounce
    const sqX = (1 + sT * 0.55) * (1 + landBounce * 0.45);
    const sqY = (1 - sT * 0.58) * (1 - landBounce * 0.5);
    // Glow matches the core's squash exactly, but fades as it flattens so a
    // flat orb gets a soft subtle glow instead of a harsh bright streak.
    const glowAlpha = 1 - sT * 0.5;

    // PRISM skin — rainbow halo cycling around the orb, drawn first so the core
    // sits cleanly on top. Skipped if the chromatic glitch frame is also active.
    if (sk.id === 'prism') {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let k = 0; k < 6; k++) {
        const hue = (frame * 4 + k * 60) % 360;
        const a = 0.42 - k * 0.06;
        ctx.strokeStyle = 'hsla(' + hue + ',95%,65%,' + a + ')';
        ctx.lineWidth = 2.2 - k * 0.25;
        ctx.beginPath();
        ctx.arc(cx, cy, baseR * (1.25 + k * 0.18) * pulse, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }
    // TEMPO skin — cyan clock arcs always orbiting (idle flourish even off-warp)
    if (sk.id === 'tempo') {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let k = 0; k < 2; k++) {
        const rr = baseR * (1.5 + k * 0.4);
        const ang = frame * (0.05 + k * 0.03) * (k % 2 === 0 ? 1 : -1);
        ctx.strokeStyle = 'rgba(180,240,255,' + (0.5 - k * 0.18) + ')';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.arc(cx, cy, rr, ang, ang + Math.PI * 0.7);
        ctx.stroke();
      }
      ctx.restore();
    }

    // GLITCH skin effect: chromatic offset (cyan + pink "ghost" rings flicker around the orb)
    if (sk.animated && sk.id !== 'prism' && sk.id !== 'tempo' && Math.floor(frame / 6) % 4 !== 0) {
      const jitter = (Math.random() - 0.5) * 4;
      ctx.fillStyle = 'rgba(25, 240, 255, 0.35)';
      ctx.beginPath();
      ctx.ellipse(cx - 3 + jitter, cy, baseR * 0.95 * sqX, baseR * 0.95 * sqY, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255, 61, 240, 0.35)';
      ctx.beginPath();
      ctx.ellipse(cx + 3 - jitter, cy, baseR * 0.95 * sqX, baseR * 0.95 * sqY, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // High-combo rim glow — at combo ≥ 15 the orb gains a hot outer rim,
    // brightening with the combo tier. Reads instantly as "tier upgrade".
    if (combo >= 15) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const rgb = combo >= 30 ? '255,61,240' : combo >= 20 ? '255,140,60' : '255,225,74';
      const a = Math.min(0.55, 0.30 + (combo - 15) * 0.012);
      const rimR = baseR * 1.35 * pulse;
      ctx.strokeStyle = 'rgba(' + rgb + ',' + a + ')';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(cx, cy, rimR, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(' + rgb + ',' + (a * 0.6) + ')';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(cx, cy, rimR + 4, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // Outer glow halo (skin-tinted) — squashes with the orb, fades when flat
    const glowR = baseR * 2.2 * pulse;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(sqX, sqY);
    ctx.globalAlpha = glowAlpha;
    const halo = ctx.createRadialGradient(0, 0, baseR * 0.6, 0, 0, glowR);
    halo.addColorStop(0, sk.halo[0]);
    halo.addColorStop(0.55, sk.halo[1]);
    halo.addColorStop(1, sk.halo[1].replace(/0\.\d+\)$/, '0)'));
    ctx.fillStyle = halo;
    ctx.fillRect(-glowR, -glowR, glowR * 2, glowR * 2);
    ctx.restore();

    // Orbital ring — counter-rotates while in air for "spin" feel
    if (!player.onGround) {
      ctx.strokeStyle = sk.ring;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(cx, cy, baseR * 1.4, baseR * 0.45, player.rot, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Core body (skin-tinted) — drawn under a squash transform so the radial
    // gradient AND the inner highlight stretch together with the shape.
    // Gradient is cached per skin (constant local coords) to avoid per-frame alloc.
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(sqX, sqY);
    if (sk._coreGrad == null) {
      const cg = ctx.createRadialGradient(-baseR * 0.3, -baseR * 0.3, 0, 0, 0, baseR);
      cg.addColorStop(0,   sk.core[0]);
      cg.addColorStop(0.3, sk.core[1]);
      cg.addColorStop(0.7, sk.core[2]);
      cg.addColorStop(1,   sk.core[3]);
      sk._coreGrad = cg;
    }
    ctx.fillStyle = sk._coreGrad;
    ctx.beginPath();
    ctx.arc(0, 0, baseR * pulse, 0, Math.PI * 2);
    ctx.fill();
    // Rolling surface — a darker trailing hemisphere + a bright "continent" pip
    // orbit the orb at the physically-correct rate. Clipped to the body so
    // they never poke past the silhouette; skipped during slide for clean squash.
    if (player.onGround && sT < 0.35) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(0, 0, baseR * pulse, 0, Math.PI * 2);
      ctx.clip();
      ctx.rotate(groundRoll);
      // Far hemisphere shading — the "back of the planet"
      ctx.fillStyle = 'rgba(8, 6, 24, 0.22)';
      ctx.beginPath();
      ctx.arc(0, 0, baseR * pulse, -Math.PI / 2, Math.PI / 2);
      ctx.fill();
      // Bright equatorial pip — the unmistakable rolling cue
      ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
      ctx.beginPath();
      ctx.arc(baseR * 0.58, 0, baseR * 0.14, 0, Math.PI * 2);
      ctx.fill();
      // Small counter-pip on the back side for parallax depth
      ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
      ctx.beginPath();
      ctx.arc(-baseR * 0.6, baseR * 0.18, baseR * 0.10, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    // Specular highlight (upper-left)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.beginPath();
    ctx.arc(-baseR * 0.34, -baseR * 0.38, baseR * 0.18, 0, Math.PI * 2);
    ctx.fill();
    // Forward-facing eyes — look toward motion (up when rising, down when falling)
    const look = player.onGround ? 0 : Math.max(-1, Math.min(1, player.vy / 12));
    const eyeY = -baseR * 0.08 + look * baseR * 0.22;
    const eyeDX = baseR * 0.30, eyeR = baseR * 0.165;
    const blink = (frame % 200) < 6 ? 0.15 : 1; // occasional blink
    ctx.fillStyle = '#0a0e1e';
    for (const ex of [-eyeDX, eyeDX]) {
      ctx.beginPath();
      ctx.ellipse(ex, eyeY, eyeR, eyeR * blink, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    if (blink > 0.5) {
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      for (const ex of [-eyeDX, eyeDX]) {
        ctx.beginPath();
        ctx.arc(ex + eyeR * 0.3, eyeY - eyeR * 0.3, eyeR * 0.34, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();

    // OVERDRIVE aura — hue-cycling energy rings pulsing around the orb
    if (feverActive) {
      const hue = (frame * 6) % 360;
      for (let k = 0; k < 3; k++) {
        const rr = baseR * (1.6 + k * 0.45) + Math.sin(frame * 0.3 + k) * 4;
        ctx.strokeStyle = 'hsla(' + ((hue + k * 50) % 360) + ', 100%, 65%, ' + (0.55 - k * 0.16) + ')';
        ctx.lineWidth = 3 - k * 0.6;
        ctx.beginPath();
        ctx.arc(cx, cy, rr, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    // TIME WARP — concentric clock-face arcs orbiting the orb, plus subtle
    // cyan glow halo. Reads as "time bent around you" without competing with
    // other auras (we draw it BEFORE magnet/shield so they still layer cleanly).
    if (timewarpFrames > 0) {
      const fade = Math.min(1, timewarpFrames / 24);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      // Soft cyan halo
      const tg = ctx.createRadialGradient(cx, cy, baseR * 0.8, cx, cy, baseR * 2.6);
      tg.addColorStop(0, 'rgba(120,230,255,0)');
      tg.addColorStop(0.6, 'rgba(120,230,255,' + (0.18 * fade) + ')');
      tg.addColorStop(1, 'rgba(120,230,255,0)');
      ctx.fillStyle = tg;
      ctx.fillRect(cx - baseR * 2.6, cy - baseR * 2.6, baseR * 5.2, baseR * 5.2);
      // Three rotating arc segments — fast outer, slow inner (opposite directions)
      ctx.lineCap = 'round';
      for (let k = 0; k < 3; k++) {
        const rr = baseR * (1.8 + k * 0.4);
        const dir = k % 2 === 0 ? 1 : -1;
        const ang = frame * (0.06 + k * 0.03) * dir;
        ctx.strokeStyle = 'rgba(180,240,255,' + (0.65 * fade - k * 0.15) + ')';
        ctx.lineWidth = 2.4 - k * 0.5;
        ctx.beginPath();
        ctx.arc(cx, cy, rr, ang, ang + Math.PI * 0.8);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(cx, cy, rr, ang + Math.PI, ang + Math.PI * 1.4);
        ctx.stroke();
      }
      ctx.restore();
    }

    // Magnet field
    if (magnetFrames > 0) {
      const mr = 60 + (Math.sin(frame * 0.15) * 8);
      ctx.strokeStyle = 'rgba(255, 225, 74, 0.35)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, mr, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255, 225, 74, 0.18)';
      ctx.beginPath();
      ctx.arc(cx, cy, mr + 14, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Shield aura — squashes with the orb while sliding
    if (shieldActive || frame - shieldFlashFrame < 30) {
      const flash = frame - shieldFlashFrame < 30 ? 1 - (frame - shieldFlashFrame) / 30 : 1;
      const sr = baseR * 1.9 + Math.sin(frame * 0.18) * 3;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(sqX, sqY);
      ctx.globalAlpha = glowAlpha;
      const sg = ctx.createRadialGradient(0, 0, baseR, 0, 0, sr);
      sg.addColorStop(0, 'rgba(120, 230, 255, 0)');
      sg.addColorStop(0.7, 'rgba(120, 230, 255, ' + (0.25 * flash) + ')');
      sg.addColorStop(1, 'rgba(120, 230, 255, ' + (0.55 * flash) + ')');
      ctx.fillStyle = sg;
      ctx.fillRect(-sr, -sr, sr * 2, sr * 2);
      ctx.restore();
    }

    // Invincibility blink
    if (frame < invincibleUntil && Math.floor(frame / 4) % 2 === 0) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
      ctx.beginPath();
      ctx.ellipse(cx, cy, baseR * 1.1 * sqX, baseR * 1.1 * sqY, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawMystery() {
    for (const m of mysteryBoxes) {
      const px = m.x;
      const py = m.y;
      // pulsing halo
      const halo = 50 + m.glow * 16;
      const g = ctx.createRadialGradient(px, py, 0, px, py, halo);
      g.addColorStop(0, 'rgba(255, 230, 120, 0.7)');
      g.addColorStop(0.5, 'rgba(255, 80, 220, 0.3)');
      g.addColorStop(1, 'rgba(255, 80, 220, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(px - halo, py - halo, halo * 2, halo * 2);
      // box rotated
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(m.t * 0.5);
      const r = m.r;
      const grad = ctx.createLinearGradient(0, -r, 0, r);
      grad.addColorStop(0, '#ffe14a');
      grad.addColorStop(0.5, '#ff7a3d');
      grad.addColorStop(1, '#ff3df0');
      ctx.fillStyle = grad;
      ctx.fillRect(-r, -r, r * 2, r * 2);
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.strokeRect(-r + 1, -r + 1, r * 2 - 2, r * 2 - 2);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 22px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('?', 0, 1);
      ctx.restore();
    }
  }

  function drawPowerups() {
    for (const p of powerups) {
      const float = Math.sin(p.t * 2) * 4;
      const px = p.x;
      const py = p.y + float;
      // glow
      const g = ctx.createRadialGradient(px, py, 0, px, py, p.r * 1.8);
      const col = p.type === 'magnet' ? '255, 225, 74'
                : p.type === 'shield' ? '25, 240, 255'
                : p.type === 'phase'  ? '200, 168, 255'
                : p.type === 'timewarp' ? '120, 230, 255'
                : '255, 255, 255';
      g.addColorStop(0, 'rgba(' + col + ', 0.6)');
      g.addColorStop(1, 'rgba(' + col + ', 0)');
      ctx.fillStyle = g;
      ctx.fillRect(px - p.r * 1.8, py - p.r * 1.8, p.r * 3.6, p.r * 3.6);
      ctx.fillStyle = 'rgba(' + col + ', 1)';
      ctx.beginPath();
      ctx.arc(px, py, p.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#07091a';
      ctx.font = 'bold 22px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(
        p.type === 'magnet'   ? '🧲' :
        p.type === 'shield'   ? '🛡' :
        p.type === 'phase'    ? '👻' :
        p.type === 'timewarp' ? '⏱' :
        '⚡',
        px, py + 2);
    }
  }

  // Magnet attraction streaks — soft additive lines from each in-range coin
  // toward the player while the magnet is active. Sells the pull effect and
  // turns the magnet from "just pulls them" into "looks INSANE pulling them".
  // Coin-chain arcs — short jagged lines connecting consecutive combo pickups,
  // fading over 14 frames. Reads as a literal "chain" being woven through the
  // air as you grab streaks of coins.
  function drawCoinChains() {
    if (!coinChains.length) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    // Hot streak: at combo ≥ 10 (or OVERDRIVE) the chain becomes multi-segment
    // jagged lightning instead of a single bend. Reads as actual electric arcs.
    const hot = feverActive || combo >= 10;
    const veryHot = feverActive || combo >= 20;
    for (const c of coinChains) {
      const k = c.life / 14;
      const dx = c.x2 - c.x1, dy = c.y2 - c.y1;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len < 1) continue;
      const ux = -dy / len, uy = dx / len;
      // Build a poly-line: more segments + sharper jitter when hot
      const segs = veryHot ? 5 : hot ? 4 : 2;
      const jit = veryHot ? 14 : hot ? 10 : 6;
      const pts = [{ x: c.x1, y: c.y1 }];
      for (let i = 1; i < segs; i++) {
        const t = i / segs;
        const j = (Math.random() - 0.5) * jit;
        pts.push({
          x: c.x1 + dx * t + ux * j,
          y: c.y1 + dy * t + uy * j
        });
      }
      pts.push({ x: c.x2, y: c.y2 });
      // Outer glow stroke — hue depends on heat tier
      const outerRGB = veryHot ? '255,61,240' : hot ? '255,140,60' : '255,225,120';
      ctx.strokeStyle = 'rgba(' + outerRGB + ',' + (0.7 * k).toFixed(3) + ')';
      ctx.lineWidth = veryHot ? 3 : 2;
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.stroke();
      // Bright white core for that electric look
      ctx.strokeStyle = 'rgba(255,255,255,' + (0.85 * k).toFixed(3) + ')';
      ctx.lineWidth = 1.0;
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.stroke();
      // Hot tier: spawn tiny sparks along the path (cheap, decays with k)
      if (veryHot && Math.random() < 0.5) {
        for (let s = 0; s < 2; s++) {
          const t = Math.random();
          const sx = c.x1 + dx * t;
          const sy = c.y1 + dy * t;
          ctx.fillStyle = 'rgba(255,255,255,' + (0.8 * k) + ')';
          ctx.beginPath();
          ctx.arc(sx + (Math.random() - 0.5) * 6, sy + (Math.random() - 0.5) * 6, 1.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    ctx.restore();
  }

  function drawMagnetStreaks() {
    if (magnetFrames <= 0 || !coinsArr.length) return;
    const pcx = player.x + player.w / 2;
    const pcy = player.y + player.h / 2;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineWidth = 1.4;
    for (const c of coinsArr) {
      const dx = pcx - c.x;
      const dy = pcy - c.y;
      const d2 = dx * dx + dy * dy;
      if (d2 > 200 * 200 || d2 < 30 * 30) continue;
      const d = Math.sqrt(d2);
      const fade = 1 - d / 200;
      const col = c.type === 'red' ? '255,80,220' : c.type === 'blue' ? '120,230,255' : '255,225,74';
      const g = ctx.createLinearGradient(c.x, c.y, pcx, pcy);
      g.addColorStop(0, 'rgba(' + col + ',' + (0.55 * fade).toFixed(3) + ')');
      g.addColorStop(1, 'rgba(' + col + ',0)');
      ctx.strokeStyle = g;
      ctx.beginPath();
      ctx.moveTo(c.x, c.y);
      ctx.lineTo(pcx, pcy);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawSprings() {
    for (const s of springs) {
      const cx = s.x + s.w / 2;
      const compress = s.used > 0 ? (s.used / 10) * 6 : 0; // squashes briefly after firing
      const top = s.y + compress;
      const h = s.h - compress;
      const pulse = 0.7 + 0.3 * Math.abs(Math.sin(s.t));
      // Glow halo under the pad
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(cx, GROUND, 0, cx, GROUND, 56);
      g.addColorStop(0, 'rgba(255,255,255,' + (0.45 * pulse) + ')');
      g.addColorStop(0.5, 'rgba(25,240,255,' + (0.25 * pulse) + ')');
      g.addColorStop(1, 'rgba(25,240,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(cx - 56, GROUND - 56, 112, 80);
      ctx.restore();
      // Base plate — bright cyan with white top edge
      const grad = ctx.createLinearGradient(s.x, top, s.x, top + h);
      grad.addColorStop(0, '#ffffff');
      grad.addColorStop(0.45, '#19f0ff');
      grad.addColorStop(1, '#1a4a8c');
      ctx.fillStyle = grad;
      ctx.fillRect(s.x, top, s.w, h);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(s.x, top, s.w, 2);
      // Upward chevrons — show direction at a glance
      ctx.fillStyle = 'rgba(7, 9, 26, 0.75)';
      for (let i = 0; i < 3; i++) {
        const ax = s.x + 14 + i * 16;
        const ay = top + h * 0.55 - Math.sin(s.t + i * 0.5) * 1.4;
        ctx.beginPath();
        ctx.moveTo(ax, ay + 5);
        ctx.lineTo(ax + 5, ay - 3);
        ctx.lineTo(ax - 5, ay - 3);
        ctx.closePath();
        ctx.fill();
      }
    }
  }

  function drawTexts() {
    for (const t of texts) {
      const a = Math.min(1, t.life / 40);
      ctx.globalAlpha = a;
      ctx.fillStyle = t.color;
      ctx.font = 'bold ' + Math.round(22 * t.scale) + 'px -apple-system, "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(t.msg, t.x, t.y);
    }
    ctx.globalAlpha = 1;
  }

  // Lingering ground cracks from Dive-Slams — fading glow-edged fissures on
  // the floor. Scrolls with the world; draws below obstacles/meteors so the
  // gameplay reads on top of the scenery flourish.
  function drawSlamCracks() {
    if (!slamCracks.length) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    for (const c of slamCracks) {
      const k = c.life / 90;
      ctx.strokeStyle = 'rgba(255,225,120,' + (0.55 * k).toFixed(3) + ')';
      ctx.shadowColor = 'rgba(255,200,80,' + (0.6 * k).toFixed(3) + ')';
      ctx.shadowBlur = 8 * k;
      ctx.lineWidth = 2;
      for (const seg of c.segs) {
        ctx.beginPath();
        ctx.moveTo(c.x + seg[0].x, GROUND + seg[0].y);
        for (let i = 1; i < seg.length; i++) ctx.lineTo(c.x + seg[i].x, GROUND + seg[i].y);
        ctx.stroke();
      }
      // bright core stroke
      ctx.shadowBlur = 0;
      ctx.strokeStyle = 'rgba(255,255,255,' + (0.55 * k).toFixed(3) + ')';
      ctx.lineWidth = 1;
      for (const seg of c.segs) {
        ctx.beginPath();
        ctx.moveTo(c.x + seg[0].x, GROUND + seg[0].y);
        for (let i = 1; i < seg.length; i++) ctx.lineTo(c.x + seg[i].x, GROUND + seg[i].y);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  // Meteor + telegraphed ground shadow. The shadow pulses brighter as the
  // impact frame approaches so the danger window reads at a glance.
  function drawMeteors() {
    if (!meteors.length) return;
    for (const m of meteors) {
      // Falling body
      if (m.ttl > 0) {
        const cx = m.tx + (GROUND - m.y) * 0.0; // straight down (visually clean)
        const cy = m.y;
        const tail = 26 + (1 - m.ttl / 56) * 14;
        // Tail streak (sky → meteor head)
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const tg = ctx.createLinearGradient(cx, cy - tail * 3, cx, cy);
        tg.addColorStop(0, 'rgba(255,160,60,0)');
        tg.addColorStop(0.6, 'rgba(255,140,40,0.5)');
        tg.addColorStop(1, 'rgba(255,225,140,0.9)');
        ctx.fillStyle = tg;
        ctx.beginPath();
        ctx.moveTo(cx - m.r * 0.4, cy);
        ctx.lineTo(cx + m.r * 0.4, cy);
        ctx.lineTo(cx + 4, cy - tail * 3);
        ctx.lineTo(cx - 4, cy - tail * 3);
        ctx.closePath();
        ctx.fill();
        // Glow halo
        const hg = ctx.createRadialGradient(cx, cy, 0, cx, cy, m.r * 2.4);
        hg.addColorStop(0, 'rgba(255,200,100,0.7)');
        hg.addColorStop(1, 'rgba(255,140,40,0)');
        ctx.fillStyle = hg;
        ctx.fillRect(cx - m.r * 2.4, cy - m.r * 2.4, m.r * 4.8, m.r * 4.8);
        ctx.restore();
        // Hot core
        ctx.fillStyle = '#fff5d0';
        ctx.beginPath();
        ctx.arc(cx, cy, m.r * 0.55, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ff7a3d';
        ctx.beginPath();
        ctx.arc(cx, cy, m.r * 0.38, 0, Math.PI * 2);
        ctx.fill();
        // Ground shadow telegraph — pulsing arc; brighter as impact nears
        const urgency = Math.max(0, 1 - m.ttl / 56);
        const sw = 38 + urgency * 14;
        const sh = 10 + urgency * 4;
        const sa = 0.35 + 0.55 * urgency * (0.55 + 0.45 * Math.sin(m.t * 0.6));
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = 'rgba(255,140,60,' + sa.toFixed(3) + ')';
        ctx.beginPath();
        ctx.ellipse(m.tx, GROUND - 2, sw, sh, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,200,120,' + (0.8 * urgency).toFixed(3) + ')';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.ellipse(m.tx, GROUND - 2, sw + 4, sh + 1, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      } else if (m.impact > 0) {
        // Post-impact bloom — a fading orange crater
        const k = m.impact / 14;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const ig = ctx.createRadialGradient(m.tx, GROUND, 0, m.tx, GROUND, 60);
        ig.addColorStop(0, 'rgba(255,220,140,' + (0.7 * k) + ')');
        ig.addColorStop(1, 'rgba(255,140,40,0)');
        ctx.fillStyle = ig;
        ctx.fillRect(m.tx - 60, GROUND - 50, 120, 70);
        ctx.restore();
      }
    }
  }

  function drawObstacles() {
    for (const o of obstacles) {
      if (o.type === 'spike') {
        // JUMP hazard — magenta, with vertical shading for depth
        const g = ctx.createLinearGradient(o.x, o.y, o.x, o.y + o.h);
        g.addColorStop(0, '#ff6a9e');
        g.addColorStop(1, '#c01049');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(o.x, o.y + o.h);
        ctx.lineTo(o.x + o.w / 2, o.y);
        ctx.lineTo(o.x + o.w, o.y + o.h);
        ctx.closePath();
        ctx.fill();
        // bright edge facing the light (left)
        ctx.strokeStyle = 'rgba(255,200,220,0.9)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(o.x, o.y + o.h);
        ctx.lineTo(o.x + o.w / 2, o.y);
        ctx.stroke();
      } else if (o.type === 'block' || o.type === 'tall') {
        // JUMP hazard — magenta neon crate with face shading
        const g = ctx.createLinearGradient(o.x, o.y, o.x + o.w, o.y + o.h);
        g.addColorStop(0, '#2a0a18');
        g.addColorStop(1, '#12060c');
        ctx.fillStyle = g;
        ctx.fillRect(o.x, o.y, o.w, o.h);
        ctx.strokeStyle = '#ff3d6e';
        ctx.lineWidth = 3;
        ctx.strokeRect(o.x + 1.5, o.y + 1.5, o.w - 3, o.h - 3);
        // top highlight bar
        ctx.fillStyle = 'rgba(255,120,160,0.55)';
        ctx.fillRect(o.x + 3, o.y + 3, o.w - 6, 3);
        ctx.strokeStyle = 'rgba(255,61,110,0.85)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        if (o.type === 'block') {
          ctx.moveTo(o.x + 9, o.y + 9);
          ctx.lineTo(o.x + o.w - 9, o.y + o.h - 9);
          ctx.moveTo(o.x + o.w - 9, o.y + 9);
          ctx.lineTo(o.x + 9, o.y + o.h - 9);
        } else {
          for (let i = 0; i < 5; i++) {
            ctx.moveTo(o.x + 4, o.y + 14 + i * 16);
            ctx.lineTo(o.x + o.w - 4, o.y + 14 + i * 16);
          }
        }
        ctx.stroke();
      } else if (o.type === 'flying') {
        // AIR hazard — cyan drone, eye that tracks the player
        const cx2 = o.x + o.w / 2, cy2 = o.y + o.h / 2;
        const pulse = 1 + Math.sin(frame * 0.2) * 0.1;
        const rg = ctx.createRadialGradient(cx2, cy2, 2, cx2, cy2, o.w / 2 + 8);
        rg.addColorStop(0, 'rgba(120,245,255,0.5)');
        rg.addColorStop(1, 'rgba(25,240,255,0)');
        ctx.fillStyle = rg;
        ctx.fillRect(cx2 - o.w, cy2 - o.h, o.w * 2, o.h * 2);
        ctx.fillStyle = '#19f0ff';
        ctx.beginPath();
        ctx.ellipse(cx2, cy2, (o.w / 2) * pulse, (o.h / 2) * pulse, 0, 0, Math.PI * 2);
        ctx.fill();
        // pupil tracks player
        const ang = Math.atan2((player.y + player.h / 2) - cy2, (player.x + player.w / 2) - cx2);
        ctx.fillStyle = '#06121a';
        ctx.beginPath();
        ctx.arc(cx2 + Math.cos(ang) * 6, cy2 + Math.sin(ang) * 4, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(cx2 + Math.cos(ang) * 6 - 2, cy2 + Math.sin(ang) * 4 - 2, 2.5, 0, Math.PI * 2);
        ctx.fill();
      } else if (o.type === 'overhang') {
        // SLIDE hazard — amber, distinct colour cues "go low"
        ctx.strokeStyle = 'rgba(255, 177, 61, 0.35)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(o.x + o.w / 2, 0);
        ctx.lineTo(o.x + o.w / 2, o.y);
        ctx.stroke();
        const g = ctx.createLinearGradient(o.x, o.y, o.x, o.y + o.h);
        g.addColorStop(0, '#2a1a06');
        g.addColorStop(1, '#1a1004');
        ctx.fillStyle = g;
        ctx.fillRect(o.x, o.y, o.w, o.h);
        ctx.strokeStyle = '#ffb13d';
        ctx.lineWidth = 3;
        ctx.strokeRect(o.x + 1.5, o.y + 1.5, o.w - 3, o.h - 3);
        // bottom highlight (the dangerous edge)
        ctx.fillStyle = 'rgba(255,200,120,0.7)';
        ctx.fillRect(o.x + 3, o.y + o.h - 5, o.w - 6, 3);
        ctx.fillStyle = '#ffb13d';
        for (let i = 0; i < 3; i++) {
          const chx = o.x + 10 + i * 13;
          const chy = o.y + o.h - 16;
          ctx.beginPath();
          ctx.moveTo(chx, chy);
          ctx.lineTo(chx + 9, chy);
          ctx.lineTo(chx + 4.5, chy + 8);
          ctx.closePath();
          ctx.fill();
        }
      }
    }
  }

  // Closest parallax layer — drawn in front of the player for real depth.
  // Kept soft/translucent so it never hides gameplay.
  function drawForeground() {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    // Soft vertical light shafts sweeping past the camera
    for (const sh of fgShafts) {
      const g = ctx.createLinearGradient(sh.x, 0, sh.x + sh.w, 0);
      g.addColorStop(0, 'rgba(' + palette.accent + ',0)');
      g.addColorStop(0.5, 'rgba(' + palette.accent + ',0.05)');
      g.addColorStop(1, 'rgba(' + palette.accent + ',0)');
      ctx.fillStyle = g;
      ctx.fillRect(sh.x, 0, sh.w, H);
    }
    // Dust motes — tiny bright specks closest to the lens. During OVERDRIVE
    // they shift hot-pink and stretch into short streaks so the whole scene
    // visibly screams the multiplier.
    if (feverActive) {
      for (const mo of fgMotes) {
        const a = 0.35 + 0.25 * Math.sin(mo.tw);
        const streakLen = 4 + mo.r * 2;
        const g = ctx.createLinearGradient(mo.x, mo.y, mo.x + streakLen, mo.y);
        g.addColorStop(0, 'rgba(255,80,220,' + a + ')');
        g.addColorStop(1, 'rgba(255,80,220,0)');
        ctx.fillStyle = g;
        ctx.fillRect(mo.x, mo.y - mo.r, streakLen, mo.r * 2);
      }
    } else {
      for (const mo of fgMotes) {
        ctx.fillStyle = 'rgba(255,255,255,' + (0.18 + 0.16 * Math.sin(mo.tw)) + ')';
        ctx.beginPath();
        ctx.arc(mo.x, mo.y, mo.r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  // Rounded-rect path helper (own impl — broader mobile support than ctx.roundRect)
  function roundRectPath(x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawSetpieceBoss() {
    if (!setpiece) return;
    // LOW-G ambience — a soft moon-blue wash from above so the float zone reads
    if (setpiece.type === 'lowg') {
      const pulse = 0.08 + 0.03 * Math.sin(frame * 0.06);
      const g = ctx.createLinearGradient(0, 0, 0, GROUND);
      g.addColorStop(0, 'rgba(140,210,255,' + pulse.toFixed(3) + ')');
      g.addColorStop(1, 'rgba(140,210,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, GROUND);
      return;
    }
    // HYPERSPACE — a star-warp tunnel radiating from the right-side vanishing point.
    // Streaks emanate outward, scaling with the section's intro/outro fade.
    if (setpiece.type === 'hyperspace') {
      const t = setpiece.t;
      const dur = setpiece.dur;
      const intro = Math.min(1, t / 40);
      const outro = Math.min(1, (dur - t) / 40);
      const fade = Math.min(intro, outro);
      const vx = W * 0.78, vy = GROUND - 220;
      // Radial darken behind the streaks to make them pop
      const dim = ctx.createRadialGradient(vx, vy, 0, vx, vy, W * 1.1);
      dim.addColorStop(0, 'rgba(40,0,80,' + (0.10 * fade) + ')');
      dim.addColorStop(1, 'rgba(8,4,24,' + (0.45 * fade) + ')');
      ctx.fillStyle = dim;
      ctx.fillRect(0, 0, W, H);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      // Streak field — 80 deterministic streaks animated by frame
      const N = 80;
      for (let i = 0; i < N; i++) {
        const ang = (i * 137.5) % 360 * Math.PI / 180;
        const phase = (frame * (0.025 + (i % 7) * 0.004) + i * 0.31) % 1;
        const dist = phase * Math.hypot(W, H) * 0.9;
        const x = vx + Math.cos(ang) * dist;
        const y = vy + Math.sin(ang) * dist;
        const trailLen = 70 + (i % 5) * 40;
        const tx = vx + Math.cos(ang) * Math.max(0, dist - trailLen);
        const ty = vy + Math.sin(ang) * Math.max(0, dist - trailLen);
        const a = (0.55 - phase * 0.45) * fade;
        if (a <= 0.02) continue;
        const hue = (i * 23 + frame) % 360;
        ctx.strokeStyle = 'hsla(' + hue + ',95%,70%,' + a.toFixed(3) + ')';
        ctx.lineWidth = 1 + (1 - phase) * 1.6;
        ctx.beginPath();
        ctx.moveTo(tx, ty);
        ctx.lineTo(x, y);
        ctx.stroke();
      }
      // Central pulse at the vanishing point
      const pulseR = 60 + Math.sin(frame * 0.18) * 14;
      const cg = ctx.createRadialGradient(vx, vy, 4, vx, vy, pulseR);
      cg.addColorStop(0, 'rgba(255,255,255,' + (0.65 * fade) + ')');
      cg.addColorStop(0.5, 'rgba(180,120,255,' + (0.40 * fade) + ')');
      cg.addColorStop(1, 'rgba(120,80,220,0)');
      ctx.fillStyle = cg;
      ctx.fillRect(vx - pulseR, vy - pulseR, pulseR * 2, pulseR * 2);
      ctx.restore();
      return;
    }
    if (setpiece.type !== 'tornado') return;
    const v = setpiece.vortex;
    if (v < 0.01) return;
    const bx = W * 0.74;
    const topY = 30;
    const botY = GROUND;
    // Funnel: stacked rotating ellipses, wide at top → narrow at base
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const layers = 11;
    for (let i = 0; i < layers; i++) {
      const f = i / (layers - 1);
      const y = topY + (botY - topY) * f;
      const rw = (90 - f * 64) * v;
      const spin = frame * 0.12 + i * 0.5;
      const ox = Math.cos(spin) * (10 + f * 8);
      const a = 0.12 + (1 - f) * 0.10;
      ctx.fillStyle = 'rgba(180,120,255,' + a + ')';
      ctx.beginPath();
      ctx.ellipse(bx + ox, y, rw, 13, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(120,220,255,' + (a * 0.6) + ')';
      ctx.beginPath();
      ctx.ellipse(bx + ox, y, rw * 0.6, 8, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // Swirling debris specks
    for (let i = 0; i < 14; i++) {
      const sp = frame * 0.2 + i * 1.3;
      const f = (i % 7) / 7;
      const y = topY + (botY - topY) * f;
      const rw = (90 - f * 64) * v;
      const px = bx + Math.cos(sp) * rw;
      ctx.fillStyle = 'rgba(255,255,255,' + (0.3 + 0.3 * Math.sin(sp)) + ')';
      ctx.beginPath();
      ctx.arc(px, y, 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    // Boss HP bar — "health" drains with the set-piece timer, giving the fight
    // a clear beginning/middle/end and a sense of wearing the boss down.
    if (v > 0.4) {
      const hp = Math.max(0, 1 - setpiece.t / setpiece.dur);
      const bw = Math.min(260, W * 0.6), bh = 9;
      const bxL = (W - bw) / 2, byT = 54;
      ctx.save();
      ctx.fillStyle = 'rgba(11,16,32,0.7)';
      ctx.strokeStyle = 'rgba(180,120,255,0.6)';
      ctx.lineWidth = 1.5;
      roundRectPath(bxL - 2, byT - 2, bw + 4, bh + 4, 6);
      ctx.fill(); ctx.stroke();
      const fg = ctx.createLinearGradient(bxL, 0, bxL + bw, 0);
      fg.addColorStop(0, '#b478ff');
      fg.addColorStop(1, '#ff3df0');
      ctx.fillStyle = fg;
      roundRectPath(bxL, byT, bw * hp, bh, 5);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText('🌪 TORNADO', W / 2, byT - 4);
      ctx.restore();
    }
  }

  function drawCoins() {
    const magnetOn = magnetFrames > 0;
    for (const c of coinsArr) {
      const spin = Math.cos(c.t);          // -1..1 → 3D rotation around Y
      const wobble = Math.max(0.12, Math.abs(spin));
      const edge = spin < 0;               // showing the back face
      // Gem palette — blue & red coin variants render in their own colours
      const isBlue = c.type === 'blue';
      const isRed = c.type === 'red';
      const haloRGB = isRed ? '255,80,220' : isBlue ? '120,230,255' : '255,225,74';
      // Proximity / magnet glow halo
      const dxp = c.x - (player.x + player.w / 2);
      const dyp = c.y - (player.y + player.h / 2);
      const near = magnetOn || (dxp * dxp + dyp * dyp < 150 * 150);
      if (near || isBlue || isRed) {
        const sparkle = (isBlue || isRed) ? 0.45 + 0.25 * Math.abs(Math.sin(c.t * 1.4)) : 0.5;
        const hg = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, c.r * 2.6);
        hg.addColorStop(0, 'rgba(' + haloRGB + ',' + sparkle + ')');
        hg.addColorStop(1, 'rgba(' + haloRGB + ',0)');
        ctx.fillStyle = hg;
        ctx.fillRect(c.x - c.r * 2.6, c.y - c.r * 2.6, c.r * 5.2, c.r * 5.2);
      }
      // Coin body — gradient palette switches per gem type
      const g = ctx.createLinearGradient(c.x, c.y - c.r, c.x, c.y + c.r);
      if (isRed) {
        g.addColorStop(0, edge ? '#7a0a40' : '#ffcad0');
        g.addColorStop(0.5, edge ? '#a8104a' : '#ff3df0');
        g.addColorStop(1, edge ? '#52041a' : '#a8104a');
      } else if (isBlue) {
        g.addColorStop(0, edge ? '#0a4a7a' : '#caf0ff');
        g.addColorStop(0.5, edge ? '#0a7aa8' : '#19f0ff');
        g.addColorStop(1, edge ? '#04304a' : '#0b94ad');
      } else {
        g.addColorStop(0, edge ? '#c8920a' : '#fff0a0');
        g.addColorStop(0.5, edge ? '#a8780a' : '#ffe14a');
        g.addColorStop(1, edge ? '#7a5500' : '#d9a516');
      }
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(c.x, c.y, c.r * wobble, c.r, 0, 0, Math.PI * 2);
      ctx.fill();
      // Inner ring face (only when showing the front clearly)
      if (!edge) {
        ctx.fillStyle = isRed ? 'rgba(255, 220, 240, 0.9)' : isBlue ? 'rgba(220, 240, 255, 0.9)' : 'rgba(255, 248, 200, 0.85)';
        ctx.beginPath();
        ctx.ellipse(c.x, c.y, (c.r - 5) * wobble, c.r - 5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = isRed ? '#7a0a40' : isBlue ? '#04304a' : '#caa015';
        ctx.font = 'bold ' + Math.round(c.r * 1.1) + 'px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.save();
        ctx.scale(wobble, 1);
        ctx.fillText('★', c.x / wobble, c.y);
        ctx.restore();
        // Denomination tag — clear "x5" / "x10" above gem coins so the reward
        // value reads at a glance even mid-rush.
        if ((isBlue || isRed)) {
          ctx.fillStyle = isRed ? '#ff3df0' : '#19f0ff';
          ctx.font = 'bold 11px -apple-system, "Segoe UI", sans-serif';
          ctx.fillText(isRed ? 'x10' : 'x5', c.x, c.y - c.r - 6);
        }
      }
      // Moving gloss streak
      const gloss = (Math.sin(c.t * 1.3) * 0.5 + 0.5);
      ctx.fillStyle = 'rgba(255,255,255,' + (0.5 * wobble) + ')';
      ctx.beginPath();
      ctx.ellipse(c.x - c.r * 0.3 * wobble, c.y - c.r * 0.4 + gloss * 4, c.r * 0.18 * wobble, c.r * 0.4, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.textAlign = 'start';
    ctx.textBaseline = 'alphabetic';
  }

  function drawParticles() {
    for (const p of particles) {
      const a = Math.max(0, p.life / 40);
      ctx.fillStyle = p.color;
      ctx.globalAlpha = a;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawRings() {
    if (!rings.length) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const g of rings) {
      const a = g.life / g.maxLife;
      ctx.strokeStyle = 'rgba(' + g.rgb + ',' + (a * 0.6) + ')';
      ctx.lineWidth = 1 + a * 2.5;
      ctx.beginPath();
      ctx.arc(g.x, g.y, g.r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  // Wet-floor reflections — the iconic synthwave mirror. Mirrors the hero,
  // hazards and pickups onto the grid floor, additively, fading with the
  // object's height so high objects barely register (physically plausible).
  function drawReflections() {
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, GROUND, W, H - GROUND);
    ctx.clip();
    ctx.translate(0, GROUND * 2);
    ctx.scale(1, -1);
    ctx.globalCompositeOperation = 'lighter';
    const FADE = 240;

    // Obstacle silhouettes in their signature hazard colour
    for (const o of obstacles) {
      const a = 0.22 * Math.max(0, 1 - Math.max(0, GROUND - (o.y + o.h)) / FADE);
      if (a < 0.02) continue;
      ctx.globalAlpha = a;
      if (o.type === 'spike') {
        ctx.fillStyle = 'rgba(255,61,110,1)';
        ctx.beginPath();
        ctx.moveTo(o.x, o.y + o.h);
        ctx.lineTo(o.x + o.w / 2, o.y);
        ctx.lineTo(o.x + o.w, o.y + o.h);
        ctx.closePath();
        ctx.fill();
      } else if (o.type === 'flying') {
        ctx.fillStyle = 'rgba(25,240,255,1)';
        ctx.beginPath();
        ctx.ellipse(o.x + o.w / 2, o.y + o.h / 2, o.w / 2, o.h / 2, 0, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = o.type === 'overhang' ? 'rgba(255,177,61,1)' : 'rgba(255,61,110,1)';
        ctx.fillRect(o.x, o.y, o.w, o.h);
      }
    }

    // Coins — cheap gold ellipses (no gradients, keeps Coin Rush fast)
    ctx.fillStyle = 'rgba(255,225,74,1)';
    for (const c of coinsArr) {
      const a = 0.5 * Math.max(0, 1 - (GROUND - c.y) / FADE);
      if (a < 0.03) continue;
      ctx.globalAlpha = a;
      ctx.beginPath();
      ctx.ellipse(c.x, c.y, c.r * 0.8, c.r, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Powerups
    for (const p of powerups) {
      const a = 0.4 * Math.max(0, 1 - (GROUND - p.y) / FADE);
      if (a < 0.03) continue;
      ctx.globalAlpha = a;
      ctx.fillStyle = p.type === 'magnet' ? 'rgba(255,225,74,1)' : p.type === 'shield' ? 'rgba(25,240,255,1)' : p.type === 'phase' ? 'rgba(200,168,255,1)' : 'rgba(255,255,255,1)';
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }

    // Springs — bright cyan slab, hardly fades because they sit on the floor
    ctx.fillStyle = 'rgba(25,240,255,1)';
    for (const s of springs) {
      ctx.globalAlpha = 0.45;
      ctx.fillRect(s.x, s.y, s.w, s.h);
    }

    // Player orb — the headline reflection (soft halo + bright core)
    {
      const sk = currentSkin();
      const cx = player.x + player.w / 2;
      const cyp = player.y + player.h / 2;
      const a = 0.55 * Math.max(0.18, 1 - Math.max(0, GROUND - (player.y + player.h)) / 300);
      ctx.globalAlpha = a;
      const r = 22;
      const halo = ctx.createRadialGradient(cx, cyp, 0, cx, cyp, r * 2.2);
      halo.addColorStop(0, sk.halo[0]);
      halo.addColorStop(1, 'rgba(' + sk.trail + ',0)');
      ctx.fillStyle = halo;
      ctx.fillRect(cx - r * 2.2, cyp - r * 2.2, r * 4.4, r * 4.4);
      ctx.fillStyle = 'rgba(' + sk.trail + ',0.85)';
      ctx.beginPath();
      ctx.arc(cx, cyp, r * 0.8, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
    ctx.globalAlpha = 1;
  }

  // Additively blend the blurred quarter-res frame back over the scene so every
  // bright neon source blooms. Strength swells hard during OVERDRIVE.
  function applyBloom() {
    if (!bloomOK) return;
    const bw = bloomCanvas.width, bh = bloomCanvas.height;
    if (bw < 2 || bh < 2) return;
    try {
      bctx.setTransform(1, 0, 0, 1, 0, 0);
      bctx.globalCompositeOperation = 'source-over';
      bctx.clearRect(0, 0, bw, bh);
      bctx.filter = 'blur(' + BLOOM_BLUR + 'px)';
      bctx.drawImage(canvas, 0, 0, bw, bh);
      bctx.filter = 'none';
      const pulse = feverActive ? 0.12 * (0.5 + 0.5 * Math.sin(frame * 0.25)) : 0;
      const strength = Math.min(0.85, 0.2 + (feverActive ? 0.45 : 0) + pulse);
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = strength;
      ctx.drawImage(bloomCanvas, 0, 0, canvas.width, canvas.height);
      ctx.restore();
    } catch (_) { bloomOK = false; }
  }

  function draw() {
    ctx.save();
    // Camera zoom-punch (level up / impacts) — eases back each frame
    zoomPunch *= 0.86;
    if (zoomPunch > 0.002) {
      ctx.translate(W / 2, H / 2);
      const z = 1 + zoomPunch;
      ctx.scale(z, z);
      ctx.translate(-W / 2, -H / 2);
    }
    if (shake > 0.3) {
      ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
    }
    drawBackground();
    drawWeather();
    drawGround();
    drawReflections();
    drawSpeedLines();
    drawSetpieceBoss();
    drawCoins();
    drawMagnetStreaks();
    drawCoinChains();
    drawPowerups();
    drawMystery();
    drawParticles();
    drawRings();
    drawSlamCracks();
    drawObstacles();
    drawMeteors();
    drawSprings();
    drawPlayer();
    drawForeground();
    drawTexts();
    // Set-piece colour wash + progress bar — each setpiece gets its own tint
    // so the player reads the "rules" of the section at a glance, not just the
    // intro popText.
    if (setpiece) {
      let washRGB = '255, 40, 60', barRGB = '255,61,110';
      if (setpiece.type === 'coinrush') { washRGB = '255, 200, 40'; barRGB = '255,225,74'; }
      else if (setpiece.type === 'lowg') { washRGB = '120, 200, 255'; barRGB = '140,210,255'; }
      else if (setpiece.type === 'meteor') { washRGB = '255, 140, 60'; barRGB = '255,140,60'; }
      else if (setpiece.type === 'storm') { washRGB = '120, 230, 255'; barRGB = '120,230,255'; }
      else if (setpiece.type === 'tornado') { washRGB = '180, 120, 255'; barRGB = '180,120,255'; }
      else if (setpiece.type === 'hyperspace') { washRGB = '180, 120, 255'; barRGB = '180,120,255'; }
      ctx.fillStyle = 'rgba(' + washRGB + ',0.08)';
      ctx.fillRect(0, 0, W, H);
      const prog = 1 - setpiece.t / setpiece.dur;
      // Backing track behind the progress bar so it never disappears against
      // the floor on bright biomes
      ctx.fillStyle = 'rgba(11,16,32,0.6)';
      ctx.fillRect(0, GROUND + 2, W, 4);
      ctx.fillStyle = 'rgba(' + barRGB + ',0.95)';
      ctx.fillRect(0, GROUND + 2, W * prog, 4);
    }
    ctx.restore();

    // Bloom pass — reads the rendered scene, blurs, adds glow back. Game-feel
    // cues below (flash / glitch) stay crisp because they're drawn after it.
    applyBloom();

    // TIME WARP wash — a cool cyan vignette + slow radial pulse out from centre.
    // Reads "time is slowing" without obscuring play; fades out in the last
    // half-second so the world snaps back cleanly.
    if (state === STATE.PLAY && timewarpFrames > 0) {
      const fade = Math.min(1, timewarpFrames / 36);
      const tw = ctx.createRadialGradient(W / 2, GROUND - 200, W * 0.18, W / 2, GROUND - 200, W * 0.85);
      tw.addColorStop(0, 'rgba(180,240,255,0)');
      tw.addColorStop(0.65, 'rgba(120,210,255,' + (0.10 * fade) + ')');
      tw.addColorStop(1, 'rgba(80,170,255,' + (0.22 * fade) + ')');
      ctx.fillStyle = tw;
      ctx.fillRect(0, 0, W, H);
      // Scanning ring — a faint cyan ring slowly sweeping outward, like a sonar tick
      const sweepT = (frame * 0.03) % 1;
      const sweepR = sweepT * Math.hypot(W, H) * 0.6;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = 'rgba(160,230,255,' + (0.18 * fade * (1 - sweepT)) + ')';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(player.x + player.w / 2, GROUND - 60, sweepR, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // Combo "heat" / OVERDRIVE wash — the screen glows with the streak. During
    // OVERDRIVE it cycles through the full neon spectrum for a frenzied look.
    const heat = Math.min(combo, 20) / 20;
    if (state === STATE.PLAY && (feverActive || heat > 0.25)) {
      const pulse = 0.8 + 0.2 * Math.sin(frame * 0.2);
      const hg = ctx.createRadialGradient(W / 2, GROUND - 160, H * 0.17, W / 2, GROUND - 160, H * 0.68);
      if (feverActive) {
        const hue = (frame * 6) % 360;
        hg.addColorStop(0, 'hsla(' + hue + ',100%,60%,0)');
        hg.addColorStop(1, 'hsla(' + hue + ',100%,60%,' + (0.17 * pulse).toFixed(3) + ')');
      } else {
        hg.addColorStop(0, 'rgba(' + palette.sunRGB + ',0)');
        hg.addColorStop(1, 'rgba(' + palette.sunRGB + ',' + (0.12 * heat * pulse).toFixed(3) + ')');
      }
      ctx.fillStyle = hg;
      ctx.fillRect(0, 0, W, H);
    }

    // Subtle CRT scanlines + corner vignette — synthwave authenticity layer.
    // Drawn AFTER bloom + heat wash so it sits on top without being blown out.
    // Kept very low alpha so it never fights gameplay readability.
    if (state === STATE.PLAY || state === STATE.PAUSED) {
      ctx.save();
      ctx.globalCompositeOperation = 'multiply';
      // 2px stripes spaced every 4px (cheap: stride loop, not a pattern)
      ctx.fillStyle = 'rgba(40, 50, 90, 0.18)';
      for (let y = 0; y < H; y += 4) ctx.fillRect(0, y, W, 1);
      ctx.restore();
      // Soft vignette — radial darken at the edges
      const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.30, W / 2, H / 2, Math.max(W, H) * 0.78);
      vg.addColorStop(0, 'rgba(0,0,0,0)');
      vg.addColorStop(0.65, 'rgba(0,0,0,0.18)');
      vg.addColorStop(1, 'rgba(0,0,0,0.55)');
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, W, H);
    }

    // Full-screen white flash (level up / shield save / revive)
    const flashAge = frame - flashFrame;
    if (flashAge >= 0 && flashAge < 14) {
      ctx.fillStyle = 'rgba(255,255,255,' + (0.55 * (1 - flashAge / 14)) + ')';
      ctx.fillRect(0, 0, W, H);
    }
    // Chromatic glitch bars (on hit / shield save / game over)
    const glitchAge = frame - glitchFrame;
    if (glitchAge >= 0 && glitchAge < 18) {
      const a = 1 - glitchAge / 18;
      ctx.globalCompositeOperation = 'screen';
      for (let i = 0; i < 4; i++) {
        const y = Math.random() * H;
        const h = 6 + Math.random() * 20;
        ctx.fillStyle = 'rgba(255, 40, 200, ' + (0.35 * a) + ')';
        ctx.fillRect(-6, y, W + 12, h);
        ctx.fillStyle = 'rgba(40, 255, 240, ' + (0.35 * a) + ')';
        ctx.fillRect(6, y + 4, W + 12, h * 0.6);
      }
      ctx.globalCompositeOperation = 'source-over';
    }

    // Biome-transition warp — an expanding colour shockwave in the new palette
    // plus outward light streaks, so each level change reads as a hyperspace jump.
    const warpAge = frame - levelWarpFrame;
    if (warpAge >= 0 && warpAge < 40) {
      const p = warpAge / 40;          // 0 → 1 progress
      const k = 1 - p;                 // fade out
      const cy = GROUND - 160;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const rad = p * Math.hypot(W, H) * 0.65;
      const ring = ctx.createRadialGradient(W / 2, cy, Math.max(1, rad - 70), W / 2, cy, rad + 40);
      ring.addColorStop(0, 'rgba(' + palette.accent + ',0)');
      ring.addColorStop(0.72, 'rgba(' + palette.accent + ',' + (0.30 * k).toFixed(3) + ')');
      ring.addColorStop(1, 'rgba(' + palette.accent + ',0)');
      ctx.fillStyle = ring;
      ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = 'rgba(255,255,255,' + (0.22 * k).toFixed(3) + ')';
      ctx.lineWidth = 2;
      for (let i = 0; i < 12; i++) {
        const yy = (i + 0.5) / 12 * H;
        const sx = W / 2 + Math.sin(i * 12.9) * 30;
        const ll = 80 + p * W;
        ctx.beginPath(); ctx.moveTo(sx - ll, yy); ctx.lineTo(sx - ll * 0.35, yy); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(sx + ll * 0.35, yy); ctx.lineTo(sx + ll, yy); ctx.stroke();
      }
      ctx.restore();
    }

    // Pause overlay — gentle dark scrim + branded title + resume hint, drawn
    // straight on the canvas so we don't need a DOM layer. Keeps the playfield
    // visible underneath so the player can plan their next move on resume.
    if (state === STATE.PAUSED) {
      ctx.save();
      ctx.fillStyle = 'rgba(7,9,26,0.62)';
      ctx.fillRect(0, 0, W, H);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      // Stacked pulse halos behind the title text. Uses wall-clock time so the
      // halo keeps breathing even while gameplay `frame` is frozen.
      const pulse = 0.85 + 0.15 * Math.sin(performance.now() * 0.003);
      const cy = H * 0.42;
      const halo = ctx.createRadialGradient(W / 2, cy, 0, W / 2, cy, 220 * pulse);
      halo.addColorStop(0, 'rgba(255,61,240,' + (0.22 * pulse) + ')');
      halo.addColorStop(0.5, 'rgba(25,240,255,' + (0.10 * pulse) + ')');
      halo.addColorStop(1, 'rgba(25,240,255,0)');
      ctx.fillStyle = halo;
      ctx.fillRect(W / 2 - 240, cy - 240, 480, 480);
      // Title
      ctx.shadowColor = 'rgba(255,61,240,0.6)';
      ctx.shadowBlur = 16;
      ctx.font = 'bold 56px sans-serif';
      ctx.fillStyle = '#fff';
      ctx.fillText('PAUZĂ', W / 2, cy);
      // Subtitle hint
      ctx.shadowBlur = 0;
      ctx.font = '600 14px sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.78)';
      ctx.fillText('TAP PE  ▶  PENTRU A CONTINUA', W / 2, cy + 50);
      ctx.restore();
    }
  }

  function updateOver() {
    particles.forEach((p) => {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.15;
      p.life--;
    });
    particles = particles.filter((p) => p.life > 0);
    if (shake > 0) shake *= 0.9;
  }

  // ---------- Main loop (fixed-step physics, decoupled from refresh rate) ----------
  const FIXED_DT = 1000 / 60;
  let last = performance.now();
  let accumulator = 0;
  function loop(now) {
    try {
      let dt = now - last;
      last = now;
      if (dt > 250) dt = 250;
      accumulator += dt;
      let steps = 0;
      while (accumulator >= FIXED_DT && steps < 5) {
        if (state === STATE.PLAY) update();
        else if (state === STATE.OVER) updateOver();
        else if (state === STATE.MENU) updateAttract();
        accumulator -= FIXED_DT;
        steps++;
      }
      if (steps >= 5) accumulator = Math.min(accumulator, FIXED_DT);
      draw();
    } catch (err) {
      console.error('[Glitch Run] loop error:', err);
    }
    requestAnimationFrame(loop);
  }
  player.y = GROUND - player.h;
  requestAnimationFrame(loop);

  // Auto-pause when the app is backgrounded (tab switch, incoming call, lock).
  // Stays paused on return so the player resumes deliberately instead of
  // reappearing mid-obstacle and dying to a frame they never saw.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && state === STATE.PLAY) {
      state = STATE.PAUSED;
      if (pauseBtn) pauseBtn.textContent = '▶';
      music.pause();
    }
  });

  // Prevent context menu / pinch zoom
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  document.addEventListener('contextmenu', (e) => e.preventDefault());
})();
