#!/bin/bash
# Read-only wrapper for ynab-cli.
# Blocks all write operations (create, update, delete, split, budget, set-default, api POST/PUT/PATCH/DELETE).
# Only allows read commands through to the real ynab binary.

set -euo pipefail

REAL_YNAB="$(dirname "$0")/.ynab-real"

# Block write subcommands
for arg in "$@"; do
  case "$arg" in
    create|update|delete|split|budget|logout)
      echo "Error: write operation '$arg' is blocked. This is a read-only installation." >&2
      exit 1
      ;;
  esac
done

# Block raw API writes (ynab api POST/PUT/PATCH/DELETE ...)
if [ "${1:-}" = "api" ]; then
  method="${2:-GET}"
  case "$method" in
    POST|PUT|PATCH|DELETE|post|put|patch|delete)
      echo "Error: write operation 'api $method' is blocked. This is a read-only installation." >&2
      exit 1
      ;;
  esac
fi

# Block MCP server (gives unrestricted access)
if [ "${1:-}" = "mcp" ]; then
  echo "Error: MCP server is blocked. This is a read-only installation." >&2
  exit 1
fi

exec "$REAL_YNAB" "$@"
