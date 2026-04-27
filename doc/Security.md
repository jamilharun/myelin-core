---
tags: [myelin, security, legal]
created: 2026-04-26
---

# Myelin — Security

## Security Layers

### Layer 1 — Rate limiting (Cloudflare built-in, free)

```
POST /api/v1/submissions              → 5 per hour per IP
POST /api/v1/submissions/*/comments   → 20 per hour per IP
GET  /api/v1/*                        → 1000 per hour per IP (no key)
GET  /api/v1/*                        → 10000 per hour per IP (with key)
```

### Layer 2 — Auth required for writes

```
Reads  → public, no auth, no account
Writes → account required
         GitHub OAuth (preferred) or email + password
         Email verification: 7-day window
         No verify within 7 days → account deleted, submissions stay (anonymous)
         Verified → active, posts go live normally
```

### Layer 3 — New account cooldown

```
Account age < 24h  → can't post
Account age < 7d   → 1 post per day max
Account age > 7d   → normal limits
```

### Layer 4 — Reputation gate

```
Post submission     → reputation ≥ 0
Post comment        → reputation ≥ 10
Flag submission     → reputation ≥ 20
API write access    → reputation ≥ 50
```

### Layer 5 — Submission validation

```
Required fields enforced per type (Zod schema — see API.md Required Fields table)
  optimization: title, cpu, before, after, metric, code_before, code_after, language all required
  gotcha:       body required; code_before/code_after optional
  snippet:      code_after + language required; code_before not applicable
delta        server-calculated from before/after — not submitted
before/after positive number, zero not allowed
min code length enforced on code fields
```

### Layer 6 — Human review queue

```
First 3 submissions from new account → review queue
After approved → trusted, bypass queue
```

### Layer 7 — Balloon System

Every user has a balloon (tolerance budget). Normal users never notice it. Spammers hit it fast.

```
Balloon capacity  = 100 points
Submission cost   = 20 points
Comment cost      = 5 points
Refill rate       = 10 points per hour
```

**Pop triggers:**

| Trigger                         | Consequence             |
| ------------------------------- | ----------------------- |
| 3 flagged submissions in 1 hour | Balloon pops            |
| 5 rejected submissions in 24h   | Balloon pops            |
| 10 posts in 10 minutes          | Balloon pops            |
| Flags > upvotes ratio sustained | Balloon slowly deflates |

**On pop:**

```
All pending submissions → rejected
All future submissions  → rejected
Account flagged         → admin review
```

**Recovery:**

```
Popped → appeal form (human only)
       → admin restores with smaller capacity
       → repeat offense = permanent ban
```

**Why balloon beats rate limiting:**
Rate limit = hard wall, resets on schedule, easily gamed.
Balloon = dynamic, tracks behavior over time, degrades gradually.

### Full stack cost

| Layer           | Tool                           | Cost |
| --------------- | ------------------------------ | ---- |
| Rate limiting   | Cloudflare built-in            | Free |
| Auth            | Lucia                          | Free |
| Cooldowns       | DB timestamp check             | Free |
| Reputation gate | DB query                       | Free |
| Validation      | Zod schema                     | Free |
| Review queue    | DB flag + admin page           | Free |
| Balloon system  | Redis (Upstash) atomic counter | Free |

---

### Webhook Security

SSRF prevention on `POST /api/v1/webhooks/register`:

```
Reject http:// — HTTPS only
Resolve hostname before saving
Reject if resolved IP is in any RFC 1918 range:
  10.0.0.0/8
  172.16.0.0/12
  192.168.0.0/16
  127.0.0.1 / ::1  (loopback)
  169.254.0.0/16   (link-local)
```

---

## Security Risk — Hacker Value

Low-level knowledge is inherently dual-use.

**Value TO attackers:**

| What                  | How used offensively                                                           |
| --------------------- | ------------------------------------------------------------------------------ |
| SIMD patterns         | Usable as shellcode primitives                                                 |
| CPU errata DB         | Known hardware bugs = exploit surface                                          |
| Cache timing patterns | Powers Spectre-style side-channel attacks                                      |
| Dispatch templates    | Reveals how real software is structured internally — helps reverse engineering |

**Value FOR security researchers (legitimate):**

| Who                  | What they pull                              |
| -------------------- | ------------------------------------------- |
| CTF players          | Assembly patterns, shellcode techniques     |
| Security researchers | CPU quirks relevant to exploit mitigations  |
| Malware analysts     | Recognize optimization patterns in binaries |
| Red teams            | Timing primitives, instruction behavior     |

**Mitigations:**

- Human review queue — catches suspicious submissions
- Community flagging — surfaces malicious code
- Reputation gate — limits new account abuse
- Balloon system — burst submissions from new accounts blocked

**Submission rules — flagged and removed:**

```
- Shellcode
- Exploit primitives
- Timing attack primitives with no legitimate optimization use
- Obfuscated payloads
```

Can't fully prevent it. Same way GitHub can't prevent malicious repos. Moderation handles edge cases, not the architecture.

---

## Data Scrapers

Free data = scrapers come. Goal: make it work for the platform, not against it.

**Real risk — not theft, but unattributed reuse.**

**Mitigations without killing openness:**

| Measure                         | Effect                                             |
| ------------------------------- | -------------------------------------------------- |
| Rate limit unauthenticated GETs | Slows bulk scrapers, doesn't block agents          |
| `robots.txt` with scraper rules | Signals intent, not hard enforcement               |
| CC BY license on all data       | Legal attribution requirement                      |
| API key for bulk access         | High-volume scrapers → become paying API Pro users |
| Watermarking patterns in data   | Detect if data appears elsewhere unattributed      |

**CC BY license (decided):**

```
Free to use         ✓
Must credit Myelin  ✓ (every use spreads the name)
Commercial use OK   ✓
No permission needed ✓
```

Same model as Wikipedia. Attribution requirement turns extraction into distribution.

---

## Legal

See [[Legal]] — Philippines context, applicable laws, launch checklist, GDPR, corporate defense.
