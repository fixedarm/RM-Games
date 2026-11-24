// Searches the app's own knowledge (remedies, recipes, skills, pillars, checked
// claims) so the advisor answers from it first and only goes beyond it if needed.
import { remedies } from './data/remedies.js';
import { recipes } from './data/guide.js';
import { RECIPE_USES } from './data/recipe-uses.js';
import { claims } from './data/claims.js';
import { principles } from './data/principles.js';
import manual from './data/manual.json';

const STOP = new Set('a an and are as at be but by can could do does for from get got have having how i im is it its just me my of on or so some that the this to too what whats when which who why will with you your about any been feel feeling help into keep know like make more much need should than then there they very want way would also good best natural naturally remedy remedies home ive dont cant really bit lot lots day days since night bad cure cook eat after ago week weeks hurt hurts hurting suffer suffering problem problems issue issues treat treatment thing things hand hands arm arms finger stove kitchen'.split(' '));

// Everyday words mapped to the terms the app uses.
const SYN = {
  tummy: ['stomach', 'digestion'], belly: ['stomach', 'gut'], stomachache: ['stomach', 'cramps'], gas: ['bloating', 'wind'], gassy: ['bloating', 'wind'], farting: ['wind', 'bloating'],
  heartburn: ['reflux'], helicobacter: ['pylori', 'stomach'], ulcer: ['ulcer', 'stomach'], acid: ['reflux'], indigestion: ['digestion', 'bloating'], poop: ['constipation'], constipated: ['constipation'], runs: ['diarrhoea'], diarrhea: ['diarrhoea'],
  throwing: ['vomiting', 'nausea'], vomit: ['vomiting'], queasy: ['nausea'], sick: ['nausea', 'cold'],
  sleep: ['insomnia', 'sleep'], sleepless: ['insomnia'], awake: ['insomnia'], tired: ['fatigue', 'energy'], exhausted: ['fatigue'], energy: ['fatigue', 'energy'],
  stressed: ['stress'], anxious: ['anxiety'], nervous: ['anxiety'], worried: ['anxiety'], depressed: ['mood', 'depression'], sad: ['mood'], panic: ['panic', 'anxiety'],
  runny: ['congestion', 'cold'], stuffy: ['congestion', 'blocked'], blocked: ['congestion', 'blocked'], snot: ['congestion'], sinuses: ['sinus'], flu: ['flu', 'cold'], fever: ['fever'],
  coughing: ['cough'], throat: ['throat'], headache: ['headache', 'head'], migraine: ['headache'],
  itchy: ['itch'], itching: ['itch'], rash: ['skin', 'itch'], eczema: ['eczema', 'skin'], burnt: ['burn'], burned: ['burn'], cut: ['cuts', 'wound', 'bleeding'], bleeding: ['bleeding', 'wound'],
  joints: ['joint'], knee: ['joint'], back: ['back', 'muscle'], sore: ['sore'], muscles: ['muscle'], sprained: ['sprain'], arthritic: ['arthritis'],
  sugar: ['blood sugar', 'sugar'], diabetic: ['diabetes', 'blood sugar'], pressure: ['blood pressure'], bp: ['blood pressure'], weight: ['weight'], fat: ['weight'],
  period: ['menstrual', 'cramps'], periods: ['menstrual'], menopause: ['menopause', 'hot flush'], breastfeeding: ['breastfeeding', 'breast'],
  kid: ['children'], kids: ['children'], child: ['children'], baby: ['babies'], toddler: ['children'],
  water: ['water', 'hydration'], purify: ['water', 'safe', 'purif', 'boil', 'filter'], hurts: ['pain'], ache: ['pain', 'aches'], aching: ['pain', 'aches'], lentils: ['lentil'], drinking: ['water'], fire: ['fire'], knot: ['knots'], cpr: ['cpr'], choking: ['choking'], snake: ['snakebite'], bite: ['bite', 'sting'],
  veins: ['varicose'], liver: ['liver'], detox: ['detox', 'cleanse'], juice: ['juice'], broth: ['broth', 'soup'], bread: ['bread'], recipe: ['recipe'],
};

const norm = (w) => w.replace(/(ies)$/, 'y').replace(/(ing|es|s)$/, '');
export function terms(q) {
  const words = q.toLowerCase().replace(/[^a-z0-9\s'-]/g, ' ').split(/\s+/).map((w) => w.replace(/'/g, '')).filter((w) => w.length > 2 && !STOP.has(w));
  const out = new Set();
  words.forEach((w) => {
    out.add(norm(w));
    (SYN[w] || SYN[norm(w)] || []).forEach((s) => out.add(norm(s)));
  });
  return [...out].filter((w) => w.length > 2);
}

