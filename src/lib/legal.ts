// Legal pages (/terms, /privacy).
//
// The content is admin-editable rather than committed to the repo, because
// every deployment needs different text — different legal entity, country,
// data practices, sub-processors — and a policy that ships in the source tree
// is a policy someone publishes without reading.
//
// IMPORTANT: the starter drafts below are a STRUCTURE, not legal advice. They
// exist so an operator starts from the right set of sections instead of a
// blank box, and every one of them carries placeholders that must be filled
// in and reviewed by a qualified lawyer for the relevant jurisdiction before
// publishing. Nothing here inserts itself: an admin has to deliberately load a
// draft, and the editor says all of this in the UI too.

export const LEGAL_REVIEW_WARNING =
  "This is an unreviewed starting draft, not legal advice. Replace every [PLACEHOLDER], " +
  "adapt it to how you actually handle data, and have a qualified lawyer review it for your " +
  "jurisdiction before publishing.";

// A deliberately plain renderer — no markdown dependency for what is
// fundamentally headings, paragraphs and bullets. Anything it doesn't
// recognise renders as a paragraph, so unexpected input degrades to readable
// text rather than disappearing.
export type LegalBlock =
  | { type: "h2"; text: string }
  | { type: "h3"; text: string }
  | { type: "p"; text: string }
  | { type: "ul"; items: string[] };

export function parseLegalContent(content: string): LegalBlock[] {
  const blocks: LegalBlock[] = [];
  let list: string[] = [];

  const flushList = () => {
    if (list.length) {
      blocks.push({ type: "ul", items: list });
      list = [];
    }
  };

  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    if (!line) {
      flushList();
      continue;
    }
    if (line.startsWith("- ")) {
      list.push(line.slice(2).trim());
      continue;
    }
    flushList();
    if (line.startsWith("### ")) blocks.push({ type: "h3", text: line.slice(4).trim() });
    else if (line.startsWith("## ")) blocks.push({ type: "h2", text: line.slice(3).trim() });
    else blocks.push({ type: "p", text: line });
  }
  flushList();
  return blocks;
}

export const STARTER_TERMS = `## 1. Who we are
These terms govern your use of [SERVICE NAME], operated by [LEGAL ENTITY NAME],
registered at [REGISTERED ADDRESS] ("we", "us"). Contact us at [CONTACT EMAIL].

## 2. The service
We provide scheduling software that lets a business publish a booking page and
accept appointments or event registrations from its own customers.

Two different people use this service, and these terms apply to both:
- **Business users**, who create an account and publish a booking page.
- **Invitees**, who book a time or buy a ticket through someone's booking page.

Where a term applies to only one of them, it says so.

## 3. Accounts
- You must give accurate registration details and keep them current.
- You are responsible for activity under your account and for keeping your
  credentials secure.
- You must be at least [MINIMUM AGE] years old to create an account.
- We may suspend or terminate an account that breaches these terms.

## 4. Acceptable use
You may not use the service to:
- break any applicable law, or infringe anyone's rights
- send unsolicited bulk messages
- upload malicious code, or attempt to gain unauthorised access
- resell or white-label the service except as permitted in writing

## 5. Your content
You keep ownership of the content you upload (branding, event artwork, form
questions, and similar). You grant us the limited licence needed to host and
display it in order to operate the service. You are responsible for having the
rights to everything you upload.

## 6. Bookings and payments
- A booking is an arrangement between the business and its invitee. We provide
  the software; we are not a party to it.
- Where a business charges for a booking or a ticket, payments are processed by
  our payment providers, [PAYMENT PROVIDERS]. Their terms apply to that
  processing.
- Refunds and cancellations for a specific booking are the business's
  responsibility and follow the policy it publishes.
- Subscription fees for the service itself are described on our pricing page and
  billed in advance. Except where the law requires otherwise, they are
  non-refundable for a period already started.

## 7. Availability
We aim to keep the service available but do not guarantee uninterrupted access.
We may change, suspend or discontinue features, and will give reasonable notice
of material changes where we can.

## 8. Termination
You may stop using the service and delete your account at any time. On deletion
we handle your data as described in the Privacy Policy.

## 9. Liability
[THIS SECTION MUST BE DRAFTED BY YOUR LAWYER. Limitation of liability is
jurisdiction-specific, and consumer-protection law may restrict what you can
exclude. Do not publish generic wording here.]

## 10. Changes to these terms
We may update these terms. We will post the updated version here and update the
"last updated" date. Material changes will be notified to account holders at the
email address on file.

## 11. Governing law
These terms are governed by the laws of [JURISDICTION], and disputes are subject
to the courts of [JURISDICTION].
`;

