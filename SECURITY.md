# Security policy

Calorico stores a food diary, body measurements and weight history. That is
health data. A bug that exposes one account's diary to another is serious even
though the project is small, and it will be treated that way.

## Reporting a vulnerability

**Do not open a public issue.**

Use GitHub's private reporting:
[Security → Report a vulnerability](https://github.com/davide97g/calorico/security/advisories/new)

Or email **ghiotto.davidenko@gmail.com** with `[security]` in the subject.

Useful to include: what you found, how to reproduce it, what an attacker gets
out of it, and the commit or deployed version you tested against. A proof of
concept is welcome; a video is not necessary.

## What to expect

| | |
| --- | --- |
| First reply | within 5 days |
| Assessment | within 14 days |
| Fix for a confirmed high-severity issue | as fast as one person can manage, typically days |
| Credit | in the release notes, unless you prefer otherwise |

This is a spare-time project run by one person. There is no bug bounty and no
payment. What there is: a real answer, a real fix, and public credit.

## Scope

**In scope** — the code in this repository and the deployment at
`calorico.davideghiotto.it`:

- authentication, session handling, token revocation
- authorisation between accounts and between family group members
- SQL injection, XSS, CSRF, SSRF
- exposure of one user's diary, weight, profile or scans to another
- vulnerable dependencies with a plausible path to exploitation here
- the meal-photo pipeline, including anything that would cause an image to be
  retained

**Out of scope**:

- reports produced by a scanner with no demonstrated impact
- missing headers that do not lead to an exploit here
- rate limits you consider too generous, without a demonstrated abuse
- social engineering, physical access, denial of service by volume
- vulnerabilities in Open Food Facts, or in data supplied by it
- anything requiring a compromised device or a malicious browser extension

## Testing rules

You may test against the public deployment, within limits:

- **Use your own account.** Do not access, modify or exfiltrate data belonging
  to anyone else. If a bug hands you someone else's data, stop, do not save it,
  and say so in the report.
- **No destructive testing**, no automated load, no scraping runs. The data is
  open and downloadable from Open Food Facts if you want a copy.
- **No spam** to other users through the family invite feature.

Report in good faith and stay within these rules and you will not be pursued for
it.

## What is already in place

Context, so you can skip the obvious:

- Passwords are stored as `scrypt` hashes with a random salt, never in plain
  text and never recoverable.
- Sessions are signed JWTs carrying a token version; bumping it invalidates
  every token already issued for that user.
- Rate limits are applied to sign-in, registration and account deletion.
- A restrictive Content Security Policy is set on every response, plus HSTS,
  `nosniff`, a referrer policy and a permissions policy. The landing page's
  policy is stricter still and allows no outbound connections at all.
- The site makes no third-party requests: the webfonts are self-hosted for
  exactly that reason.
- Meal photographs are never written to disk or database. They exist in memory
  for the duration of a single analysis.
- Account deletion cascades through every table and is immediate.
- Postgres is reachable only on the internal container network.