const reCache = {};
const wordRe = (w) => (reCache[w] ||= new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}${w.length <= 4 ? '(s|es)?\\b' : ''}`));

// Weighted fields per item: title and "used for" count most.
function score(ts, fields) {
  let s = 0;
  const hit = new Set();
  for (const [text, weight] of fields) {
    const t = text.toLowerCase();
    for (const w of ts) {
      if (wordRe(w).test(t)) { s += weight; hit.add(w); }
    }
  }
  // Reward items matching several different words of the question.
  return hit.size ? s * (1 + 0.5 * (hit.size - 1)) : 0;
}

const INDEX = [
  ...remedies.map((r, i) => ({ type: 'remedy', key: i, title: r.name, icon: '🌿', evidence: r.evidence,
    fields: [[r.name, 4], [r.for.join(' '), 4], [r.how, 1]], detail: `${r.how} Caution: ${r.caution}`, how: r.how, caution: r.caution, short: r.for.slice(0, 3).join(', ') })),
  ...recipes.map((r) => ({ type: 'recipe', key: r.id, title: r.name, icon: r.emoji || '❧', evidence: r.evidence,
    fields: [[r.name, 4], [(RECIPE_USES[r.id]?.remedy || r.uses).join(' '), 4], [r.uses.join(' '), 2], [r.tagline, 2], [r.ingredients.map((x) => x[1]).join(' '), 1]],
    detail: `${RECIPE_USES[r.id]?.good || r.tagline} Dosage: ${r.dosage} Caution: ${r.caution}`, how: `${RECIPE_USES[r.id]?.good || r.tagline} ${r.dosage}`, caution: r.caution, short: r.tagline })),
  ...manual.skills.map((s) => ({ type: 'skill', key: s.id, title: s.title, icon: '🏕️',
    fields: [[s.title, 4], [s.sub, 3], [s.why, 1], [s.steps.map((x) => x.title).join(' '), 1]],
    detail: `${s.sub}. Steps: ${s.steps.map((x) => x.title).join('; ')}.`, short: s.sub })),
  ...principles.map((p) => ({ type: 'pillar', key: p.id, title: `${p.icon} ${p.name}`, icon: p.icon,
    fields: [[p.name, 3], [p.goal, 2], [p.why, 1], [p.points.join(' '), 1]], detail: `${p.why} ${p.points.slice(0, 2).join(' ')}`, short: p.goal })),
  ...claims.map((c, i) => ({ type: 'claim', key: i, title: c.claim, icon: '⚖️', risk: c.risk,
    fields: [[c.topic, 3], [c.claim, 2]], detail: `Evidence: ${c.evidence} Risk: ${c.riskText}`, short: c.topic })),
];

const LIMIT = { remedy: 4, recipe: 3, skill: 2, pillar: 1, claim: 2 };
const MIN = { remedy: 4, recipe: 4, skill: 4, pillar: 4, claim: 4 };

export function searchApp(q) {
  const ts = terms(q);
  if (!ts.length) return [];
  const ranked = INDEX.map((it) => ({ ...it, score: score(ts, it.fields) }))
    .filter((it) => it.score >= MIN[it.type])
    .sort((a, b) => b.score - a.score);
  const top = ranked[0]?.score || 0;
  const count = {};
  return ranked.filter((it) => {
    if (it.score < top * 0.45) return false;
    count[it.type] = (count[it.type] || 0) + 1;
    return count[it.type] <= LIMIT[it.type];
  });
}

// Text handed to the AI with the question: answer from this first.
export function hitsForPrompt(hits) {
  if (!hits.length) return '';
  return `\n\n[App knowledge matching this question. Answer from this first, naming the remedies/recipes/skills exactly as written so the user can find them in the app. Only add anything beyond it if the app does not cover the question, and put that under a heading "Beyond the app".]\n${hits
    .map((h) => `- (${h.type}) ${h.title}: ${h.detail}`)
    .join('\n')}`;
}

// Offline / no-key answer built only from the app.
const brief = (t, n = 200) => {
  if (t.length <= n) return t;
  const cut = t.slice(0, n);
  const end = cut.lastIndexOf('. ');
  return `${end > 80 ? cut.slice(0, end + 1) : `${cut.trimEnd()}…`}`;
};
export function localAnswer(hits) {
  const ev = { strong: 'Strong evidence', some: 'Some evidence', traditional: 'Traditional use' };
  const pick = (t) => hits.filter((h) => h.type === t);
  const parts = ['**From the app\'s knowledge**'];
  const rem = [...pick('remedy'), ...pick('recipe')];
  if (rem.length) parts.push(rem.map((h) => `- **${h.title}**${h.evidence ? ` (${ev[h.evidence]})` : ''}: ${brief(h.how || h.detail)}${h.caution ? ` ⚠️ ${brief(h.caution, 140)}` : ''}`).join('\n'));
  if (pick('skill').length) parts.push(pick('skill').map((h) => `- **${h.title}**: ${brief(h.detail, 220)}`).join('\n'));
  if (pick('pillar').length) parts.push(pick('pillar').map((h) => `- **${h.title}**: ${brief(h.detail)}`).join('\n'));
  if (pick('claim').length) parts.push(`**Claims to be careful with**\n${pick('claim').map((h) => `- “${h.title}” ${brief(h.detail, 220)}`).join('\n')}`);
  parts.push('See a doctor if symptoms are severe, getting worse or last more than a few days.');
  return parts.join('\n\n');
}
