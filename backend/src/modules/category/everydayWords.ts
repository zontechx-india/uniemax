/**
 * Everyday words → taxonomy paths, for the category picker's search.
 *
 * The platform taxonomy is broad and in English ("Fashion > Women"), but a
 * saree seller searches for "saree" — or "साड़ी", "சேலை", "സാരി" — and got
 * "No category matches". Each key is a word (any script, lower-case) a seller
 * is likely to type for what they sell; the value is the path (as
 * `pathLabel`, lower-case, " > " separated) it belongs under. A search term
 * that starts a key (3+ characters) is replaced by that path, so "sare",
 * "sarees" and "saree" all land on Fashion > Women.
 *
 * Code, not data: it only widens search and never creates or renames
 * categories, so it needs no seed run or migration. Extend freely.
 */
export const EVERYDAY_WORDS: Record<string, string> = {
  // Women's ethnic wear
  saree: "fashion > women",
  sarees: "fashion > women",
  sari: "fashion > women",
  "साड़ी": "fashion > women",
  "साडी": "fashion > women",
  "சேலை": "fashion > women",
  "புடவை": "fashion > women",
  "സാരി": "fashion > women",
  "ಸೀರೆ": "fashion > women",
  "చీర": "fashion > women",
  "শাড়ি": "fashion > women",
  kurti: "fashion > women",
  lehenga: "fashion > women",
  lehnga: "fashion > women",
  salwar: "fashion > women",
  churidar: "fashion > women",
  dupatta: "fashion > women",
  blouse: "fashion > women",
  nighty: "fashion > women",
  "कुर्ती": "fashion > women",
  // Men's ethnic wear
  kurta: "fashion > men",
  "कुर्ता": "fashion > men",
  dhoti: "fashion > men",
  mundu: "fashion > men",
  "മുണ്ട്": "fashion > men",
  lungi: "fashion > men",
  sherwani: "fashion > men",
  veshti: "fashion > men",
  // Jewellery
  jewellery: "jewelry & accessories > jewelry",
  jhumka: "jewelry & accessories > jewelry",
  bangle: "jewelry & accessories > jewelry",
  bangles: "jewelry & accessories > jewelry",
  chain: "jewelry & accessories > jewelry",
  necklace: "jewelry & accessories > jewelry",
  earring: "jewelry & accessories > jewelry",
  anklet: "jewelry & accessories > jewelry",
  payal: "jewelry & accessories > jewelry",
  bindi: "fashion > fashion accessories",
  // Grocery
  grocery: "grocery & food",
  kirana: "grocery & food > staples",
  atta: "grocery & food > staples",
  rice: "grocery & food > staples",
  dal: "grocery & food > staples",
  "दाल": "grocery & food > staples",
  flour: "grocery & food > staples",
  masala: "grocery & food > cooking essentials",
  spices: "grocery & food > cooking essentials",
  ghee: "grocery & food > cooking essentials",
  oil: "grocery & food > cooking essentials",
  pickle: "grocery & food > packaged food",
  achar: "grocery & food > packaged food",
  namkeen: "grocery & food > snacks",
  mixture: "grocery & food > snacks",
  sweets: "grocery & food > snacks",
  mithai: "grocery & food > snacks",
  tea: "grocery & food > beverages",
  chai: "grocery & food > beverages",
  coffee: "grocery & food > beverages",
  // Footwear / bags
  chappal: "shoes & footwear > sandals & slippers",
  slipper: "shoes & footwear > sandals & slippers",
  purse: "bags & luggage > handbags",
  // Phones
  phone: "electronics > mobiles",
  mobile: "electronics > mobiles",
  cover: "electronics > accessories",
  charger: "electronics > accessories",
};

/**
 * Replaces each search term that starts an everyday word (3+ characters)
 * with the taxonomy path it stands for; other terms pass through.
 */
export function expandEverydayTerms(terms: string[]): string[] {
  return terms.map((term) => {
    if (term.length < 3) return term;
    const exact = EVERYDAY_WORDS[term];
    if (exact) return exact;
    const key = Object.keys(EVERYDAY_WORDS).find((word) => word.startsWith(term));
    return key ? EVERYDAY_WORDS[key]! : term;
  });
}
