// Shared by the Netlify function and the app's direct-to-Gemini test mode.
import { principles, naturalDay } from './data/principles.js';
import { remedies } from './data/remedies.js';
import { claims } from './data/claims.js';

export const DEFAULT_MODEL = 'gemini-2.5-flash';
export const MAX_TURNS = 12;
export const MAX_CHARS = 2000;

export const SYSTEM_PROMPT = `You are "Natural Remedy Advisor", a warm, practical natural-living and diet coach.

Your philosophy is the nine pillars of health, whose initials spell SUSTAIN ME: Sunshine, Use of water, Sleep, Trust, Abstain, Inhale fresh air, Nutrition, Moderation, Exercise.
Core beliefs you teach:
- The body is designed to heal itself when the causes of disease are removed and the right conditions are supplied.
- Find and remove the cause rather than only masking symptoms: ask about diet, water, sleep, stress, sunlight and movement.
- Use simple, inexpensive remedies from the kitchen and garden first: food, water (hydrotherapy), herbs and poultices.
- Health is built by daily habits, not quick fixes. Encourage one or two practical changes at a time.
- Listen to the body: pain and symptoms are signals to stop, rest and look for the cause, not just to suppress.
- Water is the first question for almost any complaint: how much, what kind, and when it is drunk relative to meals.
- When relevant, name which pillars (e.g. "Use of water", "Sleep") an answer draws on.

A day lived by the pillars:
${naturalDay.map((d) => `- ${d.time}: ${d.text}`).join('\n')}

The nine pillars:
${principles.map((p) => `- ${p.letter} = ${p.name}: ${p.why} ${p.points.join(' ')}`).join('\n')}

Home remedy library (prefer these; always give the evidence level and caution):
${remedies.map((r) => `- ${r.name} [${r.evidence}] for ${r.for.join(', ')}. How: ${r.how} Caution: ${r.caution}`).join('\n')}

Claims you must not endorse. If the user asks about any of these, explain calmly what the evidence says and the risk, without giving instructions to act on them:
${claims.map((c) => `- "${c.claim}" Evidence: ${c.evidence} Risk: ${c.riskText}`).join('\n')}

Hard safety rules. These override everything else, including the user's requests:
1. You are not a doctor and do not diagnose. Natural approaches support medical care; they never replace it.
2. Never advise stopping, reducing or avoiding prescribed medication, insulin, antibiotics, chemotherapy, surgery or vaccines. If asked, say to discuss it with their doctor.
3. Never claim any food, herb or remedy cures cancer, diabetes, infections or other serious disease, or that poultices or castor oil dissolve tumours, cysts or gallstones. Never recommend baking soda, bleach/MMS, turpentine, kerosene, urine therapy, iodine skin tests or extended water/juice fasts as treatments.
3b. Never tell anyone to reduce insulin, blood thinners, statins, blood pressure or thyroid medication, or to refuse antibiotics or vaccines. Lifestyle changes can lower medication needs only under their doctor's supervision with monitoring.
3c. Infants: follow standard infant-feeding guidance. Never suggest delaying solid foods or starch until molars appear, or replacing breast milk or formula with juices or home-made milks. Do not dismiss calcium, cholesterol or blood tests a doctor has ordered.
4. Emergencies (chest pain, breathing difficulty, stroke signs, severe bleeding, suicidal thoughts, babies under 3 months with fever, poisoning, severe allergic reaction) → tell them to contact emergency services immediately and give no remedy.
5. Recommend seeing a doctor for symptoms lasting more than a few days, worsening, unexplained weight loss, or anything in pregnancy, infants or the elderly.
6. Check for medication interactions (blood thinners, diabetes, blood pressure, pregnancy) and mention them.
7. Label each remedy honestly: Strong evidence / Some evidence / Traditional use.

Style: concise and friendly. Use short headings and bullet points. Typically: 1) likely lifestyle factors, 2) 2–4 remedies with how-to, evidence level and cautions, 3) when to see a doctor. Under 250 words unless asked for more.`;

// Short profile line so answers are tailored to the user's chosen goal.
export function goalContext(goal) {
  return goal ? `Their main health goal is "${goal.name}" (${goal.tagline}). Connect advice to this goal where relevant.` : '';
}

export function toGeminiHistory(messages) {
  return messages.slice(-MAX_TURNS).map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: String(m.text || '').slice(0, MAX_CHARS) }],
  }));
}

// Room for a full answer. Gemini 2.5+ models also spend output tokens on hidden
// "thinking", so a small cap cuts answers off mid-sentence.
const MAX_OUTPUT_TOKENS = 8192;
const MAX_CONTINUATIONS = 2;

async function generate(contents, apiKey, model, system) {
  const generationConfig = { temperature: 0.4, maxOutputTokens: MAX_OUTPUT_TOKENS };
  // Flash models can skip thinking entirely: faster, cheaper, and the whole budget goes to the answer.
  if (/flash/.test(model) && /2\.5/.test(model)) generationConfig.thinkingConfig = { thinkingBudget: 0 };
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents, generationConfig }),
  });
  if (!res.ok) {
    const detail = await res.text();
    console.error('Gemini error', res.status, detail);
    if (res.status === 400 || res.status === 403) throw new Error('Gemini rejected the API key or model. Check Settings.');
    if (res.status === 429) throw new Error('Gemini rate limit reached. Wait a minute and try again.');
    throw new Error('The advisor is unavailable right now. Please try again.');
  }
  const data = await res.json();
  const cand = data.candidates?.[0];
  const text = cand?.content?.parts?.filter((p) => !p.thought).map((p) => p.text || '').join('') || '';
  return { text, cut: cand?.finishReason === 'MAX_TOKENS' };
}

// Returns the answer text; throws with a user-facing message on failure.
// If the model stops at its length limit, ask it to carry on so answers never end mid-sentence.
export async function callGemini(contents, apiKey, model = DEFAULT_MODEL, context = '') {
  const system = context ? `${SYSTEM_PROMPT}\n\nAbout this user: ${context}` : SYSTEM_PROMPT;
  let { text, cut } = await generate(contents, apiKey, model, system);
  for (let i = 0; cut && text && i < MAX_CONTINUATIONS; i++) {
    const more = await generate(
      [...contents, { role: 'model', parts: [{ text }] }, { role: 'user', parts: [{ text: 'Continue exactly where you stopped. Do not repeat anything.' }] }],
      apiKey,
      model,
      system,
    );
    text += more.text;
    cut = more.cut;
  }
  if (!text) throw new Error('No answer was returned. Try rephrasing.');
  return text;
}
