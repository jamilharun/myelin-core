---
tags: [myelin, monetization, revenue, business]
created: 2026-04-26
---

# Myelin — Monetization

## Core Rule

Never charge contributors or readers. Charge power consumers only.

```
Contributors       → free forever (they build the value)
Casual readers     → free forever (they grow the audience)
Agents             → free forever (the differentiator — charging them kills adoption)
Commercial tools   → paid (companies building products on top of Myelin data)
Researchers        → paid (bulk dataset exports)
CPU vendors        → paid (sponsored architecture sections)
```

Paywall on contributors = fewer submissions = less value = fewer users = less money.
Wrong direction. Contributors are the product — protect them.

Same model as: Stack Overflow (free to post, charges Teams/Jobs) · npm (free to publish, charges private packages) · GitHub (free to contribute, charges enterprise).

---

## Revenue Tiers

| Tier              | Who                           | What                                   | Price       |
| ----------------- | ----------------------------- | -------------------------------------- | ----------- |
| Free              | Everyone                      | Read + write, standard limits          | $0          |
| API Pro           | Commercial tools, companies   | High-volume API pulls, webhooks, feeds | ~$19/mo     |
| Data export       | Researchers                   | Bulk benchmark dataset downloads       | ~$49/export |
| Sponsored section | CPU vendors (Intel, AMD, ARM) | Featured architecture visibility       | negotiated  |
| Ads               | Relevant advertisers only     | Sidebar, docs, learning pages          | CPM-based   |

**Contributor perk:** ads hidden after reaching a reputation threshold — rewards active contributors, zero cost to them. Exact threshold TBD.

---

## Ads — Ethical Only

Low-level devs are the most ad-averse audience online. Generic ads = instant credibility loss. Relevant ads = accepted or ignored.

**Allowed:**

- CPU/hardware vendors (Intel, AMD, ARM dev programs)
- Dev tooling (profilers, compilers, JetBrains)
- Cloud/infra (Hetzner, DigitalOcean)
- Low-level programming courses/books

**Not allowed:** Google AdSense, third-party tracking pixels, anything unrelated to dev/hardware.

**Placement:**

```
Sidebar on submission pages     → low friction
Bottom of learning path pages   → reader finished, receptive
Sponsor slot in API docs        → companies paying for visibility
"Sponsored by" on CPU sections  → Intel/AMD natural fit
```

**Why niche ads pay well:** low-level devs = high salary = advertisers pay higher CPM than generic audiences. Less traffic, more revenue per visit.

---

## Earliest Path to Revenue

```
Launch free → build audience
      ↓
Consulting leads come naturally
(building the platform = publicly proven expertise)
      ↓
API Pro tier when commercial tools start pulling at scale
      ↓
Data exports + sponsorships when volume justifies
```

Consulting works first — zero extra effort. Platform proves expertise publicly, companies find you. No cold outreach needed.

API Pro targets companies building products on Myelin data, not individual agents. Agents stay free — charging them is the wrong move. Free agents = more data = more value = what attracts the paying companies.

---

## Running Costs (estimates)

| Item                  | Provider          | Cost at launch        |
| --------------------- | ----------------- | --------------------- |
| Workers (API)         | Cloudflare        | Free tier             |
| Pages (frontend)      | Cloudflare        | Free tier             |
| PostgreSQL            | Neon / Supabase   | Free tier             |
| Redis                 | Upstash           | Free tier (10k cmd/d) |
| Domain (`myelin.sh`)  | registrar         | ~$15–30/yr            |
| Email (transactional) | Resend / Postmark | Free tier             |

**At launch:** effectively $0/month beyond the domain. Scale costs only hit when traffic hits.

Upgrade triggers:

- Upstash → paid when > 10k Redis commands/day
- Neon/Supabase → paid when DB storage exceeds free tier
- Cloudflare Workers → paid at > 100k requests/day
