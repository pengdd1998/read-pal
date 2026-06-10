---
name: ReadPal
description: A playful, cozy mobile reading companion with AI-powered conversation and gamified discovery.
colors:
  curious-gold: "#d97706"
  curious-gold-light: "#f59e0b"
  curious-gold-deep: "#b45309"
  inkstone: "#1e2a38"
  inkstone-soft: "#3d5578"
  inkstone-muted: "#6b7f96"
  inkstone-whisper: "#b1bbc9"
  cream: "#fdfbf7"
  cream-warm: "#f9f5f0"
  cream-dark: "#f0e9e0"
  cream-deep: "#e8dfd4"
  sage-green: "#6b9e76"
  terracotta: "#a65d57"
  forest: "#2d5a4a"
typography:
  display:
    fontFamily: "Crimson Pro, Georgia, serif"
    fontSize: "28px"
    fontWeight: 700
    lineHeight: 34
  title:
    fontFamily: "DM Sans, system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 600
    lineHeight: 26
  body:
    fontFamily: "DM Sans, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 22
  body-medium:
    fontFamily: "DM Sans, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 500
    lineHeight: 22
  caption:
    fontFamily: "DM Sans, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 18
  label:
    fontFamily: "DM Sans, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 600
    lineHeight: 16
    letterSpacing: "0.8px"
  button:
    fontFamily: "DM Sans, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 600
    lineHeight: 22
rounded:
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
  xxl: "24px"
  xxxl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.curious-gold}"
    textColor: "{colors.cream}"
    rounded: "{rounded.md}"
    padding: "12px 24px"
  button-primary-hover:
    backgroundColor: "{colors.curious-gold-light}"
  button-primary-disabled:
    backgroundColor: "{colors.cream-deep}"
    textColor: "{colors.inkstone-whisper}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.curious-gold}"
    rounded: "{rounded.md}"
    padding: "12px 24px"
  chip-filter:
    backgroundColor: "{colors.cream}"
    textColor: "{colors.inkstone-muted}"
    rounded: "{rounded.full}"
    padding: "12px 16px"
  chip-filter-active:
    backgroundColor: "{colors.curious-gold}"
    textColor: "{colors.cream}"
  card-surface:
    backgroundColor: "{colors.cream}"
    rounded: "{rounded.lg}"
    padding: "16px"
  input-field:
    backgroundColor: "{colors.cream-warm}"
    textColor: "{colors.inkstone}"
    rounded: "{rounded.md}"
    padding: "14px 12px"
  input-field-error:
    backgroundColor: "{colors.cream-warm}"
    textColor: "{colors.inkstone}"
    rounded: "{rounded.md}"
    padding: "14px 12px"
  tab-bar:
    backgroundColor: "{colors.cream}"
    textColor: "{colors.curious-gold}"
    height: "60px"
---

# Design System: ReadPal

## 1. Overview

**Creative North Star: "The Cozy Reading Nook"**

ReadPal's design system wraps every interaction in warmth. It feels like settling into a favorite armchair with a cup of tea and a book you've been looking forward to all day. The palette is built around warm creams and ambers, the typography pairs a serif display voice with a friendly sans body, and shadows lift cards just enough to feel real without breaking the cozy intimacy.

The system rejects three things categorically: the cold efficiency of SaaS dashboards, the noise of social media feeds, and the sterile file-management feel of Kindle clones. Every screen invites you to stay, not to check metrics. Every card feels like it belongs on a well-loved bookshelf, not in a data table.

Interactive components are refined and restrained. Buttons have gentle curves and warm fills. Inputs sit in cream backgrounds with soft borders. Elevation is clear and structural: cards lift visibly off the surface to announce interactivity, but never shout. The gold accent appears sparingly, marking primary actions and active states, then stepping back so the content breathes.

**Key Characteristics:**
- Warm, cream-dominant surfaces that feel like paper, not pixels
- Curious Gold accent used sparingly for CTAs, active states, and gamification highlights
- Clear structural elevation: cards lift with visible shadows to signal interactivity
- Serif display type for warmth, sans for clarity; scale contrast between them
- Playful micro-copy and persona greetings that surprise without demanding attention
- WCAG AAA contrast targets with dyslexia-friendly reading options

## 2. Colors

A warm palette centered on cream surfaces and a single gold accent. The neutral range is tinted warm, never cold gray. Every background whispers "paper," never "screen."

