// How remedies are organised: by kind (shelves) and by body zone (body map).

export const KINDS = [
  { id: 'kitchen', label: 'From the kitchen', icon: '🥣', color: '#d9673f' },
  { id: 'water', label: 'Water therapy', icon: '💧', color: '#3b8fc4' },
  { id: 'herb', label: 'Herbs & supplements', icon: '🌿', color: '#5a9a4a' },
  { id: 'external', label: 'Packs, poultices & body care', icon: '🩹', color: '#a0785a' },
  { id: 'routine', label: 'Routines & resets', icon: '🔁', color: '#6b6fc4' },
];

const KIND_RULES = [
  ['routine', /eating|cleanse|reset|elimination|cold & flu|inversion|sunshine|cleaning|mouth taping|probiotics/i],
  ['water', /hydrotherapy|foot bath|steam|sauna|mitten|water before|celtic salt|gargle|lemon & warm/i],
  ['external', /poultice|pack|compress|wrap|oil pulling|scalp|clay|aloe vera gel|inhaler|nail/i],
  ['kitchen', /smoothie|pudding|porridge|dressing|broth|grains|fermented|flaxseed|vinegar|honey|ginger tea|garlic|brazil|purslane|cayenne pepper|turmeric/i],
  ['herb', /./],
];
export const kindOf = (r) => KIND_RULES.find(([, re]) => re.test(r.name))[0];

// Body zones: x/y are positions on the 100×120 body map.
export const ZONES = [
  { id: 'mind', label: 'Mind & sleep', x: 80, y: 8, re: /sleep|insomnia|stress|anxiety|mood|fatigue|energy|snoring/i },
  { id: 'head', label: 'Head', x: 50, y: 11, re: /head|hair|scalp|sinus|ear|oral|gums|teeth|eye|cold sore|tinnitus|mouth/i },
  { id: 'chest', label: 'Throat & chest', x: 50, y: 31, re: /cough|throat|\bcold\b|flu|chest|congestion|breath|fever/i },
  { id: 'gut', label: 'Gut', x: 50, y: 47, re: /digest|bloat|reflux|heartburn|constipat|ibs|colitis|nausea|sickness|stomach|gastritis|gut|candida|yeast|liver|ulcer|diarrh|appetite|sugar|blood sugar|weight/i },
  { id: 'hormones', label: 'Hormones', x: 50, y: 60, re: /hormone|menopause|pms|prostate|thyroid|breast|milk supply|menstrual|hot flush|\bmen\b|urination|iodine|selenium/i },
  { id: 'skin', label: 'Skin & nails', x: 17, y: 52, re: /skin|burn|bite|sting|boil|splinter|nail|fungal|eczema|wound|bruise|sunburn/i },
  { id: 'joints', label: 'Joints & muscles', x: 62, y: 86, re: /joint|sprain|swelling|muscle|arthritis|bone|cramp|inflammation|aches/i },
  { id: 'immune', label: 'Immunity', x: 86, y: 72, re: /immun|detox|heavy metal|mercury|cleanse|minerals|alkaline|circulation|chlorophyll|hydration|dehydration|vitamin d/i },
];
export const zonesOf = (r) => {
  const text = `${r.name} ${r.for.join(' ')}`;
  return ZONES.filter((z) => z.re.test(text)).map((z) => z.id);
};

// Split a method into steps for numbered display.
export const stepsOf = (how) =>
  how
    .split(/(?<=[.!?])\s+(?=[A-Z0-9])/)
    .map((s) => s.trim())
    .filter(Boolean);
