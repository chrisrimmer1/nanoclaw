---
name: food-diary
description: "Query Chris's food diary. Use when Chris asks about his food diary, what he's eaten, food patterns, specific ingredients, scores, grades, or anything related to his eating history."
---

# Food Diary

Chris's food diary is stored in Supabase. Always use the database in preference to the JSON file.

## Connection

```bash
SUPABASE_URL="https://xhqlpxrktpnmlmeevvod.supabase.co"
ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhocWxweHJrdHBubWxtZWV2dm9kIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE1NjcwODksImV4cCI6MjA4NzE0MzA4OX0.RRsS_Jos4ekssDxegYQXqhBKSosXkFHZkd8VWfhyY6U"
```

## Tables

### `days` -- one row per day

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | Primary key |
| `date` | date (YYYY-MM-DD) | **Canonical diary date -- always use this, never `created_at`** |
| `day_name` | text | e.g. "Mon", "Tue" |
| `score` | float | 0-10 (see Grades below) |
| `grade` | text | A/B/C/D/F/TREAT |
| `is_cheat` | boolean | Whether this was the week's cheat day |
| `content` | text | Full raw diary text |
| `created_at` | timestamptz | Sync timestamp -- NOT the diary date, often a day off |

**`content` contains structured lines that aren't in separate columns:**
- `Summary:` -- free-text summary of the day
- `Pees:` -- pee count/notes
- `Stomach:` -- stomach notes

To query these, fetch `content` and parse the relevant line.

### `food_items` -- individual food/drink entries

| Column | Type | Notes |
|--------|------|-------|
| `day_id` | uuid | FK to `days.id` |
| `time_str` | text | e.g. "12:30" |
| `item` | text | Food/drink description |
| `has_exclamation` | boolean | Marked with `!` -- a rule violation |
| `is_time_violation` | boolean | Eaten outside allowed window |
| `violation_type` | text | Type of time violation |

### `health_markers` -- bowel movements

| Column | Type | Notes |
|--------|------|-------|
| `day_id` | uuid | FK to `days.id` |
| `time_str` | text | e.g. "07:15" |
| `marker_type` | text | P1, P2, or P3 |
| `notes` | text | e.g. "semi good", "loose" |

## Grades and scoring

Each non-cheat day starts at 10. Each unique violation (exclamation item or time violation) subtracts 1 point. Cheat days are fixed at 10 with grade TREAT.

| Grade | Score range |
|-------|-------------|
| TREAT | Cheat day (always 10) |
| A | >= 9 |
| B | >= 7.5 |
| C | >= 6 |
| D | >= 4 |
| F | < 4 |

## Common queries

### Last N days
```bash
curl -s "$SUPABASE_URL/rest/v1/days?select=date,day_name,score,grade,food_items(time_str,item)&order=date.desc&limit=5" \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY"
```

### Specific date
```bash
curl -s "$SUPABASE_URL/rest/v1/days?select=date,day_name,score,grade,content,food_items(time_str,item),health_markers(time_str,marker_type,notes)&date=eq.2026-03-17" \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY"
```

### Search for an ingredient
```bash
curl -s "$SUPABASE_URL/rest/v1/food_items?select=item,time_str,day_id,days(date,day_name)&item=ilike.*banana*&order=days(date).desc&limit=20" \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY"
```

### Date range
```bash
curl -s "$SUPABASE_URL/rest/v1/days?select=date,day_name,score,grade,food_items(time_str,item)&date=gte.2026-03-01&date=lte.2026-03-19&order=date.desc" \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY"
```

### Health markers for a date range
```bash
curl -s "$SUPABASE_URL/rest/v1/health_markers?select=time_str,marker_type,notes,days(date,day_name)&days.date=gte.2026-03-10&days.date=lte.2026-03-17&order=days(date).desc" \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY"
```

### Cross-referencing ingredients across days
For queries like "days I had both eggs and cheese", fetch food_items and group by `day_id` in Python -- Supabase REST doesn't support multi-item intersection queries directly.

## Output format

IMPORTANT: Do NOT use code blocks or tables for food diary output. Use Telegram Markdown with bold times. Send output exactly like this example:

Mon 16 Mar 2026 — Grade *A* (9.0)

*10:47* Asparagus & almonds ⚠️
*12:20* FD salmon teriyaki w mixed salad & walnuts
*15:02* Decaf espresso w 2 dark choc
*15:02* Peanut butter stuffed date
*15:02* Blueberries
*18:35* Mexican corn soup w sourdough, feta & quorn ham
*19:00* Banana

*Health:* P1 at 06:53 (semi)

The asterisks around times produce bold text in Telegram Markdown. Do NOT wrap any of this in triple backticks. Long food descriptions must be allowed to wrap naturally in proportional font, not in monospace.

## Tips

- Use Python for date maths (e.g. "last 3 months", "last 2 weeks") and for cross-referencing multiple food items per day
- `has_exclamation` = rule violation; `is_time_violation` = outside eating window
- The `content` field is a useful fallback for anything not captured in structured columns
