import './styles.css';
import { principles, naturalDay } from './data/principles.js';
import { remedies, EVIDENCE } from './data/remedies.js';
import { claims } from './data/claims.js';
import { checkRedFlags } from './data/redflags.js';
import { goals, goalById } from './data/goals.js';
import { DEFAULT_MODEL, toGeminiHistory, callGemini, goalContext } from './advisor-core.js';

const API_BASE = import.meta.env.VITE_API_BASE || '';
// Inside the Android app with no server configured, only a personal key works.
const HAS_SERVER = Boolean(API_BASE) || !window.Capacitor?.isNativePlatform?.();
const API_URL = `${API_BASE}/api/advisor`;
const $ = (sel) => document.querySelector(sel);
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const store = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v ? JSON.parse(v) : fallback;
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* storage unavailable: keep working in memory */
    }
  },
};

const escapeHtml = (s) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// Minimal markdown: headings, bold, italics, bullet lists. Input is escaped first.
function renderMarkdown(md) {
  const lines = escapeHtml(md).split('\n');
  let html = '';
  let inList = false;
  for (const raw of lines) {
    const line = raw
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^*])\*(?!\s)(.+?)\*/g, '$1<em>$2</em>');
    const bullet = line.match(/^\s*(?:[-*•]|\d+\.)\s+(.*)/);
    if (bullet) {
      if (!inList) (html += '<ul>'), (inList = true);
      html += `<li>${bullet[1]}</li>`;
      continue;
    }
    if (inList) (html += '</ul>'), (inList = false);
    const heading = line.match(/^#{1,6}\s+(.*)/);
    if (heading) html += `<h4>${heading[1]}</h4>`;
    else if (line.trim()) html += `<p>${line}</p>`;
  }
  if (inList) html += '</ul>';
  return html;
}

const buzz = (ms = 12) => navigator.vibrate?.(ms);

let toastTimer;
function toast(text) {
  const el = $('#toast');
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

/* ---------- Tabs ---------- */
function showTab(name) {
  document.querySelectorAll('.dock button').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.id === `tab-${name}`));
  store.set('tab', name);
}
document.querySelectorAll('.dock button').forEach((btn) => btn.addEventListener('click', () => showTab(btn.dataset.tab)));
showTab(store.get('tab', 'today'));

let profile = store.get('profile', {});
const currentGoal = () => goalById(profile.goal) || goals[0];

/* ---------- Intro ---------- */
const lettersHtml = () =>
  principles.map((p) => `<button class="letter" data-id="${p.id}" style="--c:${p.color}" title="${p.name}">${p.letter}</button>`).join('');
$('#intro-letters').innerHTML = lettersHtml();

let slide = 0;
function showSlide(i) {
  slide = i;
  $('#slides').style.transform = `translateX(-${i * 100}%)`;
  document.querySelectorAll('#dots i').forEach((d, j) => d.classList.toggle('on', j === i));
  $('#intro-next').textContent = i === 2 ? "I understand, let's start" : 'Next';
}
function openIntro() {
  showSlide(0);
  $('#intro').showModal();
}
$('#intro-next').addEventListener('click', () => {
  if (slide < 2) return showSlide(slide + 1);
  store.set('consent', true);
  $('#intro').close();
  if (!profile.goal) openOnboarding();
});
$('#intro').addEventListener('cancel', (e) => {
  if (!store.get('consent', false)) e.preventDefault();
});
$('#open-help').addEventListener('click', openIntro);
if (!store.get('consent', false)) openIntro();
else if (!profile.goal) queueMicrotask(() => openOnboarding());