export const STARTER_PRIVACY = `## Who we are
[LEGAL ENTITY NAME], registered at [REGISTERED ADDRESS], is the controller of
the personal data described here. Contact us at [CONTACT EMAIL].
[IF YOU HAVE A DATA PROTECTION OFFICER OR AN EU/UK REPRESENTATIVE, NAME THEM HERE.]

## Whose data we handle
- **Business users** who create an account with us.
- **Invitees**, whose details are submitted when they book with one of those
  businesses. For that data the business is the controller and we act as its
  processor.

## What we collect
From business users:
- account details: name, email, business name, password (stored hashed)
- profile and branding: logo, colours, ticket artwork
- availability, event types and booking settings
- billing details, held by our payment provider — we store identifiers and
  subscription status, not full card numbers
- security data: two-factor secrets, sign-in attempts, session information

From invitees:
- name and email address
- answers to any questions the business chose to ask on its booking form
- booking, ticket and check-in records
- payment status for paid bookings, processed by our payment provider

Automatically:
- technical logs including IP address, and error diagnostics used to keep the
  service working

## Why we use it, and our legal basis
- To provide the service — performance of a contract.
- To secure it, prevent abuse and keep records — legitimate interests.
- To take payments and meet accounting obligations — contract and legal
  obligation.
- To send service emails such as confirmations and reminders — contract.
- [ADD MARKETING HERE ONLY IF YOU DO IT, AND STATE THE CONSENT BASIS.]

## Who we share it with
- Payment providers: [PAYMENT PROVIDERS]
- Email delivery: [EMAIL PROVIDER]
- Hosting and database: [HOSTING PROVIDER]
- File storage: [STORAGE PROVIDER]
- Calendar and video providers, where a user connects one: [PROVIDERS]

We do not sell personal data.
[LIST EVERY SUB-PROCESSOR YOU ACTUALLY USE AND KEEP THIS CURRENT.]

## International transfers
[DESCRIBE WHERE DATA IS STORED AND PROCESSED, AND THE SAFEGUARD YOU RELY ON FOR
ANY TRANSFER OUT OF THE UK/EEA. THIS DEPENDS ON YOUR HOSTING REGION.]

## How long we keep it
- Account data: for the life of the account, then deleted after the recovery
  window described in our deletion process.
- Booking and ticket records: [RETENTION PERIOD], as they may be needed for
  accounting and dispute resolution.
- Error and security logs: pruned automatically on a rolling basis.
[SET PERIODS THAT MATCH WHAT YOU ACTUALLY DO.]

## Your rights
Depending on where you live, you may have the right to access, correct, delete,
restrict, object to, or port your personal data, and to complain to a
supervisory authority.

Business users can delete their account from the dashboard, which begins the
deletion process described in these terms. Invitees should contact the business
they booked with in the first instance, or us at [CONTACT EMAIL].

[IF YOU SERVE THE EU/UK, NAME THE RELEVANT SUPERVISORY AUTHORITY.]

## Cookies
We use cookies that are strictly necessary to sign you in and keep your session
secure. [IF YOU ADD ANALYTICS OR ANY NON-ESSENTIAL COOKIE, YOU MUST DESCRIBE IT
HERE AND OBTAIN CONSENT WHERE REQUIRED.]

## Security
We use encryption in transit, hash passwords, encrypt sensitive stored secrets,
and offer two-factor authentication. No system is perfectly secure, and we
cannot guarantee absolute security.

## Children
The service is not directed at children under [AGE], and we do not knowingly
collect their data.

## Changes
We will post updates here and change the "last updated" date. Material changes
will be notified to account holders.
`;
