import './styles.css';
import { principles } from './data/principles.js';
import { remedies, EVIDENCE } from './data/remedies.js';
import { checkRedFlags } from './data/redflags.js';
import { goals, goalById } from './data/goals.js';
import { DEFAULT_MODEL, toGeminiHistory, callGemini, goalContext } from './advisor-core.js';

const API_BASE = import.meta.env.VITE_API_BASE || '';
// Inside the Android app with no server configured, only a personal key works.
const HAS_SERVER = Boolean(API_BASE) || !window.Capacitor?.isNativePlatform?.();
const API_URL = `${API_BASE}/api/advisor`;
const $ = (sel) => document.querySelector(sel);

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

/* ---------- Tabs ---------- */
function showTab(name) {
  document.querySelectorAll('.tabbar button').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.id === `tab-${name}`));
  store.set('tab', name);
}
document.querySelectorAll('.tabbar button').forEach((btn) => btn.addEventListener('click', () => showTab(btn.dataset.tab)));
showTab(store.get('tab', 'today'));

let profile = store.get('profile', {});
const currentGoal = () => goalById(profile.goal) || goals[0];

/* ---------- Consent ---------- */
if (!store.get('consent', false)) {
  $('#consent').showModal();
  $('#consent-ok').addEventListener('click', () => {
    store.set('consent', true);
    $('#consent').close();
    if (!profile.goal) openOnboarding();
  });
} else if (!profile.goal) {
  queueMicrotask(() => openOnboarding());
}

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
      'Hi! Tell me what\'s bothering you, or ask about food and healthy habits. I\'ll suggest natural approaches based on the **eight laws of health**, and tell you honestly how strong the evidence is.',
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
    pending.innerHTML = `<span class="error">${escapeHtml(navigator.onLine ? err.message : 'You are offline. The remedy library and habit tracker still work.')}</span>`;
    history.pop();
  } finally {
    form.classList.remove('busy');
  }
});

async function askAdvisor(messages) {
  const { key, model } = store.get('settings', {});
  if (key) return { text: await callGemini(toGeminiHistory(messages), key, model || DEFAULT_MODEL, goalContext(goalById(profile.goal))) };
  if (!HAS_SERVER) throw new Error('Add your Gemini API key in Settings (⚙️) to use the advisor.');
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, goal: profile.goal }),
  });
  return res.json();
}

renderChat();

/* ---------- Settings ---------- */
function openSettings() {
  const { key = '', model = '' } = store.get('settings', {});
  $('#set-key').value = key;
  $('#set-model').value = model || DEFAULT_MODEL;
  $('#settings-mode').textContent = key
    ? 'Using your personal key.'
    : HAS_SERVER ? 'Using the app server.' : 'No key set: the advisor is off. The other tabs work offline.';
  $('#settings').showModal();
}
$('#open-settings').addEventListener('click', openSettings);
$('#change-goal').addEventListener('click', () => {
  $('#settings').close();
  openOnboarding();
});
$('#settings-form').addEventListener('submit', () => {
  store.set('settings', { key: $('#set-key').value.trim(), model: $('#set-model').value.trim() || DEFAULT_MODEL });
});
$('#settings-clear').addEventListener('click', () => {
  store.set('settings', {});
  $('#settings').close();
});

/* ---------- Remedy library ---------- */
function remedyCard(r, featured = false) {
  const ev = EVIDENCE[r.evidence];
  return `<article class="card remedy ${featured ? 'featured' : ''}">
    <div class="card-head"><h3>${r.name}</h3><span class="badge ${ev.cls}">${ev.label}</span></div>
    <p class="tags">${r.for.map((f) => `<span>${f}</span>`).join('')}</p>
    <p><strong>How:</strong> ${r.how}</p>
    <p class="caution">⚠️ ${r.caution}</p>
  </article>`;
}