/* ---------- Onboarding (goal) ---------- */
let pickedGoal = null;
function openOnboarding() {
  pickedGoal = profile.goal || null;
  $('#ob-name').value = profile.name || '';
  $('#goal-grid').innerHTML = goals
    .map((g) => `<button type="button" class="goal-opt ${g.id === pickedGoal ? 'picked' : ''}" data-goal="${g.id}">
      <span class="goal-icon">${g.icon}</span><strong>${g.name}</strong><small>${g.tagline}</small></button>`)
    .join('');
  $('#ob-start').disabled = !pickedGoal;
  $('#onboard').showModal();
}
$('#goal-grid').addEventListener('click', (e) => {
  const opt = e.target.closest('.goal-opt');
  if (!opt) return;
  pickedGoal = opt.dataset.goal;
  document.querySelectorAll('.goal-opt').forEach((o) => o.classList.toggle('picked', o === opt));
  $('#ob-start').disabled = false;
  buzz();
});
$('#onboard').addEventListener('cancel', (e) => {
  if (!profile.goal) e.preventDefault();
});
$('#onboard-form').addEventListener('submit', () => {
  profile = { name: $('#ob-name').value.trim(), goal: pickedGoal };
  store.set('profile', profile);
  renderAll();
});
$('#goal-pill').addEventListener('click', openOnboarding);

/* ---------- Sky: follows the real sun ---------- */
const hourNow = () => {
  const d = new Date();
  return d.getHours() + d.getMinutes() / 60;
};
function phaseOf(h) {
  if (h >= 5 && h < 8) return { id: 'dawn', label: 'Dawn', greet: 'Good morning' };
  if (h >= 8 && h < 17) return { id: 'day', label: h < 12 ? 'Morning' : 'Afternoon', greet: h < 12 ? 'Good morning' : 'Good afternoon' };
  if (h >= 17 && h < 20) return { id: 'dusk', label: 'Dusk', greet: 'Good evening' };
  return { id: 'night', label: 'Night', greet: h < 5 ? 'Rest well' : 'Good evening' };
}

function drawStars() {
  const c = $('#sky-stars');
  const r = c.getBoundingClientRect();
  c.width = r.width * devicePixelRatio;
  c.height = r.height * devicePixelRatio;
  const ctx = c.getContext('2d');
  ctx.scale(devicePixelRatio, devicePixelRatio);
  let seed = 7;
  const rand = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  for (let i = 0; i < 70; i++) {
    ctx.globalAlpha = 0.3 + rand() * 0.7;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(rand() * r.width, rand() * r.height * 0.75, rand() * 1.3 + 0.2, 0, Math.PI * 2);
    ctx.fill();
  }
}

