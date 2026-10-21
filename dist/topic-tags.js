// dist/topic-tags.js
export const topicTags = [
  { id: 'rent', labelKey: 'tagRent', categories: ['housing'] },
  { id: 'moving', labelKey: 'tagMoving', categories: ['housing', 'visa'] },
  { id: 'electricity', labelKey: 'tagElectricity', categories: ['housing'] },
  { id: 'gas', labelKey: 'tagGas', categories: ['housing'] },
  { id: 'visa', labelKey: 'tagVisa', categories: ['visa'] },
  { id: 'residence', labelKey: 'tagResidence', categories: ['visa'] },
  { id: 'employment', labelKey: 'tagEmployment', categories: ['work'] },
  { id: 'tax', labelKey: 'tagTax', categories: ['work'] },
  { id: 'driving', labelKey: 'tagDriving', categories: ['car'] },
  { id: 'transport', labelKey: 'tagTransport', categories: ['car', 'daily'] },
  { id: 'travel', labelKey: 'tagTravel', categories: ['daily'] },
  { id: 'food', labelKey: 'tagFood', categories: ['daily'] },
  { id: 'shopping', labelKey: 'tagShopping', categories: ['daily'] },
  { id: 'family', labelKey: 'tagFamily', categories: ['daily'] },
  { id: 'community', labelKey: 'tagCommunity', categories: ['daily'] }
];

export function normalizeTopicTags(value,{allowUnknown=false}={}) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 5) throw new TypeError('invalid_topic_tags');
  const known = new Set(topicTags.map(tag => tag.id));
  const ids = [];
  for (const id of value) {
    if (typeof id !== 'string' || !(allowUnknown?/^[a-z][a-z0-9-]{0,39}$/.test(id):known.has(id)) || ids.includes(id)) throw new TypeError('invalid_topic_tags');
    ids.push(id);
  }
  return ids.sort();
}