### Primary
- **Curious Gold** (#d97706): The single accent. Used for primary buttons, active tab indicators, progress bars, streak counters, and CTA fills. Appears on roughly 8% of any given screen. Its rarity makes it feel warm and intentional, not loud.

### Secondary
- **Sage Green** (#6b9e76): Success, completion states, and mastery indicators. Used for completed badges, flashcard mastery bars, and the "done" filter state.
- **Terracotta** (#a65d57): Destructive actions, error states, and sign-out. Used sparingly for error borders, the logout button, and stop-streaming controls.
- **Forest** (#2d5a4a): The AI chat button and select deep-accent elements. Dark, grounded, natural.

### Neutral
- **Cream** (#fdfbf7): The primary surface. Cards, tab bar, elevated containers. Warm-tinted off-white, never pure white.
- **Cream Warm** (#f9f5f0): The background canvas. The base color behind all content. Reads as warm paper.
- **Cream Dark** (#f0e9e0): Dividers, borders, inactive track backgrounds for progress bars. The boundary color.
- **Cream Deep** (#e8dfd4): Disabled states, deep borders, and skeleton placeholders.
- **Inkstone** (#1e2a38): Primary text color. Dark, warm, readable. Never pure black.
- **Inkstone Soft** (#3d5578): Secondary headings, slightly lighter emphasis text.
- **Inkstone Muted** (#6b7f96): Caption text, helper text, timestamps. Meets WCAG AA on cream backgrounds.
- **Inkstone Whisper** (#b1bbc9): Disabled text, subtle labels, meta information. Use only on cream or white surfaces, never on dark backgrounds.

### Named Rules
**The Curious Gold Rule.** Curious Gold appears on primary actions, active states, and gamification elements only. It never decorates. If more than 10% of a screen's visible area is gold, pull back.

**The Warm Neutral Rule.** Every neutral is tinted warm. No cool grays, no blue-grays, no pure whites. The palette stays in the amber-warm hue family end to end.

## 3. Typography

**Display Font:** Crimson Pro (with Georgia, serif fallback)
**Body Font:** DM Sans (with system-ui, sans-serif fallback)
**Reading Font:** Literata (for the EPUB reader)

**Character:** A serif display face brings warmth and literary personality to headings. DM Sans carries body text with friendly clarity. The weight contrast (700 for display, 400 for body) creates clear hierarchy without shouting. In the reader, Literata provides a comfortable reading experience with dyslexia-friendly proportions.

### Hierarchy
- **Display** (700, 28px, 34px line-height): Screen titles, the greeting header, streak count numbers. Sets the literary tone.
- **Title** (600, 20px, 26px line-height): Section headings, card titles, settings section titles. Can be overridden to 17-18px in tighter spaces.
- **Body** (400, 15px, 22px line-height): Paragraph text, descriptions, chat messages. Maximum line length 65-75ch in reader views.
- **Body Medium** (500, 15px, 22px line-height): Emphasized body text, list item titles, persona names.
- **Caption** (400, 13px, 18px line-height): Metadata, timestamps, helper text, secondary labels.
- **Label** (600, 11px, 16px line-height, 0.8px tracking): Overlines, section headers in settings, chip text. Usually uppercase in practice.
- **Button** (600, 16px, 22px line-height): All button text. Can be sized down to 13-14px for compact buttons.

### Named Rules
**The Two-Family Rule.** Crimson Pro is for display text only (screen titles, large numbers). DM Sans handles everything else: body, labels, buttons, captions. Never use Crimson Pro for UI labels or button text.

**The Scale Discipline Rule.** The defined scale steps are display, title, body, caption, label, button. Avoid creating intermediate sizes. If a component needs a different size, extend the scale deliberately rather than overriding inline.

## 4. Elevation

ReadPal uses clear structural lift. Cards and interactive surfaces are elevated with visible shadows that create a tactile, layered feel. The reading nook has depth: surfaces sit at different heights, and the shadows make that legible.

### Shadow Vocabulary
- **Ambient** (shadow: 0 2px 4px rgba(30,42,56,0.04), elevation 1): Default card elevation. Subtle presence, used on most surface[0] containers.
- **Lifted** (shadow: 0 4px 8px rgba(30,42,56,0.08), elevation 3): Hero cards, active elements, FABs. Visibly lifts off the surface.
- **Prominent** (shadow: 0 8px 16px rgba(30,42,56,0.12), elevation 6): Floating menus, modal surfaces, the AI assistant FAB. Highest elevation tier.

### Named Rules
**The Resting State Rule.** Shadows are present even at rest. ReadPal is not a flat design system. Cards sit slightly above the cream background by default, creating a gentle stacked-paper feel.

**The No-Glow Rule.** Shadows use Inkstone (the text color) as their source, never pure black and never the accent color. No colored glow shadows.

## 5. Components

### Buttons
- **Shape:** Gently rounded (12px radius)
- **Primary:** Curious Gold background, Cream text, 12-16px vertical padding, full-width on mobile. Shadow: Ambient.
- **Hover/Pressed:** Lightens to Curious Gold Light (#f59e0b). Opacity 0.7 on active press.
- **Disabled:** Cream Deep background, Inkstone Whisper text.
- **Ghost/Secondary:** Transparent background, Curious Gold text. Used for navigation links and secondary actions.

### Chips
- **Style:** Cream background, Inkstone Muted text, fully rounded (9999px radius).
- **Active state:** Curious Gold fill, Cream text. Clear toggle signal.
- **Filter chips:** 12px vertical padding (44px minimum touch target height).

### Cards / Containers
- **Corner Style:** 16px radius for cards, 12px for compact containers.
- **Background:** Cream (#fdfbf7) for elevated cards. Cream Warm (#f9f5f0) for the page background.
- **Shadow Strategy:** Ambient by default, Lifted for hero/featured cards.
- **Border:** 1px Cream Dark border for subtle delineation when needed. Never side-stripe borders.
- **Internal Padding:** 16-24px, varying for rhythm.

### Inputs / Fields
- **Style:** Cream Warm background, 12px radius, 50px height for text inputs. Transparent border by default.
- **Focus:** No explicit focus ring in current implementation. Error state: Terracotta border.
- **Icon prefix:** 18px icons in Inkstone Muted, left-aligned with 8px gap to text.

### Navigation
- **Tab bar:** 60px height, Cream background, Cream Dark top border. Active tab: Curious Gold tint + filled icon. Inactive: Inkstone Muted outline icon.
- **Screen headers:** Display typography, no border, padded 16-20px.
- **Back navigation:** Arrow-back icon in Curious Gold, 40px touch target.

### AI Insight Bubble
A signature component. Displays persona-generated reading insights inside the hero card. Cream-tinted amber background (#fef8ee), 12px radius, persona icon + name header in persona color, body text in Inkstone Soft. No border-left stripe.

### Persona Cards
Horizontal carousel of 140px-wide cards with 56px avatar circles. Selected state: 2px Curious Gold border + amber glow shadow. Spring animation on press (scale to 0.95 then back). Reduced motion: crossfade instead.

## 6. Do's and Don'ts

### Do:
- **Do** keep Curious Gold to primary actions and active states. Its warmth is its power; dilute it and it becomes noise.
- **Do** use clear structural shadows on cards. The reading nook has depth.
- **Do** vary card elevation and background treatment to create visual rhythm. Not every section needs a white card.
- **Do** maintain 44px minimum touch targets on all interactive elements.
- **Do** support reduced motion: replace spring/pulse animations with opacity crossfades when `AccessibilityInfo.isReduceMotionEnabled` is true.
- **Do** tint all neutrals warm. The palette lives in the amber family.
- **Do** use Crimson Pro only for display headings. It brings warmth to titles and should never appear in UI labels.

### Don't:
- **Don't** use `border-left` or `border-right` greater than 1px as a colored stripe on cards, list items, or callouts. This is the SaaS sidebar reflex. Use background tints, full borders, or leading icons instead.
- **Don't** use the hero-metric template (big number + small label + gradient accent). As PRODUCT.md says: "avoid generic SaaS dashboards with corporate blue/gray palettes and data-heavy layouts."
- **Don't** create identical card grids. Every card in a group should not look like every other card. Vary sizes, layouts, and prominence.
- **Don't** use pure white (#ffffff) or pure black (#000000). Use Cream and Inkstone instead.
- **Don't** use decorative continuous animations. Motion conveys state (selection, press, loading), not decoration. No endless pulses.
- **Don't** use display fonts in UI labels, buttons, or data cells. DM Sans only for interface text.
- **Don't** mimic Kindle's sterile library grid or a social feed's engagement metrics. As PRODUCT.md says: "Don't mimic Kindle's sterile library or a social feed's noise. Be the cozy bookshelf with a friendly cat on it."
- **Don't** use cool grays or blue-gray neutrals anywhere in the palette. Every neutral carries warmth.
