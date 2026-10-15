/* ==========================================================
   EmsPredicts – script.js
   1. Passing-network background (canvas)
   2. Storage + sign up / sign in (browser-only demo)
   3. Live fixtures + results (TheSportsDB free API)
   4. Outcome model (Poisson goals from recent form)
   5. UI rendering
   ========================================================== */
(() => {
  'use strict';

  /* ---------- config ---------- */
  const API = 'https://www.thesportsdb.com/api/v1/json/3/';
  const LEAGUES = [
    { id: 4328, name: 'Premier League' },
    { id: 4335, name: 'La Liga' },
    { id: 4332, name: 'Serie A' },
    { id: 4331, name: 'Bundesliga' },
    { id: 4334, name: 'Ligue 1' }
  ];

  /* ---------- helpers ---------- */
  const $ = (sel, root = document) => root.querySelector(sel);

  function el(tag, props = {}, ...kids) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === 'class') n.className = v;
      else if (k === 'text') n.textContent = v;
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else if (v !== false && v != null) n.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat()) if (kid != null) n.append(kid);
    return n;
  }

  const pad = n => String(n).padStart(2, '0');

  /* ==========================================================
     1. BACKGROUND – a team's passing network on a night pitch
     ========================================================== */
  function startPitch() {
    const cv = $('#pitch');
    const ctx = cv.getContext('2d');
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // 4-4-2 shape as fractions of pitch length (fx) and width (fy)
    const SHAPE = [
      [0.05, 0.5],
      [0.22, 0.14], [0.2, 0.38], [0.2, 0.62], [0.22, 0.86],
      [0.45, 0.1], [0.42, 0.36], [0.42, 0.64], [0.45, 0.9],
      [0.7, 0.36], [0.72, 0.64]
    ];
    const nodes = SHAPE.map(([fx, fy]) => ({
      fx, fy, x: 0, y: 0,
      ph: Math.random() * 6.28,
      sp: 0.3 + Math.random() * 0.3
    }));

    const edges = new Map(); // "a-b" -> weight
    let dpr = 1, W = 0, H = 0, portrait = false, R = { x: 0, y: 0, w: 0, h: 0 };
    let holder = 6, pass = null, hold = 0, last = performance.now(), t = 0;

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = cv.width = Math.floor(window.innerWidth * dpr);
      H = cv.height = Math.floor(window.innerHeight * dpr);
      portrait = H > W;
      const LW = portrait ? H : W;
      const LH = portrait ? W : H;
      R = { x: LW * 0.04, y: LH * 0.07, w: LW * 0.92, h: LH * 0.86 };
      if (reduce) draw();
    }

    function place() {
      for (const n of nodes) {
        n.x = R.x + R.w * n.fx + Math.sin(t * n.sp + n.ph) * R.w * 0.012;
        n.y = R.y + R.h * n.fy + Math.cos(t * n.sp * 1.3 + n.ph) * R.h * 0.015;
      }
    }

    function startPass() {
      const from = nodes[holder];
      const options = nodes
        .map((n, i) => ({ i, d: Math.hypot(n.x - from.x, n.y - from.y), fwd: n.fx > from.fx }))
        .filter(o => o.i !== holder)
        .sort((a, b) => a.d - b.d)
        .slice(0, 4);
      const weights = options.map(o => (o.fwd ? 1.7 : 1));
      let r = Math.random() * weights.reduce((a, b) => a + b, 0);
      let pick = options[0];
      for (let k = 0; k < options.length; k++) {
        r -= weights[k];
        if (r <= 0) { pick = options[k]; break; }
      }
      pass = { from: holder, to: pick.i, p: 0, dur: 900 + Math.random() * 600, bend: (Math.random() - 0.5) * 0.5 };
    }

    function ballPos() {
      const a = nodes[pass.from], b = nodes[pass.to];
      const u = pass.p < 0.5 ? 2 * pass.p * pass.p : 1 - Math.pow(-2 * pass.p + 2, 2) / 2;
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      const dx = b.x - a.x, dy = b.y - a.y;
      const cx = mx - dy * pass.bend, cy = my + dx * pass.bend;
      const v = 1 - u;
      return {
        x: v * v * a.x + 2 * v * u * cx + u * u * b.x,
        y: v * v * a.y + 2 * v * u * cy + u * u * b.y
      };
    }

    function drawPitch() {
      const { x, y, w, h } = R;
      ctx.strokeStyle = 'rgba(233, 241, 234, 0.10)';
      ctx.lineWidth = 2 * dpr;
      ctx.strokeRect(x, y, w, h);
      ctx.beginPath(); ctx.moveTo(x + w / 2, y); ctx.lineTo(x + w / 2, y + h); ctx.stroke();
      ctx.beginPath(); ctx.arc(x + w / 2, y + h / 2, h * 0.135, 0, Math.PI * 2); ctx.stroke();
      const bw = w * 0.157, bh = h * 0.593, sw = w * 0.052, sh = h * 0.269;
      ctx.strokeRect(x, y + (h - bh) / 2, bw, bh);
      ctx.strokeRect(x + w - bw, y + (h - bh) / 2, bw, bh);
      ctx.strokeRect(x, y + (h - sh) / 2, sw, sh);
      ctx.strokeRect(x + w - sw, y + (h - sh) / 2, sw, sh);
    }

    function draw() {
      if (portrait) ctx.setTransform(0, 1, 1, 0, 0, 0); // turn the pitch to fit tall screens
      else ctx.setTransform(1, 0, 0, 1, 0, 0);
      const LW = portrait ? H : W, LH = portrait ? W : H;
      ctx.clearRect(0, 0, LW, LH);
      drawPitch();
      place();

      // pass history
      for (const [key, wt] of edges) {
        const [a, b] = key.split('-').map(Number);
        ctx.strokeStyle = 'rgba(233, 241, 234,' + Math.min(0.5, wt * 0.1).toFixed(3) + ')';
        ctx.lineWidth = (1 + Math.min(wt, 4) * 0.6) * dpr;
        ctx.beginPath();
        ctx.moveTo(nodes[a].x, nodes[a].y);
        ctx.lineTo(nodes[b].x, nodes[b].y);
        ctx.stroke();
      }

      // players
      nodes.forEach((n, i) => {
        ctx.beginPath();
        ctx.arc(n.x, n.y, 6 * dpr, 0, Math.PI * 2);
        if (i === holder && !pass) {
          ctx.fillStyle = 'rgba(243, 182, 63, 0.9)';
          ctx.fill();
        } else {
          ctx.strokeStyle = 'rgba(233, 241, 234, 0.28)';
          ctx.lineWidth = 2 * dpr;
          ctx.stroke();
        }
      });

      // ball in flight
      if (pass) {
        const p = ballPos();
        ctx.save();
        ctx.shadowColor = 'rgba(243, 182, 63, 0.9)';
        ctx.shadowBlur = 18 * dpr;
        ctx.fillStyle = '#f3b63f';
        ctx.beginPath();
        ctx.arc(p.x, p.y, 5 * dpr, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    function frame(now) {
      const dt = Math.min(now - last, 60);
      last = now;
      t += dt / 1000;

      for (const [k, v] of edges) {
        const nv = v * Math.exp(-dt / 6000);
        if (nv < 0.05) edges.delete(k); else edges.set(k, nv);
      }

      if (pass) {
        pass.p += dt / pass.dur;
        if (pass.p >= 1) {
          const key = [pass.from, pass.to].sort((a, b) => a - b).join('-');
          edges.set(key, (edges.get(key) || 0) + 1);
          holder = pass.to;
          pass = null;
          hold = 150 + Math.random() * 250;
        }
      } else {
        hold -= dt;
        if (hold <= 0) startPass();
      }

      draw();
      requestAnimationFrame(frame);
    }

    window.addEventListener('resize', resize);
    resize();

    if (reduce) {
      // one still frame with a few established links
      for (let i = 1; i < nodes.length; i++) edges.set([i - 1, i].join('-'), 2 + (i % 3));
      draw();
    } else {
      requestAnimationFrame(frame);
    }
  }

  /* ==========================================================
     2. STORAGE + AUTH
     NOTE: this stores accounts in the browser only. It is a
     front-end demo – a real site needs a server and a proper
     password hashing scheme (bcrypt / argon2).
     ========================================================== */
  const mem = {};
  const store = {
    get(key) {
      try {
        const v = window.localStorage.getItem(key);
        return v ? JSON.parse(v) : null;
      } catch (e) {
        return mem[key] ?? null;
      }
    },
    set(key, value) {
      try { window.localStorage.setItem(key, JSON.stringify(value)); }
      catch (e) { mem[key] = value; }
    }
  };

  async function hashPassword(password, salt) {
    const data = new TextEncoder().encode(salt + ':' + password);
    if (window.crypto && window.crypto.subtle) {
      const buf = await window.crypto.subtle.digest('SHA-256', data);
      return [...new Uint8Array(buf)].map(b => pad(b.toString(16))).join('');
    }
    let h = 5381; // weak fallback for very old browsers
    for (const c of data) h = ((h << 5) + h + c) >>> 0;
    return 'x' + h.toString(16);
  }

  function randomSalt() {
    const a = new Uint8Array(16);
    (window.crypto || {}).getRandomValues ? window.crypto.getRandomValues(a) : a.forEach((_, i) => (a[i] = Math.random() * 256));
    return [...a].map(b => pad(b.toString(16))).join('');
  }

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  async function signUp({ name, email, password, adult }) {
    name = name.trim();
    email = email.trim().toLowerCase();
    if (name.length < 2) throw new Error('Enter your name.');
    if (!EMAIL_RE.test(email)) throw new Error('Enter a valid email address.');
    if (password.length < 8) throw new Error('Use a password with at least 8 characters.');
    if (!adult) throw new Error('You must be 18 or older to create an account.');
    const users = store.get('pc_users') || {};
    if (users[email]) throw new Error('An account with this email already exists. Sign in instead.');
    const salt = randomSalt();
    users[email] = { name, salt, hash: await hashPassword(password, salt) };
    store.set('pc_users', users);
    store.set('pc_session', email);
    return { email, name };
  }

  async function signIn({ email, password }) {
    email = email.trim().toLowerCase();
    const users = store.get('pc_users') || {};
    const u = users[email];
    if (!u || (await hashPassword(password, u.salt)) !== u.hash) {
      throw new Error('Email or password is incorrect.');
    }
    store.set('pc_session', email);
    return { email, name: u.name };
  }

  function signOut() { store.set('pc_session', null); }

  function currentUser() {
    const email = store.get('pc_session');
    const users = store.get('pc_users') || {};
    return email && users[email] ? { email, name: users[email].name } : null;
  }

  const picksKey = email => 'pc_picks_' + email;

  /* ==========================================================
     3. MATCH DATA
     ========================================================== */
  async function getJSON(url) {
    const r = await fetch(url);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  }

  function normalize(list) {
    return (list || []).map(e => {
      const when = e.dateEvent ? new Date(e.dateEvent + 'T' + (e.strTime || '12:00:00') + 'Z') : null;
      const hs = e.intHomeScore === null || e.intHomeScore === undefined || e.intHomeScore === '' ? null : Number(e.intHomeScore);
      const as = e.intAwayScore === null || e.intAwayScore === undefined || e.intAwayScore === '' ? null : Number(e.intAwayScore);
      return {
        id: String(e.idEvent),
        home: e.strHomeTeam,
        away: e.strAwayTeam,
        idHome: e.idHomeTeam,
        idAway: e.idAwayTeam,
        badgeHome: e.strHomeTeamBadge || '',
        badgeAway: e.strAwayTeamBadge || '',
        hs, as,
        when: when && !isNaN(when) ? when : null
      };
    });
  }

  // Fictional fixtures, used only if the live feed can't be reached.
  function sampleData() {
    const now = Date.now();
    const mk = (id, home, away, hs, as, hrs) => ({
      id: 's' + id, home, away, idHome: null, idAway: null, badgeHome: '', badgeAway: '',
      hs, as, when: new Date(now + hrs * 3600e3)
    });
    return {
      next: [
        mk(1, 'Harbour City', 'Northgate Rovers', null, null, 20),
        mk(2, 'Red Valley', 'Castle Athletic', null, null, 44),
        mk(3, 'Riverside United', 'Old Mill', null, null, 68)
      ],
      past: [
        mk(11, 'Northgate Rovers', 'Red Valley', 2, 1, -30),
        mk(12, 'Castle Athletic', 'Harbour City', 0, 3, -54),
        mk(13, 'Old Mill', 'Northgate Rovers', 1, 1, -78),
        mk(14, 'Harbour City', 'Riverside United', 2, 0, -102),
        mk(15, 'Red Valley', 'Old Mill', 1, 2, -126),
        mk(16, 'Riverside United', 'Castle Athletic', 3, 2, -150)
      ],
      sample: true
    };
  }

  const leagueCache = {};

  async function loadLeague(league) {
    if (leagueCache[league.id]) return leagueCache[league.id];
    try {
      const [past, next] = await Promise.all([
        getJSON(API + 'eventspastleague.php?id=' + league.id),
        getJSON(API + 'eventsnextleague.php?id=' + league.id)
      ]);
      const data = {
        past: normalize(past.events).filter(m => m.hs !== null && m.as !== null).sort((a, b) => b.when - a.when),
        next: normalize(next.events).sort((a, b) => a.when - b.when),
        sample: false
      };
      leagueCache[league.id] = data;
      return data;
    } catch (err) {
      return sampleData();
    }
  }

  const formCache = {};
  async function teamGames(teamId, name) {
    if (!teamId) return [];
    if (formCache[teamId]) return formCache[teamId];
    try {
      const j = await getJSON(API + 'eventslast.php?id=' + teamId);
      const games = normalize(j.results).filter(m => m.hs !== null && (m.home === name || m.away === name));
      formCache[teamId] = games;
      return games;
    } catch (err) {
      return [];
    }
  }

  /* ==========================================================
     4. OUTCOME MODEL
     Each side's expected goals = league average x attack x
     opponent's defence x home/away factor, then a Poisson
     grid gives win / draw / lose odds.
     ========================================================== */
  function teamForm(name, games) {
    const sorted = [...games].sort((a, b) => b.when - a.when).slice(0, 8);
    let gf = 0, ga = 0;
    const form = [];
    for (const g of sorted) {
      const isHome = g.home === name;
      const f = isHome ? g.hs : g.as;
      const a = isHome ? g.as : g.hs;
      gf += f; ga += a;
      form.push(f > a ? 'W' : f === a ? 'D' : 'L');
    }
    return { gf, ga, p: sorted.length, form };
  }

  function poisson(lambda, k) {
    let f = 1;
    for (let i = 2; i <= k; i++) f *= i;
    return Math.exp(-lambda) * Math.pow(lambda, k) / f;
  }

  function predict(hForm, aForm, leagueAvg) {
    const K = 3; // pulls small samples toward the league average
    const atk = s => ((s.gf + K * leagueAvg) / (s.p + K)) / leagueAvg;
    const def = s => ((s.ga + K * leagueAvg) / (s.p + K)) / leagueAvg;
    const lh = leagueAvg * atk(hForm) * def(aForm) * 1.12;
    const la = leagueAvg * atk(aForm) * def(hForm) * 0.92;

    const N = 9;
    let pH = 0, pD = 0, pA = 0, over = 0, btts = 0, total = 0;
    let best = { p: 0, h: 0, a: 0 };
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        const p = poisson(lh, i) * poisson(la, j);
        total += p;
        if (i > j) pH += p; else if (i === j) pD += p; else pA += p;
        if (i + j > 2) over += p;
        if (i > 0 && j > 0) btts += p;
        if (p > best.p) best = { p, h: i, a: j };
      }
    }
    pH /= total; pD /= total; pA /= total; over /= total; btts /= total;

    const sample = Math.min(hForm.p, aForm.p);
    return {
      pH, pD, pA, over, btts,
      score: best.h + '-' + best.a,
      lh, la,
      quality: sample < 2 ? 'Thin' : sample < 4 ? 'Fair' : 'Good'
    };
  }

  /* ==========================================================
     5. UI
     ========================================================== */
  const state = {
    league: LEAGUES[0],
    view: 'upcoming',
    data: null,
    user: null,
    preds: {},     // matchId -> { status, result, hForm, aForm }
    openId: null,
    pendingId: null
  };

  /* ---- auth dialog ---- */
  const dlg = $('#authDialog');

  function setAuthMode(mode, hint) {
    const isIn = mode === 'signin';
    $('#authTitle').textContent = isIn ? 'Sign in' : 'Create account';
    $('#tabSignin').setAttribute('aria-selected', String(isIn));
    $('#tabSignup').setAttribute('aria-selected', String(!isIn));
    $('#signinForm').hidden = !isIn;
    $('#signupForm').hidden = isIn;
    $('#authHint').textContent = hint || '';
    $('#authError').textContent = '';
  }

  function openAuth(mode, hint) {
    setAuthMode(mode, hint);
    if (typeof dlg.showModal === 'function') dlg.showModal();
    else dlg.setAttribute('open', '');
    (mode === 'signin' ? $('#siEmail') : $('#suName')).focus();
  }

  function closeAuth() {
    if (typeof dlg.close === 'function') dlg.close();
    else dlg.removeAttribute('open');
  }

  async function handleAuth(e, action) {
    e.preventDefault();
    const form = e.currentTarget;
    const btn = $('button[type="submit"]', form);
    const fd = new FormData(form);
    $('#authError').textContent = '';
    btn.disabled = true;
    try {
      state.user = await action(fd);
      form.reset();
      closeAuth();
      refreshAccount();
      const pending = state.pendingId;
      state.pendingId = null;
      if (pending) togglePrediction(pending);
    } catch (err) {
      $('#authError').textContent = err.message;
    } finally {
      btn.disabled = false;
    }
  }

  function refreshAccount() {
    const u = state.user;
    $('#userChip').hidden = !u;
    $('#userChip').textContent = u ? 'Hi, ' + u.name.split(' ')[0] : '';
    $('#picksLink').hidden = !u;
    $('#signinBtn').hidden = !!u;
    $('#signupBtn').hidden = !!u;
    $('#signoutBtn').hidden = !u;
    $('#picks').hidden = !u;
    if (u) renderPicks();
    renderMatches();
  }

  /* ---- fixtures ---- */
  function fmtDate(d) {
    if (!d) return { day: 'Date to be confirmed', time: '' };
    return {
      day: d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }),
      time: d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
    };
  }

  function badge(src, name) {
    if (!src) return null;
    const img = el('img', { src: src + '/tiny', alt: '', loading: 'lazy', width: '30', height: '30' });
    img.addEventListener('error', () => img.remove());
    return img;
  }

  function renderMatches() {
    const list = $('#matches');
    list.replaceChildren();
    if (!state.data) return;

    const upcoming = state.view === 'upcoming';
    const rows = upcoming ? state.data.next : state.data.past;

    if (!rows.length) {
      $('#status').textContent = upcoming
        ? 'No upcoming fixtures listed for this league right now. Check recent results or try another league.'
        : 'No recent results listed for this league.';
    }

    for (const m of rows) {
      const d = fmtDate(m.when);
      const open = upcoming && state.openId === m.id;

      const row = el('div', { class: 'match-row' },
        el('div', { class: 'match-time' }, el('strong', { text: d.day }), d.time),
        el('div', { class: 'fixture' },
          el('span', { class: 'team home' }, m.home, badge(m.badgeHome)),
          upcoming ? el('span', { class: 'vs', text: 'vs' })
                   : el('span', { class: 'score', text: m.hs + ' – ' + m.as }),
          el('span', { class: 'team away' }, badge(m.badgeAway), m.away)
        ),
        upcoming
          ? el('button', {
              class: 'btn predict-btn',
              type: 'button',
              'data-predict': m.id,
              'aria-expanded': String(open),
              'aria-controls': 'pred-' + m.id,
              text: open ? 'Hide prediction' : 'Predict',
              onclick: () => togglePrediction(m.id)
            })
          : null
      );

      const li = el('li', { class: 'match' }, row);
      if (open) li.append(renderPrediction(m));
      list.append(li);
    }
  }

  function renderPrediction(m) {
    const box = el('section', { class: 'pred', id: 'pred-' + m.id, 'aria-live': 'polite' });
    const entry = state.preds[m.id];

    if (!entry || entry.status === 'loading') {
      box.append(el('p', { text: 'Working out the numbers…' }));
      return box;
    }

    const r = entry.result;
    const pct = n => Math.round(n * 100);
    const h = pct(r.pH), d = pct(r.pD), a = 100 - h - d;
    const odds = p => (1 / Math.max(p, 0.01)).toFixed(2);

    const top = Math.max(r.pH, r.pD, r.pA);
    const lean = top === r.pH ? m.home + ' win' : top === r.pA ? m.away + ' win' : 'Draw';
    const sorted = [r.pH, r.pD, r.pA].sort((x, y) => y - x);
    const closeCall = sorted[0] - sorted[1] < 0.08;

    const formLine = (name, f) => el('div', { class: 'form-line' },
      el('b', { text: name }),
      f.form.length
        ? f.form.map(x => el('span', { class: 'chip ' + x, text: x }))
        : el('span', { text: 'no recent results found' })
    );

    box.append(
      el('h3', { text: lean + (closeCall ? ' (close call)' : '') }),
      el('div', { class: 'bar', role: 'img', 'aria-label': m.home + ' ' + h + '%, draw ' + d + '%, ' + m.away + ' ' + a + '%' },
        el('span', { class: 'b-home', style: 'flex-basis:' + h + '%' }),
        el('span', { class: 'b-draw', style: 'flex-basis:' + d + '%' }),
        el('span', { class: 'b-away', style: 'flex-basis:' + a + '%' })
      ),
      el('dl', { class: 'legend' },
        el('div', { class: 'l-home' }, el('dt', { text: m.home }), el('dd', {}, h + '%', el('small', { text: 'fair odds ' + odds(r.pH) }))),
        el('div', { class: 'l-draw' }, el('dt', { text: 'Draw' }), el('dd', {}, d + '%', el('small', { text: 'fair odds ' + odds(r.pD) }))),
        el('div', { class: 'l-away' }, el('dt', { text: m.away }), el('dd', {}, a + '%', el('small', { text: 'fair odds ' + odds(r.pA) })))
      ),
      el('dl', { class: 'facts' },
        el('div', {}, el('dt', { text: 'Most likely score' }), el('dd', { text: r.score })),
        el('div', {}, el('dt', { text: 'Over 2.5 goals' }), el('dd', { text: pct(r.over) + '%' })),
        el('div', {}, el('dt', { text: 'Both teams score' }), el('dd', { text: pct(r.btts) + '%' })),
        el('div', {}, el('dt', { text: 'Form data' }), el('dd', { text: r.quality }))
      ),
      formLine(m.home, entry.hForm),
      formLine(m.away, entry.aForm),
      el('div', { class: 'pred-actions' },
        el('button', {
          class: 'btn btn-solid',
          type: 'button',
          text: isSaved(m.id) ? 'Pick saved' : 'Save this pick',
          disabled: isSaved(m.id),
          onclick: () => savePick(m, lean, h, d, a)
        }),
        el('p', {
          class: 'caveat',
          text: 'Built only from recent results, so injuries, lineups and motivation are not counted. Fair odds are 1 divided by the probability; a bookmaker price above that is better value.'
        })
      )
    );
    return box;
  }

  async function togglePrediction(id) {
    if (!state.user) {
      state.pendingId = id;
      openAuth('signin', 'Sign in or create an account to see predictions.');
      return;
    }
    if (state.openId === id) {
      state.openId = null;
      renderMatches();
      focusPredict(id);
      return;
    }
    state.openId = id;
    const m = state.data.next.find(x => x.id === id);
    if (!m) return;

    if (!state.preds[id]) {
      state.preds[id] = { status: 'loading' };
      renderMatches();
      focusPredict(id);

      const pastGames = state.data.past;
      const [hExtra, aExtra] = await Promise.all([
        teamGames(m.idHome, m.home),
        teamGames(m.idAway, m.away)
      ]);
      const merge = (name, extra) => {
        const seen = new Set();
        return [...extra, ...pastGames.filter(g => g.home === name || g.away === name)]
          .filter(g => (seen.has(g.id) ? false : seen.add(g.id)));
      };
      const hForm = teamForm(m.home, merge(m.home, hExtra));
      const aForm = teamForm(m.away, merge(m.away, aExtra));

      let goals = 0, n = 0;
      for (const g of pastGames) { goals += g.hs + g.as; n++; }
      const leagueAvg = n >= 5 ? goals / (2 * n) : 1.35;

      state.preds[id] = { status: 'done', result: predict(hForm, aForm, leagueAvg), hForm, aForm };
    }
    renderMatches();
    focusPredict(id);
  }

  function focusPredict(id) {
    const b = document.querySelector('[data-predict="' + id + '"]');
    if (b) b.focus({ preventScroll: true });
  }

  /* ---- saved picks ---- */
  function getPicks() { return state.user ? store.get(picksKey(state.user.email)) || [] : []; }
  function isSaved(id) { return getPicks().some(p => p.id === id); }

  function savePick(m, lean, h, d, a) {
    if (!state.user || isSaved(m.id)) return;
    const picks = getPicks();
    picks.unshift({
      id: m.id, home: m.home, away: m.away, lean,
      probs: h + '% / ' + d + '% / ' + a + '%',
      kickoff: m.when ? m.when.toISOString() : null
    });
    store.set(picksKey(state.user.email), picks);
    renderPicks();
    renderMatches();
    focusPredict(m.id);
  }

  function removePick(id) {
    store.set(picksKey(state.user.email), getPicks().filter(p => p.id !== id));
    renderPicks();
    renderMatches();
  }

  function renderPicks() {
    const ul = $('#picksList');
    ul.replaceChildren();
    const picks = getPicks();
    if (!picks.length) {
      ul.append(el('li', { class: 'picks-empty', text: 'No saved picks yet. Open a fixture, tap Predict, then save the lean you like.' }));
      return;
    }
    for (const p of picks) {
      const when = p.kickoff ? fmtDate(new Date(p.kickoff)) : null;
      ul.append(el('li', {},
        el('div', { class: 'pk-main' },
          el('strong', { text: p.home + ' vs ' + p.away }),
          el('span', { text: p.lean + ' · home / draw / away ' + p.probs + (when ? ' · ' + when.day : '') })
        ),
        el('button', { class: 'btn btn-quiet', type: 'button', text: 'Remove', 'aria-label': 'Remove pick ' + p.home + ' vs ' + p.away, onclick: () => removePick(p.id) })
      ));
    }
  }

  /* ---- kickoff clock ---- */
  let clockTimer = null;
  function startClock() {
    clearInterval(clockTimer);
    const next = state.data && state.data.next.find(m => m.when && m.when.getTime() > Date.now());
    const teams = $('#kickTeams'), clock = $('#kickClock'), when = $('#kickWhen');
    if (!next) {
      teams.textContent = 'No fixture scheduled';
      clock.textContent = '--:--:--';
      when.textContent = '';
      return;
    }
    teams.textContent = next.home + ' vs ' + next.away;
    const f = fmtDate(next.when);
    when.textContent = f.day + ', ' + f.time;
    const tick = () => {
      let s = Math.max(0, Math.floor((next.when.getTime() - Date.now()) / 1000));
      const days = Math.floor(s / 86400); s %= 86400;
      const hh = Math.floor(s / 3600), mm = Math.floor((s % 3600) / 60), ss = s % 60;
      clock.textContent = (days ? days + 'd ' : '') + pad(hh) + ':' + pad(mm) + ':' + pad(ss);
    };
    tick();
    clockTimer = setInterval(tick, 1000);
  }

  /* ---- league + view controls ---- */
  function renderTabs() {
    const tabs = $('#leagueTabs');
    tabs.replaceChildren(...LEAGUES.map(l => el('button', {
      type: 'button',
      role: 'tab',
      'aria-selected': String(l.id === state.league.id),
      text: l.name,
      onclick: () => selectLeague(l)
    })));
  }

  async function selectLeague(league) {
    state.league = league;
    state.openId = null;
    state.data = null;
    renderTabs();
    renderMatches();
    const status = $('#status');
    status.className = 'status';
    status.textContent = 'Loading ' + league.name + '…';

    const data = await loadLeague(league);
    if (state.league.id !== league.id) return; // user switched while loading
    state.data = data;

    if (data.sample) {
      status.className = 'status warn';
      status.textContent = 'Live scores could not be reached, so these are made-up sample fixtures. Check your connection and reload for real matches.';
    } else {
      status.textContent = '';
    }
    renderMatches();
    startClock();
  }

  function setView(view) {
    state.view = view;
    state.openId = null;
    $('#viewUpcoming').setAttribute('aria-pressed', String(view === 'upcoming'));
    $('#viewRecent').setAttribute('aria-pressed', String(view === 'recent'));
    if (state.data && !state.data.sample) $('#status').textContent = '';
    renderMatches();
  }

  /* ---- boot ---- */
  function init() {
    startPitch();

    state.user = currentUser();

    $('#signinBtn').addEventListener('click', () => openAuth('signin'));
    $('#signupBtn').addEventListener('click', () => openAuth('signup'));
    $('#signoutBtn').addEventListener('click', () => {
      signOut();
      state.user = null;
      state.openId = null;
      refreshAccount();
    });
    $('#authClose').addEventListener('click', closeAuth);
    $('#tabSignin').addEventListener('click', () => setAuthMode('signin', $('#authHint').textContent));
    $('#tabSignup').addEventListener('click', () => setAuthMode('signup', $('#authHint').textContent));
    dlg.addEventListener('click', e => { if (e.target === dlg) closeAuth(); }); // click on backdrop
    dlg.addEventListener('close', () => { state.pendingId = null; });

    $('#signinForm').addEventListener('submit', e =>
      handleAuth(e, fd => signIn({ email: fd.get('email') || '', password: fd.get('password') || '' })));
    $('#signupForm').addEventListener('submit', e =>
      handleAuth(e, fd => signUp({
        name: fd.get('name') || '',
        email: fd.get('email') || '',
        password: fd.get('password') || '',
        adult: fd.get('age') === 'on'
      })));

    $('#viewUpcoming').addEventListener('click', () => setView('upcoming'));
    $('#viewRecent').addEventListener('click', () => setView('recent'));

    renderTabs();
    refreshAccount();
    selectLeague(LEAGUES[0]);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();

