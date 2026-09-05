import type { StoreProfile } from "./storeProfile.schema.js";

/**
 * Store readiness — **one registry, every consumer**.
 *
 * Before this existed, "is this store complete enough to go live?" was
 * answered independently in three places that all drifted: the publish
 * endpoint (which checked nothing), the payments page (which showed a hint
 * and enforced nothing), and the seller's own guesswork. Adding a required
 * field meant hunting for each of them.
 *
 * Now a requirement is declared once, below, and everything derives from it:
 *
 *   - the server **enforces** gates (`assertGate` in the service layer),
 *   - the seller's **setup checklist** renders from the same evaluation,
 *   - the **wizard** knows which fields belong to which step,
 *   - the client shows exactly the blockers the server would reject on.
 *
 * Adding a future requirement — a verified GSTIN before online payment, a
 * signed agreement before payout, a minimum of three products before a
 * marketplace feature — is ONE entry in `REQUIREMENTS`. No endpoint, no UI
 * and no migration changes.
 */

// ---------------------------------------------------------------------------
// Gates — the capabilities a requirement can block
// ---------------------------------------------------------------------------

/**
 * `PUBLISH` — make the storefront publicly reachable.
 * `ONLINE_PAYMENT` — accept platform-processed payment (money moves, so the
 *   payout identity has to be real).
 * `PICKUP` — offer collection from a physical location, which is meaningless
 *   without an address to collect from.
 */
export const GATES = ["PUBLISH", "ONLINE_PAYMENT", "PICKUP"] as const;

export type Gate = (typeof GATES)[number];

export const GATE_LABELS: Record<Gate, string> = {
  PUBLISH: "publish your store",
  ONLINE_PAYMENT: "accept online payments",
  PICKUP: "offer store pickup",
};

// ---------------------------------------------------------------------------
// Steps — how requirements are grouped for the seller
// ---------------------------------------------------------------------------

/**
 * A step is a screen's worth of related fields. `wizard: true` steps are the
 * numbered pages of the Create Store flow, in this order; the rest are
 * checklist-only items the seller completes from the management sections
 * (you cannot add a product from a signup wizard).
 */
export interface StepDefinition {
  key: StepKey;
  /** Shown as the step's heading, and as the checklist group title. */
  title: string;
  /** One line under the heading — what this step is for, in plain words. */
  blurb: string;
  /** Part of the numbered Create Store wizard. */
  wizard: boolean;
  /** Where the seller edits it after onboarding, relative to /stores/:slug. */
  href: string;
}

export const STEP_KEYS = [
  "store",
  "business",
  "address",
  "tax",
  "catalog",
  "payout",
] as const;

export type StepKey = (typeof STEP_KEYS)[number];

export const STEPS: StepDefinition[] = [
  {
    key: "store",
    title: "Your store",
    blurb: "The name and logo customers will see.",
    wizard: true,
    href: "details",
  },
  {
    key: "business",
    title: "Business & contact",
    blurb: "Who is selling, and how we reach you about orders.",
    wizard: true,
    href: "business",
  },
  {
    key: "address",
    title: "Address",
    blurb: "Where you trade from, and where orders are picked up.",
    wizard: true,
    href: "business",
  },
  {
    key: "tax",
    title: "Tax details",
    blurb: "Needed only when you start accepting online payments.",
    wizard: true,
    href: "business",
  },
  {
    key: "catalog",
    title: "Your first products",
    blurb: "A category and at least one product to sell.",
    wizard: false,
    href: "products",
  },
  {
    key: "payout",
    title: "Getting paid",
    blurb: "The bank account your online earnings are sent to.",
    wizard: false,
    href: "bank-accounts",
  },
];

/** The numbered pages of the Create Store wizard, in order. */
export const WIZARD_STEPS = STEPS.filter((s) => s.wizard);

// ---------------------------------------------------------------------------
// The requirement registry
// ---------------------------------------------------------------------------

/**
 * Everything a requirement needs to judge itself. Assembled once per store by
 * `stores.service.ts` — the counts come from batched aggregates, so listing
 * ten stores still costs three queries, not thirty.
 */
export interface ReadinessContext {
  name: string;
  logoKey: string | null;
  profile: StoreProfile;
  categoryCount: number;
  productCount: number;
  hasPrimaryBankAccount: boolean;
}

export interface Requirement {
  key: string;
  /** Imperative and specific — this string is shown to the seller verbatim. */
  label: string;
  step: StepKey;
  /** Capabilities this requirement blocks while unmet. Empty = advisory. */
  gates: Gate[];
  isMet: (ctx: ReadinessContext) => boolean;
  /**
   * Only checked when this predicate passes. Lets a requirement apply
   * conditionally — say, a field that only matters once the seller switches a
   * capability on — without the evaluator knowing why.
   */
  appliesWhen?: (ctx: ReadinessContext) => boolean;
}

const filled = (value: string | null | undefined): boolean =>
  typeof value === "string" && value.trim().length > 0;

