// Template summaries: what a send must supply (body values, button values,
// media header) and which templates can't be sent at all.
import { test } from "node:test";
import assert from "node:assert/strict";
import { countBodyParams, fillTemplateBody, summarizeTemplate, templateSendProblem } from "../../src/modules/whatsapp/whatsapp.templates.js";

const approved = (components: unknown[], extra: Record<string, unknown> = {}) =>
  summarizeTemplate({ name: "t", language: "en", status: "APPROVED", category: "UTILITY", components, ...extra } as never);

const shape = (params: number, buttons = 0, headerMedia = false) => ({ params, buttons, headerMedia });

test("countBodyParams: highest {{n}}, spacing tolerated", () => {
  assert.equal(countBodyParams("Hi {{1}}, order {{2}} ships {{ 3 }}"), 3);
  assert.equal(countBodyParams("{{2}} then {{1}} then {{2}}"), 2);
  assert.equal(countBodyParams("No variables"), 0);
});

test("summary: a plain approved body template is sendable", () => {
  const t = approved([
    { type: "HEADER", format: "TEXT", text: "Order update" },
    { type: "BODY", text: "Hi {{1}}, order {{2}} has shipped." },
    { type: "FOOTER", text: "UnieMax" },
    { type: "BUTTONS", buttons: [{ type: "QUICK_REPLY", text: "Thanks" }, { type: "URL", text: "Track", url: "https://uniemax.com/track" }] },
  ]);
  assert.equal(t.sendable, true);
  assert.equal(t.reason, null);
  assert.equal(t.paramCount, 2);
  assert.equal(t.header, "Order update");
  assert.equal(t.headerMedia, null);
  assert.equal(t.footer, "UnieMax");
  assert.deepEqual(t.buttons, ["Thanks", "Track"]);
  assert.deepEqual(t.urlButtons, []); // a fixed URL needs no value
});

test("summary: media headers and dynamic URL buttons are sendable, with what they need", () => {
  const t = approved([
    { type: "HEADER", format: "IMAGE" },
    { type: "BODY", text: "Hi {{1}}" },
    { type: "BUTTONS", buttons: [{ type: "QUICK_REPLY", text: "Stop" }, { type: "URL", text: "Open", url: "https://uniemax.com/mystores/{{1}}" }] },
  ]);
  assert.equal(t.sendable, true);
  assert.equal(t.headerMedia, "image");
  assert.equal(t.header, null);
  assert.deepEqual(t.urlButtons, [{ index: 1, text: "Open", url: "https://uniemax.com/mystores/{{1}}" }]);
});

test("summary: what can't be filled is listed but not sendable", () => {
  const cases: [string, ReturnType<typeof approved>][] = [
    ["pending", summarizeTemplate({ name: "t", language: "en", status: "PENDING", components: [{ type: "BODY", text: "x" }] })],
    ["named", approved([{ type: "BODY", text: "Hi {{name}}" }], { parameter_format: "NAMED" })],
    ["location header", approved([{ type: "HEADER", format: "LOCATION" }, { type: "BODY", text: "x" }])],
    ["header variable", approved([{ type: "HEADER", format: "TEXT", text: "Hi {{1}}" }, { type: "BODY", text: "x" }])],
  ];
  for (const [label, t] of cases) {
    assert.equal(t.sendable, false, label);
    assert.ok(t.reason && t.reason.length > 10, label);
  }
});

test("fillTemplateBody: values land in their {{n}}; missing ones stay visible", () => {
  assert.equal(fillTemplateBody("Hi {{1}}, order {{2}} shipped. Bye {{1}}", ["Asha", "UM-1"]), "Hi Asha, order UM-1 shipped. Bye Asha");
  assert.equal(fillTemplateBody("Hi {{1}} {{2}}", ["Asha"]), "Hi Asha {{2}}");
});

test("templateSendProblem: language, counts, buttons and media header are checked before Meta", () => {
  const templates = [
    approved([{ type: "BODY", text: "Hi {{1}}, address {{2}}, contact {{3}}" }], { name: "uniemax_address_update", language: "en_US" }),
    approved(
      [{ type: "BODY", text: "Hi {{1}}, {{2}}" }, { type: "BUTTONS", buttons: [{ type: "URL", text: "Open", url: "https://uniemax.com/mystores/{{1}}" }] }],
      { name: "seller_setup_products" },
    ),
    approved([{ type: "HEADER", format: "IMAGE" }, { type: "BODY", text: "Sale!" }], { name: "promo" }),
    approved([{ type: "HEADER", format: "LOCATION" }, { type: "BODY", text: "x" }], { name: "where" }),
  ];
  assert.equal(templateSendProblem(templates, "uniemax_address_update", "en_US", shape(3)), null);
  assert.match(templateSendProblem(templates, "uniemax_address_update", "en", shape(3))!, /no "en" version — use "en_US"/);
  assert.match(templateSendProblem(templates, "uniemax_address_update", "en_US", shape(2))!, /needs 3 values for \{\{1\}\}…\{\{3\}\}, got 2/);
  assert.match(templateSendProblem(templates, "missing", "en", shape(0))!, /No template named "missing"/);

  assert.equal(templateSendProblem(templates, "seller_setup_products", "en", shape(2, 1)), null);
  assert.match(templateSendProblem(templates, "seller_setup_products", "en", shape(2))!, /1 link button to fill, got 0/);

  assert.equal(templateSendProblem(templates, "promo", "en", shape(0, 0, true)), null);
  assert.match(templateSendProblem(templates, "promo", "en", shape(0))!, /image header — add the image/);
  assert.match(templateSendProblem(templates, "uniemax_address_update", "en_US", shape(3, 0, true))!, /no media header/);
  assert.match(templateSendProblem(templates, "where", "en", shape(0))!, /location header/);
});
