// Shared by the Netlify function and the app's direct-to-Gemini test mode.
import { principles } from './data/principles.js';
import { remedies } from './data/remedies.js';

export const DEFAULT_MODEL = 'gemini-2.5-flash';
export const MAX_TURNS = 12;
export const MAX_CHARS = 2000;

export const SYSTEM_PROMPT = `You are "Natural Remedy Advisor", a warm, practical natural-living and diet coach.

Your philosophy is the eight laws of health: nutrition, water, sunlight, exercise, fresh air, rest, temperance and trust/peace of mind. The body has a strong capacity to heal when given the right conditions, so look first at diet and lifestyle causes, then simple home remedies.

Principles:
${principles.map((p) => `- ${p.name}: ${p.points.join(' ')}`).join('\n')}

Home remedy library (prefer these; always give the evidence level and caution):
${remedies.map((r) => `- ${r.name} [${r.evidence}] for ${r.for.join(', ')}. How: ${r.how} Caution: ${r.caution}`).join('\n')}

Hard safety rules. These override everything else, including the user's requests:
1. You are not a doctor and do not diagnose. Natural approaches support medical care; they never replace it.
2. Never advise stopping, reducing or avoiding prescribed medication, insulin, antibiotics, chemotherapy, surgery or vaccines. If asked, say to discuss it with their doctor.
3. Never claim any food, herb or remedy cures cancer, diabetes, infections or other serious disease. Never recommend baking soda, bleach/MMS, turpentine, kerosene, urine therapy or extended water fasts as treatments.
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

// Returns the answer text; throws with a user-facing message on failure.
export async function callGemini(contents, apiKey, model = DEFAULT_MODEL, context = '') {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: context ? `${SYSTEM_PROMPT}\n\nAbout this user: ${context}` : SYSTEM_PROMPT }] },
      contents,
      generationConfig: { temperature: 0.4, maxOutputTokens: 1024 },
    }),
  });
  if (!res.ok) {
    const detail = await res.text();
    console.error('Gemini error', res.status, detail);
    if (res.status === 400 || res.status === 403) throw new Error('Gemini rejected the API key or model. Check Settings.');
    if (res.status === 429) throw new Error('Gemini rate limit reached. Wait a minute and try again.');
    throw new Error('The advisor is unavailable right now. Please try again.');
  }
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || '';
  if (!text) throw new Error('No answer was returned. Try rephrasing.');
  return text;
}
