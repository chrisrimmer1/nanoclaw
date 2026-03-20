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

## Creating Skills

To create a persistent skill, write it to `/workspace/group/skills/<name>/SKILL.md`.
It will be available in all future sessions automatically.
