// Page shells say who runs UnieMax — "UnieMax is a product of Zontechx", the
// © line and the address — in the HTML itself, for crawlers that run no
// JavaScript (Meta's WhatsApp display-name review). Marketplace pages only:
// a seller's store never carries it. Pure logic: `npm run test:unit`.
// The HTTP twin (a running backend) is in test/page-shell.test.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { OPERATOR_MARKER, renderPage, type Shell } from "../../src/modules/seo/pageHead.js";
import { platformOrganizationJsonLd } from "../../src/modules/seo/structuredData.js";

const CONTEXT = { origin: "https://uniemax.com", path: "/about" };

/** The real `frontend/index.html`, split the way `loadShell` splits it. */
async function sourceShell(): Promise<Shell> {
  const html = await readFile(new URL("../../../frontend/index.html", import.meta.url), "utf8");
  const start = html.indexOf("<!-- seo:start -->") + "<!-- seo:start -->".length;
  const end = html.indexOf("<!-- seo:end -->");
  return {
    kind: "templated",
    html,
    before: html.slice(0, start),
    after: html.slice(end),
    defaults: { title: "UnieMax", description: "", image: "/og-image.jpg" },
  };
}

test("index.html keeps the operator marker inside #root", async () => {
  const shell = await sourceShell();
  const root = shell.html.indexOf('<div id="root">');
  const marker = shell.html.indexOf(OPERATOR_MARKER);
  assert.ok(root !== -1 && marker > root, "marker must sit inside #root so React replaces it");
  assert.ok(marker < shell.html.indexOf('<script type="module"'));
});

test("a platform page carries Zontechx in the body and the head", async () => {
  const html = renderPage(await sourceShell(), { title: ["About"], platform: true }, CONTEXT);
  const body = html.slice(html.indexOf("<body>"));
  assert.match(body, /UnieMax is a product of <a href="https:\/\/zontechx\.com"[^>]*>Zontechx<\/a>/);
  assert.match(body, new RegExp(`© ${new Date().getFullYear()} Zontechx\\. All rights reserved\\.`));
  assert.match(body, /RMZ Millenia Business Park Perungudi Campus 1A/);
  assert.match(body, /Chennai, Tamil Nadu 600096, India/);
  assert.match(body, /\+91 7708774542/);
  assert.ok(!body.includes(OPERATOR_MARKER));
  assert.match(html, /<meta name="author" content="Zontechx" \/>/);
});

test("a seller store page carries no operator block or author", async () => {
  const html = renderPage(await sourceShell(), { title: ["Some Store"] }, CONTEXT);
  // (index.html names the dev host, *.zontechx.com, so test the block itself.)
  assert.ok(!html.includes("is a product of"));
  assert.ok(!html.includes('<meta name="author"'));
  assert.ok(html.includes(OPERATOR_MARKER));
});

test("the platform Organization names Zontechx as its parent", () => {
  const org = platformOrganizationJsonLd("https://uniemax.com") as {
    parentOrganization: { "@type": string; name: string; url: string; address: { postalCode: string } };
  };
  assert.equal(org.parentOrganization["@type"], "Organization");
  assert.equal(org.parentOrganization.name, "Zontechx");
  assert.equal(org.parentOrganization.url, "https://zontechx.com");
  assert.equal(org.parentOrganization.address.postalCode, "600096");
});
