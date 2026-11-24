import { readFileSync } from "node:fs";
import PDFDocument from "pdfkit";

/**
 * A seller's bill as a PDF — "Receipt" once paid, "Bill" while it waits for
 * payment. A4, one typeface (Plus Jakarta Sans, the app's own, vendored in
 * `backend/assets/fonts` under the OFL), the shop's colour as a thin band and
 * its logo or initial, then the facts only: who sold, to whom, what, how much,
 * how it was paid. Nothing is invented — a field the shop never filled in
 * (GSTIN, phone, address) is left out, and it never claims to be a tax
 * invoice (prices carry no GST split today).
 *
 * Pure: `renderBillPdf(data)` → bytes. The service (`bills.service.ts →
 * billPdfData`) decides what goes in, including what the public copy masks.
 */

export interface BillPdfLine {
  name: string;
  /** "Size M · SKU KT-104" — null when neither. */
  detail: string | null;
  quantity: number;
  unitPaise: number;
  amountPaise: number;
}

export interface BillPdfData {
  kind: "RECEIPT" | "BILL";
  number: string;
  orderNumber: string | null;
  /** Bill: when it was made. Receipt: when it was paid. */
  issuedAt: Date;
  store: {
    name: string;
    /** The legal / trading name when it differs from the shop name. */
    legalName: string | null;
    addressLines: string[];
    phone: string | null;
    email: string | null;
    gstin: string | null;
    /** #rrggbb — the band and the initial tile. */
    accent: string;
    /** PNG, square. Null → the shop's initial on its colour. */
    logo: Buffer | null;
  };
  customer: { name: string | null; phone: string };
  /** "Deliver to" + the address, "Collected in store", "Store pickup"… */
  handover: { label: string; lines: string[] };
  lines: BillPdfLine[];
  subtotalPaise: number;
  shippingPaise: number;
  /** "Free", "Pickup" — shown instead of ₹0 when set. */
  shippingNote: string | null;
  discountPaise: number;
  totalPaise: number;
  /** Lines of the Payment box, already in words. */
  payment: string[];
  /** BILL only: where to pay (drawn as a link). */
  payLink: string | null;
  note: string | null;
  /** The bill's own page, printed in the footer to check it online. */
  viewLink: string;
}

// ---------------------------------------------------------------------------
// Words and numbers (Indian style)
// ---------------------------------------------------------------------------

/** "Decimal string" → paise, exactly (no float maths). */
export function toPaise(value: string | number | null | undefined): number {
  if (value === null || value === undefined || value === "") return 0;
  const [rupees = "0", paise = ""] = String(value).split(".");
  const sign = rupees.trim().startsWith("-") ? -1 : 1;
  const whole = Math.abs(parseInt(rupees, 10) || 0);
  return sign * (whole * 100 + (parseInt((paise + "00").slice(0, 2), 10) || 0));
}

const RUPEE_FMT = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** 123456.5 → "1,23,456.50" (no ₹ — it is drawn in its own font). */
export const groupRupees = (paise: number) => RUPEE_FMT.format(Math.abs(paise) / 100);

const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function belowHundred(n: number): string {
  if (n < 20) return ONES[n]!;
  return [TENS[Math.floor(n / 10)], ONES[n % 10]].filter(Boolean).join(" ");
}
function belowThousand(n: number): string {
  const h = Math.floor(n / 100);
  const rest = n % 100;
  return [h ? `${ONES[h]} Hundred` : "", rest ? belowHundred(rest) : ""].filter(Boolean).join(" ");
}

/** Whole rupees in words, Indian grouping (crore, lakh, thousand). */
export function numberInWords(n: number): string {
  if (n === 0) return "Zero";
  const parts: string[] = [];
  const crore = Math.floor(n / 1_00_00_000);
  const lakh = Math.floor((n % 1_00_00_000) / 1_00_000);
  const thousand = Math.floor((n % 1_00_000) / 1000);
  const rest = n % 1000;
  if (crore) parts.push(`${numberInWords(crore)} Crore`);
  if (lakh) parts.push(`${belowHundred(lakh)} Lakh`);
  if (thousand) parts.push(`${belowHundred(thousand)} Thousand`);
  if (rest) parts.push(belowThousand(rest));
  return parts.join(" ");
}