function renderSky() {
  const h = hourNow();
  const ph = phaseOf(h);
  const sky = $('#sky');
  sky.className = `sky ${ph.id}`;
  $('#phase').textContent = `${ph.label} · ${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
  $('#greeting').textContent = profile.name ? `${ph.greet}, ${profile.name}` : ph.greet;

  // Sun travels 6:00→18:00 along the arc; the moon takes the night shift.
  const isDay = h >= 6 && h < 18;
  const t = isDay ? (h - 6) / 12 : ((h + 24 - 18) % 24) / 12;
  const bx = (1 - t) ** 2 * 20 + 2 * (1 - t) * t * 200 + t ** 2 * 380;
  const by = (1 - t) ** 2 * 140 + 2 * (1 - t) * t * 20 + t ** 2 * 140;
  const rect = sky.getBoundingClientRect();
  const arcTop = rect.height - 18 - 150;
  const sun = $('#sun');
  sun.classList.toggle('moon', !isDay);
  sun.style.left = `${(bx / 400) * 100}%`;
  sun.style.top = `${arcTop + by}px`;
}

/* ---------- Right now ---------- */
function nowIndex(h) {
  let idx = naturalDay.length - 1;
  naturalDay.forEach((d, i) => {
    if (h >= d.from) idx = i;
  });
  return h < naturalDay[0].from ? naturalDay.length - 1 : idx;
}
function renderNow() {
  const i = nowIndex(hourNow());
  const d = naturalDay[i];
  const next = naturalDay[(i + 1) % naturalDay.length];
  $('#now-card').innerHTML = `<span class="now-ico">${d.icon}</span>
    <span class="now-label">Right now</span>
    <span class="now-title">${d.time}</span>
    <p class="now-text">${d.text}</p>
    <span class="now-next">Next · <strong>${next.time}</strong>: ${next.text.split('.')[0]}.</span>`;
}

/* ---------- Habits store ---------- */
const dayKey = (d = new Date()) => d.toLocaleDateString('en-CA');
const FOCUS_COUNT = 4;
const TOTAL = principles.length + FOCUS_COUNT;
const STREAK_MIN = Math.ceil(TOTAL / 2);
let habits = store.get('habits', {});
const doneOn = (d) => habits[dayKey(d)] || [];
function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}
function streak() {
  let n = 0;
  let i = doneOn(daysAgo(0)).length >= STREAK_MIN ? 0 : 1; // today still counts as in progress
  while (doneOn(daysAgo(i)).length >= STREAK_MIN) n++, i++;
  return n;
}
const pillarsOpen = (list) => principles.filter((p) => list.includes(p.id)).length;

function toggleDone(id) {
  const key = dayKey();
  const set = new Set(habits[key] || []);
  const before = pillarsOpen([...set]);
  const adding = !set.has(id);
  adding ? set.add(id) : set.delete(id);
  habits[key] = [...set];
  store.set('habits', habits);
  buzz(adding ? 14 : 6);
  const p = principles.find((x) => x.id === id);
  if (adding && p) toast(`${p.letter} · ${p.name} bloomed`);
  if (adding && !p) toast('Ritual planted 🌱');
  renderToday();
  if (adding && before < principles.length && pillarsOpen([...set]) === principles.length) {
    toast('Full bloom! All nine pillars today ✿');
    petalRain();
  }
}

/* ---------- Bloom ---------- */
const PETAL = 'M0,-34 C30,-52 44,-112 0,-150 C-44,-112 -30,-52 0,-34 Z';
function buildBloom() {
  const step = 360 / principles.length;
  $('#bloom').innerHTML = principles
    .map((p, i) => {
      const a = i * step;
      return `<g transform="rotate(${a})"><g class="petal" data-id="${p.id}" style="--c:${p.color}" tabindex="0" role="button" aria-label="${p.name}">
        <path d="${PETAL}" /><text x="0" y="-104" transform="rotate(${-a} 0 -104)">${p.letter}</text></g></g>`;
    })
    .join('');
}
buildBloom();
function bloomClick(e) {
  const petal = e.target.closest('.petal');
  if (petal) toggleDone(petal.dataset.id);
}
$('#bloom').addEventListener('click', bloomClick);
$('#bloom').addEventListener('keydown', (e) => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.closest('.petal')) {
    e.preventDefault();
    bloomClick(e);
  }
});

/* ---------- Petal rain ---------- */
function petalRain() {
  if (reduceMotion) return;
  const c = $('#petal-rain');
  c.width = innerWidth * devicePixelRatio;
  c.height = innerHeight * devicePixelRatio;
  const ctx = c.getContext('2d');
  ctx.scale(devicePixelRatio, devicePixelRatio);
  const colors = principles.map((p) => p.color);
  const bits = Array.from({ length: 90 }, () => ({
    x: Math.random() * innerWidth,
    y: -20 - Math.random() * innerHeight * 0.6,
    r: 5 + Math.random() * 6,
    vy: 1.4 + Math.random() * 2.2,
    sway: Math.random() * Math.PI * 2,
    rot: Math.random() * Math.PI,
    c: colors[Math.floor(Math.random() * colors.length)],
  }));
  const start = performance.now();
  (function frame(now) {
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    bits.forEach((b) => {
      b.y += b.vy;
      b.sway += 0.04;
      b.rot += 0.03;
      ctx.save();
      ctx.translate(b.x + Math.sin(b.sway) * 18, b.y);
      ctx.rotate(b.rot);
      ctx.fillStyle = b.c;
      ctx.beginPath();
      ctx.ellipse(0, 0, b.r, b.r * 0.55, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
    if (now - start < 3800) requestAnimationFrame(frame);
    else ctx.clearRect(0, 0, innerWidth, innerHeight);
  })(start);
  buzz([20, 40, 20]);
}

/* ---------- Garden ---------- */
function plantSvg(n, animate) {
  const g = animate ? ' class="grow"' : '';
  if (n === 0) return '<svg viewBox="0 0 40 46"><ellipse cx="20" cy="44" rx="7" ry="2" fill="#8a6a43" opacity=".5"/></svg>';
  if (n < 5) return `<svg viewBox="0 0 40 46"><g${g}><path d="M20 46 V34" stroke="#3fa66a" stroke-width="2.5" fill="none"/><path d="M20 36 C14 34 12 28 14 26 C18 27 20 31 20 36Z M20 36 C26 34 28 28 26 26 C22 27 20 31 20 36Z" fill="#5cc286"/></g></svg>`;
  if (n < 9) return `<svg viewBox="0 0 40 46"><g${g}><path d="M20 46 V20" stroke="#2e8a57" stroke-width="3" fill="none"/><path d="M20 34 C10 32 6 24 9 20 C15 22 19 27 20 34Z M20 28 C30 26 34 18 31 14 C25 16 21 21 20 28Z" fill="#3fa66a"/><circle cx="20" cy="18" r="3.5" fill="#5cc286"/></g></svg>`;
  if (n < TOTAL) return `<svg viewBox="0 0 40 46"><g${g}><path d="M20 46 V16" stroke="#2e8a57" stroke-width="3" fill="none"/><path d="M20 36 C10 34 6 26 9 22 C15 24 19 29 20 36Z M20 30 C30 28 34 20 31 16 C25 18 21 23 20 30Z" fill="#3fa66a"/><path d="M20 4 C27 8 27 16 20 18 C13 16 13 8 20 4Z" fill="#c4669a"/></g></svg>`;
  const petals = principles
    .map((p, i) => `<ellipse cx="20" cy="5" rx="3.2" ry="6" fill="${p.color}" transform="rotate(${i * 40} 20 12)"/>`)
    .join('');
  return `<svg viewBox="0 0 40 46"><g${g}><path d="M20 46 V18" stroke="#2e8a57" stroke-width="3" fill="none"/><path d="M20 38 C10 36 6 28 9 24 C15 26 19 31 20 38Z" fill="#3fa66a"/>${petals}<circle cx="20" cy="12" r="4" fill="#f2b84b"/></g></svg>`;
}
let lastGardenToday = -1;
function renderGarden() {
  const days = [...Array(14)].map((_, i) => daysAgo(13 - i));
  const todayN = doneOn().length;
  $('#garden').innerHTML = days
    .map((d, i) => {
      const n = doneOn(d).length;
      const isToday = i === 13;
      return `<div class="plot ${isToday ? 'today' : ''}">${plantSvg(n, isToday && todayN !== lastGardenToday)}<small>${isToday ? 'Today' : d.toLocaleDateString(undefined, { weekday: 'narrow' })}</small></div>`;
    })
    .join('');
  lastGardenToday = todayN;
  const s = streak();
  $('#garden-sub').textContent = s
    ? `🔥 ${s}-day streak. Each plant grows with what you complete that day.`
    : `Complete ${STREAK_MIN} of ${TOTAL} today to start a streak. Each plant grows with what you complete.`;
}

/* ---------- Today ---------- */
function renderToday() {
  const goal = currentGoal();
  const today = doneOn();
  const open = pillarsOpen(today);

  $('#goal-pill').innerHTML = `${goal.icon} ${goal.name}<small>change</small>`;

  document.querySelectorAll('.petal').forEach((el) => {
    el.classList.toggle('open', today.includes(el.dataset.id));
    el.classList.toggle('key', goal.laws.includes(el.dataset.id));
  });
  const core = $('#bloom-core');
  core.innerHTML = `<div><strong>${open}/9</strong><small>${open === 9 ? 'Full bloom' : 'pillars'}</small></div>`;
  core.classList.toggle('full', open === 9);

  $('#pillar-strip').innerHTML = principles
    .map((p) => `<button class="p-chip ${today.includes(p.id) ? 'open' : ''}" data-id="${p.id}" style="--c:${p.color}" title="${p.goal}">
      <b>${p.letter}</b><span>${p.name}${goal.laws.includes(p.id) ? ' ★' : ''}</span></button>`)
    .join('');

  $('#focus-sub').textContent = `Four small acts for ${goal.name.toLowerCase()}. Tap to plant each one.`;
  $('#focus-list').innerHTML = goal.actions
    .map((a, i) => {
      const id = `f${i}`;
      return `<li><button class="ritual ${today.includes(id) ? 'done' : ''}" data-id="${id}"><span class="seed"></span><span>${a}</span></button></li>`;
    })
    .join('');
  $('#goal-note').hidden = !goal.note;
  $('#goal-note').textContent = goal.note ? `⚠️ ${goal.note}` : '';

  const dayIndex = Math.floor(Date.now() / 86400000);
  const featured = remedies.find((r) => r.name === goal.remedies[dayIndex % goal.remedies.length]);
  $('#remedy-of-day').innerHTML = featured ? remedyCard(featured, true) : '';

  $('#goal-prompts').innerHTML = goal.prompts.map((p) => `<button class="prompt" data-q="${escapeHtml(p)}"><em>Ask</em>${p}</button>`).join('');

  renderGarden();
}
$('#pillar-strip').addEventListener('click', (e) => e.target.closest('.p-chip') && toggleDone(e.target.closest('.p-chip').dataset.id));
$('#focus-list').addEventListener('click', (e) => e.target.closest('.ritual') && toggleDone(e.target.closest('.ritual').dataset.id));
$('#goal-prompts').addEventListener('click', (e) => {
  const btn = e.target.closest('.prompt');
  if (btn) ask(btn.dataset.q);
});

/* ---------- Advisor chat ---------- */
const chatEl = $('#chat');
const input = $('#chat-input');
let history = store.get('chat', []);

function addBubble(role, html) {
  const div = document.createElement('div');
  div.className = `bubble ${role}`;
  div.innerHTML = html;
  chatEl.appendChild(div);
  chatEl.scrollTop = chatEl.scrollHeight;
  return div;
}

function urgentHtml(flags) {
  return `<div class="urgent"><strong>⚠️ Please get medical help now</strong>
    <ul>${flags.map((f) => `<li>${escapeHtml(f)}</li>`).join('')}</ul>
    <p>Call your local emergency number or see a doctor. Home remedies are not appropriate here.</p></div>`;
}

function renderChat() {
  chatEl.innerHTML = '';
  if (!history.length) {
    addBubble('assistant', renderMarkdown(
      'Hi! Tell me what\'s bothering you, or ask about food and healthy habits. I\'ll suggest natural approaches based on the **9 pillars of health**, and tell you honestly how strong the evidence is.',
    ));
  }
  history.forEach((m) => addBubble(m.role, m.urgent ? urgentHtml(m.flags) : m.role === 'user' ? escapeHtml(m.text) : renderMarkdown(m.text)));
  $('#suggestions').innerHTML = history.length
    ? '<button class="chip" id="clear-chat">New conversation</button>'
    : [...currentGoal().prompts, 'Sore throat and runny nose'].map((s) => `<button class="chip">${s}</button>`).join('');
}

$('#suggestions').addEventListener('click', (e) => {
  if (!e.target.matches('.chip')) return;
  if (e.target.id === 'clear-chat') {
    history = [];
    store.set('chat', history);
    renderChat();
  } else {
    ask(e.target.textContent);
  }
});

function ask(text) {
  showTab('advisor');
  input.value = text;
  $('#chat-form').requestSubmit();
}

input.addEventListener('input', () => {
  input.style.height = 'auto';
  input.style.height = `${Math.min(input.scrollHeight, 140)}px`;
});
input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    $('#chat-form').requestSubmit();
  }
});

$('#chat-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = input.value.trim();
  if (!text) return;
  input.value = '';
  input.style.height = 'auto';
  history.push({ role: 'user', text });

  // Client-side check first so emergencies are answered instantly, even offline.
  const flags = checkRedFlags(text);
  if (flags.length) {
    history.push({ role: 'assistant', urgent: true, flags, text: '' });
    store.set('chat', history);
    return renderChat();
  }

  renderChat();
  const pending = addBubble('assistant', '<span class="typing"><i></i><i></i><i></i></span>');
  const form = $('#chat-form');
  form.classList.add('busy');
  try {
    const messages = history.filter((m) => !m.urgent).map(({ role, text }) => ({ role, text }));
    const data = await askAdvisor(messages);
    if (data.urgent) history.push({ role: 'assistant', urgent: true, flags: data.flags, text: '' });
    else if (data.text) history.push({ role: 'assistant', text: data.text });
    else throw new Error(data.error || 'Something went wrong');
    store.set('chat', history);
    renderChat();
  } catch (err) {
    pending.innerHTML = `<span class="error">${escapeHtml(navigator.onLine ? err.message : 'You are offline. The remedy library and Today screen still work.')}</span>`;
    history.pop();
  } finally {
    form.classList.remove('busy');
  }
});

async function askAdvisor(messages) {
  const { key, model } = store.get('settings', {});
  if (key) return { text: await callGemini(toGeminiHistory(messages), key, model || DEFAULT_MODEL, goalContext(goalById(profile.goal))) };
  if (!HAS_SERVER) throw new Error('Add your Gemini API key in Settings (⚙︎) to use the advisor.');
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, goal: profile.goal }),
  });
  if (!res.headers.get('content-type')?.includes('application/json')) {
    throw new Error('The advisor server is not available here. Add your Gemini API key in Settings (⚙︎).');
  }
  return res.json();
}

/* ---------- Settings ---------- */
function openSettings() {
  const { key = '', model = '' } = store.get('settings', {});
  $('#set-key').value = key;
  $('#set-model').value = model || DEFAULT_MODEL;
  $('#settings-mode').textContent = key
    ? 'Using your personal key.'
    : HAS_SERVER ? 'Using the app server.' : 'No key set: the advisor is off. Everything else works offline.';
  $('#settings').showModal();
}
$('#open-settings').addEventListener('click', openSettings);
$('#change-goal').addEventListener('click', () => {
  $('#settings').close();
  openOnboarding();
});
$('#settings-form').addEventListener('submit', () => {
  store.set('settings', { key: $('#set-key').value.trim(), model: $('#set-model').value.trim() || DEFAULT_MODEL });
  toast('Settings saved');
});
$('#settings-clear').addEventListener('click', () => {
  store.set('settings', {});
  $('#settings').close();
  toast('Key removed');
});

/* ---------- Remedy library ---------- */
function remedyCard(r, featured = false) {
  const ev = EVIDENCE[r.evidence];
  return `<article class="remedy ${featured ? 'featured' : ''}">
    <div class="remedy-head"><h3>${r.name}</h3>
      <span class="meter ${ev.cls}" title="${ev.label}"><span><i></i><i></i><i></i></span><small>${ev.label}</small></span></div>
    <p class="tags">${r.for.map((f) => `<span>${f}</span>`).join('')}</p>
    <p><strong>How:</strong> ${r.how}</p>
    <p class="caution">⚠️ ${r.caution}</p>
  </article>`;
}

const RISK = { high: 'High risk if acted on', medium: 'Can cause harm', low: 'Mostly unproven' };
function claimCard(c) {
  return `<article class="claim risk-${c.risk}">
    <div class="claim-head"><span class="claim-topic">${c.topic}</span><span class="risk-badge">${RISK[c.risk]}</span></div>
    <p class="claim-text">“${c.claim}”</p>
    <p><strong>What the evidence says:</strong> ${c.evidence}</p>
    <p class="claim-risk">⚠️ ${c.riskText}</p>
  </article>`;
}

let remedyFilter = 'goal';
function renderRemedies() {
  const q = $('#remedy-search').value.trim().toLowerCase();
  if (remedyFilter === 'claims' && !q) {
    $('#remedy-list').innerHTML = `<p class="claims-intro">These claims appear in popular natural-health teaching. We don't give instructions for them because acting on them can cause harm. Here is what the evidence says, so you can decide.</p>${claims.map(claimCard).join('')}`;
    return;
  }
  const mine = currentGoal().remedies;
  const list = remedies.filter(
    (r) =>
      (q ? r.name.toLowerCase().includes(q) || r.for.some((f) => f.includes(q) || q.includes(f))
        : remedyFilter === 'goal' ? mine.includes(r.name)
        : remedyFilter === 'strong' ? r.evidence === 'strong'
        : true),
  );
  const claimHits = q ? claims.filter((c) => `${c.topic} ${c.claim}`.toLowerCase().includes(q)) : [];
  $('#remedy-list').innerHTML = list.length || claimHits.length
    ? list.map((r) => remedyCard(r)).join('') + claimHits.map(claimCard).join('')
    : `<p class="muted">No remedy found for “${escapeHtml(q)}”. Try asking the Advisor.</p>`;
}
$('#remedy-search').addEventListener('input', renderRemedies);
$('#remedy-filters').addEventListener('click', (e) => {
  if (!e.target.dataset.filter) return;
  remedyFilter = e.target.dataset.filter;
  $('#remedy-search').value = '';
  document.querySelectorAll('#remedy-filters .chip').forEach((c) => c.classList.toggle('active', c === e.target));
  renderRemedies();
});

