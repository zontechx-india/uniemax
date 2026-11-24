// The bill / receipt PDF (modules/bills/billPdf.ts): money in words, exact
// paise, safe text, and that both documents render. No server, no database:
// `npm run test:unit`. Set BILL_PDF_OUT=dir to also write the sample PDFs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { amountInWords, groupRupees, printable, renderBillPdf, toPaise, type BillPdfData } from "../../src/modules/bills/billPdf.js";

test("amounts in words use Indian grouping", () => {
  assert.equal(amountInWords(115000), "Rupees One Thousand One Hundred Fifty Only");
  assert.equal(amountInWords(115050), "Rupees One Thousand One Hundred Fifty and Fifty Paise Only");
  assert.equal(amountInWords(12345678900), "Rupees Twelve Crore Thirty Four Lakh Fifty Six Thousand Seven Hundred Eighty Nine Only");
  assert.equal(amountInWords(100), "Rupees One Only");
  assert.equal(amountInWords(5), "Rupees Zero and Five Paise Only");
});

test("money strings become exact paise and Indian groups", () => {
  assert.equal(toPaise("1234.50"), 123450);
  assert.equal(toPaise("0.05"), 5);
  assert.equal(toPaise("99"), 9900);
  assert.equal(toPaise(null), 0);
  assert.equal(groupRupees(12345650), "1,23,456.50");
});

test("text the font cannot draw is folded, not left as boxes", () => {
  assert.equal(printable("Café  Déjà"), "Cafe Deja");
  assert.equal(printable("Price ₹500"), "Price Rs 500");
  assert.equal(printable("Saree · Size M — “new”"), "Saree · Size M — “new”");
});

const base = (over: Partial<BillPdfData> = {}): BillPdfData => ({
  kind: "RECEIPT",
  number: "48203917",
  orderNumber: null,
  issuedAt: new Date("2026-11-25T10:10:00Z"),
  store: {
    name: "Anu Silks",
    legalName: "Anu Silks & Sarees Private Limited",
    addressLines: ["12 Gandhi Road, T. Nagar, Chennai, Tamil Nadu 600017"],
    phone: "+91 98400 11223",
    email: "hello@anusilks.in",
    gstin: "33ABCDE1234F1Z5",
    accent: "#7c2d5a",
    logo: null,
  },
  customer: { name: "Priya Raman", phone: "+91 98765 43210" },
  handover: { label: "Deliver to", lines: ["4/21 Lake View Street, Velachery", "Tamil Nadu 600042"] },
  lines: [
    { name: "Kanchipuram soft silk saree", detail: "Colour Maroon  ·  SKU KS-1042", quantity: 1, unitPaise: 845000, amountPaise: 845000 },
    { name: "Cotton kurti with block print and a long name that wraps onto a second line", detail: "Size M / Teal  ·  SKU KT-204", quantity: 2, unitPaise: 129900, amountPaise: 259800 },
    { name: "Silk blouse stitching", detail: null, quantity: 1, unitPaise: 45000, amountPaise: 45000 },
  ],
  subtotalPaise: 1149800,
  shippingPaise: 6000,
  shippingNote: null,
  discountPaise: 50000,
  totalPaise: 1105800,
  payment: ["Paid to Anu Silks by UPI on 25 Nov 2026, 3:40 pm", "Reference 4321 0987 6543"],
  payLink: null,
  note: "Blouse stitched to your size. Thank you for shopping with us!",
  viewLink: "https://uniemax.com/b/AbCdEf123456",
  ...over,
});

test("a receipt and an open bill both render as PDF", async () => {
  const receipt = await renderBillPdf(base());
  const bill = await renderBillPdf(
    base({
      kind: "BILL",
      store: { ...base().store, legalName: null, gstin: null, email: null, accent: "#f5d90a" },
      handover: { label: "Delivery", lines: ["Address added when the bill is paid"] },
      payment: ["Pay online from this link by 28 Nov 2026, 3:40 pm"],
      payLink: "https://uniemax.com/b/AbCdEf123456",
      note: null,
    }),
  );
  // Many lines: the table runs onto a second page with its header again.
  const many = await renderBillPdf(
    base({
      lines: Array.from({ length: 40 }, (_, i) => ({ name: `Item ${i + 1}`, detail: "Size L", quantity: 1, unitPaise: 10000, amountPaise: 10000 })),
    }),
  );
  for (const pdf of [receipt, bill, many]) {
    assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
    assert.ok(pdf.length < 200_000, `small file (${pdf.length} bytes)`);
  }
  assert.ok((many.toString("latin1").match(/\/Type \/Page\n/g) ?? []).length >= 2, "40 lines run onto a second page");
  const out = process.env.BILL_PDF_OUT;
  if (out) {
    mkdirSync(out, { recursive: true });
    writeFileSync(join(out, "receipt.pdf"), receipt);
    writeFileSync(join(out, "bill.pdf"), bill);
    writeFileSync(join(out, "many.pdf"), many);
  }
});
