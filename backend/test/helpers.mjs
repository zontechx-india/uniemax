// Shared helpers for the API regression suite (`npm run test:api`).
//
// The suite drives a RUNNING backend over HTTP — local (`npm run dev`) or the
// dev server — so it exercises the real guards, validation and transactions
// exactly as the SPA does. No test framework or extra dependency: Node's
// built-in `node:test` + global `fetch`.
//
// Required env:
//   API_BASE            e.g. http://127.0.0.1:4000 or https://dev.uniemax.zontechx.com
//   QA_EMAIL_A / QA_PASSWORD_A   seller + buyer account (email-verified)
//   QA_EMAIL_B / QA_PASSWORD_B   a second, unrelated customer
// Optional:
//   QA_PHONE_A          phone to link to account A so its test store can
//                       publish (needs the SMS OTP bypass — never production)
//   QA_OTP_CODE         bypass code (default 123456 = OTP_DEV_CODE default)
//
// Never point this at production: it creates a store, products and orders.

export const API_BASE = (process.env.API_BASE ?? "http://127.0.0.1:4000").replace(/\/$/, "");

if (/(^|\.)uniemax\.com$/i.test(new URL(API_BASE).hostname)) {
  throw new Error("Refusing to run the API suite against production");
}

/** A tiny cookie-jar HTTP client that behaves like the SPA's axios instance. */
export class Client {
  constructor({ bearer } = {}) {
    this.cookies = new Map();
    this.bearer = bearer;
  }

  csrf() {
    return this.cookies.get("csrf_token");
  }

  cookieHeader() {
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; ");
  }

  storeCookies(res) {
    for (const raw of res.headers.getSetCookie?.() ?? []) {
      const [pair] = raw.split(";");
      const i = pair.indexOf("=");
      const name = pair.slice(0, i).trim();
      const value = pair.slice(i + 1).trim();
      if (value === "" || /max-age=0|expires=thu, 01 jan 1970/i.test(raw)) this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
  }

  /**
   * @param {string} method
   * @param {string} path  starts with /api/v1/…
   * @param {object} [opts] { json, form, headers, csrf = true, anonymous = false }
   */
  async req(method, path, opts = {}) {
    const headers = { ...(opts.headers ?? {}) };
    let body;
    if (opts.json !== undefined) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(opts.json);
    } else if (opts.form) {
      body = opts.form;
    }
    if (!opts.anonymous) {
      if (this.cookies.size) headers.Cookie = this.cookieHeader();
      if (this.bearer) headers.Authorization = `Bearer ${this.bearer}`;
      const csrf = this.csrf();
      if (opts.csrf !== false && csrf && method !== "GET") headers["X-CSRF-Token"] = csrf;
    }
    let res = await fetch(API_BASE + path, { method, headers, body });
    // Auth + order routes are rate limited per IP (10/min). A suite run hits
    // those limits on a shared dev box, so honour Retry-After once.
    if (res.status === 429 && !opts.noRetry) {
      const wait = Math.min(Number(res.headers.get("retry-after") ?? 30), 65);
      await new Promise((r) => setTimeout(r, (wait + 1) * 1000));
      res = await fetch(API_BASE + path, { method, headers, body });
    }
    if (!opts.anonymous) this.storeCookies(res);
    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
    return { status: res.status, body: data, headers: res.headers };
  }
}

const webSessions = new Map();

/** Signs in through the web (cookie) profile — one session per account per
 * test file, so a run stays under the login rate limit. */
export async function webLogin(email, password) {
  if (webSessions.has(email)) return webSessions.get(email);
  const c = new Client();
  const r = await c.req("POST", "/api/v1/auth/web/login", { json: { email, password } });
  if (r.status !== 200) throw new Error(`login ${email} failed: ${r.status} ${JSON.stringify(r.body)}`);
  webSessions.set(email, c);
  return c;
}

/** Signs in through the mobile (bearer) profile. */
export async function mobileLogin(email, password) {
  const c = new Client();
  const r = await c.req("POST", "/api/v1/auth/mobile/login", { json: { email, password } });
  if (r.status !== 200) throw new Error(`mobile login ${email} failed: ${r.status}`);
  c.bearer = r.body.data.accessToken;
  return c;
}

/** Smallest valid PNG (1×1, transparent) — a real image for upload tests. */
export const PNG_1PX = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

export function fileForm(fields, file, filename = "photo.png", type = "image/png") {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  fd.append("file", new Blob([file], { type }), filename);
  return fd;
}

export function uniq(prefix) {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function need(name) {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is required (see backend/test/helpers.mjs)`);
  return v;
}

export const VALID_ADDRESS = {
  label: "QA",
  name: "QA Tester",
  phone: "9876543210",
  addressLine: "QA test address, do not ship",
  pincode: "682001",
  state: "Kerala",
  country: "India",
};
