import React from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { useSEO } from '@/useSEO'

// Legal text is data, not prose in JSX: drafted for operator protection and
// adversarially reviewed (draft + hostile-attack replacements, 2026-09-15).
// Editing a clause = editing this array. Escaped ASCII (\u2014 etc.) by design.
type Clause = { heading: string; body: string }
const CLAUSES: Clause[] = [
  {
    "body": "This Privacy Policy states the complete and exclusive data practices of the independent individual developer operating threatbase.qzz.io (\"the Operator,\" \"we,\" \"us\") for the website, search console, user accounts, and threat-intelligence feeds offered through threatbase.qzz.io (collectively, \"the Service\"; the published indicator lists, \"the Feeds\"; any person or automated client accessing the Service, whether or not holding an account, \"you\" or \"the User\"). \"Personal Data\" means information that identifies you or is reasonably linkable to you, and \"Account\" means your optional registered profile on the Service.\n\nTerms governing your use of the Service and the Feeds \u2014 including acceptable use, the license and attribution terms for reuse of the Feeds, the prohibition on reselling, republishing, or presenting the Feeds or Reports as your own or as verified, disclaimers of warranty, limitation of liability, user indemnification of the Operator including the Operator's reasonable costs of defense and attorneys' fees, suspension, termination, and key revocation, and dispute resolution \u2014 are set out in the Terms of Service, which prevail over this Policy in the event of conflict as to any matter other than the handling of Personal Data. This Policy governs only the handling of Personal Data and creates no rights for any third party.",
    "heading": "1. Scope, Definitions, and the Operator"
  },
  {
    "body": "We collect Personal Data only in the four categories below, and no others.\n\nAccount data. If you create an Account, we collect the email address you supply or that your chosen identity provider (Google or GitHub) transmits to us; a unique username, which is public; an avatar image URL provided by the identity provider; and the optional profile fields you choose to complete (display name, bio, website). Passwords are retained solely as cryptographic hashes. When you enable TOTP multi-factor authentication, the shared secret is stored server-side. API keys are stored as salted, one-way hashes; the Operator retains only the key prefix, creation time, and usage metadata needed for rate limiting and revocation.\n\nReport data. When you submit a threat report or a dispute, we store the indicator reported, its category, your comment, your reporter alias, and creation/update timestamps, together with the IP address used to submit the report solely for enforcing per-IP daily submission limits and abuse prevention.\n\nServer logs. For every request, our hosting provider Cloudflare records standard edge logs, which may include IP address, user agent string, referring page, and timestamp.\n\nExclusions. Apart from the categories above we collect nothing: no names, phone numbers, physical addresses, payment data, precise geolocation, or search content beyond the indicator you query, and no analytics, tracking, fingerprinting, or advertising data. We do not sell or rent Personal Data for any purpose.",
    "heading": "2. Information We Collect"
  },
  {
    "body": "We state below each purpose of processing and the legal basis we rely on, using GDPR terminology as our uniform reference standard for all users regardless of location. No automated decision-making producing legal or similarly significant effects, and no marketing profiling, occurs on the Service.\n\nProvision of Accounts, sign-in, API keys, and Pro entitlement management: basis, performance of the contract formed by your acceptance of the Terms of Service.\n\nPublication and enforcement of Reports and reporter attribution, and enforcement of submission limits: basis, the legitimate interests of the Operator and of the public in open, accountable threat intelligence, plus performance of the contract.\n\nOperation, security, and debugging of the Service, including Cloudflare bot challenges, Turnstile verification, rate limiting, and the restriction, blocking, suspension, or termination of any Account, API key, Pro entitlement, or access at the Operator's sole discretion, with or without cause and with or without notice: basis, the legitimate interest of the Operator in the security, integrity, and availability of the Service.\n\nCommunication with you regarding your Account, entitlements, disputes, or legal claims, and response to lawful demands: basis, legitimate interest and, where applicable, legal obligation.\n\nConsent-based processing: the Operator stores only strictly-necessary local-storage items and security cookies, none of which require consent under prevailing enforcement practice; where a jurisdiction nonetheless requires consent, providing or retaining the relevant feature constitutes that consent, which you may withdraw by using the feature's own controls or by closing your Account.\n\nNo legal basis stated in this Policy creates or implies any entitlement to continued or uninterrupted access to the Service, to publication or retention of any entry or Report, or to any outcome of the dispute process, and the exercise of the Operator's discretion under this clause is not a breach of this Policy.",
    "heading": "3. How We Use Personal Data and Our Legal Bases"
  },
  {
    "body": "The Service stores in your browser exactly the items listed here and nothing else; all are first-party and strictly necessary for the features described.\n\nlocalStorage key tb:recent: your last five lookups, used to redisplay them in the console. Never transmitted to the Operator. Cleared at any time by you.\n\nsessionStorage key tb:ip_prefill: a one-use hint suggesting your own address in the scanner. Exists only for the current tab and is never transmitted beyond the page.\n\nlocalStorage keys prefixed sb-*-auth-token: your Supabase authentication session, written only after you sign in. Sessions are scoped globally by our provider, meaning a session may persist on a device until you sign out on that device, even if you sign out elsewhere; you are responsible for signing out on devices you do not control.\n\nCookies cf_clearance and __cf_bm: security cookies set by Cloudflare when its managed challenge or the Turnstile check runs, used only to distinguish humans from automated clients.\n\nThe Service sets no tracking, analytics, or advertising cookies, and therefore operates no consent banner. We assume no responsibility for cookies set by third-party sites to which the Service links.",
    "heading": "4. What the Service Stores on Your Device"
  },
  {
    "body": "You acknowledge and agree that the following are public by design, are outside any confidentiality obligation of the Operator, and are not subject to deletion or correction through the rights channel in clause 11: every submitted Report, including the indicator, category, comment, and reporter alias, as rendered publicly at /reported, in exports, and in the Feeds; your username and completed public profile fields wherever the Service displays them; and the Feeds themselves, which consist of indicators (IP addresses, CIDR ranges, domains, URLs, and file hashes) believed to reflect publicly observable malicious activity. An indicator can in principle identify a device associated with a natural person. Entries derived from community submissions or from third-party upstream feeds are ingested without independent verification; the Operator is not responsible for the accuracy, currency, legality, or provenance of upstream or community data and makes no representation that any indicator is accurate, verified, or current. The Operator does not treat the Feeds as Personal Data.\n\nChallenges to feed content proceed through the dispute process on the Service, which requires a signed-in Account, and not under this Policy. The dispute process is offered as a voluntary courtesy only: it creates no duty or undertaking on the part of the Operator to investigate, respond to, correct, remove, or preserve any entry, imposes no standard of care, and confers no right to any particular outcome; the Operator may leave a challenged entry published, or remove any entry without dispute, in each case at its sole discretion.\n\nReuse of the Feeds is governed exclusively by the license and attribution terms of the Terms of Service. Publishing or mirroring the Feeds \u2014 including on GitHub or in upstream projects \u2014 grants no rights beyond those terms: no reseller or passing-off right, no perpetual right, and no license to present the Feeds as verified or as your own. The Operator may revoke any consumer's access and may discontinue or alter the Feeds at any time without notice and without liability.",
    "heading": "5. Information That Is Public by Design"
  },
  {
    "body": "We disclose Personal Data only to the processors listed below, each of which operates under its own published privacy policy, and to no other recipient except as clause 7 permits. The Operator has no other subprocessors and will not engage a payment processor or new subprocessor without first amending this Policy.\n\nCloudflare, Inc.: hosting, edge logging, managed bot challenge, and Turnstile CAPTCHA verification.\n\nSupabase, Inc.: cloud-hosted authentication and the cloud database (hosted in the United States) that stores Accounts, Reports, profile fields, and API-key metadata including key hashes.\n\nGitHub, Inc.: source-code hosting and public mirroring of the Feeds.\n\nGoogle LLC and GitHub, Inc. (identity providers): when you choose to sign in with Google or GitHub OAuth, that provider authenticates you and transmits your name, email address, and profile/avatar URL to the Service; the Operator never receives or stores your provider password.\n\nSupabase session tokens are additionally held by your browser as described in clause 4.",
    "heading": "6. Service Providers and Subprocessors"
  },
  {
    "body": "In addition to the disclosures in clauses 5 and 6, we may disclose Personal Data: where you authorize or direct the disclosure; and, without notice to you where notice is prohibited or impracticable, in response to valid legal process, or where the Operator in good faith believes disclosure is reasonably necessary to comply with applicable law, to protect the Service, its Operator, or other users, to enforce the Terms of Service, or to respond to claims that content published through the Service is unlawful. The Operator is an individual without legal budget; responding to demands is subject to practical limits, and you agree that the Operator's handling of such demands is performed on an as-available basis and is not itself a breach of this Policy.",
    "heading": "7. Disclosure, Legal Process, and Enforcement"
  },
  {
    "body": "The Operator is located in Nepal. The processors named in clause 6 and the infrastructure of the Service are located principally in the United States. By using the Service you acknowledge that your Personal Data is transferred to, processed, and stored in jurisdictions whose data-protection laws differ from those of Nepal and of your country of residence, and you consent to that transfer. Nepal and the hosting jurisdictions impose no general cross-border mechanism that the Operator could enforce against its own infrastructure, and the Operator makes no representation that safeguards equivalent to EU Standard Contractual Clauses, the UK IDTA, or any adequacy framework apply to the Service.",
    "heading": "8. International Transfers"
  },
  {
    "body": "Report submissions and their associated submission IP addresses are retained only for the purposes stated in clause 2 \u2014 enforcement of per-IP daily submission limits and abuse prevention \u2014 and the Operator purges stale per-IP submission records on a rolling basis rather than retaining them indefinitely. Once a Report is published, the Report content and its public alias are retained as public-by-design content under clause 5 for as long as the Report remains in effect; the Operator does not store any Personal Data of a reporter beyond what clause 2 lists.\n\nRetention is category-specific, practical, and not indefinite. Accounts and profile data are retained until you close the Account or until we receive and verify a deletion request under clause 11, and are deleted within 30 days of such verification; backup rotation at our processor may extend complete erasure by up to a further 30 days. API keys and their metadata are deleted upon revocation or Account closure. Cloudflare edge logs are retained only for the short period published by Cloudflare, ordinarily fewer than 30 days. Items in your browser (clause 4) persist until you clear them. Once a Report is published it is ingested into the Feeds and distributed to mirrors, upstream projects that consume the Feeds by default, and third-party blocklist consumers; Account deletion removes the link between the Report and your login email but does not remove the public alias, and the Operator cannot recall content from downstream copies and does not undertake to do so.",
    "heading": "9. Retention"
  },
  {
    "body": "We maintain the security measures inherent to the stack described in clauses 4 and 6 and no more: HTTPS throughout, hashed passwords, salted one-way hashes of API keys so that a database compromise yields no usable keys, optional TOTP multi-factor authentication, Cloudflare managed challenge and Turnstile verification, and per-IP rate limits. You acknowledge that the Service is a zero-revenue hobby system operated by one person; that no method of transmission or storage is guaranteed secure; and that we do not warrant the security or confidentiality of any data, including your Account email and the indicators you query, which are themselves public by design under clause 5. If the Operator becomes aware of a confirmed compromise of Personal Data within its direct control, the Operator will, where lawful and practicable, notify affected Account holders by email or site notice without undue delay, and will state in that notice only what is then known. Good-faith, non-destructive security findings may be reported to threatbasepro@gmail.com; the Operator requests that findings remain undisclosed for 30 days pending remediation, and offers no bug bounty.",
    "heading": "10. Security and Breach Response"
  },
  {
    "body": "Where applicable law grants you rights of access, correction, deletion, restriction, or portability with respect to your Personal Data, you may exercise them by email to threatbasepro@gmail.com from the address associated with your Account or by otherwise demonstrating control of that address. Because the Operator is a solo hobby operator, that email channel is the only channel the Operator can reliably process: requests received through other channels may not be acted upon, and the Operator assumes no statutory response deadline. The Operator may refuse unverifiable or manifestly excessive requests and will respond within 30 days or within such longer period as its capacity as a solo hobby operator reasonably requires. As the Personal Data held for a typical Account is limited to an email address and profile fields, access responses will reflect that scope, and deletion operates as qualified in clause 9. No sale of Personal Data occurs, so no \"Do Not Sell\" mechanism is offered; no rights are recognized with respect to public Feeds content except through the dispute process in clause 5. The Operator is not established in the EU, EEA, or United Kingdom, has not appointed a representative in any of those jurisdictions, and makes no representation about the availability or necessity of any supervisory-authority or officer channel; nothing in this Policy extends or restricts any right you may hold under the law of your country of residence. The Service is not directed at persons under 16 years of age; minors under 16 must not create Accounts or submit Reports, and a parent or guardian may request deletion of a minor's Account data through the contact above.",
    "heading": "11. Your Rights, Requests, and Children"
  },
  {
    "body": "The Operator may amend this Policy at any time by posting the revised text at /privacy on threatbase.qzz.io; the amended Policy takes effect immediately upon posting, and continued access to or use of the Service after posting constitutes acceptance. The Operator may, but is not obligated to, note material changes. No amendment applies retroactively to excuse processing that was permitted under the Policy then in effect. Notice to you is effective upon posting at /privacy or upon the Operator's first attempt to send email to the address associated with your Account; the Operator is not responsible for failed delivery, spam filtering, or messages you do not read.\n\nGoverning law and forum: this Policy, and every claim arising out of or relating to it or to the data practices it describes \u2014 including claims concerning the collection, publication, retention, disclosure, or restriction of data, and claims concerning the accuracy of the Service or of the Feeds \u2014 are governed by the laws of Nepal without regard to conflict-of-laws rules, and are subject to the exclusive jurisdiction of the courts located in Nepal, regardless of the form of action, whether in contract, tort, statute, or otherwise.\n\nSeverability: if any provision of this Policy is held invalid or unenforceable, that provision shall be reformed to the minimum extent necessary to render it enforceable, and every remaining provision shall survive independently.\n\nTHE FEEDS ARE UNVERIFIED, MACHINE-GENERATED DATA. THE FEEDS CONSIST OF INDICATORS AGGREGATED FROM THIRD-PARTY OPEN SOURCES, AUTOMATED SENSORS, AND COMMUNITY SUBMISSIONS WITHOUT INDEPENDENT VERIFICATION BY THE OPERATOR, AND MAY CONTAIN ERRORS, OMISSIONS, AND STALE ENTRIES. THE FEEDS ARE NOT ADVICE AND MUST NOT BE RELIED UPON FOR ACCESS-CONTROL, BLOCKING, SECURITY, OR LEGAL DECISIONS.\n\nEXCEPT AS EXPRESSLY STATED IN THIS POLICY, THE SERVICE, THE FEEDS, AND ALL INFORMATION PROCESSED OR DISPLAYED THROUGH THEM ARE PROVIDED \"AS IS\" AND \"AS AVAILABLE,\" WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED, INCLUDING, WITHOUT LIMITATION, THE IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, ACCURACY, COMPLETENESS, CURRENCY, NON-INFRINGEMENT, TITLE, AND THE ABSENCE OF VIRUSES OR OTHER HARMFUL COMPONENTS, AND WITHOUT ANY WARRANTY THAT PERSONAL DATA WILL REMAIN SECURE, CONFIDENTIAL, OR UNDISCLOSED, OR THAT ACCESS TO THE SERVICE WILL BE CONTINUOUS OR UNRESTRICTED.\n\nTO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, IN NO EVENT SHALL THE OPERATOR BE LIABLE FOR ANY DAMAGES WHATSOEVER, DIRECT, INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, EXEMPLARY, OR PUNITIVE, ARISING OUT OF OR RELATING TO THIS POLICY, THE SERVICE, OR THE FEEDS \u2014 INCLUDING WITHOUT LIMITATION DAMAGES CAUSED BY OR ALLEGED TO BE CAUSED BY ANY ACTION TAKEN OR OMITTED IN RELIANCE ON THE FEEDS OR ANY CONTENT DISPLAYED OR PUBLISHED THROUGH THEM, SUCH AS BLOCKING, FILTERING, THROTTLING, BLACKLISTING, OR DENIAL OF ACCESS TO ANY NETWORK, HOST, DOMAIN, ADDRESS, SERVICE, OR PERSON BY THE OPERATOR OR BY ANY THIRD-PARTY CONSUMER OF THE FEEDS, AND INCLUDING DAMAGES ARISING FROM THE COLLECTION, USE, DISCLOSURE, ACCURACY, RETENTION, OR SECURITY OF DATA AND FROM ANY SUSPENSION OR TERMINATION OF AN ACCOUNT, REVOCATION OF API KEYS OR ENTITLEMENTS, OR INTERRUPTION OR UNAVAILABILITY OF THE SERVICE \u2014 WHETHER IN CONTRACT, TORT (INCLUDING NEGLIGENCE), STRICT LIABILITY, STATUTE, OR OTHERWISE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGES. WHERE APPLICABLE LAW DOES NOT PERMIT THE FULL EXCLUSION OF LIABILITY, THE OPERATOR'S TOTAL AGGREGATE LIABILITY FOR ALL CLAIMS ARISING OUT OF OR RELATING TO THE SERVICE AND THE FEEDS SHALL NOT EXCEED THE GREATER OF US$100 (OR ITS NEPALESE-RUPEE EQUIVALENT) OR THE SUM, IF ANY, YOU HAVE PAID TO THE OPERATOR FOR THE SERVICE IN THE TWELVE MONTHS PRECEDING THE FIRST EVENT GIVING RISE TO LIABILITY. WHERE APPLICABLE LAW DOES NOT PERMIT THE EXCLUSION OF IMPLIED WARRANTIES OR THE LIMITATION OF LIABILITY, THE EXCLUDED OR LIMITED PROVISIONS SHALL BE READ DOWN AND ENFORCED TO THE GREATEST EXTENT PERMITTED.",
    "heading": "12. Changes, Governing Law, Severability, and Disclaimer of Warranties"
  }
]

