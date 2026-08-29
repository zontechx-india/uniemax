// MUST be first — decides which database this script writes to.
import "../config/loadEnv.js";
import { prisma } from "../config/prisma.js";
import { storeThemeColorsSchema } from "../modules/stores/stores.schema.js";
import type { StoreThemeColors } from "../modules/stores/stores.schema.js";

/**
 * Seed the five starter store appearance templates.
 *
 * The palettes are LIFTED FROM REAL STORES already on the platform — the
 * shops that took the trouble to configure Appearance are the best evidence
 * of what actually works here — but only their **colors** travel: the five
 * keys of `Store.theme` and nothing else. No name, logo, catalog, homepage,
 * footer or setting is read, and each template is named from the palette
 * itself (see `describePalette`), so a template can never carry a seller's
 * branding.
 *
 * Stores are read newest-configured first, deduped by palette, and skipped
 * when they never left the platform default (an untouched store made no
 * design decision). Whatever the live data can't supply is topped up from the
 * curated fallbacks below, so a fresh install still gets five.
 *
 * Idempotent: does nothing when templates already exist unless run with
 * `--force`, which tops the table back up to five without touching rows an
 * admin has since edited.
 *
 *   npm run seed-theme-templates
 *   npm run seed-theme-templates -- --force
 */

const TARGET_COUNT = 5;

/** Used when the platform has fewer than five configured stores to learn from. */
const FALLBACK_PALETTES: {
  name: string;
  description: string;
  theme: StoreThemeColors;
}[] = [
  {
    name: "UnieMax Classic",
    description: "The platform purple on a soft grey canvas — safe anywhere.",
    theme: {
      backgroundColor: "#f9fafb",
      primaryColor: "#6c3ef4",
      secondaryColor: null,
      surfaceColor: null,
      buttonTextColor: null,
    },
  },
  {
    name: "Midnight Chrome",
    description:
      "Near-black canvas with a cool violet CTA — electronics and premium goods.",
    theme: {
      backgroundColor: "#0f1115",
      primaryColor: "#7c5cff",
      secondaryColor: "#a78bfa",
      surfaceColor: "#181b22",
      buttonTextColor: "#ffffff",
    },
  },
  {
    name: "Saffron Market",
    description:
      "Warm, high-contrast orange — groceries, food and everyday retail.",
    theme: {
      backgroundColor: "#fffaf3",
      primaryColor: "#ea580c",
      secondaryColor: "#c2410c",
      surfaceColor: "#ffffff",
      buttonTextColor: "#ffffff",
    },
  },
  {
    name: "Emerald Grove",
    description: "Fresh green on off-white — organics, wellness and home.",
    theme: {
      backgroundColor: "#f5faf7",
      primaryColor: "#0f9d58",
      secondaryColor: "#047857",
      surfaceColor: "#ffffff",
      buttonTextColor: "#ffffff",
    },
  },
  {
    name: "Rose Atelier",
    description: "Soft blush and deep rose — fashion, beauty and gifting.",
    theme: {
      backgroundColor: "#fff7f8",
      primaryColor: "#e11d48",
      secondaryColor: "#9f1239",
      surfaceColor: "#ffffff",
      buttonTextColor: "#ffffff",
    },
  },
];

/** The palette every store starts on — never worth copying as a "choice". */
const PLATFORM_DEFAULT = "#f9fafb|#6c3ef4";

/** Identity of a palette — two stores with the same colors are one template. */
const signature = (theme: StoreThemeColors) =>
  [
    theme.backgroundColor,
    theme.primaryColor,
    theme.secondaryColor ?? "auto",
    theme.surfaceColor ?? "auto",
    theme.buttonTextColor ?? "auto",
  ]
    .join("|")
    .toLowerCase();

