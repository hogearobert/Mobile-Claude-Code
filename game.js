(() => {
  'use strict';

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
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
    if (typeof player !== 'undefined' && state !== STATE.PLAY) {
      player.y = GROUND - player.h;
    }
  }
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 150));
  resize();

  // ---------- Game state ----------
  const STATE = { MENU: 0, PLAY: 1, OVER: 2 };
  let state = STATE.MENU;

  let best = parseInt(localStorage.getItem('neon-dash-best') || '0', 10);
  let totalCoins = parseInt(localStorage.getItem('neon-dash-coins') || '0', 10);
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
    trail: []
  };

  let obstacles = [];
  let coinsArr = [];
  let particles = [];
  let stars = [];
  let mountains = [];
  let buildings = [];

  let scrollX = 0;
  let speed = 6;
  const baseSpeed = 6;
  let gravity = 0.95;
  const jumpV = -17;

  let score = 0;
  let runCoins = 0;
  let frame = 0;
  let nextObstacleAt = 60;
  let nextCoinAt = 90;
  let shake = 0;
  let lastJumpFrame = -100;
  let inputGraceUntil = 0;

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

  function reset() {
    player.x = 110;
    player.y = GROUND - player.h;
    player.vy = 0;
    player.onGround = true;
    player.jumps = 0;
    player.rot = 0;
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
    shake = 0;
    lastJumpFrame = -100;
    inputGraceUntil = 15;
    scoreEl.textContent = '0';
    coinsEl.textContent = totalCoins;
    initParallax();
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
    for (let i = 0; i < 10; i++) {
      particles.push({
        x: player.x + player.w / 2,
        y: player.y + player.h,
        vx: (Math.random() - 0.5) * 4,
        vy: Math.random() * 3 + 1,
        life: 24,
        color: player.jumps === 1 ? '#19f0ff' : '#ff3df0',
        r: Math.random() * 3 + 1
      });
    }
  }

  function startGame() {
    overlay.classList.remove('show');
    gameoverEl.classList.remove('show');
    reset();
    state = STATE.PLAY;
  }

  function gameOver() {
    state = STATE.OVER;
    shake = 18;
    if (score > best) {
      best = score;
      localStorage.setItem('neon-dash-best', best);
      bestEl.textContent = best;
    }
    totalCoins += runCoins;
    localStorage.setItem('neon-dash-coins', totalCoins);
    coinsEl.textContent = totalCoins;
    finalScoreEl.textContent = score;
    finalBestEl.textContent = best;
    finalCoinsEl.textContent = '+' + runCoins;
    setTimeout(() => gameoverEl.classList.add('show'), 280);
    // explosion
    for (let i = 0; i < 40; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = Math.random() * 8 + 2;
      particles.push({
        x: player.x + player.w / 2,
        y: player.y + player.h / 2,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        life: 50,
        color: ['#ff3df0', '#19f0ff', '#ffe14a'][i % 3],
        r: Math.random() * 4 + 2
      });
    }
  }

  // ---------- Input ----------
  function onTap(e) {
    if (e.cancelable) e.preventDefault();
    if (state === STATE.MENU) return;
    if (state === STATE.OVER) return;
    jump();
  }
  canvas.addEventListener('pointerdown', onTap, { passive: false });
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' || e.code === 'ArrowUp') {
      e.preventDefault();
      if (e.repeat) return;
      if (state === STATE.MENU) startGame();
      else if (state === STATE.OVER) startGame();
      else jump();
    }
  });
  startBtn.addEventListener('click', startGame);
  retryBtn.addEventListener('click', startGame);

  // ---------- Spawning ----------
  function spawnObstacle() {
    const types = ['spike', 'block', 'tall', 'flying'];
    let t = types[Math.floor(Math.random() * types.length)];
    // Avoid flying too early
    if (score < 20 && t === 'flying') t = 'block';

    if (t === 'spike') {
      obstacles.push({ type: t, x: W + 20, y: GROUND - 30, w: 36, h: 30 });
    } else if (t === 'block') {
      obstacles.push({ type: t, x: W + 20, y: GROUND - 44, w: 44, h: 44 });
    } else if (t === 'tall') {
      obstacles.push({ type: t, x: W + 20, y: GROUND - 80, w: 32, h: 80 });
    } else if (t === 'flying') {
      obstacles.push({ type: t, x: W + 20, y: GROUND - 140, w: 56, h: 32 });
    }
  }

  function spawnCoin() {
    const pattern = Math.floor(Math.random() * 3);
    const baseY = GROUND - 80 - Math.random() * 100;
    if (pattern === 0) {
      // single
      coinsArr.push({ x: W + 30, y: baseY, r: 14, picked: false, t: Math.random() * Math.PI * 2 });
    } else if (pattern === 1) {
      // arc of 5
      for (let i = 0; i < 5; i++) {
        const px = W + 30 + i * 36;
        const py = baseY - Math.sin((i / 4) * Math.PI) * 60;
        coinsArr.push({ x: px, y: py, r: 14, picked: false, t: Math.random() * Math.PI * 2 });
      }
    } else {
      // line of 4
      for (let i = 0; i < 4; i++) {
        coinsArr.push({ x: W + 30 + i * 32, y: baseY, r: 14, picked: false, t: Math.random() * Math.PI * 2 });
      }
    }
  }

  // ---------- Update ----------
  function update() {
    frame++;
    speed = baseSpeed + Math.min(score / 50, 8);
    scrollX += speed;

    // Player physics
    player.vy += gravity;
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

    // Trail
    if (frame % 2 === 0) {
      player.trail.push({ x: player.x + player.w / 2, y: player.y + player.h / 2, life: 20 });
      if (player.trail.length > 12) player.trail.shift();
    }
    player.trail.forEach((t) => t.life--);
    player.trail = player.trail.filter((t) => t.life > 0);

    // Spawn
    if (frame >= nextObstacleAt) {
      spawnObstacle();
      const gap = Math.max(45, 95 - score / 4);
      nextObstacleAt = frame + gap + Math.random() * 30;
    }
    if (frame >= nextCoinAt) {
      spawnCoin();
      nextCoinAt = frame + 90 + Math.random() * 80;
    }

    // Move obstacles
    obstacles.forEach((o) => (o.x -= speed));
    obstacles = obstacles.filter((o) => o.x + o.w > -50);

    // Move coins
    coinsArr.forEach((c) => {
      c.x -= speed;
      c.t += 0.15;
    });
    coinsArr = coinsArr.filter((c) => c.x > -30 && !c.picked);

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
    while (mountains[mountains.length - 1].x + mountains[mountains.length - 1].w < W + 200) {
      const last = mountains[mountains.length - 1];
      const w = 180 + Math.random() * 160;
      mountains.push({ x: last.x + last.w * 0.6, w, h: 120 + Math.random() * 100, hue: 280 + Math.random() * 40 });
    }
    buildings.forEach((b) => (b.x -= speed * 0.4));
    if (buildings.length && buildings[0].x + buildings[0].w < -10) buildings.shift();
    while (buildings[buildings.length - 1].x + buildings[buildings.length - 1].w < W + 100) {
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
    const px = player.x + 10;
    const py = player.y + 8;
    const pw = player.w - 20;
    const ph = player.h - 12;

    for (const o of obstacles) {
      if (px < o.x + o.w && px + pw > o.x && py < o.y + o.h && py + ph > o.y) {
        gameOver();
        return;
      }
    }
    for (const c of coinsArr) {
      const dx = c.x - (player.x + player.w / 2);
      const dy = c.y - (player.y + player.h / 2);
      if (dx * dx + dy * dy < (c.r + 24) * (c.r + 24)) {
        c.picked = true;
        runCoins++;
        score += 5;
        // sparkle
        for (let i = 0; i < 8; i++) {
          const a = Math.random() * Math.PI * 2;
          const v = Math.random() * 3 + 1;
          particles.push({
            x: c.x,
            y: c.y,
            vx: Math.cos(a) * v,
            vy: Math.sin(a) * v - 1,
            life: 24,
            color: '#ffe14a',
            r: Math.random() * 2 + 1
          });
        }
      }
    }

    score += 1;
    if (frame % 6 === 0) scoreEl.textContent = score;

    if (shake > 0) shake *= 0.9;
  }

  // ---------- Draw ----------
  function drawBackground() {
    // Gradient sky
    const grd = ctx.createLinearGradient(0, 0, 0, H);
    grd.addColorStop(0, '#0a0e2a');
    grd.addColorStop(0.6, '#1a0a2e');
    grd.addColorStop(1, '#2a0a3a');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, W, H);

    // Stars
    for (const s of stars) {
      const a = 0.5 + Math.sin(s.tw) * 0.4;
      ctx.fillStyle = `rgba(255,255,255,${a})`;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }

    // Sun/moon
    const cx = W * 0.78;
    const cy = GROUND - 280;
    const sunG = ctx.createRadialGradient(cx, cy, 5, cx, cy, 80);
    sunG.addColorStop(0, 'rgba(255, 80, 200, 0.9)');
    sunG.addColorStop(0.5, 'rgba(255, 80, 200, 0.3)');
    sunG.addColorStop(1, 'rgba(255, 80, 200, 0)');
    ctx.fillStyle = sunG;
    ctx.fillRect(cx - 80, cy - 80, 160, 160);
    ctx.fillStyle = '#ff3df0';
    ctx.beginPath();
    ctx.arc(cx, cy, 38, 0, Math.PI * 2);
    ctx.fill();
    // sun bands
    ctx.fillStyle = '#0a0e2a';
    for (let i = 0; i < 5; i++) {
      ctx.fillRect(cx - 38, cy - 24 + i * 16, 76, 4);
    }

    // Mountains
    for (const m of mountains) {
      ctx.fillStyle = `hsl(${m.hue}, 50%, 14%)`;
      ctx.beginPath();
      ctx.moveTo(m.x, GROUND);
      ctx.lineTo(m.x + m.w / 2, GROUND - m.h);
      ctx.lineTo(m.x + m.w, GROUND);
      ctx.closePath();
      ctx.fill();
      // neon edge
      ctx.strokeStyle = `hsla(${m.hue + 40}, 90%, 60%, 0.5)`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(m.x, GROUND);
      ctx.lineTo(m.x + m.w / 2, GROUND - m.h);
      ctx.lineTo(m.x + m.w, GROUND);
      ctx.stroke();
    }

    // Buildings (closer parallax)
    for (const b of buildings) {
      ctx.fillStyle = '#06081a';
      ctx.fillRect(b.x, GROUND - b.h, b.w, b.h);
      ctx.strokeStyle = 'rgba(25, 240, 255, 0.4)';
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
    // Ground base
    ctx.fillStyle = '#06081a';
    ctx.fillRect(0, GROUND, W, H - GROUND);

    // Grid lines (perspective-ish)
    ctx.strokeStyle = 'rgba(255, 61, 240, 0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, GROUND);
    ctx.lineTo(W, GROUND);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(25, 240, 255, 0.18)';
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
    // Trail
    for (let i = 0; i < player.trail.length; i++) {
      const t = player.trail[i];
      const a = t.life / 20;
      ctx.fillStyle = `rgba(25, 240, 255, ${a * 0.4})`;
      ctx.beginPath();
      ctx.arc(t.x, t.y, 14 * a, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.save();
    ctx.translate(player.x + player.w / 2, player.y + player.h / 2);
    ctx.rotate(player.rot);

    // Glow
    ctx.shadowColor = '#19f0ff';
    ctx.shadowBlur = 20;

    // Body — rounded rect
    const w = player.w, h = player.h;
    const r = 12;
    ctx.fillStyle = '#19f0ff';
    ctx.beginPath();
    ctx.moveTo(-w/2 + r, -h/2);
    ctx.lineTo(w/2 - r, -h/2);
    ctx.quadraticCurveTo(w/2, -h/2, w/2, -h/2 + r);
    ctx.lineTo(w/2, h/2 - r);
    ctx.quadraticCurveTo(w/2, h/2, w/2 - r, h/2);
    ctx.lineTo(-w/2 + r, h/2);
    ctx.quadraticCurveTo(-w/2, h/2, -w/2, h/2 - r);
    ctx.lineTo(-w/2, -h/2 + r);
    ctx.quadraticCurveTo(-w/2, -h/2, -w/2 + r, -h/2);
    ctx.closePath();
    ctx.fill();

    ctx.shadowBlur = 0;

    // Inner gradient
    const g = ctx.createLinearGradient(0, -h/2, 0, h/2);
    g.addColorStop(0, 'rgba(255,255,255,0.6)');
    g.addColorStop(1, 'rgba(255, 61, 240, 0.4)');
    ctx.fillStyle = g;
    ctx.fillRect(-w/2 + 4, -h/2 + 4, w - 8, h - 8);

    // Eyes
    ctx.fillStyle = '#07091a';
    ctx.fillRect(-12, -10, 8, 12);
    ctx.fillRect(4, -10, 8, 12);
    ctx.fillStyle = '#fff';
    ctx.fillRect(-10, -8, 4, 5);
    ctx.fillRect(6, -8, 4, 5);

    // Mouth
    ctx.strokeStyle = '#07091a';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 12, 8, 0, Math.PI);
    ctx.stroke();

    ctx.restore();
  }

  function drawObstacles() {
    for (const o of obstacles) {
      ctx.save();
      if (o.type === 'spike') {
        ctx.shadowColor = '#ff3d6e';
        ctx.shadowBlur = 14;
        ctx.fillStyle = '#ff3d6e';
        ctx.beginPath();
        ctx.moveTo(o.x, o.y + o.h);
        ctx.lineTo(o.x + o.w / 2, o.y);
        ctx.lineTo(o.x + o.w, o.y + o.h);
        ctx.closePath();
        ctx.fill();
      } else if (o.type === 'block') {
        ctx.shadowColor = '#ff3d6e';
        ctx.shadowBlur = 14;
        ctx.fillStyle = '#1a0a14';
        ctx.fillRect(o.x, o.y, o.w, o.h);
        ctx.strokeStyle = '#ff3d6e';
        ctx.lineWidth = 3;
        ctx.strokeRect(o.x + 1.5, o.y + 1.5, o.w - 3, o.h - 3);
        // X pattern
        ctx.beginPath();
        ctx.moveTo(o.x + 8, o.y + 8);
        ctx.lineTo(o.x + o.w - 8, o.y + o.h - 8);
        ctx.moveTo(o.x + o.w - 8, o.y + 8);
        ctx.lineTo(o.x + 8, o.y + o.h - 8);
        ctx.stroke();
      } else if (o.type === 'tall') {
        ctx.shadowColor = '#ff3d6e';
        ctx.shadowBlur = 14;
        ctx.fillStyle = '#1a0a14';
        ctx.fillRect(o.x, o.y, o.w, o.h);
        ctx.strokeStyle = '#ff3d6e';
        ctx.lineWidth = 3;
        ctx.strokeRect(o.x + 1.5, o.y + 1.5, o.w - 3, o.h - 3);
        // hatch
        ctx.beginPath();
        for (let i = 0; i < 5; i++) {
          ctx.moveTo(o.x, o.y + 12 + i * 16);
          ctx.lineTo(o.x + o.w, o.y + 12 + i * 16);
        }
        ctx.stroke();
      } else if (o.type === 'flying') {
        // pulsing flying drone
        const pulse = 1 + Math.sin(frame * 0.2) * 0.1;
        ctx.shadowColor = '#ff3df0';
        ctx.shadowBlur = 18;
        ctx.fillStyle = '#ff3df0';
        ctx.beginPath();
        ctx.ellipse(o.x + o.w / 2, o.y + o.h / 2, (o.w / 2) * pulse, (o.h / 2) * pulse, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(o.x + o.w / 2, o.y + o.h / 2, 6, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  function drawCoins() {
    for (const c of coinsArr) {
      const wobble = Math.cos(c.t) * 0.6 + 0.4; // 0..1 width factor
      ctx.save();
      ctx.shadowColor = '#ffe14a';
      ctx.shadowBlur = 14;
      ctx.fillStyle = '#ffe14a';
      ctx.beginPath();
      ctx.ellipse(c.x, c.y, c.r * wobble, c.r, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff8c0';
      ctx.beginPath();
      ctx.ellipse(c.x, c.y, (c.r - 4) * wobble, c.r - 4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#b88500';
      ctx.font = 'bold 16px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('★', c.x, c.y + 1);
      ctx.restore();
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
    drawGround();
    drawCoins();
    drawParticles();
    drawObstacles();
    drawPlayer();
    ctx.restore();
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
    if (steps === 5) accumulator = 0;
    draw();
    requestAnimationFrame(loop);
  }
  player.y = GROUND - player.h;
  requestAnimationFrame(loop);

  // Prevent context menu / pinch zoom
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  document.addEventListener('contextmenu', (e) => e.preventDefault());
})();
