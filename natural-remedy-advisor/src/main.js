import './styles.css';
import { principles, naturalDay } from './data/principles.js';
import { remedies, EVIDENCE } from './data/remedies.js';
import { claims } from './data/claims.js';
import { KINDS, ZONES, kindOf, zonesOf, stepsOf } from './data/taxonomy.js';
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
  t.finished.finally(() => delete document.documentElement.dataset.vt);
  return t;
}

/* ---------- Tabs ---------- */
const TAB_ORDER = ['today', 'advisor', 'remedies', 'learn'];
let currentTab = null;
function showTab(name) {
  if (name === currentTab) return;
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
    addBubble(m.role, m.urgent ? urgentHtml(m.flags) : m.role === 'user' ? escapeHtml(m.text) : renderMarkdown(m.text), m.role === 'assistant' && !m.urgent ? i : undefined),
  );
  $('#suggestions').innerHTML = msgs.length
    ? ''
    : [...currentGoal().prompts, 'Sore throat and runny nose'].map((q) => `<button class="chip">${q}</button>`).join('');
  saveThreads();
}

chatEl.addEventListener('click', async (e) => {
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
    const messages = thread.messages.filter((m) => !m.urgent).map(({ role, text }) => ({ role, text }));
    const data = await askAdvisor(messages);
    if (data.urgent) thread.messages.push({ role: 'assistant', urgent: true, flags: data.flags, text: '' });
    else if (data.text) thread.messages.push({ role: 'assistant', text: data.text });
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

const RISK = { high: 'High risk if acted on', medium: 'Can cause harm', low: 'Mostly unproven' };
function claimCard(c, i) {
  return `<article class="claim risk-${c.risk}" style="--d:${i * 25}ms">
    <div class="claim-head"><span class="claim-topic">${c.topic}</span><span class="risk-badge">${RISK[c.risk]}</span></div>
    <p class="claim-text">“${c.claim}”</p>
    <details><summary>What the evidence says</summary><p>${c.evidence}</p><p class="claim-risk">⚠️ ${c.riskText}</p></details>
  </article>`;
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
    `<section class="shelf claims-shelf">
      <div class="shelf-head"><h2>⚖️ Claims checked</h2><span>${claims.length}</span></div>
      <p class="claims-intro">Popular natural-health claims we checked against the evidence. We don't give instructions for these because acting on them can cause harm, so here is what the evidence says. You decide.</p>
      <div class="claims">${claims.map(claimCard).join('')}</div>
    </section>`,
  ].join('');
}

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
