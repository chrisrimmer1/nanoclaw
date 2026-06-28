# NanoClaw Security Model

## Trust Model

| Entity | Trust Level | Rationale |
|--------|-------------|-----------|
| Main group | Trusted | Private self-chat, admin control |
| Non-main groups | Untrusted | Other users may be malicious |
| Container agents | Sandboxed | Isolated execution environment |
| WhatsApp messages | User input | Potential prompt injection |

## Security Boundaries

### 1. Container Isolation (Primary Boundary)

Agents execute in containers (lightweight Linux VMs), providing:
- **Process isolation** - Container processes cannot affect the host
- **Filesystem isolation** - Only explicitly mounted directories are visible
- **Non-root execution** - Runs as unprivileged `node` user (uid 1000)
- **Ephemeral containers** - Fresh environment per invocation (`--rm`)

This is the primary security boundary. Rather than relying on application-level permission checks, the attack surface is limited by what's mounted.

### 2. Mount Security

**External Allowlist** - Mount permissions stored at `~/.config/nanoclaw/mount-allowlist.json`, which is:
- Outside project root
- Never mounted into containers
- Cannot be modified by agents

**Default Blocked Patterns:**
```
.ssh, .gnupg, .aws, .azure, .gcloud, .kube, .docker,
credentials, .env, .netrc, .npmrc, id_rsa, id_ed25519,
private_key, .secret
```

**Protections:**
- Symlink resolution before validation (prevents traversal attacks)
- Container path validation (rejects `..` and absolute paths)
- `nonMainReadOnly` option forces read-only for non-main groups

**Read-Only Project Root:**

The main group's project root is mounted read-only. Writable paths the agent needs (group folder, IPC, `.claude/`) are mounted separately. This prevents the agent from modifying host application code (`src/`, `dist/`, `package.json`, etc.) which would bypass the sandbox entirely on next restart.

### 3. Session Isolation

Each group has isolated Claude sessions at `data/sessions/{group}/.claude/`:
- Groups cannot see other groups' conversation history
- Session data includes full message history and file contents read
- Prevents cross-group information disclosure

### 4. IPC Authorization

Messages and task operations are verified against group identity:

| Operation | Main Group | Non-Main Group |
|-----------|------------|----------------|
| Send message to own chat | ✓ | ✓ |
| Send message to other chats | ✓ | ✗ |
| Schedule task for self | ✓ | ✓ |
| Schedule task for others | ✓ | ✗ |
| View all tasks | ✓ | Own only |
| Manage other groups | ✓ | ✗ |

**Sender Allowlist (trigger gating).**

An external config at `~/.config/nanoclaw/sender-allowlist.json` controls which
senders may trigger the agent, per chat. If the file is absent the code defaults
to `allow: '*'` (anyone in a registered chat can trigger) — so this deployment
ships an explicit default-deny instead:

```json
{
  "default": { "allow": [], "mode": "trigger" },
  "chats": { "tg:7076872214": { "allow": "*", "mode": "trigger" } },
  "logDenied": true
}
```

- `default` denies *triggering* for any chat not listed (`allow: []`), so a
  future group chat can't auto-run the unattended agent until its senders are
  added. `mode: "trigger"` (not `"drop"`) means such messages are still stored,
  not silently discarded.
- The single private main chat (`tg:7076872214`, a 1:1 only the operator can
  message) is pinned `allow: "*"`. Sender values are numeric Telegram user IDs.
- Loaded fresh per message — edits take effect with no restart.
- Note: the main group also bypasses the trigger gate via `isMainGroup`; the
  explicit entry additionally keeps it safe from the drop path. Both belt and
  braces.

### 5. Credential Isolation (Credential Proxy)

**Anthropic API credentials never enter containers.** The host runs an HTTP credential proxy that injects authentication headers transparently.

**How it works:**
1. Host starts a credential proxy on `CREDENTIAL_PROXY_PORT` (default: 3001)
2. Containers receive `ANTHROPIC_BASE_URL=http://host.docker.internal:<port>` and `ANTHROPIC_API_KEY=placeholder`
3. The SDK sends API requests to the proxy with the placeholder key
4. The proxy strips placeholder auth, injects real credentials (`x-api-key` or `Authorization: Bearer`), and forwards to `api.anthropic.com`
5. For the Anthropic credential, agents cannot discover the real secret — not in environment, stdin, files, or `/proc`.

**Exception — the YNAB token is NOT proxied.** This deployment injects a real
`YNAB_API_KEY` into the container as a plaintext environment variable so the
in-container `ynab` CLI can make budget queries. Be precise about what this
does and does not protect:

- YNAB Personal Access Tokens **cannot be scoped read-only** — they are always
  full read-write. There is no read-only token to issue.
- `container/ynab-readonly.sh` wraps the `ynab` CLI and blocks write
  subcommands (`create/update/delete/split/budget`), raw `ynab api`
  POST/PUT/PATCH/DELETE, and the MCP server. This guards against *accidental*
  writes via the CLI.
- It is **not an adversarial boundary.** The raw token is in `$YNAB_API_KEY`,
  so an agent (e.g. under prompt-injection from content it reads) can bypass
  the wrapper entirely with a direct `curl -X POST` to the YNAB API and write
  to the budget.
- Accepted risk: blast radius is limited to the YNAB budget (recoverable, no
  code/credential exposure), and only the operator can message the single
  private chat. To fully close this, move YNAB behind a host-side read-only
  IPC tool (token never enters the container) — deferred by choice.

(GitHub was previously injected the same way; it has been removed entirely —
no `gh` CLI, no `GITHUB_TOKEN`/`GH_REPO` in the container.)

**NOT Mounted:**
- WhatsApp session (`store/auth/`) - host only
- Mount allowlist - external, never mounted
- Any credentials matching blocked patterns
- `.env` is shadowed with `/dev/null` in the project root mount

## Privilege Comparison

| Capability | Main Group | Non-Main Group |
|------------|------------|----------------|
| Project root access | `/workspace/project` (ro) | None |
| Group folder | `/workspace/group` (rw) | `/workspace/group` (rw) |
| Global memory | Implicit via project | `/workspace/global` (ro) |
| Additional mounts | Configurable | Read-only unless allowed |
| Network access | Unrestricted | Unrestricted |
| MCP tools | All | All |

## Security Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────┐
│                        UNTRUSTED ZONE                             │
│  WhatsApp Messages (potentially malicious)                        │
└────────────────────────────────┬─────────────────────────────────┘
                                 │
                                 ▼ Trigger check, input escaping
┌──────────────────────────────────────────────────────────────────┐
│                     HOST PROCESS (TRUSTED)                        │
│  • Message routing                                                │
│  • IPC authorization                                              │
│  • Mount validation (external allowlist)                          │
│  • Container lifecycle                                            │
│  • Credential proxy (injects auth headers)                       │
└────────────────────────────────┬─────────────────────────────────┘
                                 │
                                 ▼ Explicit mounts only, no secrets
┌──────────────────────────────────────────────────────────────────┐
│                CONTAINER (ISOLATED/SANDBOXED)                     │
│  • Agent execution                                                │
│  • Bash commands (sandboxed)                                      │
│  • File operations (limited to mounts)                            │
│  • Anthropic API calls routed through credential proxy           │
│  • No Anthropic credentials in env/filesystem (YNAB token excepted) │
└──────────────────────────────────────────────────────────────────┘
```
