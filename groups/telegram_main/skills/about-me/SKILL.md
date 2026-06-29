---
name: about-me
description: Chris's personal knowledge base — who he is, the people in his life, his businesses, projects, clients, working style and preferences. Use whenever a question is about Chris personally or someone/something in his world (e.g. "what do I know about Karim", "who is Jeremy Holt", "what's the MBIL project", "remind me about my SAP work"). Read-only, shareable info only.
---

# About Chris — personal knowledge base (Telegram, read-only)

Chris keeps a structured personal knowledge base (an OKF bundle: one markdown
concept per file, each with YAML frontmatter and cross-links). On this machine it
is mounted **read-only** at:

```
/workspace/extra/python_projects/about_me/okf
```

Sub-directories (each has an `index.md` listing its concepts):

- `people/` — family, friends, collaborators, clients, contacts
- `organisations/` — his businesses and client/partner orgs
- `projects/` — ventures, products, client/coaching work
- `topics/` — professional profile, working style, communication & product prefs, interests
- `reference/` — cited history, provenance

## How to answer

1. Find the right concept — grep the bundle, e.g.
   `grep -ril karim /workspace/extra/python_projects/about_me/okf/`
   or scan the relevant `index.md`.
2. Read only the file(s) you need (`cat` the matching `.md`), then answer from them.
3. Keep it tight for Telegram (~35-char width). Don't dump whole files — summarise.

## CRITICAL — privacy boundary

- **Never read, quote, or reveal anything under `okf/private/`** (health, finances,
  psychology). That tier is **off-limits on Telegram.** Do not `cat`, `grep`, or
  summarise those files, and do not infer their contents.
- If asked something that would need the private tier (his health, money, therapy/
  psychology), **decline briefly**: say that's kept off Telegram and he can ask at
  his Mac instead. Don't apologise at length; just one line.
- Everything outside `okf/private/` is fine to use.

## Not available here

- **Capturing new facts** — the bundle is mounted read-only on Telegram, so you
  can't add to it. If Chris says "remember this about me", tell him to capture it at
  his Mac (the `aboutme capture` tool / about-me skill there); don't pretend it's saved.
