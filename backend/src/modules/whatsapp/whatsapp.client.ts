import type { FastifyBaseLogger } from "fastify";
import { env, isProduction } from "../../config/env.js";
import { HttpError } from "../../utils/httpError.js";
import type {
  GraphErrorBody,
  GraphSendResponse,
  GraphTemplate,
  GraphTemplateList,
} from "./whatsapp.types.js";

/**
 * Thin client for the WhatsApp Cloud API (Graph API) — the two calls this
 * module needs: send (POST /{phone-number-id}/messages) and list templates
 * (GET /{waba-id}/message_templates). No SDK dependency.
 *
 * Logging: outside production the full request and response are logged (the
 * token is masked) so a template mismatch is debuggable from the console. In
 * production only ids and error codes are logged — never a message body.
 */

/** A Graph API refusal, carrying Meta's own error code for the client. */
export class WaApiError extends HttpError {
  readonly code: number | null;
  /** Meta's own short title ("Template name does not exist…"), kept for the message record. */
  readonly title: string | null;
  /** Meta's error_data.details — usually the actionable part. */
  readonly details: string | null;

  constructor(
    statusCode: number,
    message: string,
    code: number | null,
    meta: { title?: string | null; details?: string | null } = {},
  ) {
    super(statusCode, message);
    this.code = code;
    this.title = meta.title ?? null;
    this.details = meta.details ?? null;
  }
}

/**
 * Full request/response logging. Always on outside production; in production
 * only with WA_LOG_PAYLOADS=true — a temporary switch for debugging a send,
 * since it puts customer message text in the logs.
 */
const verbose = !isProduction || env.WA_LOG_PAYLOADS;

/** Meta throttling codes — the caller should slow down, not fix the request. */
const RATE_LIMIT_CODES = new Set([4, 80007, 130429, 131048, 131056]);

/**
 * Meta's error → our status. Throttling is 429; an expired/invalid token (190)
 * or Meta's own outage is OUR problem, so 502; anything else Meta answered
 * with a 4xx (unknown template, bad params, number not on WhatsApp) is the
 * caller's request, so 400.
 */
function statusFor(httpStatus: number, code: number | null): number {
  if (httpStatus === 429 || (code !== null && RATE_LIMIT_CODES.has(code))) return 429;
  if (httpStatus === 401 || code === 190 || httpStatus >= 500) return 502;
  return httpStatus >= 400 ? 400 : 502;
}

function maskedToken(): string {
  const token = env.WA_ACCESS_TOKEN ?? "";
  return token.length > 8 ? `****${token.slice(-4)}` : "****";
}

/**
 * One Graph API call. `path` is relative to the versioned base
 * ("/<phone-number-id>/messages"). Refusals become `WaApiError`.
 */
async function graphRequest<T>(
  method: "GET" | "POST",
  path: string,
  log: FastifyBaseLogger,
  payload?: Record<string, unknown>,
): Promise<T> {
  const url = `https://graph.facebook.com/${env.WA_GRAPH_VERSION}${path}`;
  if (verbose) {
    log.info(
      {
        wa: {
          method,
          url,
          headers: {
            authorization: `Bearer ${maskedToken()}`,
            ...(payload ? { "content-type": "application/json" } : {}),
          },
          request: payload,
        },
      },
      "whatsapp: graph request",
    );
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      // Bounded: these run inside request handlers and the campaign loop, so
      // a hanging Graph API must fail fast rather than stall either.
      signal: AbortSignal.timeout(15_000),
      headers: {
        authorization: `Bearer ${env.WA_ACCESS_TOKEN}`,
        ...(payload ? { "content-type": "application/json" } : {}),
      },
      ...(payload ? { body: JSON.stringify(payload) } : {}),
    });
  } catch (error) {
    log.error({ err: error }, "whatsapp: graph request failed");
    throw new WaApiError(502, "WhatsApp API unreachable", null);
  }

  const body: unknown = await response.json().catch(() => null);
  if (verbose) {
    // Successful template lists are large and carry no customer data — status
    // only. Sends, and every error, are logged in full.
    const full = method === "POST" || !response.ok;
    log.info(
      { wa: { status: response.status, ...(full ? { response: body } : {}) } },
      "whatsapp: graph response",
    );
  }

  if (!response.ok) {
    const error = (body as GraphErrorBody | null)?.error;
    const code = error?.code ?? null;
    // 190 is our credential, not the caller's request — say which setting to fix
    // rather than echo Meta's "Invalid OAuth access token".
    const message =
      code === 190
        ? "WhatsApp rejected the access token — WA_ACCESS_TOKEN is invalid or expired"
        : (error?.error_data?.details ?? error?.message ?? `HTTP ${response.status}`);
    log.warn(
      { wa: { status: response.status, code, fbtraceId: error?.fbtrace_id } },
      "whatsapp: graph refused request",
    );
    throw new WaApiError(statusFor(response.status, code), message, code, {
      title: error?.message ?? null,
      details: error?.error_data?.details ?? null,
    });
  }
  return body as T;
}

export function sendMessage(
  payload: Record<string, unknown>,
  log: FastifyBaseLogger,
): Promise<GraphSendResponse> {
  return graphRequest("POST", `/${env.WA_PHONE_NUMBER_ID}/messages`, log, payload);
}

/** Every template on the WABA (all statuses), following Meta's paging. */
export async function listTemplates(log: FastifyBaseLogger): Promise<GraphTemplate[]> {
  const fields = "name,language,status,category,parameter_format,components";
  const templates: GraphTemplate[] = [];
  let after: string | undefined;
  // 10 pages × 100 is far beyond any real WABA; the cap keeps a paging bug finite.
  for (let page = 0; page < 10; page += 1) {
    const query = `fields=${fields}&limit=100${after ? `&after=${encodeURIComponent(after)}` : ""}`;
    const result = await graphRequest<GraphTemplateList>(
      "GET",
      `/${env.WA_WABA_ID}/message_templates?${query}`,
      log,
    );
    templates.push(...(result.data ?? []));
    after = result.paging?.next ? result.paging.cursors?.after : undefined;
    if (!after) break;
  }
  return templates;
}
