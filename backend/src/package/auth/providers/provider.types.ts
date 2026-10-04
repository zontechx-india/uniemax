/**
 * Provider **ports** — the contracts the auth package depends on for anything
 * that touches the outside world (email, SMS, OAuth token verification) or a
 * swappable algorithm (password hashing).
 *
 * The core auth logic (strategies, verification engine, session engine) only
 * ever sees these interfaces. Plugging in a real provider later (SES/Resend,
 * Twilio/MSG91, google-auth-library, Sign in with Apple) means writing one
 * adapter that implements the port and registering it in `providers/index.ts`
 * — no other file changes.
 */

/** How a verification code travels to the user. */
export type CodeChannel = "EMAIL" | "SMS";

/** Why a verification code was issued (mirrors the `OtpPurpose` enum values used by auth). */
export type CodePurpose = "LOGIN" | "LINK" | "EMAIL_VERIFY" | "PASSWORD_RESET";

/** Social sign-in providers (mirrors the `AuthProvider` Prisma enum). */
export type OAuthProviderName = "GOOGLE" | "APPLE";

/** A verification-code message ready to be delivered. */
export interface CodeMessage {
  destination: string; // email address or phone number
  code: string;
  purpose: CodePurpose;
  expiresInMinutes: number;
}

/** Sends transactional email (verification codes today; receipts etc. later). */
export interface EmailSender {
  sendCode(message: CodeMessage): Promise<void>;
}

/** Result of starting a phone verification. */
export interface StartedPhoneVerification {
  /**
   * What the engine must store to check the code later: the provider's
   * verification id (managed services like Message Central), or a local code
   * hash (console fallback). Opaque to the engine either way.
   */
  providerRef: string;
  expiresInMinutes: number;
  /** Console fallback only — echoed as `devCode` outside production. */
  devCode?: string;
}

/**
 * Phone-OTP verification. Modeled around *managed* OTP services (the provider
 * generates, delivers, and checks the code — e.g. Message Central): `start`
 * kicks off a verification, `check` validates the user-entered code.
 * `check` throws `HttpError.unauthorized` on a wrong/expired code.
 */
export interface PhoneOtpProvider {
  start(phone: string): Promise<StartedPhoneVerification>;
  check(args: { phone: string; code: string; providerRef: string }): Promise<void>;
}

/** The normalized identity an OAuth verifier extracts from a provider token. */
export interface OAuthProfile {
  /** The provider's stable user id (`sub` claim) — never changes for a user. */
  providerAccountId: string;
  email?: string;
  /** Whether the *provider* vouches for the email (Google `email_verified`). */
  emailVerified: boolean;
  name?: string;
  avatarUrl?: string;
}

/** Verifies a provider-issued ID token and returns the profile inside it. */
export interface OAuthVerifier {
  readonly provider: OAuthProviderName;
  verifyIdToken(idToken: string): Promise<OAuthProfile>;
}

/** Password hashing algorithm (bcrypt today; argon2 would be one adapter). */
export interface PasswordHasher {
  hash(plain: string): Promise<string>;
  verify(plain: string, hash: string): Promise<boolean>;
  /** True when a stored hash should be re-made at today's work factor. */
  needsRehash(hash: string): boolean;
}
