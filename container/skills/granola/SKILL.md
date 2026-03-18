---
name: granola
description: Search and retrieve meeting notes, transcripts, and summaries from Granola. Use when the user asks about meeting notes, conversations, summaries, or anything from their Granola meetings.
---

# Granola Meeting Notes

Reads from the host's Granola cache, mounted read-only at `/workspace/extra/granola/`.

## Cache Location & Structure

```python
import json, glob

# Find the cache file (version number may change)
cache_files = glob.glob('/workspace/extra/granola/cache-v*.json')
CACHE_PATH = cache_files[0]

with open(CACHE_PATH, 'r') as f:
    raw = json.load(f)

# Cache value may be a dict (v6+) or a JSON string (v3). Handle both.
cache = raw['cache'] if isinstance(raw['cache'], dict) else json.loads(raw['cache'])
state = cache['state']
```

## Key Data Structures in `state`

| Key | Contents |
|-----|----------|
| `state['documents']` | dict of `doc_id -> document` — title, dates, notes |
| `state['documentPanels']` | dict of `doc_id -> {panel_id -> panel}` — AI summaries (HTML or rich text) |
| `state['transcripts']` | dict of `doc_id -> [lines]` — raw transcript lines |
| `state['people']` | **list** of person objects (NOT a dict) |
| `state['events']` | calendar events |

## Document Fields

```python
doc = state['documents'][doc_id]
doc['title']          # Meeting title e.g. "Greg/Chris"
doc['created_at']     # ISO timestamp
doc['updated_at']
doc['notes_markdown'] # AI-generated markdown notes (may be empty)
doc['notes_plain']    # Plain text notes (may be empty)
```

## Document Panels (AI Summaries) — Most Useful

Panels contain the richest content. `content` is either an **HTML string** (newer docs) or a **rich text dict** (older docs).

```python
panels = state['documentPanels'].get(doc_id, {})
for panel_id, panel in panels.items():
    title = panel['title']       # e.g. "Summary"
    content = panel['content']   # HTML string or rich text dict
    created_at = panel['created_at']

    if isinstance(content, str):
        # HTML — use directly or strip tags
        print(content)
    elif isinstance(content, dict):
        # Rich text — recurse to extract text
        def extract_text(node):
            if isinstance(node, dict):
                if node.get('type') == 'text':
                    return node.get('text', '')
                return ' '.join(extract_text(c) for c in node.get('content', []))
            return ''
        print(extract_text(content))
```

## Transcripts

```python
lines = state['transcripts'].get(doc_id, [])
for line in lines:
    line['source']           # 'microphone' (user) or 'system' (other speaker)
    line['text']             # spoken text
    line['start_timestamp']  # ISO timestamp
    line['is_final']         # bool
```

## Common Tasks

### List recent meetings

```python
import json, glob
cache_files = glob.glob('/workspace/extra/granola/cache-v*.json')
with open(cache_files[0]) as f:
    raw = json.load(f)
cache = raw['cache'] if isinstance(raw['cache'], dict) else json.loads(raw['cache'])
state = cache['state']

docs = state['documents']
sorted_docs = sorted(docs.values(), key=lambda d: d.get('created_at',''), reverse=True)
for doc in sorted_docs[:20]:
    print(f"{doc['created_at'][:10]}  {doc['title']}")
```

### Search all content for a keyword

```python
keyword = 'IBM'

hits = []
for doc_id, panels in state['documentPanels'].items():
    for panel_id, panel in panels.items():
        content = panel.get('content', '')
        content_str = json.dumps(content) if isinstance(content, dict) else content
        if keyword.lower() in content_str.lower():
            doc = state['documents'].get(doc_id, {})
            hits.append({
                'doc_id': doc_id,
                'title': doc.get('title', 'Unknown'),
                'date': doc.get('created_at', '')[:10],
                'panel': panel.get('title'),
                'content': content_str
            })

for h in hits:
    print(f"Meeting: {h['title']} ({h['date']})")
    print(h['content'][:2000])
```

### Search transcripts for a keyword

```python
for doc_id, lines in state['transcripts'].items():
    doc = state['documents'].get(doc_id, {})
    for i, line in enumerate(lines):
        if keyword.lower() in line.get('text', '').lower():
            context = lines[max(0,i-3):i+5]
            print(f"\nMeeting: {doc.get('title')} ({doc.get('created_at','')[:10]})")
            for cl in context:
                marker = ">>>" if cl is line else "   "
                print(f"{marker} [{cl['source']}] {cl['text']}")
```

### Get full summary for a meeting

```python
doc_id = 'some-uuid'
panels = state['documentPanels'].get(doc_id, {})
for panel in panels.values():
    content = panel['content']
    if isinstance(content, str):
        import re
        text = re.sub(r'<[^>]+>', '', content)
        text = re.sub(r'&amp;', '&', text)
        text = re.sub(r'&lt;', '<', text)
        text = re.sub(r'&gt;', '>', text)
        print(text)
```

### Search people

```python
# state['people'] is a LIST, not a dict
for person in state.get('people', []):
    name = person.get('name') or ''
    email = person.get('email') or ''
    if keyword.lower() in name.lower() or keyword.lower() in email.lower():
        print(f"Name: {name}, Email: {email}")
```

## Tips

- **Panels > documents**: The `documentPanels` summaries are almost always more readable than raw `notes_markdown`
- **Newer docs use HTML**: If `content` is a string, it's HTML. If it's a dict, it's ProseMirror rich text.
- **Microphone = you**, **System = other speaker** in transcripts
- The cache updates in real-time as Granola runs on the host
