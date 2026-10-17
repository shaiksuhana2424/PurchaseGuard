const STOP = new Set(["the", "and", "for", "with", "buy", "online", "in", "on", "of", "a", "an"]);

// These terms usually identify an accessory rather than the requested main product.
// Only apply the exclusion when the query itself is not asking for an accessory.
const ACCESSORY_TERMS = new Set([
  "case", "cover", "pouch", "skin", "sleeve", "holder", "protector", "protective",
  "silicone", "keychain", "replacement", "spare", "compatible", "accessory", "accessories"
]);
const ACCESSORY_PHRASES = [
  "cover only", "case only", "not included", "earbuds not included", "no bluetooth",
  "not sold or created", "compatible with", "for airdopes", "for earbuds"
];

export function tokens(value) {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(/\s+/).filter(t => t && !STOP.has(t));
}

export function matchProduct(query, offer) {
  const queryText = String(query ?? "").toLowerCase();
  const listingText = [offer.title, offer.brand, offer.model, offer.variant, offer.color, offer.size, offer.capacity, offer.sku, offer.gtin]
    .filter(Boolean).join(" ").toLowerCase();
  const wanted = [...new Set(tokens(query))];
  const listingTokens = tokens(listingText);
  const titleTokens = new Set(listingTokens);
  const matched = wanted.filter(t => titleTokens.has(t));
  const critical = wanted.filter(t => /\d/.test(t) || /^[a-z]+\d+[a-z0-9]*$/i.test(t));
  const missingCritical = critical.filter(t => !titleTokens.has(t));
  const queryWantsAccessory = tokens(queryText).some(t => ACCESSORY_TERMS.has(t)) || ACCESSORY_PHRASES.some(p => queryText.includes(p));
  const titleHasAccessorySignal = listingTokens.some(t => ACCESSORY_TERMS.has(t)) || ACCESSORY_PHRASES.some(p => listingText.includes(p));
  const isAccessoryMismatch = !queryWantsAccessory && titleHasAccessorySignal;
  const rawScore = wanted.length ? Math.round((matched.length / wanted.length) * 100) : 0;
  // An accessory can share every model token with the main product. Never let that
  // lexical overlap make it an exact match for a query asking for the main product.
  const score = isAccessoryMismatch ? Math.min(rawScore, 25) : rawScore;
  const exactMatch = !isAccessoryMismatch && wanted.length > 0 && matched.length === wanted.length && missingCritical.length === 0;
  return {
    matchScore: score,
    exactMatch,
    isAccessoryMismatch,
    missingTerms: wanted.filter(t => !titleTokens.has(t)),
    missingCriticalTerms: missingCritical
  };
}
