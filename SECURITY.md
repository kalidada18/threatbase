# Security Policy

Threatbase is a threat-intelligence service. We take the security of the
platform and of the people who use it seriously, and we welcome reports from
security researchers.

## Reporting a vulnerability

**Please do not open a public issue for security problems.**

Report privately through GitHub Security Advisories:

- https://github.com/kalidada18/threatbase/security/advisories/new

This opens a private channel visible only to you and the maintainers. A
machine-readable pointer to this policy is published at
`https://threatbase.qzz.io/.well-known/security.txt` ([RFC 9116](https://www.rfc-editor.org/rfc/rfc9116)).

### What to include

A good report lets us reproduce the issue quickly:

- The type of issue (for example: XSS, IDOR, auth bypass, SSRF, injection).
- The affected URL, endpoint, or component.
- Step-by-step reproduction, including any request/response or payload.
- The impact you believe it has.
- Your environment (browser, OS) if relevant.

## Response targets

Threatbase is maintained by a small team, so these are goals rather than
contractual guarantees:

| Stage | Target |
| --- | --- |
| Acknowledge your report | within 3 business days |
| Initial assessment | within 7 business days |
| Fix or mitigation for a confirmed issue | as fast as severity warrants |

We will keep you updated through the advisory thread and credit you once a
fix ships, unless you prefer to stay anonymous.

## Supported versions

Threatbase is a continuously deployed web application. There are no released
versions to patch: only the current production deployment at
`https://threatbase.qzz.io` is supported. Fixes ship to production directly.

## Scope

**In scope**

- The web application at `https://threatbase.qzz.io`.
- The public API under `/api/v1/` (scanning and reporting).
- Authentication, authorization, and handling of user data (accounts,
  reports, profiles).

**Out of scope**

- **Feed contents.** Threatbase indexes malicious IPs, domains, URLs, and
  hashes on purpose. A malicious indicator appearing in a feed is the product
  working as intended, not a vulnerability.
- Volumetric denial-of-service or traffic-flooding tests.
- Reports from automated scanners with no demonstrated, reproducible impact.
- Social engineering, physical attacks, and issues requiring a compromised
  device or a privileged local account.
- Missing best-practice headers or configuration with no concrete exploit.

## Safe harbor

We consider security research conducted in good faith and in line with this
policy to be authorized. When you research within scope, we ask that you:

- Avoid privacy violations, data destruction, and service degradation.
- Only interact with accounts and data you own or have explicit permission
  to test. Do not access, modify, or exfiltrate other users' data.
- Give us a reasonable chance to remediate before any public disclosure.

Act in good faith within these bounds and we will not pursue or support legal
action against you for your research.
