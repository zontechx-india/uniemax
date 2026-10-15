/**
 * WhatsApp Cloud API wire shapes — only the fields this module reads. Meta
 * adds fields freely, so everything beyond these is ignored, never rejected.
 */

// ---- Webhook (Meta → us) ---------------------------------------------------

export interface WaWebhookPayload {
  object?: string;
  entry?: Array<{
    id?: string;
    changes?: Array<{ field?: string; value?: WaChangeValue }>;
  }>;
}

export interface WaChangeValue {
  messaging_product?: string;
  metadata?: { display_phone_number?: string; phone_number_id?: string };
  contacts?: Array<{ wa_id?: string; profile?: { name?: string } }>;
  messages?: WaInboundMessageWire[];
  statuses?: WaStatusWire[];
}

interface WaMediaWire {
  id?: string;
  caption?: string;
  filename?: string;
}

export interface WaInboundMessageWire {
  id?: string;
  from?: string;
  timestamp?: string;
  type?: string;
  text?: { body?: string };
  /** Quick-reply button on a template. */
  button?: { text?: string; payload?: string };
  interactive?: {
    type?: string;
    button_reply?: { id?: string; title?: string };
    list_reply?: { id?: string; title?: string; description?: string };
  };
  image?: WaMediaWire;
  video?: WaMediaWire;
  audio?: WaMediaWire;
  document?: WaMediaWire;
  sticker?: WaMediaWire;
}

export interface WaStatusWire {
  id?: string;
  status?: string;
  timestamp?: string;
  recipient_id?: string;
  errors?: Array<{
    code?: number;
    title?: string;
    message?: string;
    error_data?: { details?: string };
  }>;
}

// ---- Parsed (what the service persists) ------------------------------------

export interface ParsedInbound {
  wamid: string;
  waId: string;
  /** From value.contacts[].profile.name for this sender, when Meta sent it. */
  name: string | null;
  type: string;
  body: string | null;
  mediaId: string | null;
}

export interface ParsedStatus {
  wamid: string;
  status: string;
  recipientId: string;
  statusTimestamp: Date;
  errorCode: number | null;
  errorTitle: string | null;
  errorMessage: string | null;
  errorDetails: string | null;
}

export interface ParsedWebhook {
  messages: ParsedInbound[];
  statuses: ParsedStatus[];
}

// ---- Graph API (us → Meta) -------------------------------------------------

export interface GraphSendResponse {
  messaging_product: "whatsapp";
  contacts?: Array<{ input?: string; wa_id?: string }>;
  messages?: Array<{ id: string; message_status?: string }>;
}

export interface GraphErrorBody {
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
    error_data?: { details?: string };
    fbtrace_id?: string;
  };
}

export interface GraphTemplateComponent {
  type?: string; // HEADER | BODY | FOOTER | BUTTONS
  format?: string; // HEADER: TEXT | IMAGE | VIDEO | DOCUMENT | LOCATION
  text?: string;
  buttons?: Array<{ type?: string; text?: string; url?: string; phone_number?: string }>;
}

export interface GraphTemplate {
  id?: string;
  name: string;
  language: string;
  status: string; // APPROVED | PENDING | REJECTED | PAUSED | DISABLED
  category?: string;
  parameter_format?: string; // POSITIONAL | NAMED
  components?: GraphTemplateComponent[];
}

export interface GraphPhoneNumber {
  id?: string;
  display_phone_number?: string;
  verified_name?: string;
  /** GREEN | YELLOW | RED | UNKNOWN */
  quality_rating?: string;
  /** TIER_250 | TIER_1K | TIER_10K | TIER_100K | TIER_UNLIMITED */
  messaging_limit_tier?: string;
  name_status?: string;
  status?: string;
}

export interface GraphTemplateList {
  data?: GraphTemplate[];
  paging?: { cursors?: { before?: string; after?: string }; next?: string };
}
