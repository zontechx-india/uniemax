/**
 * Old free-text shelf name -> global taxonomy node.
 *
 * Every rule here was written by reading the ACTUAL shelves and the product
 * names inside them in the development database, not by guessing from the
 * word alone. That distinction is the whole point: "Bike" is genuinely
 * ambiguous (a motorcycle? a bicycle? parts? accessories?), so it maps to
 * nothing and lands in the review list, while "Chain and Sprocket Kit" on
 * MotoCore's "KTM > Duke 200" shelf is unmistakably a motorcycle part.
 *
 * Three outcomes, and only the first one writes anything:
 *
 *   map       - confident enough to apply automatically.
 *   untagged  - confidently NOT a taxonomy node (a brand, a vehicle model, a
 *               merchandising tier). Staying null is the correct answer, not a
 *               failure to map: brands and models belong to the future vehicle
 *               compatibility system and must never become categories.
 *   ambiguous - could be several things. Never written; reported for a human.
 *
 * Applied by scripts/migrateStoreCategories.ts.
 */

export type Mapping =
  | { kind: "map"; slug: string; why: string }
  | { kind: "untagged"; why: string }
  | { kind: "ambiguous"; why: string; candidates: string[] };

export type ShelfRule = {
  /** Shelf name to match. Compared normalised, so write it naturally. */
  match: string;
  /** Limit the rule to one store, for words that differ by shop. */
  store?: string;
  mapping: Mapping;
};

/**
 * Normalises a seller-typed name for matching: case, punctuation, apostrophes
 * and spacing all stop mattering, so "Men's", "MENS" and "Men s" are one key.
 */
