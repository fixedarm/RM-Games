// Shared by the client and the advisor function: messages matching these
// get an urgent "see a doctor" response and never a home remedy.
export const RED_FLAGS = [
  { re: /chest (pain|tightness|pressure)|heart attack/i, msg: 'Chest pain can be a heart attack.' },
  { re: /can'?t breathe|difficulty breathing|short(ness)? of breath|struggling to breathe/i, msg: 'Difficulty breathing is an emergency.' },
  { re: /stroke|face (droop|drooping)|slurred speech|sudden (weakness|numbness)/i, msg: 'These can be signs of a stroke. Time matters.' },
  { re: /suicid|kill myself|end my life|self[- ]harm/i, msg: 'You deserve support right now. Please call your local crisis line or emergency number.' },
  { re: /anaphyla|throat (closing|swelling)|swollen (tongue|lips)/i, msg: 'This may be a severe allergic reaction.' },
  { re: /seizure|convulsion|unconscious|passed out|fainted/i, msg: 'Seizures and loss of consciousness need urgent assessment.' },
  { re: /(baby|infant|newborn).*(fever|temperature)|(fever|temperature).*(baby|infant|newborn)/i, msg: 'Fever in a baby under 3 months always needs a doctor.' },
  { re: /blood in (my )?(stool|poo|urine|vomit)|vomiting blood|coughing (up )?blood/i, msg: 'Bleeding like this needs medical assessment.' },
  { re: /severe (abdominal|stomach|head)(ache| pain)|worst headache/i, msg: 'Severe sudden pain needs urgent assessment.' },
  { re: /poison|overdose|swallowed (bleach|chemical|pills)/i, msg: 'Contact poison control or emergency services now.' },
  { re: /pregnan.*(bleeding|severe pain)|(bleeding|severe pain).*pregnan/i, msg: 'Bleeding or severe pain in pregnancy needs urgent care.' },
  { re: /\bcancer\b|tumou?r|\blump\b/i, msg: 'Cancer and new lumps must be assessed and treated by a doctor. Lifestyle habits can support, never replace, treatment.' },
  { re: /stop (taking )?(my )?(insulin|medication|meds|chemo|blood thinner)|instead of (chemo|insulin|antibiotics|medication)/i, msg: 'Never stop prescribed medication without your doctor. Stopping suddenly can be dangerous.' },
];

export function checkRedFlags(text) {
  return RED_FLAGS.filter((f) => f.re.test(text)).map((f) => f.msg);
}
