import './styles.css';
import { principles, naturalDay } from './data/principles.js';
import { remedies, EVIDENCE } from './data/remedies.js';
import { claims } from './data/claims.js';
import { KINDS, ZONES, kindOf, zonesOf, stepsOf } from './data/taxonomy.js';
import { GUIDE_CATS, BASICS, recipes } from './data/guide.js';
import { RECIPE_USES } from './data/recipe-uses.js';
import { searchApp, hitsForPrompt, localAnswer } from './app-search.js';
import manual from './data/manual.json';
import { MANUAL_IMG, STEP_IMG, EMERGENCY_NUMBER } from './data/field.js';
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

/* ---------- Transitions ---------- */
// View Transitions where supported (Chrome/Android WebView 111+), instant elsewhere.
function transition(update, type) {
  if (reduceMotion || !document.startViewTransition) return update();
  document.documentElement.dataset.vt = type || '';
  const t = document.startViewTransition(update);
  t.finished.finally(() => delete document.documentElement.dataset.vt).catch(() => {});
  t.ready.catch(() => {}); // a newer transition (e.g. quick back presses) skips this one: harmless
  return t;
}

/* ---------- Tabs ---------- */
const TAB_ORDER = ['today', 'advisor', 'remedies', 'guide', 'learn'];
let currentTab = null;
const tabHistory = [];
function showTab(name, { back = false } = {}) {
  if (name === currentTab) return;
  if (currentTab && !back) tabHistory.push(currentTab);
  if (tabHistory.length > 20) tabHistory.shift();
  const dir = currentTab && TAB_ORDER.indexOf(name) < TAB_ORDER.indexOf(currentTab) ? 'back' : 'forward';
  const apply = () => {
    document.querySelectorAll('.dock button').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
    document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.id === `tab-${name}`));
  };
  currentTab ? transition(apply, `tab-${dir}`) : apply();
  currentTab = name;
  store.set('tab', name);
}
document.querySelectorAll('.dock button').forEach((btn) => btn.addEventListener('click', () => showTab(btn.dataset.tab)));
showTab(store.get('tab', 'today'));

let profile = store.get('profile', {});
const currentGoal = () => goalById(profile.goal) || goals[0];

/* ---------- Intro ---------- */
const lettersHtml = (tag = 'button') =>
  principles.map((p) => `<${tag} class="letter" data-id="${p.id}" style="--c:${p.color}" title="${p.name}">${p.letter}</${tag}>`).join('');
// Plain labels in the intro: buttons there would grab focus on open and scroll the slides sideways.
$('#intro-letters').innerHTML = lettersHtml('span');
$('#intro-flower').innerHTML = `<svg viewBox="-170 -170 340 340" aria-hidden="true">${principles
  .map((p, i) => `<path d="M0,-34 C30,-52 44,-112 0,-150 C-44,-112 -30,-52 0,-34 Z" fill="${p.color}" transform="rotate(${i * 40})"/>`)
  .join('')}<circle r="40" fill="#f2b84b"/></svg>`;

