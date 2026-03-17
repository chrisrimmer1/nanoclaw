---
name: summarise
description: Summarise URLs, PDFs, YouTube videos, and local files. Uses the summarize CLI locally, or Web Fetch as fallback.
---

# Summarise

Summarise URLs, local files, and YouTube links.

## With the CLI (local only)

If the `summarize` binary is available:

```bash
summarize "https://example.com" --model google/gemini-3-flash-preview
summarize "/path/to/file.pdf" --model google/gemini-3-flash-preview
summarize "https://youtu.be/dQw4w9WgXcQ" --youtube auto
```

### Installation

```bash
brew install steipete/tap/summarize
```

### Model + keys

Set the API key for your chosen provider:

- OpenAI: `OPENAI_API_KEY`
- Anthropic: `ANTHROPIC_API_KEY`
- xAI: `XAI_API_KEY`
- Google: `GEMINI_API_KEY` (aliases: `GOOGLE_GENERATIVE_AI_API_KEY`, `GOOGLE_API_KEY`)

Default model is `google/gemini-3-flash-preview` if none is set.

### Useful flags

- `--length short|medium|long|xl|xxl|<chars>`
- `--max-output-tokens <count>`
- `--extract-only` (URLs only)
- `--json` (machine readable)
- `--firecrawl auto|off|always` (fallback extraction)
- `--youtube auto` (Apify fallback if `APIFY_API_TOKEN` set)

## Without the CLI (fallback)

If the `summarize` binary is not installed, use Web Fetch to retrieve the content and summarise it directly:

1. Fetch the URL content using the WebFetch tool
2. Summarise the key points from the fetched content
3. For YouTube videos, fetch the video page and extract available transcript/description

This fallback works anywhere including inside containers.
