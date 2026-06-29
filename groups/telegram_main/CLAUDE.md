# Telegram Main Group

## Formatting

This chat is on Telegram. Mobile screen width is ~35 monospace characters on iPhone. Always target this width — if a table looks fine at 45 chars but wraps at 35, it's too wide.

### General rules
- Use Telegram Markdown v1: `*bold*`, `_italic_`, `` `code` ``, ``` ```code blocks``` ```
- Lead with the headline or summary, details below
- Keep messages concise — Telegram is a chat app, not a document viewer

### When to use tables
Only use Markdown tables for genuinely multi-column data (3+ columns), like weather forecasts or comparisons. When you do:
- Target max ~35 characters total width — count it before outputting
- Drop columns aggressively — if it doesn't fit at 35 chars, remove the least useful column
- Use short headers (e.g., "Hi/Lo" not "High/Low", "Rain" not "Rain(mm)")
- Drop units from every row — put them in the header instead
- Use 1-space column gaps, not 2
- Prefer compact date formats (e.g., "Fr20" or "Fri" not "Fri 20 Mar")
- Abbreviate conditions if needed (e.g., "Rain" not "Showers", "Cloud" not "Overcast")
- Skip emoji in table cells — they break monospace alignment

### When NOT to use tables
Simple two-column data (time + item, label + value) should be plain text with Telegram Markdown, NOT a table or code block. Use bold for the label/time and let text wrap naturally in proportional font:

*10:47* Asparagus & almonds
*12:20* FD salmon teriyaki w mixed salad & walnuts
*15:02* Decaf espresso w 2 dark choc

For key-value pairs: *Calories:* 1850

## Google Workspace (gws) auth — do not misdiagnose

gws here authenticates via Google ADC (mounted at `~/.config/gcloud/`), not
stored OAuth. `gws auth status` cannot see ADC, so it always reports
`auth_method: none` and a missing `~/.config/gws/` — **this is normal and does
NOT mean auth is broken.** Never conclude auth is broken from `gws auth status`.
To test, make a real call (e.g. `gws gmail users labels list --params
'{"userId":"me"}'`); if it returns data, auth works. Only a real 401 means it's
broken, and that's fixed on the host, not by pasting credentials. See the
`gws-shared` skill for detail.

## About Chris (personal knowledge base)

For any question about Chris personally — the people in his life, his businesses,
projects, clients, working style or preferences — use the **about-me** skill. His
knowledge base is mounted read-only at
`/workspace/extra/python_projects/about_me/okf` (people / organisations / projects
/ topics / reference). **Never** read or reveal anything under `okf/private/`
(health, finances, psychology) — that's off-limits on Telegram; if asked, say it's
kept off Telegram and he can ask at his Mac. See the about-me skill for how.

## Creating Skills

To create a persistent skill, write it to `/workspace/group/skills/<name>/SKILL.md`.
It will be available in all future sessions automatically.
