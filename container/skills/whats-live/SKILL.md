---
name: whats-live
description: Show Chris a "what's live right now" status summary of his active projects — current state + next action for each. Triggers — "what's live", "whats live", "what's on", "/whats-live", "what am I working on". Do NOT trigger on a bare "what's up" / "whats up" — it's a generic greeting Chris often uses to start a session, not a request for this skill. Also not for a single named project (read that project's PROJECT_MEMORY.md).
---

# What's live — status summary (Claudette / container version)

This is the container-adapted version of Chris's `whats-live` skill. Inside Claudette,
his projects are mounted at `/workspace/extra/python_projects/` (NOT `~/python_projects`).

## Peek (default) — instant

Triggers: "what's live", "whats live", "what's on", "/whats-live", "what am I working on".
(**Not** a bare "what's up" / "whats up" — too generic; Chris uses it as a plain greeting.)

Show the **latest already-generated** brief — no regeneration, instant:

```bash
cat /workspace/extra/python_projects/whats-live/WHATS-LIVE.md
```

Present it as-is, leading with the Digest. The `_Generated …_` line shows how fresh it is
(it's rebuilt on Chris's Mac at 07:00 each day and live-mounted in, so it's normally current).
Since you're already in Telegram, just post the brief — no separate "send" step is needed.

**If the file doesn't exist yet**, say so briefly and suggest he runs `/whats-live` on his
Mac to generate it (see note below) — don't try to regenerate it here.

## Refresh / send — not available in Claudette

- **Refresh** (rebuilding from all the `PROJECT_MEMORY.md` files) runs on Chris's Mac, not
  in the container — it needs the full `claude` CLI, `gws`, and `~/bin/notify`. Don't attempt
  it here; just peek the latest brief. If he explicitly wants a fresh rebuild, tell him to run
  `refresh what's live` / `/whats-live refresh` in a normal Claude Code session on the Mac.
- **Send to Telegram/email** is redundant — you *are* the Telegram channel, so just post the
  brief in chat.

## Notes

- The full daily delivery (file + Telegram + email) runs automatically at 07:00 on the Mac.
- If Chris only wants one project, skip this and read that project's `PROJECT_MEMORY.md`
  (under `/workspace/extra/python_projects/<project>/`).
- Source tool: `/workspace/extra/python_projects/whats-live/`.
