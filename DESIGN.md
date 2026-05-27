---
name: read-pal
description: AI-powered reading companion with warm, scholarly design
colors:
  candlelight-gold: "#d97706"
  candlelight-gold-deep: "#b45309"
  candlelight-gold-rich: "#92400e"
  cream-paper: "#fefdfb"
  warm-parchment: "#f9f5f0"
  sandstone: "#f0e9e0"
  soft-bark: "#302820"
  garden-sage: "#7a9e7e"
  clay-red: "#a65d57"
  pine-shadow: "#2d5a4a"
  evening-ink: "#1e2a38"
  dark-study: "#0f1419"
typography:
  display:
    fontFamily: "Crimson Pro, Georgia, serif"
    fontSize: "clamp(1.5rem, 3vw, 1.875rem)"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.01em"
  headline:
    fontFamily: "Crimson Pro, Georgia, serif"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.01em"
  title:
    fontFamily: "DM Sans, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.35
  body:
    fontFamily: "DM Sans, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.6
  reading:
    fontFamily: "Literata, Source Serif 4, Georgia, serif"
    fontSize: "1.125rem"
    fontWeight: 400
    lineHeight: 1.85
  label:
    fontFamily: "DM Sans, system-ui, sans-serif"
    fontSize: "0.7rem"
    fontWeight: 600
    letterSpacing: "0.25em"
  mono:
    fontFamily: "Fira Code, monospace"
    fontSize: "0.875em"
    fontWeight: 400
    lineHeight: 1.6
rounded:
  sm: "0.375rem"
  md: "0.75rem"
  lg: "1rem"
  xl: "1.5rem"
spacing:
  xs: "0.25rem"
  sm: "0.5rem"
  md: "1rem"
  lg: "1.5rem"
  xl: "2rem"
  2xl: "2.5rem"
components:
  button-primary:
    backgroundColor: "{colors.candlelight-gold}"
    textColor: "#ffffff"
    rounded: "{rounded.md}"
    padding: "0.5rem 1rem"
  button-primary-hover:
    backgroundColor: "{colors.candlelight-gold-deep}"
  button-secondary:
    backgroundColor: "{colors.sandstone}"
    textColor: "#4a3f33"
    rounded: "{rounded.md}"
    padding: "0.5rem 1rem"
  button-ghost:
    textColor: "#6b5e4d"
    rounded: "{rounded.md}"
    padding: "0.5rem 1rem"
  card:
    backgroundColor: "{colors.cream-paper}"
    rounded: "{rounded.lg}"
    padding: "1.5rem"
  input:
    backgroundColor: "{colors.cream-paper}"
    textColor: "#1e2a38"
    rounded: "{rounded.md}"
    padding: "0.625rem 1rem"
---

# Design System: read-pal

## 1. Overview

**Creative North Star: "The Reading Nook"**

A favorite reading chair, afternoon light slanting through a window, a friend nearby who asks the right questions at the right time. That is the feeling read-pal's visual system aims to reproduce: unhurried warmth, the texture of paper and wood, the sense that knowledge lives here and someone cares about helping you find it.