export const REQUIREMENTS: Requirement[] = [
  // --- Step 1: the store itself ------------------------------------------
  {
    key: "store.name",
    label: "Store name",
    step: "store",
    gates: ["PUBLISH"],
    isMet: (ctx) => filled(ctx.name),
  },
  {
    key: "store.logo",
    label: "Store logo",
    step: "store",
    gates: ["PUBLISH"],
    isMet: (ctx) => filled(ctx.logoKey),
  },

  // --- Step 2: who is selling --------------------------------------------
  {
    key: "business.name",
    label: "Business name",
    step: "business",
    gates: ["PUBLISH"],
    isMet: (ctx) => filled(ctx.profile.businessName),
  },
  {
    key: "business.sellerName",
    label: "Seller name",
    step: "business",
    gates: ["PUBLISH"],
    isMet: (ctx) => filled(ctx.profile.sellerName),
  },
  {
    key: "business.phone",
    label: "Contact phone number",
    step: "business",
    gates: ["PUBLISH"],
    isMet: (ctx) => filled(ctx.profile.phone),
  },
  {
    key: "business.email",
    label: "Contact email",
    step: "business",
    gates: ["PUBLISH"],
    isMet: (ctx) => filled(ctx.profile.email),
  },

  // --- Step 3: where ------------------------------------------------------
  {
    key: "address.business",
    label: "Business address",
    step: "address",
    // The one address the platform holds. Should store pickup ever be
    // offered, customers must be told where to collect, and this is that
    // place too — so the PICKUP gate reads it rather than a second field.
    gates: ["PUBLISH", "PICKUP"],
    isMet: (ctx) => ctx.profile.address !== null,
  },

  // --- Step 4: tax --------------------------------------------------------
  {
    key: "tax.pan",
    label: "PAN",
    step: "tax",
    // Not a publish blocker: a COD-only store never needs one. It gates the
    // moment the platform starts handling money on the seller's behalf —
    // without a PAN, 194-O TDS is withheld at 5% instead of 1% (206AA).
    gates: ["ONLINE_PAYMENT"],
    isMet: (ctx) => filled(ctx.profile.tax.pan),
  },
  {
    key: "tax.gst",
    label: "GST registration status",
    step: "tax",
    // Advisory only. Small sellers supplying within one state may trade on a
    // marketplace unregistered, so this asks for an ANSWER, not a number.
    gates: [],
    isMet: (ctx) => filled(ctx.profile.tax.gstin) || ctx.profile.tax.gstExempt,
  },

  // --- Catalog ------------------------------------------------------------
  {
    key: "catalog.category",
    label: "At least one category",
    step: "catalog",
    gates: ["PUBLISH"],
    isMet: (ctx) => ctx.categoryCount > 0,
  },
  {
    key: "catalog.product",
    label: "At least one product",
    step: "catalog",
    gates: ["PUBLISH"],
    isMet: (ctx) => ctx.productCount > 0,
  },

  // --- Payout -------------------------------------------------------------
  {
    key: "payout.bankAccount",
    label: "Primary payout bank account",
    step: "payout",
    gates: ["ONLINE_PAYMENT"],
    isMet: (ctx) => ctx.hasPrimaryBankAccount,
  },
];

// ---------------------------------------------------------------------------
// Evaluation
// ---------------------------------------------------------------------------

export interface RequirementState {
  key: string;
  label: string;
  step: StepKey;
  gates: Gate[];
  met: boolean;
}

export interface StepState extends StepDefinition {
  /** Position among wizard steps (1-based); null for checklist-only steps. */
  stepNumber: number | null;
  requirements: RequirementState[];
  complete: boolean;
  /** For a progress bar without the client re-counting. */
  metCount: number;
  totalCount: number;
}

export interface GateState {
  gate: Gate;
  allowed: boolean;
  /** Labels of the unmet requirements, ready to render in a sentence. */
  blockers: string[];
  /** Requirement keys, for a client that wants to deep-link to a step. */
  blockerKeys: string[];
}

export interface Readiness {
  steps: StepState[];
  gates: Record<Gate, GateState>;
  /** Every applicable requirement is met. */
  complete: boolean;
  metCount: number;
  totalCount: number;
}

/**
 * Judge a store against the whole registry.
 *
 * Requirements whose `appliesWhen` is false are dropped entirely — they are
 * not "unmet", they are irrelevant, and showing a seller who only delivers a
 * red cross next to something that does not apply would be a bug, not a nudge.
 */
export function evaluateReadiness(ctx: ReadinessContext): Readiness {
  const applicable = REQUIREMENTS.filter(
    (req) => req.appliesWhen?.(ctx) ?? true,
  );

  const states: RequirementState[] = applicable.map((req) => ({
    key: req.key,
    label: req.label,
    step: req.step,
    gates: req.gates,
    met: req.isMet(ctx),
  }));

  let wizardIndex = 0;
  const steps: StepState[] = STEPS.map((step) => {
    const requirements = states.filter((r) => r.step === step.key);
    const metCount = requirements.filter((r) => r.met).length;
    return {
      ...step,
      stepNumber: step.wizard ? ++wizardIndex : null,
      requirements,
      complete: metCount === requirements.length,
      metCount,
      totalCount: requirements.length,
    };
  });

  const gates = Object.fromEntries(
    GATES.map((gate) => {
      const blocking = states.filter((r) => !r.met && r.gates.includes(gate));
      return [
        gate,
        {
          gate,
          allowed: blocking.length === 0,
          blockers: blocking.map((r) => r.label),
          blockerKeys: blocking.map((r) => r.key),
        } satisfies GateState,
      ];
    }),
  ) as Record<Gate, GateState>;

  const metCount = states.filter((r) => r.met).length;
  return {
    steps,
    gates,
    complete: metCount === states.length,
    metCount,
    totalCount: states.length,
  };
}