/** 115050 → "Rupees One Thousand One Hundred Fifty and Fifty Paise Only". */
export function amountInWords(paise: number): string {
  const rupees = Math.floor(Math.abs(paise) / 100);
  const p = Math.abs(paise) % 100;
  return `Rupees ${numberInWords(rupees)}${p ? ` and ${belowHundred(p)} Paise` : ""} Only`;
}

/** "4820 3917" — read out in two halves. */
export const spacedNumber = (n: string) => (/^\d{8}$/.test(n) ? `${n.slice(0, 4)} ${n.slice(4)}` : n);

// ---------------------------------------------------------------------------
// Fonts
// ---------------------------------------------------------------------------

const FONT_DIR = new URL("../../../assets/fonts/plus-jakarta-sans/", import.meta.url);
let fonts: Record<string, Buffer> | null = null;
function loadFonts() {
  fonts ??= {
    R: readFileSync(new URL("latin-400.woff", FONT_DIR)),
    M: readFileSync(new URL("latin-500.woff", FONT_DIR)),
    S: readFileSync(new URL("latin-600.woff", FONT_DIR)),
    B: readFileSync(new URL("latin-700.woff", FONT_DIR)),
    // The Latin file has no ₹; the Latin-Ext one does.
    XR: readFileSync(new URL("latin-ext-400.woff", FONT_DIR)),
    XB: readFileSync(new URL("latin-ext-700.woff", FONT_DIR)),
  };
  return fonts;
}

/** What the Latin file cannot draw: accents folded, ₹ spelled, the rest dropped. */
export function printable(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/₹\s?/g, "Rs ")
    .replace(/[^ -~ -ÿ–—‘’“”•…−·]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// ---------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------

const C = {
  ink: "#111827",
  body: "#374151",
  muted: "#6B7280",
  line: "#E5E7EB",
  head: "#F3F4F6",
  paidBg: "#E8F5EC",
  paidFg: "#166534",
  dueBg: "#FEF3E2",
  dueFg: "#9A3412",
};

const PAGE = { w: 595.28, h: 841.89 };
const M = 44;
const W = PAGE.w - M * 2;
const FOOTER_H = 70;

const luminance = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0]! + 0.7152 * ch[1]! + 0.0722 * ch[2]!;
};

