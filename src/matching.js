
const STOP = new Set([
  "the", "and", "for", "with", "buy", "online", "in", "on", "of", "a", "an"
]);

const ACCESSORY_TERMS = new Set([
  "case", "cover", "pouch", "skin", "sleeve", "holder", "protector",
  "protective", "silicone", "keychain", "replacement", "spare",
  "compatible", "accessory", "accessories"
]);

const ACCESSORY_PHRASES = [
  "cover only",
  "case only",
  "screen protector",
  "screen guard",
  "tempered glass",
  "camera lens protector",
  "rugged armor",
  "armor case",
  "phone case",
  "phone cover",
  "mobile cover",
  "not included",
  "earbuds not included",
  "no bluetooth",
  "not sold or created",
  "compatible with",
  "for airdopes",
  "for earbuds"
];const COLOR_ALIASES = {
  black: ["black", "midnight black", "phantom black", "graphite black"],
  white: ["white", "pearl white", "ceramic white"],
  blue: ["blue", "navy blue", "midnight blue", "light blue", "sky blue"],
  green: ["green", "olive green", "mint green"],
  purple: ["purple", "violet", "lavender"],
  grey: ["grey", "gray", "light grey", "light gray", "dark grey", "dark gray"],
  silver: ["silver"],
  gold: ["gold", "golden"],
  pink: ["pink", "rose pink"]
};

const REGION_TERMS = new Set([
  "eu", "europe", "european",
  "us", "usa", "uk",
  "china", "chinese",
  "korea", "korean",
  "global", "international"
]);

const MODEL_VARIANT_WORDS = new Set([
  "call", "pro", "plus", "ultra", "lite", "mini", "max",
  "neo", "active", "fury", "force", "vivid", "flex", "connect"
]);

export function tokens(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(token => token && !STOP.has(token));
}

function requestedColor(queryTokens) {
  for (const [canonical, aliases] of Object.entries(COLOR_ALIASES)) {
    if (
      queryTokens.some(token =>
        aliases.some(alias => tokens(alias).includes(token))
      )
    ) {
      return canonical;
    }
  }

  return null;
}

function listingHasColor(listingText, color) {
  if (!color) return true;

  const normalized = ` ${listingText.toLowerCase().replace(/[^a-z0-9]+/g, " ")} `;

  return COLOR_ALIASES[color].some(alias => {
    const normalizedAlias = alias.replace(/[^a-z0-9]+/g, " ");
    return normalized.includes(` ${normalizedAlias} `);
  });
}

export function matchProduct(query, offer = {}) {
  const queryText = String(query ?? "").toLowerCase();

  const listingText = [
    offer.title,
    offer.brand,
    offer.model,
    offer.variant,
    offer.color,
    offer.size,
    offer.capacity,
    offer.sku,
    offer.gtin
  ]
    .filter(value => value !== undefined && value !== null && value !== "")
    .join(" ")
    .toLowerCase();

const wanted = [...new Set(tokens(queryText).filter(token => !STOP.has(token)))];
  const listingTokenArray = tokens(listingText);
  const listingTokens = new Set(listingTokenArray);

  const matched = wanted.filter(token => listingTokens.has(token));
  const missingTerms = wanted.filter(token => !listingTokens.has(token));

  const critical = [
    ...new Set([
      ...wanted.filter(token => /\d/.test(token)),
      ...(wanted.length > 1 && wanted.some(token => /\d/.test(token))
        ? wanted.slice(0, 2)
        : [])
    ])
  ];

  const missingCriticalTerms = critical.filter(
    token => !listingTokens.has(token)
  );

  const queryWantsAccessory =
    wanted.some(token => ACCESSORY_TERMS.has(token)) ||
    ACCESSORY_PHRASES.some(phrase => queryText.includes(phrase));

  const titleHasAccessorySignal =
    listingTokenArray.some(token => ACCESSORY_TERMS.has(token)) ||
    ACCESSORY_PHRASES.some(phrase => listingText.includes(phrase));

  const isAccessoryMismatch =
    !queryWantsAccessory && titleHasAccessorySignal;

  // Reject a different model variant, such as "Wave Call" for "Wave".
  const hasUnrequestedModelVariant = listingTokenArray.some(
    (token, index) => {
      if (!MODEL_VARIANT_WORDS.has(token)) return false;

      const preceding = listingTokenArray[index - 1];

      return Boolean(
        preceding &&
        wanted.includes(preceding) &&
        !wanted.includes(token)
      );
    }
  );

  const color = requestedColor(wanted);
  const colorMismatch = Boolean(
    color && !listingHasColor(listingText, color)
  );

  // Flag region-specific listings not explicitly requested by the user.
  const regionMismatch = [...listingTokens].some(
    token => REGION_TERMS.has(token) && !wanted.includes(token)
  );

  const rawScore = wanted.length
    ? Math.round((matched.length / wanted.length) * 100)
    : 0;

  const needsVariantReview =
    hasUnrequestedModelVariant ||
    colorMismatch ||
    regionMismatch;

  const exactMatch =
    wanted.length > 0 &&
    !isAccessoryMismatch &&
    !hasUnrequestedModelVariant &&
    !colorMismatch &&
    !regionMismatch &&
    missingTerms.length === 0 &&
    missingCriticalTerms.length === 0;

  return {
    matchScore: isAccessoryMismatch ? Math.min(rawScore, 25) : rawScore,
    exactMatch,
    isAccessoryMismatch,
    missingTerms,
    missingCriticalTerms,
    needsVariantReview
  };
}
