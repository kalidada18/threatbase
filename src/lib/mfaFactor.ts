/**
 * GoTrue keeps unverified factors. `mfa.enroll()` creates one immediately and it
 * only becomes `verified` once a TOTP code is confirmed — so an abandoned setup
 * (QR shown, never confirmed) leaves a permanent `unverified` row behind.
 *
 * Every caller that acts on "the user's authenticator" must therefore pick the
 * VERIFIED factor, not the first one. Both places that got this wrong broke 2FA
 * in opposite directions:
 *
 *  - the setup card read the first entry, so a leftover unverified factor masked
 *    a real, enabled one and the card wrongly reported "Disabled";
 *  - the login challenge read the same first entry, so it challenged an
 *    unverified factor — every code came back "Invalid verification code" and
 *    the account could not be signed into at all while a stale row sorted first.
 */
export function pickVerifiedTotpFactor<T extends { status?: string }>(
  factors: T[] | null | undefined,
): T | null {
  return (factors ?? []).find((f) => f.status === 'verified') ?? null
}
