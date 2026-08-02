# Bookify Commercial License

Copyright © 2026 **[YOUR NAME / COMPANY NAME — fill this in]**. All rights reserved.

This is a commercial end-user licence agreement ("Agreement"). It is **not**
an open-source licence (MIT, Apache, GPL, etc.) — no such rights are granted.
By purchasing, downloading, cloning, or otherwise obtaining a copy of the
Bookify source code (the "Software"), you ("Licensee") agree to be bound by
the terms below. If you do not agree, do not use the Software.

"the Software" means the Bookify source code as delivered to you, including
any modifications, rebranding, custom features, or other derivative works you
create from it. Renaming or restyling it for your own business does not
change what licence governs it.

---

## 1. Grant of licence

Subject to full payment of the applicable fee and compliance with this
Agreement, Licensor grants Licensee a non-exclusive, non-transferable,
worldwide licence to:

- **Use and modify** the Software's source code for Licensee's own purposes;
- **Deploy the Software as a live, production, customer-facing service**
  ("Deployment") — this is the Software's intended use: a multi-tenant
  booking SaaS where Licensee's own business customers ("End Users") sign up,
  configure their availability, and take bookings from their own customers
  ("Invitees").

### 1.1 One purchase = one Deployment

**One purchased licence covers exactly one production Deployment** — one
live domain/URL serving End Users as the actual product. This is not the
same as "one End User": under a single Deployment, Licensee may onboard
unlimited End Users (businesses using the booking platform) and unlimited
Invitees (their customers), consistent with the Software's multi-tenant
design.

A non-public staging, development, or preview copy of the *same* Deployment
(e.g. a `staging.yourdomain.com` mirror used only for testing before it
reaches the production domain) is covered under the same licence and does
not require a separate purchase. A **second live, customer-facing domain
running an independent instance** — a second unrelated business, a
white-labeled copy operated for a separate client, etc. — is a second
Deployment and requires a second licence.

### 1.2 What Licensee may NOT do

- **Resell, redistribute, sublicense, or otherwise transfer the Software's
  source code** — modified or unmodified, in whole or in part — to any third
  party. This includes publishing it (publicly or privately) in a form that
  gives another party access to the underlying source, using it as the basis
  for a competing product-to-be-sold, or providing it to contractors/agencies
  in a way that leaves them with a retained copy after the engagement ends.
  (Deploying the *running application* so that End Users and Invitees can use
  it through their browser — the entire point of a booking SaaS — is not
  "redistributing the source" and is expressly permitted under §1.)
- Remove or alter this licence file, or any copyright/attribution notices
  embedded in the source, except where this Agreement explicitly permits
  rebranding of user-facing product name/branding (see `REBRANDING.md`).
- Use the Software, or Licensor's name, to imply Licensor's endorsement of
  Licensee's business.
- Sell or offer the Software itself (as source code, as a "starter kit," as a
  template, etc.) on any marketplace, storefront, or direct sale — that
  right is reserved exclusively to Licensor.

## 2. Ownership

The Software is licensed, not sold. Licensor retains all right, title, and
interest in and to the Software, including all intellectual property rights.
This Agreement grants Licensee only the specific rights stated in §1 —
nothing else is implied.

## 3. Support and updates

Licensee is entitled to **[12] months** of support and updates from the date
of purchase, specifically:

- Bug fixes and security patches to the version of the Software as delivered;
- Access to subsequent versions released by Licensor during the support
  window.

Support does **not** include custom feature development, help with
Licensee's own modifications, or infrastructure/hosting troubleshooting
(Vercel, Neon, Stripe, Google/Microsoft OAuth, etc. are each governed by
their own separate terms between Licensee and those providers — Licensor is
not a party to those relationships and bears no responsibility for them).

After the support window lapses, Licensee may continue using the version of
the Software already delivered indefinitely, but is no longer entitled to
updates or support unless the window is renewed at Licensor's then-current
rate.

## 4. Fees

The licence fee is due in full before access to the Software is granted.
Licensor reserves the right to change pricing for future sales; this does
not affect licences already granted.

## 5. Warranty disclaimer

THE SOFTWARE IS PROVIDED "AS IS," WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE, AND NONINFRINGEMENT. LICENSOR DOES NOT
WARRANT THAT THE SOFTWARE WILL BE ERROR-FREE, SECURE, OR UNINTERRUPTED, OR
THAT IT WILL MEET LICENSEE'S SPECIFIC REQUIREMENTS. LICENSEE IS SOLELY
RESPONSIBLE FOR EVALUATING THE SOFTWARE'S FITNESS FOR THEIR INTENDED USE,
INCLUDING ANY LEGAL/REGULATORY REQUIREMENTS (E.G. GDPR, PCI-DSS VIA THEIR
PAYMENT PROVIDER) THAT APPLY TO THEIR OWN DEPLOYMENT AND JURISDICTION.

## 6. Limitation of liability

TO THE MAXIMUM EXTENT PERMITTED BY LAW, LICENSOR'S TOTAL LIABILITY ARISING
OUT OF OR RELATED TO THIS AGREEMENT OR THE SOFTWARE SHALL NOT EXCEED THE
AMOUNT ACTUALLY PAID BY LICENSEE FOR THE LICENCE. LICENSOR SHALL NOT BE
LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE
DAMAGES, INCLUDING LOST PROFITS OR LOST DATA, EVEN IF ADVISED OF THE
POSSIBILITY OF SUCH DAMAGES.

## 7. Termination

This licence terminates automatically, without notice, if Licensee breaches
any term of this Agreement — in particular §1.2. Upon termination, Licensee
must immediately cease all use of the Software and destroy all copies in
their possession. Sections 2, 5, 6, and 8 survive termination.

## 8. General

- **Entire agreement.** This document is the entire agreement between the
  parties regarding the Software and supersedes any prior discussion.
- **Severability.** If any provision is held unenforceable, the remainder of
  the Agreement remains in effect.
- **Governing law.** This Agreement is governed by the laws of
  **[YOUR JURISDICTION — fill this in, e.g. "the State of Delaware, USA" or
  "India"]**, without regard to conflict-of-law principles.
- **Assignment.** Licensee may not assign this Agreement without Licensor's
  prior written consent, except as part of a sale of substantially all of
  Licensee's business, provided the acquiring party assumes these terms.

---

### Before this document is used for a real sale

Two placeholders above still need your input — search for the bracketed
text:

1. **`[YOUR NAME / COMPANY NAME]`** in the copyright line — your personal
   name or registered business entity, whichever will be the actual
   licensor of record.
2. **`[YOUR JURISDICTION]`** in §8 — the governing-law choice is a real legal
   decision (which courts would hear a dispute, which country/state's
   contract law applies). If you're not sure, this is worth a few minutes
   with a lawyer rather than a guess — it's the one clause here that's
   genuinely hard to change retroactively once licences have already been sold
   under it.

The **`[12]`** months of support in §3 is a placeholder for the specific
number you chose (fixed window, renewable) — edit it directly to whatever
duration you decide, and update it consistently if your sales copy quotes a
different number.
