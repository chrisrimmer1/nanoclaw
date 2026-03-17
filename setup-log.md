# NanoClaw Setup Log

**Date:** 2026-03-17
**Platform:** macOS (Darwin 25.3.0, Apple Silicon)

---

## 1. Git & Fork Configuration

The repository was already forked and configured correctly:

- **origin** &rarr; `https://github.com/chrisrimmer1/nanoclaw.git` (personal fork)
- **upstream** &rarr; `https://github.com/qwibitai/nanoclaw.git` (source repo)

No changes needed.

## 2. Bootstrap

Ran `bash setup.sh` to verify prerequisites:

| Check | Result |
|-------|--------|
| Node.js | v23.11.0 (`/opt/homebrew/bin/node`) |
| Dependencies | Installed |
| Native modules (better-sqlite3) | Working |
| Build tools | Present |

## 3. Environment Check

Fresh install detected &mdash; no existing `.env`, no authentication, no registered groups, no container runtime.

## 4. Container Runtime &mdash; Docker

Docker was not installed. Installed via Homebrew:

```bash
brew install --cask docker
```

> **Note:** The install initially failed because `sudo` was needed to create `/usr/local/cli-plugins`. Fixed by manually running `sudo mkdir -p /usr/local/cli-plugins` in a separate terminal, then the cask installed cleanly.

Started Docker Desktop:

```bash
open -a Docker
```

Built and tested the agent container image (`nanoclaw-agent:latest`) &mdash; both build and runtime test passed on first attempt.

## 5. Claude Authentication

Configured Claude subscription (Pro/Max) authentication:

1. Ran `claude setup-token` in a separate terminal
2. Added `CLAUDE_CODE_OAUTH_TOKEN` to `.env`

## 6. Channel Setup &mdash; Telegram

### Merging the channel code

Added the Telegram skill branch and merged it into main:

```bash
git remote add telegram https://github.com/qwibitai/nanoclaw-telegram.git
git fetch telegram main
git merge telegram/main
```

Merge had conflicts in `package-lock.json`, `package.json`, and `repo-tokens/badge.svg` &mdash; resolved by accepting theirs for all three.

### Installing & building

```bash
npm install
npm run build
npx vitest run src/channels/telegram.test.ts  # 50/50 tests passed
```

### Bot creation & configuration

1. Created a new bot via **@BotFather** (`/newbot`)
2. Added `TELEGRAM_BOT_TOKEN` to `.env`
3. Synced env to container: `mkdir -p data/env && cp .env data/env/env`

### Chat registration

Registered the private chat as the main channel:

```bash
npx tsx setup/index.ts --step register -- \
  --jid "tg:7076872214" \
  --name "Chris" \
  --folder "telegram_main" \
  --trigger "@Andy" \
  --channel telegram \
  --no-trigger-required \
  --is-main
```

As the main chat, no trigger prefix is needed &mdash; every message gets a response.

## 7. Mount Allowlist

Configured agent filesystem access:

| Directory | Access |
|-----------|--------|
| `/Users/chrisrimmer/python_projects` | Read/write (main group), read-only (non-main) |

## 8. Service

Installed as a **launchd** service:

- Plist: `~/Library/LaunchAgents/com.nanoclaw.plist`
- Start: `launchctl load ~/Library/LaunchAgents/com.nanoclaw.plist`
- Restart: `launchctl kickstart -k gui/$(id -u)/com.nanoclaw`
- Stop: `launchctl unload ~/Library/LaunchAgents/com.nanoclaw.plist`

## 9. Verification

Final verification passed all checks:

| Check | Status |
|-------|--------|
| Service | Running |
| Container runtime | Docker |
| Credentials | Configured |
| Channels | Telegram |
| Channel auth | Configured |
| Registered groups | 1 |
| Mount allowlist | Configured |

---

## Quick Reference

| Action | Command |
|--------|---------|
| View logs | `tail -f logs/nanoclaw.log` |
| Restart service | `launchctl kickstart -k gui/$(id -u)/com.nanoclaw` |
| Stop service | `launchctl unload ~/Library/LaunchAgents/com.nanoclaw.plist` |
| Dev mode | Stop service first, then `npm run dev` |
| Rebuild container | `./container/build.sh` |
| Update from upstream | `/update-nanoclaw` |