The palette centers on Candlelight Gold (#d97706) as the single saturated accent against warm, paper-derived neutrals. Surfaces progress from cream to sandstone through four tonal tiers, creating depth without shadow. Typography shifts between two worlds: DM Sans handles the tool interface with calm efficiency, while Crimson Pro and Literata carry the reading experience with the warmth of well-set type. The system is deliberately restrained in its use of color and motion, saving visual energy for the content itself: the words in the books, the annotations in the margins, the flashcards you review.

This system explicitly rejects the generic SaaS dashboard: no cold grays, no blue accents, no data-heavy layouts that treat reading as just another workflow to optimize. It also rejects childish gamification: streaks and challenges exist, but they feel like entries in a personal journal, not cartoon celebrations.

**Key Characteristics:**
- Warm, tonal surface layering over dramatic shadows
- Single amber accent used sparingly (book spines, drop caps, focus rings)
- Dual typography registers: tool mode (sans) and reading mode (serif)
- AAA contrast for body text in reading mode
- Gently responsive interactions: unhurried transitions, warm hover states
- Three reading themes (light, dark, sepia) that preserve warmth across environments

## 2. Colors

The palette draws from natural materials: candlelight on paper, bark and leather, garden foliage, river clay. Every neutral is tinted warm; pure grays do not exist in this system.

### Primary
- **Candlelight Gold** (#d97706): The single saturated accent. Used for focus rings, drop caps, chapter ornaments, active navigation indicators, selection highlights, and primary button backgrounds. Its warmth signals attention without urgency. Appears on roughly 5-8% of any given screen.

### Secondary
- **Garden Sage** (#7a9e7e): Success states, knowledge graph connections, reading progress indicators. A muted green that feels like moss, not technology.
- **Clay Red** (#a65d57): Alerts, deletion confirmations, annotation highlights of type "disagree". An earthy red that warns without alarming.
- **Pine Shadow** (#2d5a4a): Secondary actions, knowledge graph nodes, feature icon backgrounds. A deep forest green that carries authority without coldness.

### Neutral
- **Cream Paper** (#fefdfb): Surface-0, the lightest background. The color of fresh, high-quality paper.
- **Warm Parchment** (#f9f5f0): Surface-1, secondary backgrounds, card groupings. Aged paper, warm but distinct.
- **Sandstone** (#f0e9e0): Surface-2, borders, dividers, subtle container backgrounds. The color of well-worn stone.
- **Soft Bark** (#302820): Deep text, dark backgrounds in light mode. The color of walnut wood.
- **Evening Ink** (#1e2a38): Primary text color. A navy so dark it reads as black but retains warmth.
- **Dark Study** (#0f1419): Surface-0 in dark mode. The color of a room at dusk with one lamp on.

### Named Rules

**The Single Accent Rule.** Candlelight Gold is the only saturated color that appears as a painted element (button, badge, icon fill). Sage, Clay Red, and Pine Shadow are supporting voices used for semantic meaning, never decoration. Restrained strategy: tinted neutrals carry 90% of the surface.

**The Warm Neutral Rule.** Every gray in this system is tinted toward amber. Pure #808080, cool gray, or blue-gray is forbidden. If a neutral feels cold, it does not belong here.

**The Dark Study Rule.** Dark mode is not inverted light mode. It is the same room after sunset: surfaces darken to deep navy-charcoal, text warms to parchment tones, and Candlelight Gold glows slightly brighter (#f59e0b in dark mode) because it must compensate for the reduced ambient light.

## 3. Typography

**Display Font:** Crimson Pro (with Georgia)
**Body Font:** DM Sans (with system-ui)
**Reading Font:** Literata (with Source Serif 4, Georgia)
**Mono Font:** Fira Code (with monospace)

**Character:** Two distinct registers that share one principle: comfort during extended use. DM Sans is a geometric sans that feels friendly without being informal. Crimson Pro is a display serif with the warmth of old book covers. Literata is a reading serif designed by Google for long-form screen reading, with a slightly larger x-height and open counters that reduce fatigue. The pairing works because both register families (sans and serif) share warmth as a quality rather than competing for attention.

### Hierarchy
- **Display** (Crimson Pro, 600, clamp(1.5rem, 3vw, 1.875rem), 1.25): Chapter titles and page-level headings in the reading experience. Used sparingly, always centered, always preceded by a chapter number label.
- **Headline** (Crimson Pro, 600, 1.5rem, 1.25): Section headings within the app: dashboard sections, settings categories, book detail sections.
- **Title** (DM Sans, 600, 1.125rem, 1.35): Card titles, list item headings, sidebar section labels. The workhorse heading for the tool interface.
- **Body** (DM Sans, 400, 0.875rem, 1.6): All UI text: descriptions, form fields, table cells, chat messages. Capped at 65ch for prose blocks.
- **Reading** (Literata, 400, 1.125rem, 1.85): The core reading experience. Justified text, hyphenation enabled, orphans/widows controlled at 3, max-width 72ch. Line-height of 1.85 is deliberately generous for multi-hour sessions.
- **Label** (DM Sans, 600, 0.7rem, 0.25em letter-spacing, uppercase): Navigation items, tab labels, chapter numbers, form labels. The system's quietest voice.
- **Mono** (Fira Code, 400, 0.875em, 1.6): Code blocks in reader content, API keys in settings, any fixed-width need.

### Named Rules

**The Two Register Rule.** Sans-serif (DM Sans) is the tool interface. Serif (Crimson Pro / Literata) is the reading experience. Never mix them within a single component. A button in reading mode is still DM Sans; a chapter title in the dashboard is still Crimson Pro.

**The Generous Leading Rule.** Reading mode line-height is 1.85, not the 1.5 typical of web UI. This is a product where users read for 30-90 minutes. The extra vertical space between lines prevents line-skipping and fatigue. UI text can use tighter leading (1.6) because it is scanned, not read continuously.

## 4. Elevation

The system uses a hybrid approach: tonal layering for structural depth, and interactive lift for reading materials that should feel physically present.

### Tonal Depth (default)
Most of the interface is flat. Depth is conveyed through the four surface tiers: Cream Paper (surface-0) sits on Warm Parchment (surface-1), which sits on Sandstone (surface-2). Each tier is a deliberate step in lightness, not a shadow. This creates a layered paper-on-desk feeling without the visual noise of drop shadows.

### Interactive Lift (reading materials)
Book covers, book cards, and reading-mode elements receive gentle shadows that make them feel like physical objects resting on the surface:

- **Resting** (`shadow-xs: 0 1px 2px rgba(30, 42, 56, 0.04)`): Cards at rest. Barely visible, just enough to separate from the background.
- **Hover** (`shadow-soft: 0 2px 8px -2px rgba(30, 42, 56, 0.08), 0 4px 16px -4px rgba(30, 42, 56, 0.04)`): Interactive cards on hover. A gentle lift, like picking up a postcard.
- **Raised** (`shadow-md: 0 4px 12px -2px rgba(30, 42, 56, 0.1), 0 8px 24px -4px rgba(30, 42, 56, 0.06)`): Modals, expanded panels. Clearly above the surface.
- **Elevated** (`shadow-lg: 0 8px 24px -4px rgba(30, 42, 56, 0.12), 0 16px 48px -8px rgba(30, 42, 56, 0.08)`): Overlays and popovers that need to float above everything.
- **Book** (`shadow-book`): Multi-layer shadow with a subtle inset bottom edge, mimicking the shadow cast by a physical book resting on a table.
- **Amber Glow** (`shadow-glow: 0 0 20px rgba(217, 119, 6, 0.2)`): Active streak indicators, featured elements, celebration moments. Used extremely sparingly.

### Named Rules

**The Flat-By-Default Rule.** Surfaces are flat at rest. Shadows appear only on reading-related elements (books, chapters) or as a response to state (hover, focus, raised). Dashboard cards, settings sections, and navigation items use tonal layering, not shadow.

**The Warm Shadow Rule.** All shadow colors use rgba(30, 42, 56, ...) with warm-tinted navy, never pure black (#000). Cold shadows break the warm atmosphere.

## 5. Components

### Buttons
Warmly responsive. Rounded but not bubbly. The press feedback (scale 0.98) gives a tactile quality that matches the physical-book metaphor.

- **Shape:** Gently rounded corners (0.75rem radius, 12px)
- **Primary:** Candlelight Gold background, white text, soft shadow. Hover deepens to #b45309 and shadow grows. Active press scales to 0.98.
- **Secondary:** Sandstone background, Soft Bark text, thin warm border. Hover darkens background to surface-3.
- **Ghost:** Transparent background, warm gray text. Hover reveals Sandstone background. The quietest action.
- **Focus:** 2px solid Candlelight Gold ring with 2px offset. Consistent across all variants.

### Cards / Containers
Cards are the primary container pattern. They use tonal depth (not shadow) at rest, gaining shadow on hover only for interactive variants.

- **Corner Style:** Generous rounding (1rem, 16px)
- **Background:** Cream Paper (surface-0)
- **Shadow Strategy:** shadow-xs at rest (barely perceptible). Interactive variants gain shadow-soft on hover with a 2px upward translation.
- **Border:** Faint Candlelight Gold tint (primary-200/50 opacity) in light mode. Thin gray border in dark mode.
- **Internal Padding:** 1.5rem (24px)

### Inputs / Fields
Inputs should feel like writing in a good notebook: clean, well-proportioned, with a satisfying focus state.

- **Style:** Cream Paper background, thin warm border, generous rounding (0.75rem)
- **Focus:** 2px ring of Candlelight Gold at 30% opacity + border shifts to full Candlelight Gold. A warm glow, not a cold spotlight.
- **Error:** Clay Red border and helper text. The error feels like a gentle correction, not an alarm.

### Navigation
Top navigation on desktop (8 items), bottom tab bar on mobile (5 items).

- **Desktop:** Text links in DM Sans label style. Active state uses a 2px Candlelight Gold underline centered below the text. Hover shows a faint Sandstone background.
- **Mobile:** Icon + short label. Active tab uses Candlelight Gold icon color. Inactive uses warm gray. Compact but not cramped.

### Reading Mode
The signature component. A full-screen immersive reading environment that removes all navigation chrome.

- **Typography:** Literata at 1.125rem, 1.85 line-height, justified, max-width 72ch.
- **Drop Caps:** First paragraph of each chapter opens with a Crimson Pro drop cap in Candlelight Gold.
- **Chapter Headers:** Centered layout with uppercase DM Sans chapter number label, Crimson Pro chapter title, decorative Candlelight Gold ornament divider.
- **Section Breaks:** Three asterisks centered (* * *) in Candlelight Gold at low opacity.
- **Highlights:** Colored marks with 2px border-radius, 0.2s ease transition on hover for selection.
- **Three Themes:** Light (Cream Paper), Dark (Dark Study), Sepia (#f8f4ec warm cream). All three preserve the warm atmosphere.

### AI Companion Chat
A persistent chat panel alongside the reading experience.

- **Persona Indicators:** Each AI persona has a distinct visual treatment: subtle icon differentiation, no avatar images.
- **Message Bubbles:** Minimal chrome. User messages align right with Sandstone background. AI responses align left with Cream Paper background.
- **Typing Indicator:** Gentle pulse in Candlelight Gold. Calm, not animated.

### Annotations Sidebar
Highlights, notes, and bookmarks organized alongside reading content.

- **Highlight Colors:** Semantic palette (Candlelight Gold for key passages, Garden Sage for definitions, Clay Red for disagreements, Pine Shadow for connections). Each color has meaning, not decoration.
- **Annotation Cards:** Compact, text-forward. Quote excerpt displayed with a faint left border in the highlight color (1px only, compliant with anti-pattern rules).

## 6. Do's and Don'ts

### Do:
- **Do** use Candlelight Gold sparingly. It is an accent, not a surface color. If more than 10% of a screen is amber, the design has lost restraint.
- **Do** ensure 7:1 contrast ratio for all reading-mode body text. This is a WCAG AAA product for extended reading sessions.
- **Do** use tonal surface layering (surface-0 through surface-3) for depth instead of shadows on non-reading elements.
- **Do** respect the two-register typography rule: DM Sans for tools, Crimson Pro / Literata for reading.
- **Do** use descriptive highlight colors that carry meaning (sage for definitions, russet for disagreements, not random rainbow).
- **Do** test all reading-mode screens in light, dark, and sepia themes.
- **Do** include focus-visible states on every interactive element. The Candlelight Gold ring is non-negotiable.
- **Do** animate with cubic-bezier(0.16, 1, 0.3, 1) (ease-out-expo) for state transitions. Unhurried and smooth.
- **Do** respect prefers-reduced-motion by collapsing all animations to near-instant (0.01ms).

### Don't:
- **Don't** use pure black (#000) or pure white (#fff). Every neutral must be tinted warm. If a gray looks cold, it does not belong.
- **Don't** create generic SaaS dashboard layouts with cold grays, blue accents, or data-heavy grids with no warmth. read-pal is a reading environment, not a management console (PRODUCT.md anti-reference).
- **Don't** add playful gamification: stickers, mascots, celebration animations, confetti. Gamification should feel like a personal journal, not a cartoon (PRODUCT.md anti-reference).
- **Don't** use border-left or border-right greater than 1px as a colored accent stripe on cards or list items. Full borders, background tints, or nothing.
- **Don't** use gradient text (background-clip: text with gradients). Use a single solid color; emphasize through weight or size instead.
- **Don't** use glassmorphism (backdrop-blur with semi-transparent backgrounds) as a decorative pattern. It is permitted for functional overlays only (modals, dropdowns).
- **Don't** create hero-metric templates (big number, small label, supporting stats, gradient accent). This is a reading app, not a SaaS dashboard.
- **Don't** build identical card grids (same-sized cards with icon + heading + text, repeated endlessly). Vary card sizes and layouts to reflect content hierarchy.
- **Don't** use em dashes. Commas, colons, semicolons, periods, or parentheses instead.