function hexToRgb(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

const luminance = (hex: string) => {
  const [r, g, b] = hexToRgb(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
};

/** Hue in degrees — how the palette gets its family name. */
function hue(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => v / 255) as [number, number, number];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  if (delta === 0) return 0;
  const raw =
    max === r
      ? ((g - b) / delta) % 6
      : max === g
        ? (b - r) / delta + 2
        : (r - g) / delta + 4;
  return (raw * 60 + 360) % 360;
}

const saturation = (hex: string) => {
  const [r, g, b] = hexToRgb(hex).map((v) => v / 255) as [number, number, number];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return max === 0 ? 0 : (max - min) / max;
};

/**
 * Each family carries a few interchangeable names, because a real platform
 * will hold several stores in the same hue and "Midnight Amber 2" is not a
 * template anyone wants to pick. The nth palette of a family takes the nth
 * name; past the list we fall back to a numeric suffix.
 */
const HUE_FAMILIES: { upTo: number; names: string[]; suits: string }[] = [
  { upTo: 15, names: ["Crimson", "Scarlet", "Garnet"], suits: "fashion, gifting and festive retail" },
  { upTo: 45, names: ["Amber", "Ember", "Copper"], suits: "food, groceries and everyday retail" },
  { upTo: 70, names: ["Citrus", "Saffron", "Marigold"], suits: "snacks, toys and value retail" },
  { upTo: 165, names: ["Emerald", "Verdant", "Fern"], suits: "organics, wellness and home" },
  { upTo: 200, names: ["Teal", "Lagoon", "Cyan"], suits: "services, health and stationery" },
  { upTo: 255, names: ["Ocean", "Cobalt", "Indigo"], suits: "electronics, tools and B2B" },
  { upTo: 290, names: ["Violet", "Amethyst", "Orchid"], suits: "premium goods and lifestyle" },
  { upTo: 335, names: ["Magenta", "Fuchsia", "Plum"], suits: "beauty, fashion and accessories" },
  { upTo: 361, names: ["Rose", "Blush", "Petal"], suits: "beauty, fashion and gifting" },
];

const GREY_FAMILY = {
  names: ["Graphite", "Slate", "Charcoal"],
  suits: "minimal catalogs and B2B",
};

/** How dark the canvas reads — the first half of every generated name. */
function tone(background: string): string {
  const lum = luminance(background);
  if (lum < 0.12) return "Obsidian";
  if (lum < 0.3) return "Midnight";
  if (lum < 0.5) return "Twilight";
  if (lum < 0.9) return "Daylight";
  return "Ivory";
}

/**
 * Name and pitch a palette FROM THE COLORS — the one thing a template is
 * allowed to inherit. A store's own name never comes near this. `seen` counts
 * how many palettes of each family have already been named, so a platform
 * full of orange shops still yields distinct, readable template names.
 */
function describePalette(
  theme: StoreThemeColors,
  seen: Map<string, number>,
): { name: string; description: string } {
  const family =
    saturation(theme.primaryColor) < 0.15
      ? GREY_FAMILY
      : HUE_FAMILIES.find((f) => hue(theme.primaryColor) < f.upTo)!;

  const key = family.names[0]!;
  const index = seen.get(key) ?? 0;
  seen.set(key, index + 1);
  const label =
    family.names[index] ?? `${family.names[0]} ${index - family.names.length + 2}`;

  const canvas = tone(theme.backgroundColor);
  return {
    name: `${canvas} ${label}`,
    description: `${luminance(theme.backgroundColor) < 0.5 ? "Dark" : "Light"} canvas with a ${label.toLowerCase()} call to action — ${family.suits}.`,
  };
}

/** Real, deliberately-configured palettes already live on the platform. */
async function palettesFromStores() {
  const stores = await prisma.store.findMany({
    // Published stores first — a live shop is a palette someone stood behind.
    orderBy: [{ isPublished: "desc" }, { updatedAt: "desc" }],
    select: { theme: true },
    take: 200,
  });

  const seen = new Set<string>();
  const families = new Map<string, number>();
  const picked: { name: string; description: string; theme: StoreThemeColors }[] = [];

  for (const store of stores) {
    // A null/legacy `theme` column simply fails to parse and is skipped.
    const parsed = storeThemeColorsSchema.safeParse(store.theme);
    if (!parsed.success) continue;
    const theme = parsed.data;
    if (`${theme.backgroundColor}|${theme.primaryColor}` === PLATFORM_DEFAULT) continue;
    const key = signature(theme);
    if (seen.has(key)) continue;
    seen.add(key);
    picked.push({ ...describePalette(theme, families), theme });
    if (picked.length === TARGET_COUNT) break;
  }
  return picked;
}

async function main() {
  const force = process.argv.includes("--force");
  const existingCount = await prisma.storeThemeTemplate.count();
  if (existingCount > 0 && !force) {
    console.log(
      `${existingCount} template(s) already exist — nothing to do. ` +
        `Re-run with --force to top up to ${TARGET_COUNT}.`,
    );
    return;
  }

  const fromStores = await palettesFromStores();
  console.log(`Found ${fromStores.length} distinct configured store palette(s).`);

  // Existing rows keep their slot; the rest is topped up from real stores
  // first, curated fallbacks second, skipping any palette already in the table.
  const current = await prisma.storeThemeTemplate.findMany({
    select: { theme: true, name: true },
  });
  const taken = new Set(
    current.flatMap((row) => {
      const parsed = storeThemeColorsSchema.safeParse(row.theme);
      return parsed.success ? [signature(parsed.data)] : [];
    }),
  );
  const takenNames = new Set(current.map((row) => row.name.toLowerCase()));

  let order = current.length;
  let created = 0;

  for (const candidate of [...fromStores, ...FALLBACK_PALETTES]) {
    if (current.length + created >= TARGET_COUNT) break;
    const key = signature(candidate.theme);
    if (taken.has(key)) continue;
    taken.add(key);
    // Two palettes can land on the same family name; keep names unique.
    let name = candidate.name;
    for (let n = 2; takenNames.has(name.toLowerCase()); n += 1) {
      name = `${candidate.name} ${n}`;
    }
    takenNames.add(name.toLowerCase());

    await prisma.storeThemeTemplate.create({
      data: {
        name,
        description: candidate.description,
        theme: candidate.theme,
        isActive: true,
        displayOrder: order,
      },
    });
    order += 1;
    created += 1;
    console.log(
      `  + ${name}  bg ${candidate.theme.backgroundColor} · primary ${candidate.theme.primaryColor}`,
    );
  }

  console.log(`Created ${created} template(s); ${current.length + created} total.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