let slide = 0;
function showSlide(i) {
  slide = i;
  $('#slides').style.transform = `translateX(-${i * 100}%)`;
  $('#intro').scrollLeft = 0;
  document.querySelectorAll('#dots i').forEach((d, j) => d.classList.toggle('on', j === i));
  $('#intro-next').textContent = i === 2 ? "I understand, let's start" : 'Next';
}
function openIntro() {
  showSlide(0);
  $('#intro').showModal();
  $('#intro-next').focus({ preventScroll: true, focusVisible: false });
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

/* ---------- Advisor: threads + journal ---------- */
const chatEl = $('#chat');
const input = $('#chat-input');
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

let threads = store.get('threads', null);
if (!threads) {
  // Migrate the single chat history from earlier versions into the journal.
  const old = store.get('chat', []);
  threads = old.length ? [{ id: uid(), title: titleOf(old), created: Date.now(), updated: Date.now(), goal: profile.goal, messages: old }] : [];
  store.set('threads', threads);
  if (threads.length) store.set('activeThread', threads[0].id);
}
let insights = store.get('insights', []);
let activeId = store.get('activeThread', null);
if (!threads.some((t) => t.id === activeId)) activeId = null;

function titleOf(messages) {
  const first = messages.find((m) => m.role === 'user')?.text || 'New conversation';
  return first.length > 52 ? `${first.slice(0, 50).trim()}…` : first;
}
const activeThread = () => threads.find((t) => t.id === activeId);
const activeMessages = () => activeThread()?.messages || [];
function saveThreads() {
  store.set('threads', threads);
  store.set('activeThread', activeId);
  const n = threads.length;
  $('#journal-count').textContent = n ? n : '';
}

function addBubble(role, html, idx) {
  const div = document.createElement('div');
  div.className = `bubble ${role}`;
  div.innerHTML = html;
  if (idx !== undefined) {
    const saved = insights.some((i) => i.threadId === activeId && i.idx === idx);
    div.insertAdjacentHTML('beforeend', `<div class="bubble-actions">
      <button data-act="save" data-idx="${idx}" class="${saved ? 'on' : ''}">${saved ? '★ Saved' : '☆ Save insight'}</button>
      <button data-act="copy" data-idx="${idx}">⧉ Copy</button></div>`);
  }
  chatEl.appendChild(div);
  chatEl.scrollTop = chatEl.scrollHeight;
  return div;
}

function urgentHtml(flags) {
  return `<div class="urgent"><strong>⚠️ Please get medical help now</strong>
    <ul>${flags.map((f) => `<li>${escapeHtml(f)}</li>`).join('')}</ul>
    <p>Call your local emergency number or see a doctor. Home remedies are not appropriate here.</p></div>`;
}

const FOUND_LABEL = { remedy: 'Remedy', recipe: 'Recipe', skill: 'Skill', pillar: 'Pillar', claim: 'Claim checked' };
function foundHtml(m) {
  if (!m.found?.length) return '';
  return `<div class="found"><div class="found-head">📚 Found in the app${m.local ? '' : ' · answered from these first'}</div>
    <div class="found-chips">${m.found.map((f) => `<button class="found-chip t-${f.type}" data-found="${f.type}:${f.key}"><span>${f.icon}</span><b>${escapeHtml(f.title.length > 48 ? `${f.title.slice(0, 46)}…` : f.title)}</b><small>${FOUND_LABEL[f.type]}</small></button>`).join('')}</div></div>`;
}
function openFound(ref) {
  const [type, key] = ref.split(/:(.*)/s);
  if (type === 'remedy') return openRemedy(Number(key));
  if (type === 'recipe') { showTab('guide'); setGuideMode('recipes', false); return openGuidePage(recipePage(recipes.find((r) => r.id === key))); }
  if (type === 'skill') { showTab('guide'); setGuideMode('skills', false); return openSkill(key); }
  if (type === 'pillar') return showTab('learn');
  if (type === 'claim') {
    claimRisk = 'all'; openClaims = true; focusClaim = Number(key);
    showTab('remedies'); renderShelves();
    setTimeout(() => document.querySelector(`[data-claim="${key}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 400);
  }
}

function renderChat() {
  const msgs = activeMessages();
  chatEl.innerHTML = '';
  $('#thread-title').textContent = activeThread()?.title || 'New conversation';
  if (!msgs.length) {
    addBubble('assistant', renderMarkdown(
      "Hi! Tell me what's bothering you, or ask about food and healthy habits. I'll suggest natural approaches based on the **9 pillars of health**, and tell you honestly how strong the evidence is. Every conversation is kept in your **Journal**.",
    ));
  }
  msgs.forEach((m, i) =>
    addBubble(m.role, m.urgent ? urgentHtml(m.flags) : m.role === 'user' ? escapeHtml(m.text) : foundHtml(m) + renderMarkdown(m.text), m.role === 'assistant' && !m.urgent ? i : undefined),
  );
  $('#suggestions').innerHTML = msgs.length
    ? ''
    : [...currentGoal().prompts, 'Sore throat and runny nose'].map((q) => `<button class="chip">${q}</button>`).join('');
  saveThreads();
}

chatEl.addEventListener('click', async (e) => {
  const f = e.target.closest('[data-found]');
  if (f) return openFound(f.dataset.found);
  const btn = e.target.closest('.bubble-actions button');
  if (!btn) return;
  const idx = Number(btn.dataset.idx);
  const msgs = activeMessages();
  const m = msgs[idx];
  if (btn.dataset.act === 'copy') {
    try {
      await navigator.clipboard.writeText(m.text);
      toast('Copied');
    } catch {
      toast('Copy is not available here');
    }
    return;
  }
  const existing = insights.findIndex((i) => i.threadId === activeId && i.idx === idx);
  if (existing >= 0) {
    insights.splice(existing, 1);
    toast('Removed from Saved insights');
  } else {
    const question = [...msgs.slice(0, idx)].reverse().find((x) => x.role === 'user')?.text || '';
    insights.unshift({ id: uid(), threadId: activeId, idx, question, text: m.text, saved: Date.now() });
    toast('Saved to your Journal ★');
    buzz();
  }
  store.set('insights', insights);
  renderChat();
});

function newThread() {
  activeId = null;
  transition(renderChat, 'fade');
}
$('#new-thread').addEventListener('click', () => {
  newThread();
  input.focus();
});
$('#suggestions').addEventListener('click', (e) => {
  if (e.target.matches('.chip')) ask(e.target.textContent);
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
  if (!activeThread()) {
    const t = { id: uid(), title: '', created: Date.now(), updated: Date.now(), goal: profile.goal, messages: [] };
    threads.unshift(t);
    activeId = t.id;
  }
  const thread = activeThread();
  thread.messages.push({ role: 'user', text });
  thread.title = titleOf(thread.messages);
  thread.updated = Date.now();
  // Most recently used conversation first.
  threads = [thread, ...threads.filter((t) => t !== thread)];

  // Client-side check first so emergencies are answered instantly, even offline.
  const flags = checkRedFlags(text);
  if (flags.length) {
    thread.messages.push({ role: 'assistant', urgent: true, flags, text: '' });
    return renderChat();
  }

  renderChat();
  const pending = addBubble('assistant', '<span class="typing"><i></i><i></i><i></i></span>');
  const form = $('#chat-form');
  form.classList.add('busy');
  try {
    // Search the app's own knowledge first; the AI is told to answer from it.
    const hits = searchApp(text);
    const found = hits.map(({ type, key, title, icon }) => ({ type, key, title, icon }));
    const messages = thread.messages.filter((m) => !m.urgent).map(({ role, text: t }) => ({ role, text: t }));
    let data;
    try {
      data = await askAdvisor(messages, hitsForPrompt(hits));
    } catch (err) {
      if (!hits.length) throw err;
      // No key, offline or server error: answer from the app alone.
      const why = !navigator.onLine ? 'you are offline' : /key/i.test(err.message) ? 'no Gemini key is set' : 'the AI could not be reached';
      data = { text: `${localAnswer(hits)}\n\nℹ️ Answered from the app only because ${why}. Add a Gemini key in Settings (⚙︎) for a fuller, personal answer.`, local: true };
    }
    if (data.urgent) thread.messages.push({ role: 'assistant', urgent: true, flags: data.flags, text: '' });
    else if (data.text) thread.messages.push({ role: 'assistant', text: data.text, found, ...(data.local ? { local: true } : {}) });
    else throw new Error(data.error || 'Something went wrong');
    thread.updated = Date.now();
    renderChat();
  } catch (err) {
    pending.innerHTML = `<span class="error">${escapeHtml(navigator.onLine ? err.message : 'You are offline. The Apothecary and Today screen still work.')}</span>`;
    thread.messages.pop();
    if (!thread.messages.length) {
      threads = threads.filter((t) => t !== thread);
      activeId = null;
    }
    saveThreads();
  } finally {
    form.classList.remove('busy');
  }
});

/* Journal */
let journalView = 'threads';
function dayLabel(ts) {
  const d = new Date(ts);
  const days = Math.floor((new Date().setHours(0, 0, 0, 0) - new Date(ts).setHours(0, 0, 0, 0)) / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return 'This week';
  return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}
function snippet(text, q) {
  const plain = text.replace(/[#*_>]/g, '').replace(/\s+/g, ' ');
  if (!q) return plain.slice(0, 120);
  const i = plain.toLowerCase().indexOf(q);
  const start = Math.max(0, i - 40);
  return (start ? '…' : '') + plain.slice(start, start + 140);
}
const mark = (text, q) => (q ? escapeHtml(text).replace(new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'ig'), '<mark>$1</mark>') : escapeHtml(text));

function renderJournal() {
  const q = $('#journal-search').value.trim().toLowerCase();
  document.querySelectorAll('#journal-seg button').forEach((b) => b.classList.toggle('active', b.dataset.view === journalView));
  const list = $('#journal-list');
  if (journalView === 'insights') {
    const items = insights.filter((i) => !q || `${i.question} ${i.text}`.toLowerCase().includes(q));
    list.innerHTML = items.length
      ? items.map((i) => `<article class="insight" data-thread="${i.threadId}">
          <p class="insight-q">${mark(i.question, q)}</p>
          <div class="insight-a">${renderMarkdown(i.text)}</div>
          <div class="insight-foot"><span>${new Date(i.saved).toLocaleDateString()}</span>
            <button data-open="${i.threadId}">Open conversation →</button>
            <button data-unsave="${i.id}">Remove</button></div>
        </article>`).join('')
      : `<div class="empty"><span>☆</span><p>${q ? 'No saved insights match.' : 'Tap “☆ Save insight” under any answer to keep it here.'}</p></div>`;
    return;
  }
  const items = threads
    .map((t) => {
      const hit = q ? t.messages.find((m) => (m.text || '').toLowerCase().includes(q)) : null;
      return { t, hit };
    })
    .filter(({ t, hit }) => !q || hit || t.title.toLowerCase().includes(q));
  let lastGroup = '';
  list.innerHTML = items.length
    ? items.map(({ t, hit }) => {
        const group = dayLabel(t.updated);
        const head = group !== lastGroup ? `<h3 class="jgroup">${group}</h3>` : '';
        lastGroup = group;
        const lastAnswer = [...t.messages].reverse().find((m) => m.role === 'assistant' && m.text);
        const goal = goalById(t.goal);
        return `${head}<article class="jthread ${t.id === activeId ? 'current' : ''}" data-open="${t.id}" style="--d:${Math.min(items.indexOf(items.find((x) => x.t === t)), 10) * 30}ms">
          <div class="jthread-main">
            <strong>${mark(t.title, q)}</strong>
            <p>${mark(snippet((hit || lastAnswer || t.messages[0]).text || '', q), q)}</p>
            <span class="jmeta">${goal ? `${goal.icon} ${goal.name} · ` : ''}${((n) => `${n} question${n === 1 ? '' : 's'}`)(t.messages.filter((m) => m.role === 'user').length)} · ${new Date(t.updated).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
          </div>
          <button class="jdel" data-del="${t.id}" aria-label="Delete conversation">🗑</button>
        </article>`;
      }).join('')
    : `<div class="empty"><span>☰</span><p>${q ? 'Nothing in your journal matches.' : 'Your conversations will be kept here automatically.'}</p></div>`;
}
function openJournal(view) {
  if (view) journalView = view;
  transition(() => {
    $('#journal').hidden = false;
    renderJournal();
  }, 'sheet');
}
function closeJournal() {
  transition(() => ($('#journal').hidden = true), 'sheet');
}
$('#open-journal').addEventListener('click', () => openJournal());
$('#journal-search').addEventListener('input', renderJournal);
$('#journal-seg').addEventListener('click', (e) => {
  if (!e.target.dataset.view) return;
  journalView = e.target.dataset.view;
  renderJournal();
});
let pendingDelete = null;
$('#journal').addEventListener('click', (e) => {
  if (e.target.closest('[data-close]')) return closeJournal();
  const del = e.target.closest('[data-del]');
  if (del) {
    // Two-tap delete instead of a confirm() dialog.
    if (pendingDelete !== del.dataset.del) {
      pendingDelete = del.dataset.del;
      del.textContent = 'Delete?';
      del.classList.add('armed');
      return;
    }
    threads = threads.filter((t) => t.id !== del.dataset.del);
    insights = insights.filter((i) => i.threadId !== del.dataset.del);
    store.set('insights', insights);
    if (activeId === del.dataset.del) activeId = null;
    pendingDelete = null;
    saveThreads();
    renderChat();
    renderJournal();
    toast('Conversation deleted');
    return;
  }
  const unsave = e.target.closest('[data-unsave]');
  if (unsave) {
    insights = insights.filter((i) => i.id !== unsave.dataset.unsave);
    store.set('insights', insights);
    renderJournal();
    renderChat();
    return;
  }
  const open = e.target.closest('[data-open]');
  if (open && threads.some((t) => t.id === open.dataset.open)) {
    activeId = open.dataset.open;
    transition(() => {
      $('#journal').hidden = true;
      renderChat();
    }, 'sheet');
    showTab('advisor');
  }
});

async function askAdvisor(messages, appContext = '') {
  const { key, model } = store.get('settings', {});
  if (key) {
    const history = toGeminiHistory(messages);
    history[history.length - 1].parts[0].text += appContext;
    return { text: await callGemini(history, key, model || DEFAULT_MODEL, goalContext(goalById(profile.goal))) };
  }
  if (!HAS_SERVER) throw new Error('Add your Gemini API key in Settings (⚙︎) to use the advisor.');
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, goal: profile.goal, appContext }),
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

/* ---------- Apothecary ---------- */
const kindById = Object.fromEntries(KINDS.map((k) => [k.id, k]));
const remedyIndex = (r) => remedies.indexOf(r);
let favourites = store.get('favourites', []);

function meter(r) {
  const ev = EVIDENCE[r.evidence];
  return `<span class="meter ${ev.cls}" title="${ev.label}"><span><i></i><i></i><i></i></span><small>${ev.label}</small></span>`;
}

// Compact recipe-card tile; tapping it grows into the detail sheet.
function remedyTile(r, extra = '', delay = 0) {
  const k = kindById[kindOf(r)];
  const fav = favourites.includes(r.name);
  return `<button class="tile ${extra}" data-r="${remedyIndex(r)}" style="--k:${k.color};--d:${delay}ms">
    <span class="tile-band"><span class="tile-ico">${k.icon}</span>${fav ? '<span class="tile-fav">★</span>' : ''}</span>
    <span class="tile-body">
      <strong>${r.name}</strong>
      <span class="tile-for">${r.for.slice(0, 3).join(' · ')}</span>
      ${meter(r)}
    </span>
  </button>`;
}
// Back-compat for the Today screen.
const remedyCard = (r) => remedyTile(r, 'wide');

let claimRisk = 'all';
const RISK = { high: 'High risk if acted on', medium: 'Can cause harm', low: 'Mostly unproven' };
const CLAIM_GROUPS = [
  { id: 'cancer', label: 'Cancer & screening', icon: '🎗️', topics: ['Cancer', 'Screening'] },
  { id: 'meds', label: 'Medication, diabetes & heart', icon: '💊', topics: ['Diabetes', 'Heart', 'Medication', 'Blood pressure', 'Thyroid', 'Kidneys', 'Mental health'] },
  { id: 'babies', label: 'Babies, pregnancy & parenting', icon: '👶', topics: ['Babies', 'Pregnancy', 'Parenting', 'Vaccines'] },
  { id: 'aid', label: 'Infections & first aid', icon: '🩹', topics: ['Infections', 'First aid', 'Essential oils'] },
  { id: 'food', label: 'Food, detox & kitchen myths', icon: '🥗', topics: ['Sugar', 'Fats', 'Detox drinks', 'Gut', 'Digestion', 'Liver', 'Weight', 'Food', 'Kitchen tests', 'Water', 'Gallbladder'] },
  { id: 'other', label: 'Body, home & everything else', icon: '🏠', topics: [] },
];
const claimGroupOf = (c) => (CLAIM_GROUPS.find((g) => g.topics.includes(c.topic)) || CLAIM_GROUPS.at(-1)).id;
let openClaims = false;
let focusClaim = null;
function claimCard(c) {
  const i = claims.indexOf(c);
  return `<details class="claim risk-${c.risk}" data-claim="${i}" ${focusClaim === i ? 'open' : ''}>
    <summary><i class="risk-dot" title="${RISK[c.risk]}"></i><span class="claim-text">${c.claim}</span><span class="claim-topic">${c.topic}</span></summary>
    <div class="claim-body"><span class="risk-badge">${RISK[c.risk]}</span><p><b>What the evidence says:</b> ${c.evidence}</p><p class="claim-risk">⚠️ ${c.riskText}</p></div>
  </details>`;
}
function claimsSection() {
  const counts = Object.fromEntries(Object.keys(RISK).map((k) => [k, claims.filter((c) => c.risk === k).length]));
  const list = claims.filter((c) => claimRisk === 'all' || c.risk === claimRisk);
  const focusGroup = focusClaim !== null ? claimGroupOf(claims[focusClaim]) : null;
  const groups = CLAIM_GROUPS.map((g) => [g, list.filter((c) => claimGroupOf(c) === g.id)]).filter(([, cs]) => cs.length);
  return `<details class="shelf claims-shelf" id="claims-box" ${openClaims ? 'open' : ''}>
    <summary class="claims-summary">
      <span class="claims-title">⚖️ Claims checked <small>${claims.length}</small></span>
      <span class="claims-counts"><i class="risk-high">${counts.high} high risk</i><i class="risk-medium">${counts.medium} can harm</i><i class="risk-low">${counts.low} unproven</i></span>
      <span class="claims-lede">Popular claims we checked against the evidence. No instructions, just what the evidence says. You decide.</span>
      <i class="chev" aria-hidden="true"></i>
    </summary>
    <div class="claim-filter" role="group" aria-label="Filter claims">${[['all', 'All'], ...Object.entries(RISK)].map(([k, v]) => `<button class="chip ${claimRisk === k ? 'active' : ''}" data-crisk="${k}">${v}${k === 'all' ? '' : ` · ${counts[k]}`}</button>`).join('')}</div>
    ${groups.map(([g, cs]) => `<details class="claim-group" data-cgroup="${g.id}" ${claimRisk !== 'all' || focusGroup === g.id ? 'open' : ''}>
      <summary><span>${g.icon}</span><b>${g.label}</b><span class="cg-dots">${['high', 'medium', 'low'].map((k) => cs.filter((c) => c.risk === k).length ? `<i class="risk-${k}">${cs.filter((c) => c.risk === k).length}</i>` : '').join('')}</span><i class="chev" aria-hidden="true"></i></summary>
      <div class="claim-list">${cs.map(claimCard).join('')}</div>
    </details>`).join('')}
  </details>`;
}

function shelf(title, sub, items, cls = '') {
  if (!items.length) return '';
  return `<section class="shelf ${cls}">
    <div class="shelf-head"><h2>${title}</h2><span>${sub}</span></div>
    <div class="shelf-row">${items.join('')}</div>
  </section>`;
}

function renderShelves() {
  const goal = currentGoal();
  const mine = goal.remedies.map((n) => remedies.find((r) => r.name === n)).filter(Boolean);
  const favs = favourites.map((n) => remedies.find((r) => r.name === n)).filter(Boolean);
  $('#shelves').innerHTML = [
    shelf(`${goal.icon} For ${goal.name.toLowerCase()}`, `${mine.length} remedies`, mine.map((r) => remedyTile(r))),
    shelf('★ Saved', `${favs.length}`, favs.map((r) => remedyTile(r))),
    ...KINDS.map((k) => {
      const items = remedies.filter((r) => kindOf(r) === k.id);
      return shelf(`${k.icon} ${k.label}`, `${items.length}`, items.map((r) => remedyTile(r)));
    }),
    claimsSection(),
  ].join('');
}
$('#shelves').addEventListener('click', (e) => {
  const b = e.target.closest('[data-crisk]');
  if (!b) return;
  claimRisk = b.dataset.crisk;
  focusClaim = null;
  transition(renderShelves, 'fade');
});
$('#shelves').addEventListener('toggle', (e) => {
  if (e.target.id === 'claims-box') openClaims = e.target.open;
}, true);

/* Body map */
const BODY = `<svg viewBox="0 0 100 120" class="body-svg" aria-hidden="true">
  <defs><linearGradient id="bodyg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--leaf)" stop-opacity=".22"/><stop offset="1" stop-color="var(--leaf)" stop-opacity=".08"/></linearGradient></defs>
  <g fill="url(#bodyg)" stroke="var(--leaf)" stroke-opacity=".35" stroke-width=".6">
    <circle cx="50" cy="11" r="8"/>
    <path d="M44 20 h12 l1 4 c9 1 13 5 14 12 l4 26 c.5 3-3 4-4 1 l-6-22 -1 20 c0 6 1 10 1 14 l-2 38 c0 3-5 3-5 0 l-3-34 h-2 l-3 34 c0 3-5 3-5 0 l-2-38 c0-4 1-8 1-14 l-1-20 -6 22 c-1 3-4.5 2-4-1 l4-26 c1-7 5-11 14-12z"/>
  </g>
</svg>`;
let activeZone = null;
function renderBodyMap() {
  $('#body-map').innerHTML = BODY + ZONES.map((z) => {
    const n = remedies.filter((r) => zonesOf(r).includes(z.id)).length;
    const side = z.x > 60 ? 'right' : z.x < 40 ? 'left' : 'center';
    // The figure fills the middle 62% of the map; labels use the space either side.
    return `<button class="hotspot ${z.id === activeZone ? 'on' : ''} ${side}" data-zone="${z.id}" style="left:${19 + z.x * 0.62}%;top:${(z.y / 120) * 100}%">
      <i></i><span>${z.label}<b>${n}</b></span></button>`;
  }).join('');
}
function renderZone() {
  const box = $('#zone-results');
  if (!activeZone) {
    box.hidden = true;
    $('#finder-hint').textContent = 'Tap an area of the body.';
    return;
  }
  const z = ZONES.find((x) => x.id === activeZone);
  const items = remedies.filter((r) => zonesOf(r).includes(z.id));
  const order = { strong: 0, some: 1, traditional: 2 };
  items.sort((a, b) => order[a.evidence] - order[b.evidence]);
  $('#finder-hint').textContent = `${items.length} remedies for ${z.label.toLowerCase()}, strongest evidence first.`;
  box.hidden = false;
  box.innerHTML = `<div class="zone-head"><h2>${z.label}</h2><button class="chip" id="zone-clear">Clear ✕</button></div>
    <div class="grid">${items.map((r, i) => remedyTile(r, 'stagger', i * 35)).join('')}</div>`;
}
$('#body-map').addEventListener('click', (e) => {
  const h = e.target.closest('.hotspot');
  if (!h) return;
  buzz();
  transition(() => {
    activeZone = activeZone === h.dataset.zone ? null : h.dataset.zone;
    renderBodyMap();
    renderZone();
  }, 'fade');
  if (activeZone) setTimeout(() => $('#zone-results').scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' }), 360);
});
$('#zone-results').addEventListener('click', (e) => {
  if (e.target.id === 'zone-clear') {
    transition(() => {
      activeZone = null;
      renderBodyMap();
      renderZone();
    }, 'fade');
  }
});

/* Search */
function renderSearch() {
  const q = $('#remedy-search').value.trim().toLowerCase();
  const finder = document.querySelector('.finder');
  if (!q) {
    finder.hidden = false;
    renderZone();
    $('#shelves').hidden = false;
    return;
  }
  finder.hidden = true;
  $('#shelves').hidden = true;
  const list = remedies.filter((r) => `${r.name} ${r.for.join(' ')} ${r.how}`.toLowerCase().includes(q));
  const claimHits = claims.filter((c) => `${c.topic} ${c.claim}`.toLowerCase().includes(q));
  const box = $('#zone-results');
  box.hidden = false;
  box.innerHTML = list.length || claimHits.length
    ? `<div class="zone-head"><h2>“${escapeHtml(q)}”</h2><span class="muted">${list.length + claimHits.length} found</span></div>
       <div class="grid">${list.map((r, i) => remedyTile(r, 'stagger', i * 30)).join('')}</div>
       ${claimHits.length ? `<div class="claims">${claimHits.map(claimCard).join('')}</div>` : ''}`
    : `<div class="empty"><span>🔍</span><p>No remedy found for “${escapeHtml(q)}”.</p><button class="chip" id="ask-instead">Ask the Advisor instead</button></div>`;
}
$('#remedy-search').addEventListener('input', renderSearch);
document.addEventListener('click', (e) => {
  if (e.target.id === 'ask-instead') ask($('#remedy-search').value.trim());
});

/* Detail sheet: the tapped tile grows into it */
let sheetSource = null;
function openRemedy(i, tile) {
  const r = remedies[i];
  const k = kindById[kindOf(r)];
  const fav = favourites.includes(r.name);
  const zones = zonesOf(r).map((z) => ZONES.find((x) => x.id === z).label);
  if (tile) tile.style.viewTransitionName = 'remedy-hero';
  sheetSource = tile;
  transition(() => {
    if (tile) tile.style.viewTransitionName = '';
    $('#rsheet-card').style.setProperty('--k', k.color);
    $('#rsheet-card').innerHTML = `
      <header class="rs-hero" style="view-transition-name: remedy-hero">
        <button class="rs-close" data-close aria-label="Close">✕</button>
        <span class="rs-kind">${k.icon} ${k.label}</span>
        <h2 id="rs-title">${r.name}</h2>
        ${meter(r)}
      </header>
      <div class="rs-body">
        <p class="rs-for">${r.for.map((f) => `<span>${f}</span>`).join('')}</p>
        <h3>How to do it</h3>
        <ol class="rs-steps">${stepsOf(r.how).map((st, n) => `<li style="--d:${n * 60}ms">${st}</li>`).join('')}</ol>
        <div class="rs-caution"><strong>⚠️ Read before you try</strong><p>${r.caution}</p></div>
        ${zones.length ? `<p class="muted">Body areas: ${zones.join(', ')}</p>` : ''}
        <div class="rs-actions">
          <button class="secondary" data-fav="${i}">${fav ? '★ Saved' : '☆ Save'}</button>
          <button class="primary" data-ask="${i}">Ask the advisor about this</button>
        </div>
      </div>`;
    $('#rsheet').hidden = false;
  }, 'morph');
  buzz(8);
}
function closeRemedy() {
  const tile = sheetSource && document.contains(sheetSource) ? sheetSource : null;
  transition(() => {
    $('#rsheet').hidden = true;
    if (tile) tile.style.viewTransitionName = 'remedy-hero';
    document.querySelector('.rs-hero')?.style.setProperty('view-transition-name', 'none');
  }, 'morph')?.finished?.finally(() => tile && (tile.style.viewTransitionName = ''));
  if (!document.startViewTransition || reduceMotion) tile && (tile.style.viewTransitionName = '');
}
document.addEventListener('click', (e) => {
  const tile = e.target.closest('.tile');
  if (tile) return openRemedy(Number(tile.dataset.r), tile);
});
$('#rsheet').addEventListener('click', (e) => {
  if (e.target.closest('[data-close]')) return closeRemedy();
  const fav = e.target.closest('[data-fav]');
  if (fav) {
    const r = remedies[Number(fav.dataset.fav)];
    favourites = favourites.includes(r.name) ? favourites.filter((n) => n !== r.name) : [r.name, ...favourites];
    store.set('favourites', favourites);
    const on = favourites.includes(r.name);
    fav.textContent = on ? '★ Saved' : '☆ Save';
    toast(on ? 'Saved to your shelf ★' : 'Removed from Saved');
    buzz();
    renderShelves();
    renderToday();
  }
  const askBtn = e.target.closest('[data-ask]');
  if (askBtn) {
    const r = remedies[Number(askBtn.dataset.ask)];
    $('#rsheet').hidden = true;
    newThread();
    ask(`Tell me more about "${r.name}": when it helps, how to do it safely, and what to watch out for in my situation.`);
  }
});
addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (!$('#rsheet').hidden) closeRemedy();
  else if (!$('#journal').hidden) closeJournal();
});

function renderRemedies() {
  renderBodyMap();
  renderShelves();
  renderSearch();
}

/* ---------- Home Apothecary guide ---------- */
const catById = Object.fromEntries(GUIDE_CATS.map((c) => [c.id, c]));
let guideCat = 'all';
let savedRecipes = store.get('savedRecipes', []);

// Small illustration of the finished remedy: tin, jar, bottle, cup or bowl.
function vesselSvg(kind, color) {
  const shapes = {
    tin: `<ellipse cx="60" cy="74" rx="46" ry="12" fill="#0002"/><rect x="16" y="46" width="88" height="26" rx="6" fill="#c9ced1"/><rect x="16" y="46" width="88" height="6" fill="#0001"/><ellipse cx="60" cy="46" rx="44" ry="12" fill="${color}"/><ellipse cx="60" cy="44" rx="34" ry="7" fill="#fff6"/>`,
    jar: `<ellipse cx="60" cy="98" rx="34" ry="7" fill="#0002"/><rect x="34" y="14" width="52" height="14" rx="3" fill="#8a6a43"/><path d="M30 34 q0-6 6-6 h48 q6 0 6 6 v54 q0 8-8 8 h-44 q-8 0-8-8z" fill="#fff5" stroke="#fffa"/><path d="M33 52 h54 v36 q0 6-6 6 h-42 q-6 0-6-6z" fill="${color}"/><rect x="40" y="58" width="40" height="18" rx="3" fill="#fff9"/>`,
    bottle: `<ellipse cx="60" cy="102" rx="26" ry="6" fill="#0002"/><rect x="52" y="6" width="16" height="14" rx="3" fill="#3a2b1d"/><path d="M54 20 h12 v12 q16 6 16 22 v42 q0 6-6 6 h-32 q-6 0-6-6 v-42 q0-16 16-22z" fill="${color}"/><path d="M44 58 h32 v22 h-32z" fill="#fff9"/><path d="M48 40 q-2 10 0 50" stroke="#fff5" stroke-width="3" fill="none"/>`,
    cup: `<ellipse cx="60" cy="98" rx="40" ry="7" fill="#0002"/><path d="M26 46 h64 v24 q0 26-32 26 q-32 0-32-26z" fill="#f4f1ea" stroke="#d9d2c4"/><path d="M90 54 q16 0 14 14 q-2 12-16 10" fill="none" stroke="#d9d2c4" stroke-width="5"/><ellipse cx="58" cy="46" rx="32" ry="7" fill="${color}"/><path d="M48 32 q-6-10 2-18 M64 30 q-6-10 2-18" stroke="#fff9" stroke-width="3" fill="none" stroke-linecap="round"/>`,
    bowl: `<ellipse cx="60" cy="94" rx="46" ry="8" fill="#0002"/><path d="M14 52 h92 q0 40-46 40 q-46 0-46-40z" fill="#e8e1d3" stroke="#cfc6b4"/><ellipse cx="60" cy="52" rx="46" ry="10" fill="${color}"/><circle cx="46" cy="50" r="3" fill="#fff9"/><circle cx="72" cy="53" r="2" fill="#fff9"/><path d="M80 30 l14 -18" stroke="#8a6a43" stroke-width="5" stroke-linecap="round"/>`,
  };
  return `<svg viewBox="0 0 120 110" class="vessel" aria-hidden="true">${shapes[kind]}</svg>`;
}

const usesOf = (r) => RECIPE_USES[r.id] || { good: r.tagline, remedy: r.uses };
let openChapters = new Set(store.get('openChapters', []));
// Library remedies that share a complaint with this recipe.
function relatedRemedies(r) {
  const words = usesOf(r).remedy.join(' ').toLowerCase().replace(/\(.*?\)/g, '').split(/[^a-z]+/).filter((w) => w.length > 3 && !['with', 'your', 'when', 'after', 'support', 'health', 'doctor'].includes(w));
  if (!words.length) return [];
  return remedies
    .map((x) => [x, words.filter((w) => x.for.join(' ').toLowerCase().includes(w)).length])
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1] || ({ strong: 0, some: 1, traditional: 2 }[a[0].evidence] - { strong: 0, some: 1, traditional: 2 }[b[0].evidence]))
    .slice(0, 4)
    .map(([x]) => x);
}

function recipeCard(r, i = 0) {
  const c = catById[r.cat];
  const saved = savedRecipes.includes(r.id);
  return `<button class="rcard stagger" data-recipe="${r.id}" style="--c:${c.color};--d:${Math.min(i, 12) * 30}ms">
    <span class="rcard-art">${r.emoji ? `<span class="rcard-emoji">${r.emoji}</span>` : vesselSvg(c.vessel, c.color)}${saved ? '<span class="tile-fav">★</span>' : ''}</span>
    <span class="rcard-body">
      <strong>${r.name}</strong>
      <span class="rcard-tag">${r.tagline}</span>
      ${usesOf(r).remedy.length ? `<span class="rcard-for"><b>For</b> ${usesOf(r).remedy.slice(0, 3).join(' · ')}</span>` : '<span class="rcard-for food">Everyday food</span>'}
      <span class="rcard-meta">⏱ ${r.time}</span>
    </span>
  </button>`;
}

function renderGuide() {
  const q = $('#guide-search').value.trim().toLowerCase();
  $('#guide-cats').innerHTML = [{ id: 'all', label: 'All recipes' }, { id: 'saved', label: '★ Saved' }, ...GUIDE_CATS]
    .map((c) => `<button class="chip ${guideCat === c.id ? 'active' : ''}" data-gcat="${c.id}">${c.label}</button>`)
    .join('');
  const list = recipes.filter((r) => {
    if (q) return `${r.name} ${r.tagline} ${r.uses.join(' ')} ${usesOf(r).remedy.join(' ')} ${usesOf(r).good} ${r.ingredients.map((x) => x[1]).join(' ')}`.toLowerCase().includes(q);
    if (guideCat === 'saved') return savedRecipes.includes(r.id);
    return guideCat === 'all' || r.cat === guideCat;
  });
  document.querySelector('.basics').hidden = Boolean(q) || guideCat !== 'all';
  if (!list.length) {
    $('#guide-index').innerHTML = `<div class="empty"><span>❧</span><p>${guideCat === 'saved' && !q ? 'Tap ☆ Save on a recipe to keep it here.' : 'No recipe matches.'}</p></div>`;
    return;
  }
  // Grouped into collapsible chapters, like a recipe book. Searching or picking one chapter opens it.
  const groups = GUIDE_CATS.map((c) => [c, list.filter((r) => r.cat === c.id)]).filter(([, rs]) => rs.length);
  const forceOpen = Boolean(q) || guideCat !== 'all';
  let n = 0;
  const allOpen = groups.every(([c]) => openChapters.has(c.id));
  $('#guide-index').innerHTML = (forceOpen ? '' : `<div class="chapter-tools"><button class="link-btn" data-chapters="${allOpen ? 'close' : 'open'}">${allOpen ? '− Collapse all' : '+ Expand all'}</button></div>`) + groups
    .map(([c, rs]) => {
      const covers = [...new Set(rs.flatMap((r) => usesOf(r).remedy.map((x) => x.replace(/\s*\(.*?\)/, ''))))].slice(0, 6);
      return `<details class="chapter" data-chapter="${c.id}" ${forceOpen || openChapters.has(c.id) ? 'open' : ''}>
        <summary class="chapter-title" style="--c:${c.color}"><span>${c.label}</span><small>${rs.length}</small><i class="chev" aria-hidden="true"></i>
          ${covers.length ? `<em class="chapter-covers">${covers.join(' · ')}</em>` : '<em class="chapter-covers">Everyday whole foods</em>'}</summary>
        <div class="grid">${rs.map((r) => recipeCard(r, n++)).join('')}</div></details>`;
    })
    .join('');
}
$('#guide-index').addEventListener('toggle', (e) => {
  const d = e.target.closest?.('details[data-chapter]');
  if (!d || $('#guide-search').value.trim() || guideCat !== 'all') return;
  d.open ? openChapters.add(d.dataset.chapter) : openChapters.delete(d.dataset.chapter);
  store.set('openChapters', [...openChapters]);
  const btn = document.querySelector('[data-chapters]');
  const all = [...document.querySelectorAll('details[data-chapter]')].every((x) => x.open);
  if (btn) { btn.dataset.chapters = all ? 'close' : 'open'; btn.textContent = all ? '− Collapse all' : '+ Expand all'; }
}, true);
$('#guide-index').addEventListener('click', (e) => {
  const b = e.target.closest('[data-chapters]');
  if (!b) return;
  openChapters = new Set(b.dataset.chapters === 'open' ? GUIDE_CATS.map((c) => c.id) : []);
  store.set('openChapters', [...openChapters]);
  transition(renderGuide, 'fade');
});
$('#basics').innerHTML = BASICS.map((b) => `<button class="basic" data-basic="${b.id}"><span>${b.icon}</span><strong>${b.title}</strong><small>${b.text}</small></button>`).join('');
$('#guide-search').addEventListener('input', renderGuide);
$('#guide-cats').addEventListener('click', (e) => {
  if (!e.target.dataset.gcat) return;
  guideCat = e.target.dataset.gcat;
  transition(renderGuide, 'fade');
});

const EV_LABEL = { strong: 'Strong evidence', some: 'Some evidence', traditional: 'Traditional use' };
let guideSource = null;
function openGuidePage(html, src) {
  if (src) src.style.viewTransitionName = 'guide-hero';
  guideSource = src;
  transition(() => {
    if (src) src.style.viewTransitionName = '';
    $('#gpage').innerHTML = html;
    $('#gpage').scrollTop = 0;
    $('#gsheet').hidden = false;
  }, 'morph');
  buzz(8);
}
function usesBox(r) {
  const u = usesOf(r);
  const rel = relatedRemedies(r);
  return `<section class="gp-uses-box">
      <div><h3>✓ Good for</h3><p>${u.good}</p></div>
      <div><h3>✚ Used as a remedy for</h3>${u.remedy.length ? `<ul class="gp-ailments">${u.remedy.map((x) => `<li>${x}</li>`).join('')}</ul>` : '<p class="muted">Not a remedy: an everyday whole-food recipe.</p>'}</div>
      ${rel.length ? `<div class="gp-related"><h3>Also in the remedy library</h3><div>${rel.map((x) => `<button class="chip" data-relrem="${remedies.indexOf(x)}">${x.name}</button>`).join('')}</div></div>` : ''}
    </section>`;
}
function recipePage(r) {
  const c = catById[r.cat];
  const saved = savedRecipes.includes(r.id);
  return `<header class="gp-head" style="--c:${c.color};view-transition-name:guide-hero">
      <button class="rs-close" data-close aria-label="Close">✕</button>
      <div class="gp-head-text">
        <span class="gp-cat">${c.label}</span>
        <h2 id="gp-title">${r.name}</h2>
        <p class="gp-tagline">${r.tagline}</p>
      </div>
      <div class="gp-art">${r.emoji ? `<span class="gp-emoji">${r.emoji}</span>` : vesselSvg(c.vessel, c.color)}</div>
    </header>
    <div class="gp-paper" style="--c:${c.color}">
      <p class="gp-intro">${r.intro}</p>
      ${usesBox(r)}
      <div class="gp-facts"><span><b>Makes</b>${r.makes}</span><span><b>Time</b>${r.time}</span><span><b>Keeps</b>${r.keeps}</span><span><b>Evidence</b>${EV_LABEL[r.evidence]}</span></div>
      <div class="gp-cols">
        <section class="gp-box gp-ingredients">
          <h3>Ingredients</h3>
          <ul>${r.ingredients.map(([qty, item]) => `<li><b>${qty}</b><span>${item}</span></li>`).join('')}</ul>
        </section>
        <section class="gp-instructions">
          <h3>Instructions</h3>
          <ol>${r.steps.map((s, i) => `<li style="--d:${i * 70}ms">${s}</li>`).join('')}</ol>
        </section>
      </div>
      ${r.notes ? `<section class="gp-box gp-notes"><h3>Notes</h3><p>${r.notes}</p></section>` : ''}
      <section class="gp-dosage"><h3>${['food', 'juice'].includes(r.cat) ? 'Serving' : 'Dosage'}</h3><p>${r.dosage}</p></section>
      <section class="gp-caution"><strong>⚠️ Safety</strong><p>${r.caution}</p></section>
      <div class="rs-actions">
        <button class="secondary" data-rsave="${r.id}">${saved ? '★ Saved' : '☆ Save'}</button>
        <button class="primary" data-rask="${r.id}">Ask the advisor about this</button>
      </div>
    </div>`;
}
function basicPage(b) {
  return `<header class="gp-head" style="--c:#2e8a57;view-transition-name:guide-hero">
      <button class="rs-close" data-close aria-label="Close">✕</button>
      <div class="gp-head-text">
        <span class="gp-cat">Start here</span>
        <h2 id="gp-title">${b.icon} ${b.title}</h2>
        <p class="gp-tagline">${b.text}</p>
      </div>
    </header>
    <div class="gp-paper" style="--c:#2e8a57">
      <section class="gp-instructions"><ol>${b.steps.map((s, i) => `<li style="--d:${i * 70}ms">${s}</li>`).join('')}</ol></section>
    </div>`;
}
function closeGuidePage() {
  const src = guideSource && document.contains(guideSource) ? guideSource : null;
  transition(() => {
    $('#gsheet').hidden = true;
    if (src) src.style.viewTransitionName = 'guide-hero';
    document.querySelector('.gp-head')?.style.setProperty('view-transition-name', 'none');
  }, 'morph')?.finished?.finally(() => src && (src.style.viewTransitionName = ''));
  if (!document.startViewTransition || reduceMotion) src && (src.style.viewTransitionName = '');
}
document.addEventListener('click', (e) => {
  const card = e.target.closest('[data-recipe]');
  if (card) return openGuidePage(recipePage(recipes.find((r) => r.id === card.dataset.recipe)), card);
  const basic = e.target.closest('[data-basic]');
  if (basic) openGuidePage(basicPage(BASICS.find((b) => b.id === basic.dataset.basic)), basic);
});
$('#gsheet').addEventListener('click', (e) => {
  if (e.target.closest('[data-close]')) return closeGuidePage();
  const rel = e.target.closest('[data-relrem]');
  if (rel) { $('#gsheet').hidden = true; return openRemedy(Number(rel.dataset.relrem)); }
  const save = e.target.closest('[data-rsave]');
  if (save) {
    const id = save.dataset.rsave;
    savedRecipes = savedRecipes.includes(id) ? savedRecipes.filter((x) => x !== id) : [id, ...savedRecipes];
    store.set('savedRecipes', savedRecipes);
    const on = savedRecipes.includes(id);
    save.textContent = on ? '★ Saved' : '☆ Save';
    toast(on ? 'Recipe saved ★' : 'Removed from Saved');
    buzz();
    renderGuide();
  }
  const askBtn = e.target.closest('[data-rask]');
  if (askBtn) {
    const r = recipes.find((x) => x.id === askBtn.dataset.rask);
    $('#gsheet').hidden = true;
    newThread();
    ask(`I want to make "${r.name}" (${r.tagline.toLowerCase()}). Is it suitable for me, what can I substitute, and what should I watch out for?`);
  }
});
addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !$('#gsheet').hidden) closeGuidePage();
});

/* ---------- Self-sufficient skills: assembly manual ---------- */
// Shared arrow/pattern definitions used by every line drawing.
document.body.insertAdjacentHTML('afterbegin', `<svg width="0" height="0" style="position:absolute" aria-hidden="true">${manual.sprite}</svg>`);

// Chapters in triage order: the most urgent knowledge first.
const CH_STYLE = {
  emergency: { icon: '🚨', color: '#d33a2c' }, firstaid: { icon: '⛑️', color: '#0f8a7e' }, disaster: { icon: '🌊', color: '#c77d0a' },
  field: { icon: '🔥', color: '#a8641e' }, home: { icon: '🏠', color: '#3b8fc4' }, food: { icon: '🥫', color: '#d9673f' },
  repair: { icon: '🧰', color: '#6b6fc4' }, garden: { icon: '🌱', color: '#2e8a57' }, community: { icon: '🤝', color: '#c4669a' },
};
const chapterNo = (id) => manual.chapters.findIndex((c) => c.id === id) + 1;
const chapterTitle = (id) => manual.chapters.find((c) => c.id === id).title;
const skillById = Object.fromEntries(manual.skills.map((s) => [s.id, s]));
let mastered = store.get('mastered', []);
let skillPos = store.get('skillPos', {});
let skillChapter = 'all';
let guideMode = store.get('guideMode', 'recipes');

$('#ms-recipes').textContent = `${recipes.length} recipes`;
$('#ms-skills').textContent = `${manual.skills.length} skills`;
function setGuideMode(mode, animate = true) {
  guideMode = mode;
  store.set('guideMode', mode);
  const apply = () => {
    document.querySelectorAll('#mode-switch button').forEach((b) => b.classList.toggle('active', b.dataset.mode === mode));
    $('#mode-switch').dataset.mode = mode;
    $('#guide-recipes').hidden = mode !== 'recipes';
    $('#guide-skills').hidden = mode !== 'skills';
    $('#guide-title').textContent = mode === 'skills' ? 'Self-Sufficient' : 'Home Apothecary';
    $('#guide-sub').textContent = mode === 'skills'
      ? `Skills to look after yourself and your family when help is far away: ${manual.skills.length} illustrated, hands-on skills, most urgent first. Emergencies, first aid, water, food, fire and hard times, one step at a time.`
      : 'A recipe book of balms, teas, syrups and tonics to make at home, each with dosage and safety notes.';
  };
  animate ? transition(apply, 'fade') : apply();
}
$('#mode-switch').addEventListener('click', (e) => {
  const b = e.target.closest('[data-mode]');
  if (b && b.dataset.mode !== guideMode) {
    buzz();
    setGuideMode(b.dataset.mode);
  }
});

function ring(done, total, size = 120, stroke = 10) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return `<svg viewBox="0 0 ${size} ${size}" class="ring-svg" aria-hidden="true">
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" class="ring-track" stroke-width="${stroke}"/>
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" class="ring-fill" stroke-width="${stroke}" stroke-dasharray="${(done / total) * c} ${c}" transform="rotate(-90 ${size / 2} ${size / 2})"/>
  </svg>`;
}

function renderReadiness() {
  const total = manual.skills.length;
  const done = mastered.filter((id) => skillById[id]).length;
  const pct = Math.round((done / total) * 100);
  const bars = manual.chapters
    .map((ch) => {
      const list = manual.skills.filter((s) => s.chapter === ch.id);
      const d = list.filter((s) => mastered.includes(s.id)).length;
      return `<span class="rd-bar" title="${ch.title}: ${d}/${list.length}" style="--c:${CH_STYLE[ch.id].color};--p:${(d / list.length) * 100}%"><i></i></span>`;
    })
    .join('');
  const level = pct >= 75 ? 'Self-reliant' : pct >= 40 ? 'Capable' : pct >= 10 ? 'Apprentice' : 'Beginner';
  $('#readiness').innerHTML = `
    <div class="rd-ring">${ring(done, total)}<div><strong>${done}</strong><small>of ${total}</small></div></div>
    <div class="rd-copy">
      <span class="rd-level">${level} · ${pct}%</span>
      <h2>Your readiness</h2>
      <p>Open a skill, follow it step by step, then do its practice drill to master it.</p>
      <div class="rd-bars">${bars}</div>
    </div>`;
}

function renderChapterRail() {
  const card = (id, title, icon, color, d, n) => `<button class="ch-card ${skillChapter === id ? 'on' : ''}" data-ch="${id}" style="--c:${color}">
      <span class="ch-num">${id === 'all' ? '★' : chapterNo(id)}</span><span class="ch-ico">${icon}</span>
      <strong>${title}</strong>
      <span class="ch-meta">${d}/${n} mastered</span>
      <span class="ch-bar"><i style="width:${n ? (d / n) * 100 : 0}%"></i></span>
    </button>`;
  $('#chapter-rail').innerHTML =
    card('all', 'All skills', '📘', '#1b3a5c', mastered.filter((id) => skillById[id]).length, manual.skills.length) +
    manual.chapters
      .map((ch) => {
        const list = manual.skills.filter((s) => s.chapter === ch.id);
        return card(ch.id, ch.title, CH_STYLE[ch.id].icon, CH_STYLE[ch.id].color, list.filter((s) => mastered.includes(s.id)).length, list.length);
      })
      .join('');
}

function skillCard(s, i) {
  const done = mastered.includes(s.id);
  const pos = skillPos[s.id];
  const ch = CH_STYLE[s.chapter];
  return `<button class="sk-card stagger ${done ? 'done' : ''}" data-skill="${s.id}" style="--c:${ch.color};--d:${Math.min(i, 14) * 28}ms">
    <span class="sk-thumb"><img src="${MANUAL_IMG[s.id]}" alt="" loading="lazy" decoding="async" /></span>
    <span class="sk-body">
      <span class="sk-head"><span class="sk-num">${s.num}</span><span class="sk-ch">${ch.icon} ${chapterTitle(s.chapter)}</span></span>
      <strong>${s.title}</strong>
      <span class="sk-sub">${s.sub}</span>
      <span class="sk-meta">${s.steps.length} steps · ${s.parts.length} parts${s.tools.length ? ` · ${s.tools.length} tools` : ''}</span>
      ${pos && !done ? `<span class="sk-resume">▶ Resume where you left off</span>` : ''}
    </span>
    ${done ? '<span class="sk-stamp">Mastered</span>' : ''}
  </button>`;
}

function renderSkillList() {
  const q = $('#skill-search').value.trim().toLowerCase();
  const list = manual.skills.filter((s) => {
    if (q) return `${s.title} ${s.sub} ${s.why} ${s.steps.map((x) => `${x.title} ${x.text}`).join(' ')} ${s.parts.map((p) => p.name).join(' ')}`.toLowerCase().includes(q);
    return skillChapter === 'all' || s.chapter === skillChapter;
  });
  $('#chapter-rail').hidden = Boolean(q);
  $('#skill-list').innerHTML = list.length
    ? list.map(skillCard).join('')
    : `<div class="empty"><span>⚒</span><p>No skill matches “${escapeHtml(q)}”.</p></div>`;
}

function renderSkills() {
  renderReadiness();
  renderChapterRail();
  renderSkillList();
  $('#manual-foot').textContent = manual.foot;
}
$('#skill-search').addEventListener('input', renderSkillList);
$('#chapter-rail').addEventListener('click', (e) => {
  const c = e.target.closest('[data-ch]');
  if (!c) return;
  skillChapter = c.dataset.ch;
  buzz();
  transition(() => {
    renderChapterRail();
    renderSkillList();
  }, 'fade');
});

/* Build mode: a swipeable instruction booklet */
let playing = null;
let pages = [];
let pageIdx = 0;
let partsReady = new Set();

function noteCard(n) {
  const kind = /danger/i.test(n.type) ? 'danger' : /tip/i.test(n.type) ? 'tip' : 'ok';
  const icon = { danger: '⚠', tip: '💡', ok: '✓' }[kind];
  return `<div class="pl-note ${kind}"><span>${icon}</span><div><b>${n.type}</b><p>${n.text}</p></div></div>`;
}

// Compact reminder shown beside every tool, so the whole protocol is on one screen.
const quickProtocol = (s) => `<div class="pl-quick">
    <h3>Quick protocol</h3>
    <ol>${s.steps.map((st) => `<li><b>${st.n}</b><span><strong>${st.title}.</strong> ${st.text}</span></li>`).join('')}</ol>
  </div>
  ${noteCard(s.notes[0])}`;

function toolPage(s) {
  let tool = '';
  if (s.utility === 'cpr') tool = `<div class="pl-toolbox cpr-box">
      <button class="cpr-heart" id="cpr-heart" aria-label="Start or stop the CPR pacer"><span id="cpr-count">START</span><small id="cpr-cue">Tap to begin</small></button>
      <div class="cpr-side">
        <h2>CPR pacer</h2>
        <p>Push on every beat: <b>105 a minute</b>, <b>5–6 cm</b> deep. After 30 it turns blue: give 2 breaths.</p>
        <label class="cpr-opt"><input type="checkbox" id="cpr-hands-only" /> Hands-only CPR (no breaths)</label>
        <p class="pl-hint">Swap rescuers every 2 minutes. Don't stop until help or an AED takes over.</p>
      </div>
    </div>`;
  if (s.utility === 'burn_timer') tool = `<div class="pl-toolbox burn-box">
      <div class="burn-ring">${ring(1200, 1200, 200, 14)}<div><strong id="burn-time">20:00</strong><small id="burn-state">Ready</small></div></div>
      <div class="cpr-side">
        <h2>20-minute cooling timer</h2>
        <p>Cool, running water until the ring empties. Then cover loosely with cling film.</p>
        <div class="tool-row"><button class="pl-btn primary-btn" id="burn-go">Start</button><button class="pl-btn" id="burn-reset">Reset</button></div>
      </div>
    </div>`;
  if (s.utility === 'rain_calc') tool = `<div class="pl-toolbox col">
      <h2>Roof yield calculator</h2>
      <div class="calc-grid">
        <label>Roof length (m)<input type="number" id="rc-len" value="10" min="1" inputmode="decimal" /></label>
        <label>Roof width (m)<input type="number" id="rc-wid" value="5" min="1" inputmode="decimal" /></label>
        <label>Rainfall (mm)<input type="number" id="rc-rain" value="10" min="1" inputmode="decimal" /></label>
      </div>
      <div class="calc-out" id="rc-out"></div>
      <p class="pl-hint">Area × rain (mm) × 0.8 = litres. Allow about 1 L of first-flush pipe per m² of roof.</p>
    </div>`;
  if (s.utility === 'salt_calc') tool = `<div class="pl-toolbox col">
      <h2>2.5% salt calculator</h2>
      <div class="calc-grid one"><label>Cut vegetables (g)<input type="number" id="salt-veg" value="1000" min="50" step="50" inputmode="decimal" /></label></div>
      <div class="calc-out" id="salt-out"></div>
      <p class="pl-hint">Weigh after cutting. Under 2% risks spoilage; over 3% stalls fermentation.</p>
    </div>`;
  return tool ? `<section class="pl-page pl-tool">${tool}${quickProtocol(s)}</section>` : '';
}

let stepsDone = new Set();
function stepsHeader(s) {
  const n = s.steps.filter((_, i) => stepsDone.has(i)).length;
  return `${n}/${s.steps.length} done`;
}

function buildPages(s) {
  const list = [];
  const tool = toolPage(s);
  const partItem = (p, i, kind) => `<button class="pl-chipitem ${partsReady.has(`${kind}${i}`) ? 'ready' : ''}" data-part="${kind}${i}">
      ${p.svg ? `<span class="pl-chip-art">${p.svg}</span>` : ''}<span class="pl-chip-text">${p.q ? `<b>${p.q}</b>` : ''}${p.name}</span><i class="pl-tick">✓</i></button>`;
  list.push({ label: 'Overview', html: `<section class="pl-page pl-cover">
      <figure class="pl-hero"><img src="${MANUAL_IMG[s.id]}" alt="${s.title}" /><span class="pl-bignum">${s.num}</span></figure>
      <span class="pl-chapter">${CH_STYLE[s.chapter].icon} ${chapterTitle(s.chapter)}</span>
      <h2>${s.title}</h2>
      <p class="pl-sub">${s.sub}</p>
      <blockquote class="pl-why">${s.why}</blockquote>
      <div class="pl-stats"><span><b>${s.steps.length}</b>steps</span><span><b>${s.parts.length + s.tools.length}</b>items</span><span><b>${mastered.includes(s.id) ? '✓' : '–'}</b>${mastered.includes(s.id) ? 'mastered' : 'not drilled'}</span></div>
      <div class="pl-parts-head"><h3>You need · tap as you gather</h3><span class="pl-ready" id="pl-ready"></span></div>
      <div class="pl-chips">${s.parts.map((p, i) => partItem(p, i, 'p')).join('')}</div>
      ${s.tools.length ? `<h3>Tools & contacts</h3><div class="pl-chips">${s.tools.map((p, i) => partItem(p, i, 't')).join('')}</div>` : ''}
      ${noteCard(s.notes[0])}
    </section>` });
  if (tool) list.push({ label: s.utility === 'cpr' ? 'CPR pacer' : s.utility === 'burn_timer' ? 'Timer' : 'Calculator', html: tool });
  if (s.guides.length)
    list.push({ label: 'Pictures', html: `<section class="pl-page pl-guides"><h2>Visual guide</h2><p class="pl-hint">Tap a picture to enlarge it, then swipe across its panels.</p>
        ${s.guides.map((g) => `<figure><figcaption>${g.title}</figcaption><img src="${MANUAL_IMG[g.img]}" alt="${g.title}" loading="lazy" width="${g.w}" height="${g.h}" /></figure>`).join('')}</section>` });
  // All steps on one scrolling page: drawings beside the words, tap a step to tick it off.
  list.push({ label: 'Steps', html: `<section class="pl-page pl-steps">
      <div class="pl-parts-head"><h2>Step by step</h2><span class="pl-ready" id="pl-steps-done">${stepsHeader(s)}</span></div>
      <p class="pl-hint">Tap a step when you've done it.</p>
      <ol class="pl-steplist">${s.steps.map((st, i) => {
        const pic = STEP_IMG[`${s.id}-${String(i + 1).padStart(2, '0')}`];
        const art = pic ? `<span class="pl-steppic"><img src="${pic}" alt="${st.title}" loading="lazy" decoding="async" /></span>` : st.svg ? `<span class="pl-stepart">${st.svg}</span>` : '';
        return `<li><button class="pl-stepcard ${pic ? 'has-pic' : st.svg ? 'has-art' : ''} ${stepsDone.has(i) ? 'done' : ''}" data-step="${i}">
          ${art}
          <span class="pl-stepbadge">${st.n}</span>
          <span class="pl-stepbody"><strong>${st.title}</strong><span>${st.text}</span></span>
        </button></li>`;
      }).join('')}</ol>
    </section>` });
  list.push({ label: 'Finish', html: `<section class="pl-page pl-finish">
      <h2>Stay safe</h2>
      ${s.notes.map(noteCard).join('')}
      <div class="pl-drillbox">
        <span class="pl-medal" id="pl-medal">${mastered.includes(s.id) ? '🏅' : '🎯'}</span>
        <div><h3>Practice drill</h3><p>${s.drill}</p></div>
      </div>
      <button class="pl-master ${mastered.includes(s.id) ? 'on' : ''}" id="pl-master">${mastered.includes(s.id) ? '✓ Mastered' : 'I’ve practised this'}</button>
      <button class="pl-ask" data-skill-ask="${s.id}">Ask the advisor about this skill</button>
    </section>` });
  list.firstStep = list.findIndex((p) => p.label === 'Steps');
  return list;
}

/* Interactive tools inside build mode */
let audioCtx = null;
let wakeLock = null;
const keepAwake = async (on) => {
  try {
    if (on && !wakeLock) wakeLock = await navigator.wakeLock?.request('screen');
    if (!on && wakeLock) (await wakeLock.release(), (wakeLock = null));
  } catch {
    /* not available here */
  }
};
function click(freq = 660) {
  try {
    audioCtx ||= new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.08);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.08);
  } catch {
    /* audio unavailable */
  }
}
let cprTimer = null;
let cprN = 0;
let breathUntil = 0;
function cprStop() {
  clearInterval(cprTimer);
  cprTimer = null;
  const heart = $('#cpr-heart');
  if (heart) {
    heart.classList.remove('on', 'breathe');
    $('#cpr-count').textContent = 'START';
    $('#cpr-cue').textContent = 'Tap to begin';
  }
  keepAwake(false);
}
function cprStart() {
  cprN = 0;
  breathUntil = 0;
  $('#cpr-heart').classList.add('on');
  keepAwake(true);
  cprTimer = setInterval(() => {
    const heart = $('#cpr-heart');
    if (!heart) return cprStop();
    const now = Date.now();
    if (now < breathUntil) return;
    heart.classList.remove('breathe');
    cprN = (cprN % 30) + 1;
    click(cprN === 30 ? 880 : 660);
    navigator.vibrate?.(40);
    heart.classList.remove('beat');
    void heart.offsetWidth;
    heart.classList.add('beat');
    $('#cpr-count').textContent = cprN;
    $('#cpr-cue').textContent = 'Push hard & fast';
    if (cprN === 30 && !$('#cpr-hands-only').checked) {
      breathUntil = now + 5000;
      setTimeout(() => {
        if (!cprTimer) return;
        heart.classList.add('breathe');
        $('#cpr-count').textContent = '2';
        $('#cpr-cue').textContent = 'Give 2 breaths';
        click(440);
      }, 400);
    }
  }, Math.round(60000 / 105));
}
let burnTimer = null;
let burnLeft = 1200;
function burnRender() {
  const t = $('#burn-time');
  if (!t) return;
  t.textContent = `${String(Math.floor(burnLeft / 60)).padStart(2, '0')}:${String(burnLeft % 60).padStart(2, '0')}`;
  const circle = document.querySelector('.burn-ring .ring-fill');
  const c = 2 * Math.PI * ((220 - 14) / 2);
  circle?.setAttribute('stroke-dasharray', `${(burnLeft / 1200) * c} ${c}`);
}
function burnStop(reset) {
  clearInterval(burnTimer);
  burnTimer = null;
  if (reset) burnLeft = 1200;
  if ($('#burn-go')) $('#burn-go').textContent = burnLeft === 0 ? 'Done ✓' : burnLeft === 1200 ? 'Start' : 'Resume';
  if ($('#burn-state')) $('#burn-state').textContent = burnLeft === 0 ? 'Cooling complete' : burnLeft === 1200 ? 'Ready' : 'Paused';
  burnRender();
  keepAwake(false);
}
function stopTools() {
  cprStop();
  burnStop(true);
}
function updateCalcs() {
  if ($('#rc-out')) {
    const l = Math.max(0, +$('#rc-len').value || 0);
    const w = Math.max(0, +$('#rc-wid').value || 0);
    const r = Math.max(0, +$('#rc-rain').value || 0);
    const area = +(l * w).toFixed(1);
    const litres = Math.round(area * r * 0.8);
    $('#rc-out').innerHTML = `<div><b>${area}</b><span>m² roof</span></div><div><b>${litres.toLocaleString()}</b><span>litres collected</span></div>
      <div><b>${Math.round(area)}</b><span>L first-flush pipe</span></div><div><b>${(litres / 200).toFixed(1)}</b><span>× 200 L drums</span></div>`;
  }
  if ($('#salt-out')) {
    const g = Math.max(0, +$('#salt-veg').value || 0);
    $('#salt-out').innerHTML = `<div><b>${Math.round(g * 0.025)} g</b><span>salt (2.5%)</span></div><div><b>${Math.round(g * 0.02)}–${Math.round(g * 0.03)} g</b><span>safe range</span></div>`;
  }
}
$('#player').addEventListener('input', (e) => e.target.matches('.calc-grid input') && updateCalcs());
$('#player').addEventListener('click', (e) => {
  const fig = e.target.closest('.pl-guides figure');
  if (fig) {
    fig.classList.toggle('zoomed');
    if (fig.classList.contains('zoomed')) toast('Swipe sideways inside the picture · tap to shrink');
    return;
  }
  if (e.target.closest('#cpr-heart')) {
    cprTimer ? cprStop() : cprStart();
    return;
  }
  if (e.target.closest('#burn-go')) {
    if (burnTimer) return burnStop(false);
    if (burnLeft === 0) burnLeft = 1200;
    keepAwake(true);
    $('#burn-go').textContent = 'Pause';
    $('#burn-state').textContent = 'Cooling…';
    burnTimer = setInterval(() => {
      burnLeft = Math.max(0, burnLeft - 1);
      burnRender();
      if (burnLeft === 0) {
        burnStop(false);
        navigator.vibrate?.([300, 150, 300]);
        click(880);
        toast('20 minutes done: cover with cling film');
      }
    }, 1000);
  }
  if (e.target.closest('#burn-reset')) burnStop(true);
});

/* SOS: straight to the life-saving steps */
function openSos() {
  const list = manual.skills.filter((s) => s.chapter === 'emergency');
  $('#sos-list').innerHTML = list
    .map((s) => `<button class="sos-btn" data-sos="${s.id}"><img src="${MANUAL_IMG[s.id]}" alt="" /><span><b>${s.title}</b><small>${s.sub}</small></span><i>→</i></button>`)
    .join('');
  transition(() => ($('#sos').hidden = false), 'sheet');
  buzz([30, 60, 30]);
}
$('#open-sos').addEventListener('click', openSos);
$('#sos').addEventListener('click', (e) => {
  if (e.target.closest('[data-sos-close]')) return transition(() => ($('#sos').hidden = true), 'sheet');
  const b = e.target.closest('[data-sos]');
  if (b) {
    $('#sos').hidden = true;
    openSkill(b.dataset.sos, null, 'steps');
  }
});
$('#sos-number').textContent = EMERGENCY_NUMBER;
$('#sos-call').href = `tel:${EMERGENCY_NUMBER}`;

function openSkill(id, from, startAt) {
  const s = skillById[id];
  playing = s;
  partsReady = new Set(store.get(`parts-${id}`, []));
  stepsDone = new Set(store.get(`steps-${id}`, []));
  pages = buildPages(s);
  // SOS opens straight at step 1 (or the CPR pacer); otherwise resume where you left off.
  const start = startAt === 'steps' ? (s.utility === 'cpr' ? 1 : pages.firstStep) : Math.min(skillPos[id] || 0, pages.length - 1);
  if (from) from.style.viewTransitionName = 'skill-hero';
  transition(() => {
    if (from) from.style.viewTransitionName = '';
    $('#player').style.setProperty('--c', CH_STYLE[s.chapter].color);
    $('#pl-num').textContent = s.num;
    $('#pl-title').textContent = s.title;
    $('#pl-progress').innerHTML = pages.map((p, i) => `<button data-jump="${i}">${p.label}</button>`).join('');
    $('#pl-track').innerHTML = pages.map((p) => p.html).join('');
    $('#player').hidden = false;
    $('#player').style.viewTransitionName = 'skill-hero';
    updateReady();
    updateCalcs();
    // Position the track only after the new pages exist, so it never keeps the last skill's scroll.
    $('#pl-track').scrollLeft = start * $('#pl-track').clientWidth;
    setPage(start);
  }, 'morph')?.finished?.finally(() => ($('#player').style.viewTransitionName = ''));
  buzz(8);
}
function closeSkill() {
  stopTools();
  transition(() => ($('#player').hidden = true), 'sheet');
  playing = null;
  renderSkills();
}
function goPage(i, smooth = true) {
  i = Math.max(0, Math.min(pages.length - 1, i));
  const track = $('#pl-track');
  track.scrollTo({ left: i * track.clientWidth, behavior: smooth && !reduceMotion ? 'smooth' : 'auto' });
  setPage(i);
}
function setPage(i) {
  pageIdx = i;
  document.querySelectorAll('#pl-progress button').forEach((b, j) => {
    b.classList.toggle('on', j === i);
    b.classList.toggle('past', j < i);
    if (j === i) b.scrollIntoView({ block: 'nearest', inline: 'center' });
  });
  $('#pl-count').textContent = pages[i].label;
  $('#pl-prev').disabled = i === 0;
  const last = i === pages.length - 1;
  $('#pl-next').textContent = last ? 'Finish ✓' : `${pages[i + 1].label} →`;
  if (playing) {
    skillPos[playing.id] = i;
    store.set('skillPos', skillPos);
  }
}
let scrollTimer;
$('#pl-track').addEventListener('scroll', () => {
  clearTimeout(scrollTimer);
  scrollTimer = setTimeout(() => {
    const i = Math.round($('#pl-track').scrollLeft / $('#pl-track').clientWidth);
    if (i !== pageIdx) {
      setPage(i);
      buzz(5);
    }
  }, 80);
});
function updateReady() {
  if (!playing) return;
  const total = playing.parts.length + playing.tools.length;
  const el = $('#pl-ready');
  if (el) {
    el.textContent = partsReady.size >= total ? 'All set ✓' : `${partsReady.size}/${total} ready`;
    el.classList.toggle('all', partsReady.size >= total);
  }
}
$('#pl-prev').addEventListener('click', () => goPage(pageIdx - 1));
$('#pl-next').addEventListener('click', () => (pageIdx === pages.length - 1 ? closeSkill() : goPage(pageIdx + 1)));
$('#pl-close').addEventListener('click', closeSkill);
$('#player').addEventListener('click', (e) => {
  const jump = e.target.closest('[data-jump]');
  if (jump) return goPage(Number(jump.dataset.jump));
  const stepBtn = e.target.closest('[data-step]');
  if (stepBtn) {
    const i = Number(stepBtn.dataset.step);
    stepsDone.has(i) ? stepsDone.delete(i) : stepsDone.add(i);
    stepBtn.classList.toggle('done', stepsDone.has(i));
    store.set(`steps-${playing.id}`, [...stepsDone]);
    $('#pl-steps-done').textContent = stepsHeader(playing);
    $('#pl-steps-done').classList.toggle('all', stepsDone.size >= playing.steps.length);
    buzz(stepsDone.has(i) ? 12 : 4);
    if (stepsDone.has(i) && stepsDone.size === playing.steps.length) toast('All steps done. Finish with the safety notes and drill.');
    return;
  }
  const part = e.target.closest('[data-part]');
  if (part) {
    const k = part.dataset.part;
    partsReady.has(k) ? partsReady.delete(k) : partsReady.add(k);
    part.classList.toggle('ready', partsReady.has(k));
    store.set(`parts-${playing.id}`, [...partsReady]);
    buzz(partsReady.has(k) ? 10 : 4);
    updateReady();
    return;
  }
  if (e.target.closest('#pl-master')) {
    const id = playing.id;
    const on = !mastered.includes(id);
    mastered = on ? [...mastered, id] : mastered.filter((x) => x !== id);
    store.set('mastered', mastered);
    const btn = $('#pl-master');
    btn.classList.toggle('on', on);
    btn.textContent = on ? '✓ Mastered' : 'I’ve practised this';
    $('#pl-medal').textContent = on ? '🏅' : '🎯';
    if (on) {
      $('#pl-medal').classList.remove('pop');
      void $('#pl-medal').offsetWidth;
      $('#pl-medal').classList.add('pop');
      petalRain();
      toast(`${playing.title}: mastered 🏅`);
    }
    return;
  }
  const askBtn = e.target.closest('[data-skill-ask]');
  if (askBtn) {
    const s = skillById[askBtn.dataset.skillAsk];
    stopTools();
    $('#player').hidden = true;
    playing = null;
    newThread();
    ask(`I'm learning "${s.title}" (${s.sub}). What are the most common mistakes, and how do I adapt it to my home?`);
  }
});
addEventListener('keydown', (e) => {
  if ($('#player').hidden) return;
  if (e.key === 'ArrowRight') goPage(pageIdx + 1);
  if (e.key === 'ArrowLeft') goPage(pageIdx - 1);
  if (e.key === 'Escape') closeSkill();
});
document.addEventListener('click', (e) => {
  const card = e.target.closest('[data-skill]');
  if (card) openSkill(card.dataset.skill, card);
});
setGuideMode(guideMode, false);

/* ---------- Pillars deck ---------- */
$('#letters').innerHTML = lettersHtml();
$('#deck').innerHTML = principles
  .map((p, i) => `<article class="pcard" id="pillar-${p.id}" data-i="${i}" style="--c:${p.color}">
    <span class="pcard-letter" aria-hidden="true">${p.letter}</span>
    <span class="pcard-num">${i + 1} / 9</span>
    <h2>${p.icon} ${p.name}</h2>
    <p class="pcard-goal">${p.goal}</p>
    <p class="pcard-why">${p.why}</p>
    <ul>${p.points.map((pt) => `<li>${pt}</li>`).join('')}</ul>
  </article>`)
  .join('');
$('#deck-dots').innerHTML = principles.map((p, i) => `<button data-i="${i}" style="--c:${p.color}" aria-label="${p.name}"></button>`).join('');
const deckObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((en) => {
      if (!en.isIntersecting) return;
      const i = Number(en.target.dataset.i);
      document.querySelectorAll('#deck-dots button').forEach((d, j) => d.classList.toggle('on', j === i));
      document.querySelectorAll('#letters .letter').forEach((l, j) => l.classList.toggle('on', j === i));
      en.target.classList.add('seen');
    });
  },
  { root: $('#deck'), threshold: 0.6 },
);
document.querySelectorAll('.pcard').forEach((c) => deckObserver.observe(c));
function goToPillar(i) {
  const card = document.querySelectorAll('.pcard')[i];
  $('#deck').scrollTo({ left: card.offsetLeft - $('#deck').offsetLeft - 16, behavior: reduceMotion ? 'auto' : 'smooth' });
  buzz();
}
$('#letters').addEventListener('click', (e) => {
  const l = e.target.closest('.letter');
  if (l) goToPillar(principles.findIndex((p) => p.id === l.dataset.id));
});
$('#deck-dots').addEventListener('click', (e) => e.target.dataset.i && goToPillar(Number(e.target.dataset.i)));

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
  renderGuide();
  renderSkills();
  renderChat();
}
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