/** Anchor id for a clause heading, used by the on-page index links. */
const slug = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

export default function PrivacyPage() {
  const prefersReducedMotion = useReducedMotion()

  useSEO({
    title: 'Privacy Policy | Threatbase',
    description: 'How Threatbase, a cyber threat intelligence platform, handles personal data: exact collection, legal bases, device storage, subprocessors, retention, transfers, breach response, and rights requests.',
    path: '/privacy',
  })

  return (
    <main className="relative min-h-[100dvh] overflow-hidden bg-[#050505] font-sans text-slate-300 selection:bg-red-500/30">
      {/* Ambient ruby + platinum wash behind the header. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[460px]"
        style={{
          background:
            'radial-gradient(680px 300px at 28% -8%, rgba(207,23,51,0.13), transparent 70%), radial-gradient(560px 300px at 82% 6%, rgba(205,211,222,0.06), transparent 70%)',
        }}
      />

      <div className="relative mx-auto max-w-5xl px-6 pt-32 pb-32 lg:px-10">
        <motion.div
          initial={prefersReducedMotion ? false : { opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-red-500/20 bg-red-500/5 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-red-400">
            Legal Information
          </div>

          <h1 className="mb-6 text-5xl font-black leading-[0.95] tracking-tighter text-white md:text-7xl">
            Privacy Policy.
          </h1>
          <p className="max-w-2xl text-lg leading-relaxed text-slate-400">
            A complete, plain statement of how Threatbase handles your personal
            data. No trackers, no ad network, no sale of data.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 border-y border-white/5 py-4 font-mono text-xs text-slate-500">
            <span>Effective: September 15, 2026</span>
            <span className="hidden text-slate-700 sm:inline">/</span>
            <span>Supersedes all prior versions</span>
            <span className="hidden text-slate-700 sm:inline">/</span>
            <Link to="/terms" className="text-slate-400 transition-colors hover:text-white">
              Terms of Service &rarr;
            </Link>
          </div>
        </motion.div>

        <div className="mt-16 grid gap-12 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-16">
          {/* Section index. App routes anchor clicks through Lenis, so these
              jump-links scroll smoothly and land under the sticky navbar. */}
          <nav aria-label="On this page" className="lg:sticky lg:top-28 lg:self-start">
            <p className="mb-4 text-[11px] font-bold uppercase tracking-widest text-slate-500">On this page</p>
            <ul className="space-y-2.5 text-sm">
              {CLAUSES.map((c, i) => (
                <li key={c.heading}>
                  <a
                    href={`#${slug(c.heading)}`}
                    className="group flex gap-2.5 text-slate-500 transition-colors hover:text-white"
                  >
                    <span className="font-mono text-xs leading-6 text-slate-700 transition-colors group-hover:text-red-500">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <span className="leading-6">{c.heading.replace(/^\d+\.\s*/, '')}</span>
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          {/* Clauses. */}
          <div className="max-w-[68ch]">
            <div className="space-y-14 text-base leading-relaxed text-slate-400 md:text-lg">
              {CLAUSES.map((c) => (
                <section key={c.heading} id={slug(c.heading)} className="scroll-mt-28">
                  <h2 className="mb-4 text-xl font-bold tracking-tight text-white md:text-2xl">
                    {c.heading}
                  </h2>
                  {c.body.split('\n\n').map((para, i) =>
                    // ALL-CAPS paragraphs are the operative disclaimers; set them apart.
                    /^[^\p{Ll}]+$/u.test(para) ? (
                      <p
                        key={i}
                        className="my-5 rounded-lg border border-red-500/15 bg-red-500/[0.04] px-5 py-4 text-sm font-semibold leading-relaxed text-white md:text-base"
                      >
                        {para}
                      </p>
                    ) : (
                      <p key={i} className="my-4">{para}</p>
                    )
                  )}
                </section>
              ))}
            </div>

            <div className="mt-16 rounded-2xl border border-white/10 bg-white/[0.02] p-6 md:p-8">
              <p className="text-sm leading-relaxed text-slate-400">
                Questions about this policy or your data? Email{' '}
                <a href="mailto:threatbasepro@gmail.com" className="font-medium text-white hover:underline">
                  threatbasepro@gmail.com
                </a>
                . The governing terms for reuse and conduct live in the{' '}
                <Link to="/terms" className="font-medium text-white hover:underline">Terms of Service</Link>.
              </p>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