let remedyFilter = 'goal';
function renderRemedies() {
  const q = $('#remedy-search').value.trim().toLowerCase();
  const mine = currentGoal().remedies;
  const list = remedies.filter(
    (r) =>
      (q ? r.name.toLowerCase().includes(q) || r.for.some((f) => f.includes(q) || q.includes(f))
        : remedyFilter === 'goal' ? mine.includes(r.name)
        : remedyFilter === 'strong' ? r.evidence === 'strong'
        : true),
  );
  $('#remedy-list').innerHTML = list.length
    ? list.map((r) => remedyCard(r)).join('')
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

/* ---------- Today ---------- */
const dayKey = (d = new Date()) => d.toLocaleDateString('en-CA');
const TOTAL = principles.length + 4; // eight laws + four goal actions
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

function greeting() {
  const h = new Date().getHours();
  const part = h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  return profile.name ? `${part}, ${escapeHtml(profile.name)}` : part;
}

function renderToday() {
  const goal = currentGoal();
  const today = doneOn();
  const pct = Math.round((today.length / TOTAL) * 100);
  const circ = 2 * Math.PI * 52;

  $('#greeting').innerHTML = greeting();
  $('#goal-pill').innerHTML = `${goal.icon} ${goal.name} <span>change</span>`;
  const s = streak();
  $('#streak').textContent = s ? `🔥 ${s}-day streak` : `Do ${STREAK_MIN} of ${TOTAL} today to start a streak`;
  $('#ring-fg').style.strokeDasharray = `${(pct / 100) * circ} ${circ}`;
  $('#ring-pct').textContent = `${pct}%`;
  $('#ring-count').textContent = `${today.length} of ${TOTAL}`;

  $('#focus-goal').textContent = goal.name;
  $('#focus-list').innerHTML = goal.actions
    .map((a, i) => {
      const id = `f${i}`;
      return `<li><button class="focus-item ${today.includes(id) ? 'done' : ''}" data-id="${id}">
        <span class="check"></span><span>${a}</span></button></li>`;
    })
    .join('');
  $('#goal-note').hidden = !goal.note;
  $('#goal-note').textContent = goal.note ? `⚠️ ${goal.note}` : '';

  $('#law-grid').innerHTML = principles
    .map((p) => `<button class="law ${today.includes(p.id) ? 'done' : ''} ${goal.laws.includes(p.id) ? 'key' : ''}"
        data-id="${p.id}" style="--law:${p.color}">
        <span class="law-icon">${p.icon}</span><strong>${p.name}</strong><small>${p.goal}</small>
        ${goal.laws.includes(p.id) ? '<em>Key for your goal</em>' : ''}</button>`)
    .join('');

  const dayIndex = Math.floor(Date.now() / 86400000);
  const featured = remedies.find((r) => r.name === goal.remedies[dayIndex % goal.remedies.length]);
  $('#remedy-of-day').innerHTML = featured ? remedyCard(featured, true) : '';

  $('#goal-prompts').innerHTML = goal.prompts.map((p) => `<button class="prompt">💬 ${p}<span>›</span></button>`).join('');

  const week = [...Array(7)].map((_, i) => daysAgo(6 - i));
  $('#habit-week').innerHTML = week
    .map((d, i) => {
      const n = doneOn(d).length;
      return `<div class="day ${i === 6 ? 'is-today' : ''}"><div class="bar"><div style="height:${Math.round((n / TOTAL) * 100)}%"></div></div>
        <small>${d.toLocaleDateString(undefined, { weekday: 'narrow' })}</small></div>`;
    })
    .join('');
  const avg = week.reduce((sum, d) => sum + doneOn(d).length, 0) / 7;
  $('#week-avg').textContent = `avg ${Math.round((avg / TOTAL) * 100)}%`;
}

function toggleDone(id) {
  const key = dayKey();
  const set = new Set(habits[key] || []);
  set.has(id) ? set.delete(id) : set.add(id);
  habits[key] = [...set];
  store.set('habits', habits);
  renderToday();
}
$('#focus-list').addEventListener('click', (e) => e.target.closest('.focus-item') && toggleDone(e.target.closest('.focus-item').dataset.id));
$('#law-grid').addEventListener('click', (e) => e.target.closest('.law') && toggleDone(e.target.closest('.law').dataset.id));
$('#goal-prompts').addEventListener('click', (e) => {
  const btn = e.target.closest('.prompt');
  if (btn) ask(btn.firstChild.textContent.replace('💬 ', ''));
});

function renderAll() {
  renderToday();
  renderRemedies();
  if (!history.length) renderChat();
}
renderAll();

/* ---------- Learn ---------- */
$('#principle-list').innerHTML = principles
  .map(
    (p) => `<article class="card law-card" style="--law:${p.color}">
      <div class="card-head"><h3><span class="law-icon">${p.icon}</span> ${p.name}</h3></div>
      <ul>${p.points.map((pt) => `<li>${pt}</li>`).join('')}</ul>
    </article>`,
  )
  .join('');

/* ---------- PWA ---------- */
if ('serviceWorker' in navigator && import.meta.env.PROD && location.protocol === 'https:' && !window.Capacitor) {
  navigator.serviceWorker.register('/sw.js');
}
