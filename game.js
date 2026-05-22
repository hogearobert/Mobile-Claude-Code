(() => {
  'use strict';

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

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
      coin() { blip(880, 0.06, 'sine', 0.25); setTimeout(() => blip(1320, 0.1, 'sine', 0.22), 50); },
      hit() { noise(0.35, 0.5, 1200); blip(110, 0.4, 'sawtooth', 0.35, 55); },
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
      // Lead arpeggio: every 8th note with random pickup
      if (stepInBar % 2 === 0 && Math.random() < song.leadDensity) {
        const chord = song.chords[barIdx];
        const note = chord[Math.floor(Math.random() * chord.length)];
        const oct = Math.random() < 0.25 ? song.leadOct + 1 : song.leadOct;
        blip(leadGain, nf(note, oct), when, stepDur * 1.2, 'triangle', 0.005, 0.28);
      }
      // Drums
      if (song.kick[stepInBar]) playKick(when);
      if (stepInBar % 2 === 1) playHat(when, 0.06);
      if (stepInBar === 4 || stepInBar === 12) playHat(when, 0.15); // snare-ish
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

    function targetVol() { return muted ? 0 : 0.16; }

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
      isMuted() { return muted; },
      isPlaying() { return active; }
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
    skinUnlocked: NS + 'skinUnlocked'
  };
  function readLS(k, dflt) { try { return localStorage.getItem(k) ?? dflt; } catch (_) { return dflt; } }
  function writeLS(k, v) { try { localStorage.setItem(k, v); } catch (_) {} }
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
  bestEl.textContent = best;
  coinsEl.textContent = totalCoins;

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
  let particles = [];
  let stars = [];
  let mountains = [];
  let buildings = [];

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
  let gravity = 0.95;
  const jumpV = -17;

  let score = 0;
  let runCoins = 0;
  let frame = 0;
  let nextObstacleAt = 60;
  let nextCoinAt = 90;
  let nextPowerupAt = 600;
  let shake = 0;
  let lastJumpFrame = -100;
  let inputGraceUntil = 0;

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
    { name: 'ULTRA',    sky: ['#1a0a1a', '#3d0a3d', '#52145a'], sun: '#ff3df0', sunRGB: '255,80,240',  mountainHue: 300, accent: '255,120,255', ground: '#1a0a1a', weather: 'leaves' }
  ];
  const LEVEL_SCORE = 500;
  let levelIdx = 0;
  let palette = LEVELS[0];

  // ---------- Combo ----------
  let combo = 0;
  let lastCoinFrame = -1000;
  const COMBO_WINDOW = 90; // ~1.5s at 60fps
  function comboMult() { return combo >= 10 ? 3 : combo >= 5 ? 2 : 1; }

  // ---------- Power-ups ----------
  let powerups = [];
  let magnetFrames = 0;
  let shieldActive = false;
  let shieldFlashFrame = -1000;
  let invincibleUntil = -1;
  let reviveUsed = false;

  // ---------- Floating texts ----------
  let texts = [];
  function popText(msg, x, y, color, scale) {
    texts.push({ msg, x, y, color: color || '#ffe14a', scale: scale || 1, life: 50 });
  }

  // ---------- Game-feel: slow-mo, screen flash, chromatic glitch ----------
  let slowmoFrames = 0;     // frames of remaining slow-mo
  let flashFrame = -1000;   // last frame a white flash was triggered
  let glitchFrame = -1000;  // last frame a chromatic glitch was triggered

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
    if (deathScores.length < 3) return 0;
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
  function startSetpiece() {
    const type = setpieceCount % 2 === 0 ? 'coinrush' : 'gauntlet';
    setpieceCount++;
    nextSetpieceAt += 2000;
    setpiece = { type, t: 0, dur: type === 'coinrush' ? 440 : 560, spawnTimer: 30 };
    obstacles = obstacles.filter((o) => o.x < W * 0.55);
    powerups = powerups.filter((p) => p.x < W * 0.55);
    popText(type === 'coinrush' ? '★ COIN RUSH ★' : '⚡ GAUNTLET ⚡',
      W / 2, GROUND - 210, type === 'coinrush' ? '#ffe14a' : '#ff3d6e', 1.7);
    shake = Math.max(shake, 9);
    flashFrame = frame;
    audio.levelup();
  }
  function updateSetpiece() {
    setpiece.t++;
    setpiece.spawnTimer--;
    if (setpiece.type === 'coinrush') {
      if (setpiece.spawnTimer <= 0) {
        const baseY = GROUND - 70 - Math.random() * 130;
        for (let i = 0; i < 3; i++) {
          coinsArr.push({ x: W + 30 + i * 30, y: baseY + Math.sin(i * 1.3) * 22, r: 14, picked: false, t: Math.random() * 6.28 });
        }
        setpiece.spawnTimer = 20;
      }
    } else {
      if (setpiece.spawnTimer <= 0) {
        if (Math.random() < 0.5) {
          obstacles.push({ type: 'overhang', x: W + 20, y: GROUND - 80, w: 46, h: 50 });
        } else {
          obstacles.push({ type: 'spike', x: W + 20, y: GROUND - 34, w: 36, h: 34 });
        }
        setpiece.spawnTimer = 50 + Math.floor(Math.random() * 18);
      }
    }
    if (setpiece.t >= setpiece.dur) {
      if (setpiece.type === 'gauntlet') {
        runCoins += 80;
        popText('+80 ★  SURVIVED!', W / 2, GROUND - 200, '#19f0ff', 1.5);
        audio.power();
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
    if (r < 0.55) {
      reward = { coins: 10 + Math.floor(rnd() * 15), msg: 'BONUS!', col: '#ffe14a' };
    } else if (r < 0.85) {
      reward = { coins: 30 + Math.floor(rnd() * 25), msg: 'MEGA BONUS!', col: '#ff3df0', extra: 'shield' };
    } else if (r < 0.97) {
      reward = { coins: 80 + Math.floor(rnd() * 40), msg: 'JACKPOT!', col: '#19f0ff', extra: 'magnet' };
    } else {
      reward = { coins: 300, msg: 'MEGA JACKPOT!!', col: '#fff' };
    }
    runCoins += reward.coins;
    if (reward.extra === 'shield') shieldActive = true;
    else if (reward.extra === 'magnet') magnetFrames = 60 * 6;
    popText(reward.msg + ' +' + reward.coins + '★', player.x + player.w / 2, GROUND - 220, reward.col, 1.4);
    audio.power();
    flashFrame = frame;
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
    { id: 'first_jump',    name: 'Primul salt',         desc: 'Sari pentru prima dată' },
    { id: 'score_500',     name: 'Cinci sute',          desc: 'Atinge 500 scor' },
    { id: 'score_2000',    name: 'Două mii',            desc: 'Atinge 2000 scor' },
    { id: 'score_5000',    name: 'Veteran',             desc: 'Atinge 5000 scor' },
    { id: 'combo_10',      name: 'Combo Maestru',       desc: 'Atinge 10 combo' },
    { id: 'combo_20',      name: 'Imparabil',           desc: 'Atinge 20 combo' },
    { id: 'magnet',        name: 'Atracție magnetică',  desc: 'Folosește un magnet' },
    { id: 'shield_save',   name: 'Salvare scut',        desc: 'Scutul absoarbe o lovitură' },
    { id: 'level_3',       name: 'Glacial',             desc: 'Ajunge la nivelul 4' },
    { id: 'level_6',       name: 'Călătorul cosmic',    desc: 'Ajunge la nivelul 6' },
    { id: 'coins_100',     name: 'Sută de stele',       desc: 'Adună 100 de stele în total' },
    { id: 'revive',        name: 'A doua șansă',        desc: 'Folosește un revive' }
  ];
  const achKey = (id) => SK.achievements + '.' + id;
  function hasAch(id) { return readLS(achKey(id), '0') === '1'; }
  function unlock(id) {
    if (hasAch(id)) return;
    writeLS(achKey(id), '1');
    const a = ACHIEVEMENTS.find((x) => x.id === id);
    if (a) showToast('🏆 ' + a.name, a.desc);
  }
  // ---------- Skins (cosmetic progression unlocked with stars) ----------
  const SKINS = [
    { id: 'cyan',    name: 'CYAN',    cost: 0,    locked: false, core:['#fff','#a8f6ff','#19f0ff','#0b94ad'], halo:['rgba(120,230,255,0.55)','rgba(255,80,220,0.18)'], ring:'rgba(255,90,220,0.6)',  trail:'120,230,255' },
    { id: 'plasma',  name: 'PLASMA',  cost: 200,  locked: true,  core:['#fff','#caffd2','#3dff7a','#0a4d20'], halo:['rgba(100,255,180,0.55)','rgba(180,255,100,0.2)'], ring:'rgba(120,255,180,0.7)', trail:'100,255,180' },
    { id: 'solar',   name: 'SOLAR',   cost: 500,  locked: true,  core:['#fff','#fff5d0','#ffd64a','#a86b00'], halo:['rgba(255,225,100,0.6)','rgba(255,120,40,0.25)'], ring:'rgba(255,200,80,0.75)', trail:'255,225,100' },
    { id: 'crimson', name: 'CRIMSON', cost: 1500, locked: true,  core:['#fff','#ffcad0','#ff3d6e','#8a0a20'], halo:['rgba(255,80,120,0.55)','rgba(255,40,60,0.25)'],  ring:'rgba(255,120,140,0.75)', trail:'255,100,140' },
    { id: 'cosmic',  name: 'COSMIC',  cost: 3500, locked: true,  core:['#fff','#e0d0ff','#b04dff','#3a0a8c'], halo:['rgba(180,80,255,0.55)','rgba(120,40,255,0.25)'], ring:'rgba(200,120,255,0.75)', trail:'180,100,255' },
    { id: 'glitch',  name: 'GLITCH',  cost: 0,    locked: true, adOnly: true, animated: true, core:['#fff','#ffd0ff','#ff3df0','#5a0a8c'], halo:['rgba(255,61,240,0.6)','rgba(180,40,200,0.22)'], ring:'rgba(255,200,255,0.85)', trail:'255,140,255' }
  ];
  function ownedSkin(id) {
    if (id === 'cyan') return true;
    return readLS(SK.skinUnlocked + '.' + id, '0') === '1';
  }
  let currentSkinId = readLS(SK.skinUnlocked + '.current', 'cyan');
  if (!ownedSkin(currentSkinId)) currentSkinId = 'cyan';
  function currentSkin() { return SKINS.find((s) => s.id === currentSkinId) || SKINS[0]; }

  // ---------- Daily missions (3 active, reset daily) ----------
  const MISSION_TEMPLATES = [
    { id: 'score_x',    type: 'final', mk: () => ({ n: 200 + Math.floor(Math.random()*600), goal: 1 }),     label: (m) => 'Atinge ' + m.n + ' scor într-un run', reward: 50 },
    { id: 'coins_x',    type: 'event', mk: () => ({ n: 20 + Math.floor(Math.random()*30), goal: 20 + Math.floor(Math.random()*30) }), label: (m) => 'Colectează ' + m.goal + ' stele',    reward: 35 },
    { id: 'combo_x',    type: 'final', mk: () => ({ n: 5 + Math.floor(Math.random()*10), goal: 1 }),       label: (m) => 'Atinge combo ' + m.n,           reward: 40 },
    { id: 'powerup_x',  type: 'event', mk: () => ({ goal: 1 + Math.floor(Math.random()*3) }),              label: (m) => 'Folosește ' + m.goal + ' power-ups', reward: 35 },
    { id: 'runs_x',     type: 'event', mk: () => ({ goal: 3 + Math.floor(Math.random()*5) }),              label: (m) => 'Joacă ' + m.goal + ' runs',     reward: 45 },
    { id: 'mystery_x',  type: 'event', mk: () => ({ goal: 1 + Math.floor(Math.random()*2) }),              label: (m) => 'Deschide ' + m.goal + ' mystery box', reward: 60 },
    { id: 'level_x',    type: 'final', mk: () => ({ n: 2 + Math.floor(Math.random()*3), goal: 1 }),         label: (m) => 'Ajunge la nivelul ' + (m.n + 1), reward: 55 }
  ];
  const MK = { current: SK.skinUnlocked + '.current' };
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

  // ---------- Screen navigation ----------
  function showScreen(name) {
    // Hide ALL overlays — main menu, shop, missions, stats, game over, ad
    document.querySelectorAll('.overlay').forEach((o) => o.classList.remove('show'));
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

      const costEl = document.createElement('div');
      costEl.className = 'skin-cost ' + (equipped ? 'equipped' : owned ? 'owned' : s.adOnly ? 'ad' : '');
      costEl.textContent = equipped ? 'ECHIPAT' : owned ? 'TAP PT ECHIPARE' : s.adOnly ? 'GRATUIT VIA AD' : (s.cost + ' ★');

      div.appendChild(previewEl);
      div.appendChild(nameEl);
      div.appendChild(costEl);

      div.addEventListener('click', () => {
        if (owned) {
          currentSkinId = s.id;
          writeLS(MK.current, s.id);
          audio.coin();
          renderShop();
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
        } else {
          showToast('Nu ai destule stele', 'Îți trebuie ' + (s.cost - totalCoins) + ' ★');
        }
      });
      grid.appendChild(div);
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
        windows: Math.random() > 0.3
      });
      bx += w + 8;
    }
  }
  initParallax();

  // ---------- Dynamic weather (per level) ----------
  let weatherP = [];
  let lightningFrame = -1000;
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
    // Lightning on rain levels
    if (w === 'rain' && Math.random() < 0.004) lightningFrame = frame;
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
    // Lightning flash
    const la = frame - lightningFrame;
    if (la >= 0 && la < 8) {
      ctx.fillStyle = 'rgba(200, 220, 255, ' + (0.4 * (1 - la / 8)) + ')';
      ctx.fillRect(0, 0, W, H);
    }
  }
  initWeather();

  function reset() {
    player.x = 110;
    player.y = GROUND - player.h;
    player.vy = 0;
    player.onGround = true;
    player.jumps = 0;
    player.rot = 0;
    player.sliding = false;
    player.slideT = 0;
    player.trail = [];
    obstacles = [];
    coinsArr = [];
    particles = [];
    scrollX = 0;
    speed = baseSpeed;
    score = 0;
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
    inputGraceUntil = 15;
    levelIdx = 0;
    palette = LEVELS[0];
    skyGradient = null;
    skyGradientH = -1;
    combo = 0;
    lastCoinFrame = -1000;
    powerups = [];
    magnetFrames = 0;
    shieldActive = false;
    shieldFlashFrame = -1000;
    invincibleUntil = -1;
    reviveUsed = false;
    texts = [];
    slowmoFrames = 0;
    flashFrame = -1000;
    glitchFrame = -1000;
    scoreEl.textContent = '0';
    coinsEl.textContent = totalCoins;
    if (levelEl) levelEl.textContent = palette.name;
    if (comboEl) comboEl.textContent = '';
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
    player.vy = jumpV * (player.jumps === 0 ? 1 : 0.85);
    player.onGround = false;
    player.jumps++;
    if (player.jumps === 1) audio.jump(); else audio.djump();
    if (player.jumps === 1) unlock('first_jump');
    const jumpColor = player.jumps === 1 ? '#19f0ff' : '#ff3df0';
    for (let i = 0; i < 10; i++) {
      pushParticle(
        player.x + player.w / 2,
        player.y + player.h,
        (Math.random() - 0.5) * 4,
        Math.random() * 3 + 1,
        24, jumpColor, Math.random() * 3 + 1
      );
    }
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
    shake = 18;
    music.stop();
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
    finalScoreEl.textContent = score;
    finalBestEl.textContent = best;
    finalCoinsEl.textContent = '+' + earned;
    if (reviveBtn) reviveBtn.style.display = reviveUsed ? 'none' : 'inline-block';
    if (doubleCoinsBtn) { doubleCoinsBtn.disabled = false; doubleCoinsBtn.style.display = earned > 0 ? '' : 'none'; }
    missionEvent('gameover', score);
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
  // Tap = jump (fires on release, ~tap-duration latency). Swipe down = slide.
  let ptrDown = false;
  let ptrStartY = 0;
  let gestureConsumed = false;
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
    ptrDown = true;
    gestureConsumed = false;
    ptrStartY = e.clientY || 0;
  }
  function onPointerMove(e) {
    if (!ptrDown || gestureConsumed || state !== STATE.PLAY) return;
    const dy = (e.clientY || 0) - ptrStartY;
    if (dy > 32) {
      startSlide();
      gestureConsumed = true;
    } else if (dy < -32) {
      jump();
      gestureConsumed = true;
    }
  }
  function onPointerUp() {
    if (state === STATE.PLAY && ptrDown && !gestureConsumed) {
      jump();
    }
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

  const muteBtn = document.getElementById('muteBtn');
  const pauseBtn = document.getElementById('pauseBtn');
  const levelEl = document.getElementById('level');
  const comboEl = document.getElementById('combo');
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
    else if (state === STATE.PAUSED) { state = STATE.PLAY; pauseBtn.textContent = '⏸'; inputGraceUntil = frame + 8; music.resumePlay(); }
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
    obstacles = obstacles.filter((o) => o.x > W * 0.55);
    powerups = powerups.filter((p) => p.x > W * 0.55);
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
  function spawnObstacle() {
    const types = ['spike', 'block', 'tall', 'flying', 'overhang'];
    let t = types[Math.floor(rnd() * types.length)];
    if (score < 150 && t === 'flying') t = 'spike';
    if (score < 250 && t === 'overhang') t = 'block'; // teach jump first, then slide

    if (t === 'spike') {
      obstacles.push({ type: t, x: W + 20, y: GROUND - 30, w: 36, h: 30 });
    } else if (t === 'block') {
      obstacles.push({ type: t, x: W + 20, y: GROUND - 44, w: 44, h: 44 });
    } else if (t === 'tall') {
      obstacles.push({ type: t, x: W + 20, y: GROUND - 80, w: 32, h: 80 });
    } else if (t === 'flying') {
      obstacles.push({ type: t, x: W + 20, y: GROUND - 140, w: 56, h: 32 });
    } else if (t === 'overhang') {
      // Hangs from above — must SLIDE under it (gap of ~30px at floor level)
      obstacles.push({ type: t, x: W + 20, y: GROUND - 80, w: 46, h: 50 });
    }
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
      batch.push({ x: W + 30, y: baseY, r: 14, picked: false, t: rnd() * Math.PI * 2 });
    } else if (pattern === 1) {
      for (let i = 0; i < 5; i++) {
        const px = W + 30 + i * 36;
        const py = baseY - Math.sin((i / 4) * Math.PI) * 60;
        batch.push({ x: px, y: py, r: 14, picked: false, t: rnd() * Math.PI * 2 });
      }
    } else {
      for (let i = 0; i < 4; i++) {
        batch.push({ x: W + 30 + i * 32, y: baseY, r: 14, picked: false, t: rnd() * Math.PI * 2 });
      }
    }
    for (const c of batch) {
      avoidObstacleOverlap(c);
      coinsArr.push(c);
    }
  }

  function spawnPowerup() {
    const types = ['magnet', 'shield'];
    const t = types[Math.floor(rnd() * types.length)];
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
    const target = Math.min(LEVELS.length - 1, Math.floor(score / LEVEL_SCORE));
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
      missionEvent('level', levelIdx);
      music.setLevel(levelIdx);
    }
  }

  // ---------- Update ----------
  function update() {
    frame++;
    const slowmoT = slowmoFrames > 0 ? 0.35 : 1.0;
    if (slowmoFrames > 0) slowmoFrames--;
    // Gentle ramp spread across all 12 levels: ~4.6 at start, reaches the
    // 15 cap only around score ~4780 (level 10). Levels 11-12 hold max intensity.
    speed = (baseSpeed + Math.min(score / 460, 10.4)) * slowmoT;
    scrollX += speed;
    updateWeather();

    // Player physics — sliding in air = fast-fall dive
    player.vy += gravity * (player.sliding && !player.onGround ? 2.4 : 1);
    player.y += player.vy;
    if (player.y + player.h >= GROUND) {
      player.y = GROUND - player.h;
      player.vy = 0;
      if (!player.onGround) {
        lastJumpFrame = -100;
      }
      player.onGround = true;
      player.jumps = 0;
      player.rot = 0;
    } else {
      player.onGround = false;
      player.rot += 0.15;
    }
    // Slide squash animation (0 = standing, 1 = fully crouched)
    const slideTarget = player.sliding && player.onGround ? 1 : 0;
    player.slideT += (slideTarget - player.slideT) * 0.35;

    // Trail
    if (frame % 2 === 0) {
      player.trail.push({ x: player.x + player.w / 2, y: player.y + player.h / 2, life: 20 });
      if (player.trail.length > 12) player.trail.shift();
    }
    player.trail.forEach((t) => t.life--);
    player.trail = player.trail.filter((t) => t.life > 0);

    // Set-piece trigger (special section every ~2000 score)
    if (!setpiece && score >= nextSetpieceAt) startSetpiece();

    if (setpiece) {
      updateSetpiece();
    } else {
      // Normal spawning (with dynamic difficulty ease)
      const ease = difficultyEase();
      if (frame >= nextObstacleAt) {
        spawnObstacle();
        const gap = Math.max(45, (95 - score / 8 - levelIdx * 3) * ease);
        nextObstacleAt = frame + gap + rnd() * 30;
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

    // Move obstacles
    obstacles.forEach((o) => (o.x -= speed));
    obstacles = obstacles.filter((o) => o.x + o.w > -50);

    // Move coins (with magnet pull if active)
    const pcx = player.x + player.w / 2;
    const pcy = player.y + player.h / 2;
    coinsArr.forEach((c) => {
      c.x -= speed;
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
    powerups.forEach((p) => { p.x -= speed; p.t += 0.08; });
    powerups = powerups.filter((p) => p.x > -40 && !p.picked);

    // Move mystery boxes (fall + scroll), land on ground OR on top of obstacles
    mysteryBoxes.forEach((m) => {
      m.x -= speed;
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
    // Combo decay
    if (combo > 0 && frame - lastCoinFrame > COMBO_WINDOW) {
      combo = 0;
      if (comboEl) comboEl.textContent = '';
    }
    // Floating texts
    texts.forEach((t) => { t.y -= 0.8; t.life--; });
    texts = texts.filter((t) => t.life > 0);

    // Parallax move
    stars.forEach((s) => {
      s.x -= speed * s.s;
      s.tw += 0.05;
      if (s.x < -5) s.x = W + 5;
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
        windows: Math.random() > 0.3
      });
    }

    // Particles
    particles.forEach((p) => {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.15;
      p.life--;
    });
    particles = particles.filter((p) => p.life > 0);

    // Collisions (generous to player — feels fair)
    // While sliding on the ground the hitbox shrinks to a short box near the floor.
    const slideC = player.slideT > 0.5 && player.onGround;
    const px = player.x + 10;
    const pw = player.w - 20;
    const py = slideC ? GROUND - 24 : player.y + 8;
    const ph = slideC ? 22 : player.h - 12;

    if (frame > invincibleUntil) {
      for (const o of obstacles) {
        if (px < o.x + o.w && px + pw > o.x && py < o.y + o.h && py + ph > o.y) {
          if (shieldActive) {
            shieldActive = false;
            shieldFlashFrame = frame;
            invincibleUntil = frame + 60;
            slowmoFrames = 30;
            glitchFrame = frame;
            flashFrame = frame;
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
    }
    for (const c of coinsArr) {
      const dx = c.x - pcx;
      const dy = c.y - pcy;
      if (dx * dx + dy * dy < (c.r + 24) * (c.r + 24)) {
        c.picked = true;
        runCoins++;
        missionEvent('coin');
        if (frame - lastCoinFrame < COMBO_WINDOW) combo++;
        else combo = 1;
        lastCoinFrame = frame;
        const m = comboMult();
        score += 5 * m;
        audio.coin();
        if (comboEl) comboEl.textContent = combo >= 2 ? ('x' + combo + (m > 1 ? '  ' + m + '×' : '')) : '';
        if (combo === 5 || combo === 10 || combo === 20) {
          popText(combo + ' COMBO!', c.x, c.y - 20, palette.sun, 1.1);
          shake = Math.max(shake, 4);
          missionEvent('combo', combo);
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
      if (dx * dx + dy * dy < (m.r + 28) * (m.r + 28)) {
        m.picked = true;
        openMystery();
      }
    }
    // Powerup pickups
    for (const p of powerups) {
      if (p.picked) continue;
      const dx = p.x - pcx;
      const dy = p.y - pcy;
      if (dx * dx + dy * dy < (p.r + 26) * (p.r + 26)) {
        p.picked = true;
        if (p.type === 'magnet') {
          magnetFrames = 60 * 8;
          popText('MAGNET 8s', p.x, p.y - 20, '#ffe14a', 1.2);
        } else if (p.type === 'shield') {
          shieldActive = true;
          popText('SHIELD', p.x, p.y - 20, '#19f0ff', 1.2);
        }
        audio.power && audio.power();
        missionEvent('powerup');
        const pcol = p.type === 'magnet' ? '#ffe14a' : '#19f0ff';
        for (let i = 0; i < 16; i++) {
          const a = Math.random() * Math.PI * 2;
          const v = Math.random() * 4 + 2;
          pushParticle(p.x, p.y, Math.cos(a) * v, Math.sin(a) * v, 40, pcol, Math.random() * 3 + 1);
        }
      }
    }

    score += 1;
    tryLevelUp();
    // Achievements (use >= because combo multipliers can skip exact values)
    if (score >= 500 && !hasAch('score_500')) unlock('score_500');
    if (score >= 2000 && !hasAch('score_2000')) unlock('score_2000');
    if (score >= 5000 && !hasAch('score_5000')) unlock('score_5000');
    if (combo === 10) unlock('combo_10');
    else if (combo === 20) unlock('combo_20');
    if (magnetFrames === 60 * 8 - 1) unlock('magnet');
    if (levelIdx === 3) unlock('level_3');
    else if (levelIdx === 5) unlock('level_6');
    if (totalCoins + runCoins >= 100) unlock('coins_100');
    if (frame % 4 === 0) scoreEl.textContent = score;

    if (shake > 0) shake *= 0.9;
  }

  // ---------- Draw ----------
  let skyGradient = null;
  let skyGradientH = -1;
  let skyGradientPal = null;
  function drawBackground() {
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

    // Stars
    for (const s of stars) {
      const a = 0.5 + Math.sin(s.tw) * 0.4;
      ctx.fillStyle = `rgba(255,255,255,${a})`;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }

    // ── Synthwave sun (iconic Outrun look: solid top, banded bottom, multi-color gradient) ──
    const cx = W * 0.78;
    const cy = GROUND - 280;
    const sunR = 48;
    const pulse = 1 + Math.sin(frame * 0.04) * 0.025;
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
        ctx.fillStyle = 'rgba(255, 225, 74, 0.55)';
        for (let wy = GROUND - b.h + 12; wy < GROUND - 20; wy += 14) {
          for (let wx = b.x + 6; wx < b.x + b.w - 6; wx += 12) {
            if ((wx + wy) % 28 < 14) ctx.fillRect(wx, wy, 5, 6);
          }
        }
      }
    }
  }

  function drawGround() {
    ctx.fillStyle = palette.ground;
    ctx.fillRect(0, GROUND, W, H - GROUND);

    ctx.strokeStyle = palette.sun;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, GROUND);
    ctx.lineTo(W, GROUND);
    ctx.stroke();

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
    // Trail — soft glow without shadowBlur (skin-tinted)
    for (let i = 0; i < player.trail.length; i++) {
      const t = player.trail[i];
      const a = Math.max(0, t.life / 20);
      const r = 18 * a;
      const grad = ctx.createRadialGradient(t.x, t.y, 0, t.x, t.y, r);
      grad.addColorStop(0, 'rgba(' + sk.trail + ', ' + (a * 0.5) + ')');
      grad.addColorStop(1, 'rgba(' + sk.trail + ', 0)');
      ctx.fillStyle = grad;
      ctx.fillRect(t.x - r, t.y - r, r * 2, r * 2);
    }

    const cx = player.x + player.w / 2;
    const sT = player.slideT;
    // When sliding, the orb drops to the floor and squashes into a flat ellipse
    const cy = (player.y + player.h / 2) + ((GROUND - 16) - (player.y + player.h / 2)) * sT;
    const baseR = 22;
    const pulse = (1 + Math.sin(frame * 0.18) * 0.06);
    const sqX = 1 + sT * 0.55;
    const sqY = 1 - sT * 0.58;
    // Glow matches the core's squash exactly, but fades as it flattens so a
    // flat orb gets a soft subtle glow instead of a harsh bright streak.
    const glowAlpha = 1 - sT * 0.5;

    // GLITCH skin effect: chromatic offset (cyan + pink "ghost" rings flicker around the orb)
    if (sk.animated && Math.floor(frame / 6) % 4 !== 0) {
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
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(sqX, sqY);
    const core = ctx.createRadialGradient(-baseR * 0.3, -baseR * 0.3, 0, 0, 0, baseR);
    core.addColorStop(0,   sk.core[0]);
    core.addColorStop(0.3, sk.core[1]);
    core.addColorStop(0.7, sk.core[2]);
    core.addColorStop(1,   sk.core[3]);
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(0, 0, baseR * pulse, 0, Math.PI * 2);
    ctx.fill();
    // Inner pulsing dot
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.beginPath();
    ctx.arc(-baseR * 0.25, -baseR * 0.25, baseR * 0.22, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

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
      const col = p.type === 'magnet' ? '255, 225, 74' : '25, 240, 255';
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
      ctx.fillText(p.type === 'magnet' ? '🧲' : '🛡', px, py + 2);
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

  function drawObstacles() {
    for (const o of obstacles) {
      if (o.type === 'spike') {
        ctx.fillStyle = '#ff3d6e';
        ctx.beginPath();
        ctx.moveTo(o.x, o.y + o.h);
        ctx.lineTo(o.x + o.w / 2, o.y);
        ctx.lineTo(o.x + o.w, o.y + o.h);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#ffadc4';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      } else if (o.type === 'block') {
        ctx.fillStyle = '#1a0a14';
        ctx.fillRect(o.x, o.y, o.w, o.h);
        ctx.strokeStyle = '#ff3d6e';
        ctx.lineWidth = 3;
        ctx.strokeRect(o.x + 1.5, o.y + 1.5, o.w - 3, o.h - 3);
        ctx.beginPath();
        ctx.moveTo(o.x + 8, o.y + 8);
        ctx.lineTo(o.x + o.w - 8, o.y + o.h - 8);
        ctx.moveTo(o.x + o.w - 8, o.y + 8);
        ctx.lineTo(o.x + 8, o.y + o.h - 8);
        ctx.stroke();
      } else if (o.type === 'tall') {
        ctx.fillStyle = '#1a0a14';
        ctx.fillRect(o.x, o.y, o.w, o.h);
        ctx.strokeStyle = '#ff3d6e';
        ctx.lineWidth = 3;
        ctx.strokeRect(o.x + 1.5, o.y + 1.5, o.w - 3, o.h - 3);
        ctx.beginPath();
        for (let i = 0; i < 5; i++) {
          ctx.moveTo(o.x, o.y + 12 + i * 16);
          ctx.lineTo(o.x + o.w, o.y + 12 + i * 16);
        }
        ctx.stroke();
      } else if (o.type === 'flying') {
        const pulse = 1 + Math.sin(frame * 0.2) * 0.1;
        ctx.fillStyle = '#ff3df0';
        ctx.beginPath();
        ctx.ellipse(o.x + o.w / 2, o.y + o.h / 2, (o.w / 2) * pulse, (o.h / 2) * pulse, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(o.x + o.w / 2, o.y + o.h / 2, 6, 0, Math.PI * 2);
        ctx.fill();
      } else if (o.type === 'overhang') {
        // Hanging chain up to the top edge so it reads as "slide under"
        ctx.strokeStyle = 'rgba(255, 61, 110, 0.4)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(o.x + o.w / 2, 0);
        ctx.lineTo(o.x + o.w / 2, o.y);
        ctx.stroke();
        // Body block
        ctx.fillStyle = '#1a0a14';
        ctx.fillRect(o.x, o.y, o.w, o.h);
        ctx.strokeStyle = '#ff3d6e';
        ctx.lineWidth = 3;
        ctx.strokeRect(o.x + 1.5, o.y + 1.5, o.w - 3, o.h - 3);
        // Hazard chevrons pointing down (slide!)
        ctx.fillStyle = '#ff3d6e';
        for (let i = 0; i < 3; i++) {
          const chx = o.x + 10 + i * 13;
          const chy = o.y + o.h - 14;
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

  function drawCoins() {
    for (const c of coinsArr) {
      const wobble = Math.max(0.15, Math.abs(Math.cos(c.t)) * 0.85 + 0.15);
      ctx.fillStyle = '#ffe14a';
      ctx.beginPath();
      ctx.ellipse(c.x, c.y, c.r * wobble, c.r, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff8c0';
      ctx.beginPath();
      ctx.ellipse(c.x, c.y, (c.r - 4) * wobble, c.r - 4, 0, 0, Math.PI * 2);
      ctx.fill();
    }
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

  function draw() {
    ctx.save();
    if (shake > 0.3) {
      ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
    }
    drawBackground();
    drawWeather();
    drawGround();
    drawCoins();
    drawPowerups();
    drawMystery();
    drawParticles();
    drawObstacles();
    drawPlayer();
    drawTexts();
    // Set-piece colour wash + progress bar
    if (setpiece) {
      const rush = setpiece.type === 'coinrush';
      ctx.fillStyle = rush ? 'rgba(255, 200, 40, 0.07)' : 'rgba(255, 40, 60, 0.09)';
      ctx.fillRect(0, 0, W, H);
      const prog = 1 - setpiece.t / setpiece.dur;
      ctx.fillStyle = rush ? 'rgba(255,225,74,0.85)' : 'rgba(255,61,110,0.85)';
      ctx.fillRect(0, GROUND + 2, W * prog, 4);
    }
    ctx.restore();

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
        accumulator -= FIXED_DT;
        steps++;
      }
      if (steps >= 5) accumulator = Math.min(accumulator, FIXED_DT);
      draw();
    } catch (err) {
      console.error('[Neon Dash] loop error:', err);
    }
    requestAnimationFrame(loop);
  }
  player.y = GROUND - player.h;
  requestAnimationFrame(loop);

  // Prevent context menu / pinch zoom
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  document.addEventListener('contextmenu', (e) => e.preventDefault());
})();