/* ---------- Pillars ---------- */
$('#letters').innerHTML = lettersHtml();
$('#principle-list').innerHTML = principles
  .map((p) => `<details class="pillar" id="pillar-${p.id}" style="--c:${p.color}">
    <summary><b>${p.letter}</b><div><strong>${p.icon} ${p.name}</strong><small>${p.goal}</small></div></summary>
    <p class="why">${p.why}</p>
    <ul>${p.points.map((pt) => `<li>${pt}</li>`).join('')}</ul>
  </details>`)
  .join('');
$('#letters').addEventListener('click', (e) => {
  const l = e.target.closest('.letter');
  if (!l) return;
  const d = $(`#pillar-${l.dataset.id}`);
  d.open = true;
  d.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
  buzz();
});
function renderTimeline() {
  const now = nowIndex(hourNow());
  $('#natural-day').innerHTML = naturalDay
    .map((d, i) => `<li class="${i === now ? 'now' : ''}"><span class="tl-icon">${d.icon}</span><div><strong>${d.time}</strong><p>${d.text}</p></div></li>`)
    .join('');
}

/* ---------- Boot ---------- */
function renderAll() {
  renderSky();
  renderNow();
  renderToday();
  renderRemedies();
  renderTimeline();
  if (!history.length) renderChat();
}
renderChat();
renderAll();
drawStars();
addEventListener('resize', () => {
  drawStars();
  renderSky();
});
setInterval(() => {
  renderSky();
  renderNow();
  renderTimeline();
}, 60000);

/* ---------- PWA ---------- */
if ('serviceWorker' in navigator && import.meta.env.PROD && location.protocol === 'https:' && !window.Capacitor) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}
