// Template summaries for the console's picker: which templates the send
// endpoints can actually fill, and how many {{n}} values each needs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { countBodyParams, fillTemplateBody, summarizeTemplate, templateSendProblem } from "../../src/modules/whatsapp/whatsapp.templates.js";

const approved = (components: unknown[], extra: Record<string, unknown> = {}) =>
  summarizeTemplate({ name: "t", language: "en", status: "APPROVED", category: "UTILITY", components, ...extra } as never);

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
  assert.equal(t.footer, "UnieMax");
  assert.deepEqual(t.buttons, ["Thanks", "Track"]);
});

test("summary: what the send endpoints cannot fill is listed but not sendable", () => {
  const cases: [string, ReturnType<typeof approved>][] = [
    ["pending", summarizeTemplate({ name: "t", language: "en", status: "PENDING", components: [{ type: "BODY", text: "x" }] })],
    ["named", approved([{ type: "BODY", text: "Hi {{name}}" }], { parameter_format: "NAMED" })],
    ["image header", approved([{ type: "HEADER", format: "IMAGE" }, { type: "BODY", text: "x" }])],
    ["header variable", approved([{ type: "HEADER", format: "TEXT", text: "Hi {{1}}" }, { type: "BODY", text: "x" }])],
    ["dynamic url", approved([{ type: "BODY", text: "x" }, { type: "BUTTONS", buttons: [{ type: "URL", text: "Open", url: "https://x.test/{{1}}" }] }])],
  ];
  for (const [label, t] of cases) {
    assert.equal(t.sendable, false, label);
    assert.ok(t.reason && t.reason.length > 10, label);
  }
  assert.equal(cases[2]![1].header, null);
});

test("fillTemplateBody: values land in their {{n}}; missing ones stay visible", () => {
  assert.equal(fillTemplateBody("Hi {{1}}, order {{2}} shipped. Bye {{1}}", ["Asha", "UM-1"]), "Hi Asha, order UM-1 shipped. Bye Asha");
  assert.equal(fillTemplateBody("Hi {{1}} {{2}}", ["Asha"]), "Hi Asha {{2}}");
});

test("templateSendProblem: language, value count and sendability are checked before Meta", () => {
  const templates = [
    approved([{ type: "BODY", text: "Hi {{1}}, address {{2}}, contact {{3}}" }], { name: "uniemax_address_update", language: "en_US" }),
    approved([{ type: "HEADER", format: "IMAGE" }, { type: "BODY", text: "x" }], { name: "promo", language: "en" }),
  ];
  assert.equal(templateSendProblem(templates, "uniemax_address_update", "en_US", 3), null);
  assert.match(templateSendProblem(templates, "uniemax_address_update", "en", 3)!, /no "en" version — use "en_US"/);
  assert.match(templateSendProblem(templates, "uniemax_address_update", "en_US", 2)!, /needs 3 values for \{\{1\}\}…\{\{3\}\}, got 2/);
  assert.match(templateSendProblem(templates, "missing", "en", 0)!, /No template named "missing"/);
  assert.match(templateSendProblem(templates, "promo", "en", 0)!, /image header/);
});