export function renderBillPdf(data: BillPdfData): Promise<Buffer> {
  const f = loadFonts();
  const title = data.kind === "RECEIPT" ? "Receipt" : "Bill";
  const doc = new PDFDocument({
    size: "A4",
    margin: 0,
    bufferPages: true,
    info: {
      Title: `${title} ${data.number} — ${printable(data.store.name)}`,
      Author: printable(data.store.name),
      Subject: `${title} ${data.number}`,
      Creator: "UnieMax",
    },
  });
  for (const [name, buf] of Object.entries(f)) doc.registerFont(name, buf);

  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  const accent = /^#[0-9a-f]{6}$/i.test(data.store.accent) ? data.store.accent : C.ink;
  const t = (
    text: string,
    x: number,
    y: number,
    o: { font?: string; size?: number; color?: string; width?: number; align?: "left" | "right" | "center"; link?: string | undefined } = {},
  ) => {
    doc
      .font(o.font ?? "R")
      .fontSize(o.size ?? 9)
      .fillColor(o.color ?? C.body)
      .text(text, x, y, { width: o.width, align: o.align ?? "left", lineGap: 1.5, link: o.link, underline: false });
    return doc.y;
  };
  const height = (text: string, width: number, font = "R", size = 9) =>
    doc.font(font).fontSize(size).heightOfString(text, { width, lineGap: 1.5 });
  const hr = (y: number, x = M, w = W, color = C.line) => {
    doc.moveTo(x, y).lineTo(x + w, y).lineWidth(0.75).strokeColor(color).stroke();
  };
  /** ₹ + amount, right-aligned at `right` (₹ from the Latin-Ext file). */
  const money = (paise: number, right: number, y: number, o: { size?: number; bold?: boolean; color?: string; minus?: boolean | undefined } = {}) => {
    const size = o.size ?? 9.5;
    const num = groupRupees(paise);
    const numFont = o.bold ? "B" : "M";
    doc.fontSize(size);
    const wNum = doc.font(numFont).widthOfString(num);
    const wRupee = doc.font(o.bold ? "XB" : "XR").widthOfString("₹");
    const lead = o.minus ? "− " : "";
    const wLead = lead ? doc.font(numFont).widthOfString(lead) : 0;
    const x0 = right - wNum - wRupee - wLead;
    const color = o.color ?? C.ink;
    if (lead) doc.font(numFont).fillColor(color).text(lead, x0, y, { lineBreak: false });
    doc.font(o.bold ? "XB" : "XR").fillColor(color).text("₹", x0 + wLead, y, { lineBreak: false });
    doc.font(numFont).fillColor(color).text(num, x0 + wLead + wRupee, y, { lineBreak: false });
  };

  // ---- header -------------------------------------------------------------
  doc.rect(0, 0, PAGE.w, 5).fill(accent);
  let y = 40;
  const tile = 46;
  if (data.store.logo) {
    try {
      doc.save();
      doc.roundedRect(M, y, tile, tile, 8).clip();
      doc.image(data.store.logo, M, y, { width: tile, height: tile });
      doc.restore();
      doc.roundedRect(M, y, tile, tile, 8).lineWidth(0.75).strokeColor(C.line).stroke();
    } catch {
      data.store.logo = null;
      doc.restore();
    }
  }
  if (!data.store.logo) {
    doc.roundedRect(M, y, tile, tile, 8).fill(accent);
    const initial = printable(data.store.name).charAt(0).toUpperCase() || "S";
    t(initial, M, y + 12, { font: "B", size: 20, color: luminance(accent) > 0.45 ? C.ink : "#FFFFFF", width: tile, align: "center" });
  }

  const leftX = M + tile + 14;
  const rightW = 196;
  const leftW = W - tile - 14 - rightW - 16;
  let ly = t(printable(data.store.name), leftX, y - 1, { font: "B", size: 15, color: C.ink, width: leftW });
  if (data.store.legalName) ly = t(printable(data.store.legalName), leftX, ly + 1, { font: "M", size: 8.5, color: C.muted, width: leftW });
  ly += 4;
  for (const line of data.store.addressLines) ly = t(printable(line), leftX, ly, { size: 8.5, width: leftW });
  const contact = [data.store.phone, data.store.email].filter(Boolean).join("  ·  ");
  if (contact) ly = t(printable(contact), leftX, ly + 1, { size: 8.5, width: leftW });
  if (data.store.gstin) ly = t(`GSTIN  ${data.store.gstin}`, leftX, ly + 1, { font: "S", size: 8.5, color: C.ink, width: leftW });

  // Right: title, numbers, status.
  const rx = M + W - rightW;
  t(title, rx, y - 4, { font: "B", size: 22, color: C.ink, width: rightW, align: "right" });
  let ry = y + 30;
  const meta: [string, string][] = [
    [data.kind === "RECEIPT" ? "Receipt no." : "Bill no.", spacedNumber(data.number)],
    [data.kind === "RECEIPT" ? "Paid on" : "Date", formatDate(data.issuedAt)],
  ];
  if (data.orderNumber) meta.push(["Order no.", data.orderNumber]);
  for (const [k, v] of meta) {
    t(k, rx, ry, { size: 8.5, color: C.muted, width: 90 });
    t(v, rx + 90, ry, { font: "S", size: 8.5, color: C.ink, width: rightW - 90, align: "right" });
    ry += 14;
  }
  const pill = data.kind === "RECEIPT" ? { text: "Paid", bg: C.paidBg, fg: C.paidFg } : { text: "Payment due", bg: C.dueBg, fg: C.dueFg };
  doc.font("B").fontSize(8.5);
  const pw = doc.widthOfString(pill.text) + 18;
  doc.roundedRect(rx + rightW - pw, ry + 3, pw, 18, 9).fill(pill.bg);
  t(pill.text, rx + rightW - pw, ry + 7.5, { font: "B", size: 8.5, color: pill.fg, width: pw, align: "center" });
  ry += 24;

  y = Math.max(ly, ry, y + tile) + 18;
  hr(y);
  y += 16;

  // ---- parties ------------------------------------------------------------
  const colW = (W - 24) / 2;
  const partyTop = y;
  t("Billed to", M, y, { font: "S", size: 8, color: C.muted });
  let py = t(printable(data.customer.name ?? "Customer"), M, y + 13, { font: "S", size: 10.5, color: C.ink, width: colW });
  py = t(data.customer.phone, M, py + 1, { size: 9, width: colW });
  const hx = M + colW + 24;
  t(data.handover.label, hx, partyTop, { font: "S", size: 8, color: C.muted });
  let hy = partyTop + 13;
  for (const line of data.handover.lines) hy = t(printable(line), hx, hy, { size: 9, color: C.ink, width: colW });
  y = Math.max(py, hy) + 20;

  // ---- items table --------------------------------------------------------
  const col = { no: M + 10, item: M + 32, qtyR: M + W - 196, rateR: M + W - 104, amtR: M + W - 10 };
  const itemW = col.qtyR - 50 - col.item;
  const tableHead = (at: number) => {
    doc.roundedRect(M, at, W, 24, 6).fill(C.head);
    const hy0 = at + 8;
    t("#", col.no, hy0, { font: "S", size: 8, color: C.muted });
    t("Item", col.item, hy0, { font: "S", size: 8, color: C.muted });
    t("Qty", col.qtyR - 40, hy0, { font: "S", size: 8, color: C.muted, width: 40, align: "right" });
    t("Rate", col.rateR - 70, hy0, { font: "S", size: 8, color: C.muted, width: 70, align: "right" });
    t("Amount", col.amtR - 80, hy0, { font: "S", size: 8, color: C.muted, width: 80, align: "right" });
    return at + 24;
  };
  const bottom = PAGE.h - FOOTER_H - 16;
  const newPage = () => {
    doc.addPage({ size: "A4", margin: 0 });
    doc.rect(0, 0, PAGE.w, 5).fill(accent);
    // Continued: which document this page belongs to.
    t(`${title} ${spacedNumber(data.number)}`, M, 30, { font: "B", size: 10, color: C.ink, width: W / 2 });
    t(`${printable(data.store.name)} · continued`, M + W / 2, 31, { size: 8.5, color: C.muted, width: W / 2, align: "right" });
    hr(50);
    return 62;
  };
  y = tableHead(y);
  data.lines.forEach((line, i) => {
    const name = printable(line.name);
    const detail = line.detail ? printable(line.detail) : "";
    const rowH = 13 + height(name, itemW, "S", 9.5) + (detail ? height(detail, itemW, "R", 8) : 0);
    if (y + rowH > bottom) y = tableHead(newPage());
    const top = y + 7;
    t(String(i + 1), col.no, top, { size: 9, color: C.muted });
    let iy = t(name, col.item, top, { font: "S", size: 9.5, color: C.ink, width: itemW });
    if (detail) iy = t(detail, col.item, iy, { size: 8, color: C.muted, width: itemW });
    t(String(line.quantity), col.qtyR - 40, top, { font: "M", size: 9.5, color: C.ink, width: 40, align: "right" });
    money(line.unitPaise, col.rateR, top);
    money(line.amountPaise, col.amtR, top, { bold: true });
    y += rowH;
    hr(y);
  });

  // ---- totals + amount in words ------------------------------------------
  const rows: { label: string; paise?: number; text?: string; minus?: boolean }[] = [
    { label: `Items (${data.lines.reduce((s, l) => s + l.quantity, 0)})`, paise: data.subtotalPaise },
    data.shippingNote ? { label: "Delivery", text: data.shippingNote } : { label: "Delivery", paise: data.shippingPaise },
  ];
  if (data.discountPaise > 0) rows.push({ label: "Discount", paise: data.discountPaise, minus: true });
  const totalsH = rows.length * 17 + 64;
  if (y + 14 + totalsH > bottom) y = newPage();
  y += 14;
  const tw = 236;
  const tx = M + W - tw;
  const totalsTop = y;
  for (const r of rows) {
    t(r.label, tx + 10, y, { size: 9, color: C.muted });
    if (r.text !== undefined) t(r.text, tx, y, { font: "M", size: 9.5, color: C.ink, width: tw - 10, align: "right" });
    else money(r.paise!, col.amtR, y, { minus: r.minus });
    y += 17;
  }
  hr(y + 2, tx, tw);
  y += 10;
  t("Total", tx + 10, y + 2, { font: "B", size: 11, color: C.ink });
  money(data.totalPaise, col.amtR, y, { size: 13, bold: true });
  y += 24;
  const paid = data.kind === "RECEIPT";
  doc.roundedRect(tx, y, tw, 26, 6).fill(paid ? C.paidBg : C.dueBg);
  t(paid ? "Amount paid" : "Amount due", tx + 10, y + 8, { font: "S", size: 9, color: paid ? C.paidFg : C.dueFg });
  money(data.totalPaise, col.amtR, y + 7.5, { size: 10, bold: true, color: paid ? C.paidFg : C.dueFg });
  const totalsEnd = y + 26;

  // Words, left of the totals.
  const wordsW = W - tw - 28;
  t("Amount in words", M, totalsTop, { font: "S", size: 8, color: C.muted, width: wordsW });
  const wordsEnd = t(amountInWords(data.totalPaise), M, totalsTop + 13, { font: "M", size: 9.5, color: C.ink, width: wordsW });
  y = Math.max(totalsEnd, wordsEnd) + 22;

  // ---- payment + note -----------------------------------------------------
  const box = (label: string, lines: { text: string; link?: string; strong?: boolean }[]) => {
    const inner = W - 28;
    const h = 30 + lines.reduce((s, l) => s + height(l.text, inner, l.strong ? "S" : "R", 9.5) + 3, 0);
    if (y + h > bottom) y = newPage();
    doc.roundedRect(M, y, W, h, 8).lineWidth(0.75).strokeColor(C.line).stroke();
    t(label, M + 14, y + 12, { font: "S", size: 8, color: C.muted });
    let by = y + 26;
    for (const l of lines) {
      by = t(l.text, M + 14, by, { font: l.strong ? "S" : "R", size: 9.5, color: l.link ? accentText : C.ink, width: inner, link: l.link }) + 3;
    }
    y += h + 12;
  };
  const accentText = luminance(accent) > 0.35 ? C.ink : accent;
  box("Payment", [
    ...data.payment.map((p, i) => ({ text: printable(p), strong: i === 0 })),
    ...(data.payLink ? [{ text: data.payLink, link: data.payLink }] : []),
  ]);
  if (data.note) box(`Note from ${printable(data.store.name)}`, [{ text: printable(data.note) }]);

  // ---- footer on every page ----------------------------------------------
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const fy = PAGE.h - FOOTER_H + 8;
    hr(fy - 10);
    const who = printable(data.store.name);
    const reach = data.store.phone ? ` on ${data.store.phone}` : data.store.email ? ` at ${data.store.email}` : "";
    t(`This is a computer-generated ${title.toLowerCase()} and does not need a signature.`, M, fy, { size: 7.5, color: C.muted, width: W - 80 });
    t(`Questions about it? Contact ${who}${reach}.`, M, fy + 11, { size: 7.5, color: C.muted, width: W - 80 });
    t(`View online: ${data.viewLink}`, M, fy + 22, { size: 7.5, color: C.muted, width: W - 80, link: data.viewLink });
    t(`Page ${i - range.start + 1} of ${range.count}`, M + W - 80, fy, { size: 7.5, color: C.muted, width: 80, align: "right" });
  }

  doc.end();
  return done;
}

/** "25 Nov 2026, 3:40 pm" in India time. */
export function formatDate(d: Date): string {
  return d.toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}