/* ---------- Back to top ---------- */
const toTop = $('#to-top');
const activeTabEl = () => document.querySelector('.tab.active');
function updateToTop() {
  const t = activeTabEl();
  const show = Boolean(t) && t.id !== 'tab-advisor' && t.scrollTop > 500;
  toTop.classList.toggle('show', show);
}
document.addEventListener('scroll', (e) => { if (e.target.classList?.contains('tab')) updateToTop(); }, true);
document.querySelector('.dock').addEventListener('click', () => setTimeout(updateToTop, 50));
toTop.addEventListener('click', () => {
  activeTabEl()?.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
  buzz(6);
});

/* ---------- Back button (Android hardware/gesture back, and browser Escape) ---------- */
// Closes the top-most layer first, then steps back through tabs, then leaves the app.
function goBack() {
  const openDialog = [...document.querySelectorAll('dialog[open]')].pop();
  if (openDialog) {
    if (openDialog.id === 'settings') { openDialog.close(); return true; }
    return true; // intro/onboarding must be finished, not dismissed
  }
  if (!$('#player').hidden) { closeSkill(); return true; }
  if (!$('#sos').hidden) { transition(() => ($('#sos').hidden = true), 'sheet'); return true; }
  if (!$('#rsheet').hidden) { closeRemedy(); return true; }
  if (!$('#gsheet').hidden) { closeGuidePage(); return true; }
  if (!$('#journal').hidden) { closeJournal(); return true; }
  const t = activeTabEl();
  if (t && t.scrollTop > 800) { t.scrollTo({ top: 0, behavior: 'smooth' }); return true; }
  const prev = tabHistory.pop();
  if (prev) { showTab(prev, { back: true }); return true; }
  if (currentTab !== 'today') { showTab('today', { back: true }); return true; }
  return false;
}
if (window.Capacitor?.isNativePlatform?.()) {
  import('@capacitor/app').then(({ App }) => {
    let lastBack = 0;
    App.addListener('backButton', () => {
      if (goBack()) return;
      // On the home tab: press back twice to leave.
      if (Date.now() - lastBack < 2000) App.exitApp();
      else { lastBack = Date.now(); toast('Press back again to exit'); }
    });
  });
}
window.nraBack = goBack; // lets tests drive the back button