export function normaliseName(input: string): string {
  return input
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function mapAll(slug: string, why: string, names: string[]): ShelfRule[] {
  return names.map((match) => ({
    match,
    mapping: { kind: "map" as const, slug, why },
  }));
}

function untaggedAll(why: string, names: string[]): ShelfRule[] {
  return names.map((match) => ({
    match,
    mapping: { kind: "untagged" as const, why },
  }));
}

function ambiguousAll(
  why: string,
  candidates: string[],
  names: string[],
): ShelfRule[] {
  return names.map((match) => ({
    match,
    mapping: { kind: "ambiguous" as const, why, candidates },
  }));
}

/** Store-scoped rules win over generic ones; otherwise order is irrelevant. */
export const SHELF_RULES: ShelfRule[] = [
  // --- Phones, tablets, computers -----------------------------------------
  ...mapAll("electronics-mobiles", "Sold as phones", [
    "Mobiles",
    "Mobile",
    "Smartphones",
    "Feature Phones",
    "Foldable Phones",
    "Gaming Phones",
    "Refurbished Phones",
  ]),
  ...mapAll("computers-accessories-laptops", "Laptop computers", [
    "Laptops",
    "Laptop",
    "Gaming Laptops",
    "Business Laptops",
    "Student Laptops",
    "Ultrabooks",
    "MacBooks",
  ]),
  ...mapAll("electronics-tablets", "Tablet computers", [
    "Tablets",
    "Android Tablets",
    "Kids Tablets",
    "Drawing Tablets",
    "iPads",
  ]),
  ...mapAll("computers-accessories-monitors", "Display panels", [
    "Monitors",
    "Gaming Monitors",
  ]),
  ...mapAll("computers-accessories-storage", "Storage media", [
    "Memory Cards",
    "Pen Drives",
    "External Hard Disks",
  ]),

  // --- Audio and electronics accessories ----------------------------------
  ...mapAll("electronics-audio", "Audio hardware", [
    "Audio",
    "TWS Earbuds",
    "Neckbands",
    "Bluetooth Speakers",
    "Soundbars",
    "Headphones",
    "Wired Earphones",
    "Earphones",
  ]),
  ...mapAll("electronics-accessories", "Phone / device accessories", [
    "Mobile Cases",
    "Screen Protectors",
    "Chargers",
    "Power Banks",
    "Data Cables",
    "Selfie Sticks",
    "OTG Adapters",
    "Mobile Accessories",
  ]),
  // Bare "Accessories" means nothing on its own - Poorvika's shelf holds
  // cases and chargers, but a fashion shop's would hold belts.
  {
    match: "Accessories",
    store: "poorvika",
    mapping: {
      kind: "map",
      slug: "electronics-accessories",
      why: "Holds mobile cases, chargers, power banks and cables",
    },
  },
  {
    match: "Accessories",
    mapping: {
      kind: "ambiguous",
      why: "Depends entirely on the shop - device, fashion or vehicle accessories",
      candidates: [
        "electronics-accessories",
        "fashion-accessories",
        "automotive-car-accessories",
      ],
    },
  },

  // --- Televisions and appliances -----------------------------------------
  // The seeded taxonomy has no Televisions node (see the report's gap list),
  // so these land on the Electronics root: less specific, but never wrong.
  ...mapAll(
    "electronics",
    "Television sets; no TV node exists in the taxonomy yet",
    [
      "Televisions",
      "Television",
      "TV",
      "LED TV",
      "QLED TV",
      "OLED TV",
      "Android TV",
      "Google TV",
      "Smart TV",
    ],
  ),
  ...mapAll("appliances-home-appliances", "Large household appliances", [
    "Home Appliances",
    "Air Conditioners",
    "Refrigerators",
    "Washing Machines",
    "Air Purifiers",
    "Robot Vacuum Cleaners",
  ]),
  ...mapAll("appliances-kitchen-appliances", "Kitchen appliance", [
    "Microwave Ovens",
    "Mixer Grinders",
    "Induction Cooktops",
  ]),

  // --- Smart home ---------------------------------------------------------
  ...mapAll("electrical-lighting", "Lighting product", [
    "Smart Bulbs",
    "Bulbs",
    "Lighting",
  ]),
  ...mapAll("electrical-switches-sockets", "Mains switching", [
    "Smart Plugs",
    "Switches",
  ]),
  ...mapAll("electronics-cameras", "Camera hardware", [
    "Smart Cameras",
    "Cameras",
    "CCTV",
  ]),
  ...mapAll("hardware", "Door hardware", ["Smart Door Locks", "Locks"]),
  {
    match: "Smart Home",
    mapping: {
      kind: "ambiguous",
      why: "An umbrella shelf spanning lighting, switches, cameras and appliances - no single node covers it",
      candidates: ["electrical", "appliances-home-appliances", "electronics"],
    },
  },

  // --- Wearables: genuinely contested -------------------------------------
  ...ambiguousAll(
    "A smart watch reads as an electronics accessory, a watch, or a fitness device depending on the shop",
    [
      "electronics-accessories",
      "jewelry-accessories-watches",
      "health-wellness-fitness-wellness",
    ],
    [
      "Smart Watches",
      "Smart Watch",
      "Fitness Bands",
      "Kids Smart Watches",
      "Luxury Smart Watches",
    ],
  ),

  // --- Gaming -------------------------------------------------------------
  ...mapAll("toys-games-gaming", "Video gaming", [
    "Gaming",
    "Gaming Consoles",
    "Gaming Controllers",
    "Gaming Accessories",
  ]),

  // --- Fashion ------------------------------------------------------------
  ...mapAll("fashion", "General apparel shelf", [
    "Fashion",
    "FashionV2",
    "Clothing",
    "Apparel",
  ]),
  ...mapAll("fashion-men", "Menswear", ["Men", "Mens", "Menswear", "Gents"]),
  ...mapAll("fashion-women", "Womenswear", [
    "Women",
    "Womens",
    "Ladies",
    "Lehangas",
    "Lehenga",
    "Sarees",
  ]),
  ...mapAll("fashion-kids", "Childrenswear", [
    "Kids",
    "Children",
    "Kidswear",
  ]),
  // A garment shelf gives no clue whose garments they are, and the taxonomy
  // splits Fashion by audience rather than by garment.
  ...ambiguousAll(
    "Garment type without an audience - Fashion is split by audience, not by garment",
    ["fashion-men", "fashion-women", "fashion-kids"],
    ["Shirt", "Shirts", "T-Shirts", "Pants", "Trousers"],
  ),

  // --- Sports -------------------------------------------------------------
  ...mapAll("sports-fitness-team-sports", "Cricket bats - a team sport", [
    "Cricket Bats",
    "Cricket Bat",
    "Hard Tennis Bats",
    "Soft Tennis Bats",
    "HardTennis Bats",
    "SoftTennis Bats",
    "Hard Ball Bats",
    "Soft Ball Bats",
    "Cricket",
  ]),

  // --- Bags, home, food ---------------------------------------------------
  ...mapAll("bags-luggage", "Bags; the sub-type is not evident from the shelf", [
    "Bag",
    "Bags",
    "Luggage",
  ]),
  ...mapAll("home-kitchen", "Household and kitchen goods", [
    "Home & Kitchen",
    "Home and Kitchen",
    "Kitchen",
    "Homeware",
  ]),
  // No bakery node exists yet, so these rest on the Grocery & Food root.
  ...mapAll(
    "grocery-food",
    "Baked goods; no bakery node exists in the taxonomy yet",
    ["Cakes", "Cake", "Brownies", "Bakery", "Desserts"],
  ),

  // --- Automotive: the case the brief singles out --------------------------
  ...mapAll(
    "automotive-motorcycle-parts",
    "Explicitly parts, explicitly two-wheeler",
    [
      "Bike Parts",
      "Bike Spares",
      "Motorcycle Parts",
      "Two Wheeler Parts",
      "Motorbike Parts",
    ],
  ),
  ...mapAll(
    "automotive-motorcycle-accessories",
    "Explicitly accessories, explicitly two-wheeler",
    ["Bike Accessories", "Motorcycle Accessories"],
  ),
  ...mapAll("automotive-car-parts", "Explicitly car parts", [
    "Car Parts",
    "Car Spares",
    "Four Wheeler Parts",
  ]),
  ...mapAll("automotive-car-accessories", "Explicitly car accessories", [
    "Car Accessories",
  ]),
  ...mapAll("automotive-oils-fluids", "Consumable fluids", [
    "Oils & Fluids",
    "Engine Oil",
    "Lubricants",
  ]),
  // The brief's headline example. "Bike" alone cannot be resolved safely.
  ...ambiguousAll(
    "Could be a motorcycle, a bicycle, or parts/accessories for either - the word alone decides nothing",
    [
      "automotive-motorcycle-parts",
      "automotive-motorcycle-accessories",
      "sports-fitness-outdoor-sports",
    ],
    [
      "Bike",
      "Bikes",
      "Motor Bikes",
      "Motorbike",
      "Motorcycle",
      "Motorcycles",
      "Two Wheeler",
    ],
  ),
  ...ambiguousAll(
    "The vehicle itself, its parts, or its accessories all read the same here",
    ["automotive-car-parts", "automotive-car-accessories"],
    ["Car", "Cars", "Four Wheeler"],
  ),

  // --- Brands: never categories -------------------------------------------
  ...untaggedAll("A manufacturer brand, not a category", [
    "Apple",
    "Samsung",
    "Google",
    "OnePlus",
    "Xiaomi",
    "Realme",
    "Dell",
    "HP",
    "Lenovo",
    "Asus",
    "Sony",
    "LG",
    "Safari",
  ]),
  ...untaggedAll(
    "A vehicle brand - belongs to the vehicle compatibility system, never to categories",
    [
      "Honda",
      "KTM",
      "Yamaha",
      "Royal Enfield",
      "Bajaj",
      "TVS",
      "Hero",
      "Suzuki",
    ],
  ),
  ...untaggedAll(
    "A vehicle model - belongs to the vehicle compatibility system, never to categories",
    [
      "Activa",
      "Shine 125",
      "Unicorn",
      "Duke 200",
      "Duke 390",
      "R15 V4",
      "MT-15",
      "FZ-S V4",
      "Classic 350",
      "Hunter 350",
      "Meteor 350",
    ],
  ),

  // --- Merchandising tiers: also not categories ---------------------------
  ...untaggedAll(
    "A merchandising tier the seller invented, not a taxonomy node",
    [
      "Pro Edition",
      "Core Edition",
      "Eliite Edition",
      "Elite Edition",
      "Premium Edition",
    ],
  ),
];

/**
 * Fallback classification for the PRODUCTS of a store whose shelves are
 * deliberately untagged. MotoCore files everything under bike brands and
 * models, so no shelf carries a taxonomy answer - but every product on them
 * is a named motorcycle part, which is exactly the context the brief says to
 * read before mapping. Only consulted when the product's own shelf has no tag.
 */
export const PRODUCT_STORE_DEFAULTS: {
  store: string;
  slug: string;
  why: string;
}[] = [
  {
    store: "motocore",
    slug: "automotive-motorcycle-parts",
    why: "Every product is a named motorcycle part (chain kits, brake pads, clutch plates, disc rotors, air filters); the shelves are bike brands/models and stay untagged",
  },
  {
    store: "urban-mobiles",
    slug: "electronics-mobiles",
    why: "Products are phones (iPhone 16, Galaxy S25); the shelves are handset brands and stay untagged",
  },
];
