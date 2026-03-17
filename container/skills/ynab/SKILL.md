---
name: ynab
description: Query YNAB (You Need a Budget) data. Read-only access to budgets, accounts, categories, transactions, payees, months, and scheduled transactions.
---

# YNAB (You Need a Budget) — Read-Only

Query budget data from YNAB. This installation is **read-only** — you cannot create, update, or delete anything.

## Setup

Authentication is pre-configured via `YNAB_API_KEY` environment variable.

On first use, set the default budget so you don't need to pass a budget ID every time:

```bash
ynab budgets list                  # find the budget ID
ynab budgets set-default <id>      # set it as default
```

## Commands

All commands return JSON. Add `--compact` for minified output. Amounts are in dollars (not milliunits).

### Budgets

```bash
ynab budgets list
ynab budgets view [id]
ynab budgets settings [id]
```

### Accounts

```bash
ynab accounts list
ynab accounts view <id>
ynab accounts transactions <id>
```

### Categories

```bash
ynab categories list
ynab categories view <id>
ynab categories transactions <id>
```

### Transactions

```bash
# List with filters
ynab transactions list
ynab transactions list --account <id> --since <YYYY-MM-DD>
ynab transactions list --approved=false --min-amount 100
ynab transactions list --fields id,date,amount,memo

# Search
ynab transactions search --memo "coffee"
ynab transactions search --payee-name "Amazon"

# View a single transaction
ynab transactions view <id>
```

### Payees

```bash
ynab payees list
ynab payees view <id>
ynab payees locations <id>
ynab payees transactions <id>
```

### Months

```bash
ynab months list
ynab months view <YYYY-MM>
```

### Scheduled Transactions

```bash
ynab scheduled list
ynab scheduled view <id>
```

## Important

- **Read-only access only.** Do not attempt to create, update, delete, or split transactions. Do not attempt to update categories, payees, or budgets. The wrapper enforces this.
- Rate limit: 200 requests/hour. Space out requests if doing bulk queries.
- If a budget ID is needed but not specified, the default budget is used.
