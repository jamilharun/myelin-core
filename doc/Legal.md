---
tags: [myelin, legal, philippines, compliance]
created: 2026-04-27
---

# Myelin — Legal

## Context

Philippines-based indie dev. Large US corporations going after a Filipino indie dev = extremely unlikely. Cost-benefit doesn't make sense across jurisdictions. Start lean — legal complexity scales with success.

---

## What Actually Applies

| Protection             | Applies? | Notes                                                                                                                           |
| ---------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Section 230            | No       | US law only                                                                                                                     |
| CC BY license          | Yes      | International, no jurisdiction                                                                                                  |
| ToS + submission rules | Yes      | Essential everywhere                                                                                                            |
| DMCA Safe Harbor       | Partial  | Filipino courts may recognize spirit                                                                                            |
| CPU errata disclosure  | Yes      | Undocumented CPU behavior shared on platform is protected as independent research — CPU vendors cannot claim it as trade secret |
| Transparency policy    | Yes      | Free, just a public page                                                                                                        |

---

## Philippines-Specific Laws

| Law                         | Relevance                                       |
| --------------------------- | ----------------------------------------------- |
| E-Commerce Act (RA 8792)    | Covers online platforms                         |
| Data Privacy Act (RA 10173) | Local GDPR equivalent — privacy policy required |
| IP Code (RA 8293)           | Intellectual property                           |
| Cybercrime Prevention Act   | Relevant if abused against you                  |

---

## What You Need at Launch (all free)

```
1. Clear ToS                — write it yourself
2. Submission rules         — no NDA/confidential material clause
3. CC BY on data records    — title, delta, tags, metadata (not code — submitter retains code ownership)
4. Privacy policy           — required under RA 10173
5. Takedown contact email   — just an address, no formal process needed
6. Transparency page        — publish takedown requests publicly
```

No lawyer needed at launch.

---

## When to Get a Lawyer

```
Revenue > ₱500k/year      → get proper legal structure
Corporation contacts you   → then consult lawyer
EU users > 10% of traffic  → GDPR compliance needed
```

---

## Core Defense Against Corporate Pressure

- ToS shifts liability to submitter for NDA/confidential content
- CC BY makes data open — harder to suppress
- Transparency page = public takedowns deter aggressive action
- Platform hosts findings, doesn't create them — same shield Wikipedia uses

---

## GDPR (EU Users)

```
Collect minimum: email + username only
Privacy policy page — what collected, why, how deleted
"Delete my account" button — purges personal data (email, username, session)
  → submission content stays, becomes anonymous (CC BY + ToS — user agreed upfront)
  → must be clearly stated in ToS and at account deletion confirmation
No third-party trackers
Cloudflare Workers = GDPR compliant infrastructure
```

Trigger: EU users > 10% of traffic → full GDPR compliance needed.

---

## Code Ownership + CC BY

- CC BY covers the _data record_ — title, delta, tags, metadata
- Code snippets: submitter retains ownership but grants platform perpetual license to display
- Account deleted → submissions become anonymous, not removed — submitter agreed to this in ToS
