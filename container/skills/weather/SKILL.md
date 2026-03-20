---
name: weather
description: Get current weather and forecasts using free APIs (wttr.in, Open-Meteo). No API keys needed.
---

# Weather

Two free services, no API keys needed.

## wttr.in (primary)

Quick one-liner:

```bash
curl -s "wttr.in/London?format=3"
# Output: London: ⛅️ +8°C
```

Compact format:

```bash
curl -s "wttr.in/London?format=%l:+%c+%t+%h+%w"
# Output: London: ⛅️ +8°C 71% ↙5km/h
```

Full forecast:

```bash
curl -s "wttr.in/London?T"
```

Format codes: `%c` condition · `%t` temp · `%h` humidity · `%w` wind · `%l` location · `%m` moon

Tips:
- URL-encode spaces: `wttr.in/New+York`
- Airport codes: `wttr.in/JFK`
- Units: `?m` (metric) `?u` (USCS)
- Today only: `?1` · Current only: `?0`
- PNG: `curl -s "wttr.in/Berlin.png" -o /tmp/weather.png`

## Open-Meteo (fallback, JSON)

Free, no key, good for programmatic use:

```bash
curl -s "https://api.open-meteo.com/v1/forecast?latitude=51.5&longitude=-0.12&current_weather=true"
```

Find coordinates for a city, then query. Returns JSON with temp, windspeed, weathercode.

Docs: https://open-meteo.com/en/docs

## Output format

For multi-day forecasts, use a compact table that fits within 35 monospace characters. Drop columns that don't fit — prioritise day, temp, and conditions. Example:

```
Day  Hi/Lo  Sky     Rain
Fri  10-15  Rain    6.3
Sat  13-16  Rain    0.7
Sun  11-17  Cloud   0
Mon  10-21  Fog     0
Tue  10-18  Cloud   0
```

Rules:
- Max 3-4 columns to stay under 35 chars
- Abbreviate conditions: Rain, Cloud, Sun, Fog, Storm, Snow
- Drop wind unless specifically asked for
- No units in data rows — put them in headers if needed
- Heading above the table: `Location — Date Range`
