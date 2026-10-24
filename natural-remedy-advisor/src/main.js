import './styles.css';
import { principles } from './data/principles.js';
import { remedies, EVIDENCE } from './data/remedies.js';
import { checkRedFlags } from './data/redflags.js';
import { DEFAULT_MODEL, toGeminiHistory, callGemini } from './advisor-core.js';

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
document.querySelectorAll('.tabbar button').forEach((btn) =>
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tabbar button').forEach((b) => b.classList.toggle('active', b === btn));
    document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.id === `tab-${btn.dataset.tab}`));
    store.set('tab', btn.dataset.tab);
  }),
);
document.querySelector(`.tabbar button[data-tab="${store.get('tab', 'advisor')}"]`)?.click();

/* ---------- Consent ---------- */
if (!store.get('consent', false)) {
  $('#consent').showModal();
  $('#consent-ok').addEventListener('click', () => {
    store.set('consent', true);
    $('#consent').close();
  });
}

/* ---------- Advisor chat ---------- */
const chatEl = $('#chat');
const input = $('#chat-input');
let history = store.get('chat', []);

const SUGGESTIONS = [
  'I feel bloated after meals',
  'Natural ways to sleep better',
  'Sore throat and runny nose',
  'Meal plan for more energy',
];

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
    : SUGGESTIONS.map((s) => `<button class="chip">${s}</button>`).join('');
}

$('#suggestions').addEventListener('click', (e) => {
  if (!e.target.matches('.chip')) return;
  if (e.target.id === 'clear-chat') {
    history = [];
    store.set('chat', history);
    renderChat();
  } else {
    input.value = e.target.textContent;
    $('#chat-form').requestSubmit();
  }
});

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
  if (key) return { text: await callGemini(toGeminiHistory(messages), key, model || DEFAULT_MODEL) };
  if (!HAS_SERVER) throw new Error('Add your Gemini API key in Settings (⚙️) to use the advisor.');
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages }),
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
$('#settings-form').addEventListener('submit', () => {
  store.set('settings', { key: $('#set-key').value.trim(), model: $('#set-model').value.trim() || DEFAULT_MODEL });
});
$('#settings-clear').addEventListener('click', () => {
  store.set('settings', {});
  $('#settings').close();
});

/* ---------- Remedy library ---------- */
function renderRemedies(query = '') {
  const q = query.trim().toLowerCase();
  const list = remedies.filter(
    (r) => !q || r.name.toLowerCase().includes(q) || r.for.some((f) => f.includes(q) || q.includes(f)),
  );
  $('#remedy-list').innerHTML = list.length
    ? list
        .map((r) => {
          const ev = EVIDENCE[r.evidence];
          return `<article class="card">
            <div class="card-head"><h3>${r.name}</h3><span class="badge ${ev.cls}">${ev.label}</span></div>
            <p class="tags">${r.for.map((f) => `<span>${f}</span>`).join('')}</p>
            <p><strong>How:</strong> ${r.how}</p>
            <p class="caution">⚠️ ${r.caution}</p>
          </article>`;
        })
        .join('')
    : `<p class="muted">No remedy found for “${escapeHtml(query)}”. Try asking the Advisor.</p>`;
}
$('#remedy-search').addEventListener('input', (e) => renderRemedies(e.target.value));
renderRemedies();

/* ---------- Habit tracker ---------- */
const dayKey = (d = new Date()) => d.toLocaleDateString('en-CA');
let habits = store.get('habits', {});

function renderHabits() {
  const today = habits[dayKey()] || [];
  $('#habit-list').innerHTML = principles
    .map(
      (p) => `<li><label class="${today.includes(p.id) ? 'done' : ''}">
        <input type="checkbox" value="${p.id}" ${today.includes(p.id) ? 'checked' : ''} />
        <span class="h-icon">${p.icon}</span>
        <span><strong>${p.name}</strong><small>${p.goal}</small></span>
      </label></li>`,
    )
    .join('');
  $('#habit-score').textContent = `${today.length}/${principles.length}`;

  const days = [...Array(7)].map((_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return d;
  });
  $('#habit-week').innerHTML = days
    .map((d) => {
      const n = (habits[dayKey(d)] || []).length;
      const pct = Math.round((n / principles.length) * 100);
      return `<div class="day"><div class="bar"><div style="height:${pct}%"></div></div>
        <small>${d.toLocaleDateString(undefined, { weekday: 'narrow' })}</small><small>${n}</small></div>`;
    })
    .join('');
}

$('#habit-list').addEventListener('change', (e) => {
  const key = dayKey();
  const set = new Set(habits[key] || []);
  e.target.checked ? set.add(e.target.value) : set.delete(e.target.value);
  habits[key] = [...set];
  store.set('habits', habits);
  renderHabits();
});
renderHabits();

/* ---------- Learn ---------- */
$('#principle-list').innerHTML = principles
  .map(
    (p) => `<article class="card">
      <div class="card-head"><h3>${p.icon} ${p.name}</h3></div>
      <ul>${p.points.map((pt) => `<li>${pt}</li>`).join('')}</ul>
    </article>`,
  )
  .join('');

/* ---------- PWA ---------- */
if ('serviceWorker' in navigator && import.meta.env.PROD && location.protocol === 'https:' && !window.Capacitor) {
  navigator.serviceWorker.register('/sw.js');
}
