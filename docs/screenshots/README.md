# Screenshots

Capture these 5 key screenshots for the README and promotion materials.

## Required Screenshots

| File | Description | URL |
|------|-------------|-----|
| `companion-chat.png` | AI companion chat sidebar open while reading | `/read/{bookId}` — open companion panel |
| `reader-view.png` | EPUB reader with highlights and sepia theme | `/read/{bookId}` — highlight some text |
| `knowledge-graph.png` | Interactive knowledge graph visualization | `/knowledge` |
| `memory-book.png` | Memory book rendered (6 chapters) | `/memory-books/{bookId}` |
| `landing-page.png` | Hero section of the landing page | `/` (root URL) |

## Step-by-Step Capture

### Setup
1. Open the live demo at `http://175.178.66.207:8090`
2. Register a test account or log in
3. Ensure "The Great Gatsby" is loaded (auto-seeded)
4. Set browser to 1440x900, dark mode

### 1. companion-chat.png
1. Navigate to your library, open "The Great Gatsby"
2. Open the AI companion panel (right sidebar)
3. Send a message like "What does the green light symbolize?"
4. Wait for the response to stream in
5. Screenshot the full page showing both reader + chat

### 2. reader-view.png
1. In the same reader view
2. Highlight a passage (select text → click highlight)
3. Switch theme to Sepia
4. Screenshot the reader showing the highlight and theme

### 3. knowledge-graph.png
1. Navigate to `/knowledge`
2. Wait for the graph to render (SVG force-directed layout)
3. Screenshot the full knowledge graph page

### 4. memory-book.png
1. Navigate to a completed book's Memory Book page
2. Scroll to show the chapter headings and content
3. Screenshot showing the beautiful 6-chapter layout

### 5. landing-page.png
1. Log out (or open incognito)
2. Visit the root URL `/`
3. Screenshot the hero section with "A friend who reads with you"

## Tips

- Use **1440x900** browser window for consistency
- Prefer **dark mode** for most screenshots
- Ensure no personal/auth data is visible
- Use "The Great Gatsby" for all demo content
- PNG format, optimize with `optipng` or similar
- Target < 500KB per screenshot for fast README loading

## After Capture

1. Place files in `docs/screenshots/`
2. Verify README table references match filenames
3. Push to GitHub and check rendering
