# Email deliverability

Every important thing this app does ends in an email — verification, booking
confirmations, reminders, ticket links, password resets. If those land in spam,
the product looks broken in a way no error log will show you.

This is the DNS and configuration side. It assumes email is already working
(`/admin/settings/email`); if the app is only logging emails to the journal,
fix that first — that is a configuration problem, not a deliverability one.

## How this app sends

Worth understanding before changing DNS, because it decides which domain you
need to authenticate.

All mail goes out from **one** address — whatever is configured as the from
address for your provider (`gmailSmtpFrom`, `sesFromAddress`, or `SMTP_FROM`).
Mail about a tenant's booking is **not** sent from that tenant's own address.
Instead the event type's `replyToEmail`, when set, becomes the `Reply-To`
header, so a customer replying reaches the business.

That is deliberate, and it is the only workable design: you cannot publish SPF
or DKIM for domains you do not control, so sending as `owner@some-salon.com`
would fail authentication and land in spam. **You only ever need to
authenticate your own sending domain.**

## The three records

Set all three on the domain in your from address. If you send as
`no-reply@bookify.example.com`, that is the domain that needs them.

### 1. SPF — who may send

One TXT record at the sending domain. You must have exactly **one** SPF record;
two is a permanent failure, not a warning.

```
v=spf1 include:amazonses.com -all
```

Use the include your provider documents (`include:_spf.google.com` for Google
Workspace, `include:amazonses.com` for SES, etc.). If you already have an SPF
record, add the include to it — do not add a second record.

`-all` (hard fail) is stricter than `~all` (soft fail). Start with `~all` if you
are unsure you have listed every sender, then tighten to `-all` once DMARC
reports show nothing legitimate failing.

### 2. DKIM — cryptographic signature

Your provider generates the keys and gives you the records to publish; you
cannot invent these.

- **Amazon SES** — Verified identities → your domain → DKIM. Publish the three
  provided CNAMEs. SES will not send from the domain until it verifies.
- **Google Workspace** — Admin console → Apps → Gmail → Authenticate email.
  Generate, publish the TXT, then click **Start authentication** — a step
  people skip, leaving DKIM generated but inactive.
- **Other SMTP** — check the provider's docs; every reputable one supports DKIM.

DKIM is the record that matters most for reaching Gmail and Outlook inboxes.

### 3. DMARC — policy and reporting

```
_dmarc.bookify.example.com  TXT  "v=DMARC1; p=none; rua=mailto:dmarc@example.com"
```

Start at `p=none`. It changes nothing about delivery; it just sends you reports
on what is passing and failing. Read them for a couple of weeks, confirm your
real mail authenticates, then tighten:

```
p=none  →  p=quarantine  →  p=reject
```

Moving straight to `p=reject` before checking reports is how people silently
destroy their own delivery.

Since **February 2024**, Gmail and Yahoo require SPF, DKIM *and* DMARC for bulk
senders. Treat all three as mandatory rather than optional hardening.

## Choosing a provider

| Option | Good for | Watch out for |
|---|---|---|
| Amazon SES | Production. Cheap, scales, good reputation tooling | Starts **sandboxed** — you can only send to verified addresses until you request production access. Request it *before* launch day |
| Google Workspace SMTP | Very small deployments, internal use | ~500 recipients/day and Google may rewrite the From. Not suitable for production volume |
| Generic SMTP (`SMTP_HOST`) | Any transactional provider — Postmark, Resend, Mailgun | Deliverability is theirs; still publish SPF/DKIM/DMARC |

The SES sandbox is the single most common launch-day surprise: everything works
in testing (you verified your own address) and then no real customer receives
anything.

## Practical points

- **Use a subdomain** — `mail.example.com` or `bookify.example.com`. A
  reputation problem on transactional mail then does not contaminate your main
  domain.
- **Do not send from `no-reply@` if you can avoid it.** Replies to booking mail
  are usually a customer trying to reach the business; `Reply-To` handles that,
  but a monitored from address is still better.
- **Warm up gradually.** A brand-new domain suddenly sending thousands of
  messages looks exactly like a compromised one.
- **Set up bounce/complaint handling** on your provider before real volume.
  Repeatedly mailing dead addresses damages reputation quickly.

## Verifying

Before launch, and after any DNS change:

1. Send a real booking confirmation to a Gmail address you control.
2. In Gmail: ⋮ → **Show original**. You want `SPF: PASS`, `DKIM: PASS`,
   `DMARC: PASS`. Anything else, fix it now — this check takes a minute and is
   the only one that tests the whole chain end to end.
3. Send to an Outlook/Hotmail address too; it is stricter than Gmail.
4. Check the message landed in **Inbox**, not Promotions or Junk.

`https://www.mail-tester.com` gives a scored report if you want more detail.

Re-check after changing sending domain, provider, or from address — all three
invalidate previous results.

## When mail stops arriving

1. Is it configured at all? With no provider set the app logs
   `No email provider configured — email not sent` and returns successfully.
   Nothing is broken; nothing is sent.
2. Check `/admin/errors` — send failures are captured there.
3. Check the provider dashboard for bounces, complaints, or a sending pause.
4. Re-run the Gmail **Show original** check; a DNS change may have broken SPF
   (a second SPF record is a common cause).
5. Confirm you are out of the SES sandbox if you use SES.
