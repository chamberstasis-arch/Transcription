---
name: Arbolista
description: Editor visual de árboles re-ordenables, tema "Blueprint Terminal" oscuro
colors:
  bg: "#0a0d13"
  panel: "#11151e"
  panel-2: "#141a26"
  elevated: "#19212f"
  border: "#232b3b"
  border-strong: "#2d384c"
  text: "#e7ebf2"
  text-dim: "#aeb8c8"
  muted: "#71809a"
  accent: "#c8f750"
  accent-bright: "#d4ff63"
  accent-dim: "#9bc23a"
  accent-ink: "#0a0d13"
  danger: "#fb7185"
  danger-dim: "#5a2b35"
typography:
  display:
    fontFamily: "Bricolage Grotesque, system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 800
    lineHeight: 1.1
    letterSpacing: "-0.02em"
  title:
    fontFamily: "Bricolage Grotesque, system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.01em"
  body:
    fontFamily: "Hanken Grotesk, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 500
    lineHeight: 1.5
    letterSpacing: "normal"
  label:
    fontFamily: "JetBrains Mono, ui-monospace, monospace"
    fontSize: "11px"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "0.14em"
  overline:
    fontFamily: "JetBrains Mono, ui-monospace, monospace"
    fontSize: "10px"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "0.22em"
  mono:
    fontFamily: "JetBrains Mono, ui-monospace, monospace"
    fontSize: "11px"
    fontWeight: 500
    lineHeight: 1.55
    letterSpacing: "0.01em"
rounded:
  xs: "6px"
  sm: "8px"
  md: "12px"
  pill: "99px"
spacing:
  xs: "6px"
  sm: "8px"
  md: "12px"
  base: "14px"
  lg: "18px"
  xl: "22px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.accent-ink}"
    rounded: "{rounded.sm}"
    padding: "0 12px"
    height: "36px"
    typography: "{typography.body}"
  button-primary-hover:
    backgroundColor: "{colors.accent-bright}"
    textColor: "{colors.accent-ink}"
  button-default:
    backgroundColor: "{colors.elevated}"
    textColor: "{colors.text-dim}"
    rounded: "{rounded.sm}"
    padding: "0 12px"
    height: "36px"
    typography: "{typography.body}"
  button-default-hover:
    backgroundColor: "#1f2838"
    textColor: "{colors.text}"
  button-danger:
    backgroundColor: "rgba(251, 113, 133, 0.08)"
    textColor: "{colors.danger}"
    rounded: "{rounded.sm}"
    padding: "0 12px"
    height: "36px"
  chip:
    backgroundColor: "{colors.elevated}"
    textColor: "{colors.text-dim}"
    rounded: "{rounded.pill}"
    padding: "0 9px"
    height: "22px"
    typography: "{typography.mono}"
  input:
    backgroundColor: "{colors.bg}"
    textColor: "{colors.text}"
    rounded: "{rounded.sm}"
    padding: "0 11px"
    height: "36px"
    typography: "{typography.body}"
  card:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
    padding: "{spacing.base}"
  tab-active:
    backgroundColor: "{colors.panel-2}"
    textColor: "{colors.text}"
    rounded: "9px 9px 0 0"
    padding: "0 8px 0 11px"
    height: "34px"
  node-row-selected:
    backgroundColor: "rgba(200, 247, 80, 0.08)"
    textColor: "{colors.text}"
    rounded: "{rounded.sm}"
    height: "42px"
---

# Design System: Arbolista

## 1. Overview

**Creative North Star: "The Blueprint Terminal"**

Arbolista looks like an architect's drafting table rendered in a terminal. The surface is a deep blue-black field overlaid with a faint 26px graph-paper grid and a single cold-lime glow bleeding in from the top-right corner, as if a drafting lamp were switched on over the canvas. Structure is the subject: the product exists to draw, re-order and color hierarchical trees, so the visual language treats every line, indent guide and node like a drawn element on technical paper. Lime ink is the cursor. It marks only what is live: the focused panel, the selected node, the active tab, the primary action.

The system is technical without being cold and dense without being noisy. Monospace carries every machine-fact (counts, depths, JSON, tab labels, section headers) while two grotesques carry the human voice: a heavy, slightly quirky display grotesque for identity and a clean humanist grotesque for everything you read. Density is high, like an IDE, but rhythm is deliberate: panels breathe at 18px, controls pack at 6 to 8px, and the accent is rationed so the eye always knows where the work is happening.

This system explicitly rejects the generic AI-tool aesthetic: no purple-to-blue gradients on white, no glassmorphism card stacks, no neon-on-black crypto sheen, no hero-metric dashboard template, no identical icon-heading-text card grids. The lime is agricultural and electric, not cyber. The dark is navy-graphite, not pure black. The chrome is drafting paper, not frosted glass.

**Key Characteristics:**
- Dark "blueprint" surface: navy-graphite neutrals plus a faint dot/line grid and one corner glow.
- Exactly one accent (electric lime) used as a live-state cursor on roughly 10% of any screen.
- Tri-typographic system: heavy display grotesque, humanist body grotesque, monospace for all data and labels.
- Full borders and tonal layering for depth. Shadows are reserved for floating surfaces only.
- High information density organized into bordered work surfaces (canvas + right rail), never loose floating cards.

## 2. Colors

A near-monochrome navy-graphite ramp doing all the structural work, lit by a single high-chroma lime that never competes with itself.

### Primary
- **Electric Lime** (`#c8f750`): The one voice. Reserved for live state and primary intent: the brand mark, the active tab underline, the focused panel ring, the selected node tint, primary buttons, focus outlines, switch "on", active toggles, and the "applied" confirmation. On dark it reads as a charged chartreuse, closer to a highlighter than to neon.
- **Lime Bright** (`#d4ff63`): Hover state for accent surfaces only (primary button hover). One step lighter, never used at rest.
- **Lime Dim** (`#9bc23a`): The darker companion in the brand-mark gradient and for accent text that must sit quieter than full lime.
- **Accent Ink** (`#0a0d13`): The near-black text printed on top of any lime fill. Lime is bright enough that its labels must be dark, never white.

### Neutral
- **Void** (`#0a0d13`): The page floor. Also the recessed fill of inputs, the JSON wells and search fields, so data entry reads as cut into the surface.
- **Panel** (`#11151e`): The primary work-surface fill: the canvas, the right-rail sections, resting tabs.
- **Panel Raised** (`#141a26`): The slightly lifted surface for popovers and the active tab body.
- **Elevated** (`#19212f`): Control fill: default buttons, chips, toolbar buttons, the node count badge, switch track at rest.
- **Hairline** (`#232b3b`): The default 1px border and divider on every surface. The drafting line of the system.
- **Hairline Strong** (`#2d384c`): The emphasized border for hover, popovers and scrollbar thumbs.
- **Ink** (`#e7ebf2`): Primary text. A soft off-white tinted toward the surface hue, never `#fff`.
- **Ink Dim** (`#aeb8c8`): Secondary text, control labels, button text at rest.
- **Muted** (`#71809a`): Tertiary text, hints, placeholder, mono metadata, inactive icons.

### Tertiary (status only)
- **Danger** (`#fb7185`): Destructive actions (delete) and validation errors only. Never decorative.
- **Danger Dim** (`#5a2b35`): The border/edge companion for danger surfaces.

### Named Rules
**The One Cursor Rule.** Lime is a cursor, not a color scheme. It appears on at most ~10% of any screen and always means "this is live or this is the primary action." If two lime elements compete for "live" on the same surface, one is wrong.

**The Blueprint Grid Rule.** The page background is fixed, non-negotiable, and never applied to inner panels: a top-right radial lime glow at 8% over Void, plus two 1px white grids at 2.2% opacity on a 26px pitch (`background-image: radial-gradient(900px 500px at 78% -8%, rgba(200,247,80,0.08), transparent 60%), linear-gradient(rgba(255,255,255,0.022) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.022) 1px, transparent 1px); background-size: 100% 100%, 26px 26px, 26px 26px`). Panels sit on the grid as solid drafting boards; they do not repeat it.

**The Tinted Neutral Rule.** No `#000`, no `#fff`. Every neutral is tinted toward the blueprint hue (roughly OKLCH hue 260, chroma 0.02 to 0.035). Pure grey is forbidden.

## 3. Typography

**Display Font:** Bricolage Grotesque (with system-ui, sans-serif)
**Body Font:** Hanken Grotesk (with system-ui, sans-serif)
**Label / Mono Font:** JetBrains Mono (with ui-monospace, monospace)

Loaded from Google Fonts: `Bricolage Grotesque:opsz,wght@12..96,400..800`, `JetBrains Mono:wght@400;500;600;700`, `Hanken Grotesk:wght@400;500;600`.

**Character:** A three-voice system with a clear division of labor. Bricolage Grotesque is the heavy, slightly idiosyncratic display voice used sparingly for identity. Hanken Grotesk is the calm humanist sans you actually read in controls and bodies. JetBrains Mono is the machine voice: it stamps every number, code fragment, status line and section header, and it is what makes the product feel like instrumentation rather than a generic web app.

### Hierarchy
- **Display** (Bricolage Grotesque, 800, 20px, line-height 1.1, letter-spacing -0.02em): The product name only.
- **Title** (Bricolage Grotesque, 700, 17px, letter-spacing -0.01em): Canvas / panel titles like "Árbol de nodos".
- **Body** (Hanken Grotesk, 500, 14px, line-height 1.5): Node labels, button text, input text, setting labels. Default reading voice. Cap prose at 65 to 75ch.
- **Label** (JetBrains Mono, 600, 11px, letter-spacing 0.14em, UPPERCASE): Right-rail section headers ("AJUSTES", "EXPORTAR JSON").
- **Overline** (JetBrains Mono, 600, 10px, letter-spacing 0.22em, UPPERCASE): The "CANVAS" eyebrow tag.
- **Mono / Data** (JetBrains Mono, 500, 11px): Chips, node counts, depth readouts, tab labels, hints, JSON preview/editor, hex values, the brand tagline.

### Named Rules
**The Machine-Voice Rule.** Anything that is a number, code, status, key, count, or structural label is set in JetBrains Mono, frequently uppercase with wide tracking. Anything a human reads as language (names, button verbs, helper sentences) is set in Hanken Grotesk. Never blur the two.

**The Rare Display Rule.** Bricolage Grotesque appears only at the two title altitudes (product name, panel title). It is never used for body, buttons, or labels.

## 4. Elevation

Depth is built primarily from tonal layering, not shadow. The stack climbs by lightness over the blueprint hue: Void (`#0a0d13`) for the floor and recessed inputs, Panel (`#11151e`) for work surfaces, Panel Raised (`#141a26`) for popovers, Elevated (`#19212f`) for controls. A 1px Hairline border separates almost every adjacent surface. Shadow is the exception, used only for surfaces that genuinely float above the page.

### Shadow Vocabulary
- **Board shadow** (`box-shadow: 0 18px 40px -24px rgba(0,0,0,0.8)`): The single resting shadow, applied to the large work surfaces (canvas, panes) to lift them off the grid. Deep, soft, heavily offset downward.
- **Popover shadow** (`box-shadow: 0 20px 50px -18px rgba(0,0,0,0.85)`): Stronger lift for transient floating layers (color/style popover).
- **Accent glow** (`box-shadow: 0 6px 18px -6px rgba(200,247,80,0.6)`): Reserved exclusively for the lime brand mark, so the one lime "lamp" appears to emit light.
- **Focus ring** (`outline: 2px solid #c8f750; outline-offset: 1px`): Keyboard focus. Also expressed as `inset 0 0 0 1px rgba(200,247,80,0.35)` for the selected node and focused pane.

### Named Rules
**The Layer-Not-Lift Rule.** Reach for a lighter neutral and a hairline border before reaching for a shadow. Shadows belong to the two big boards and to transient popovers. Buttons, chips, inputs and rows are flat: they express state through fill and border, never through drop shadow.

**The Single Glow Rule.** The only colored shadow in the system is the lime glow under the brand mark. Lime glow is never applied to buttons, cards, or text.

## 5. Components

### Buttons
- **Shape:** Gently rounded corners (8px / `{rounded.sm}`). Compact icon controls use 6px.
- **Primary (`.btn--accent`, `.tbtn--accent`):** Lime fill (`#c8f750`) with Accent Ink text and 600 weight; hover lifts to Lime Bright (`#d4ff63`). Used once per context for the dominant action ("Nodo raíz", "Aplicar").
- **Default (`.btn`):** Elevated fill (`#19212f`), Hairline border, Ink Dim text; hover shifts fill to `#1f2838`, text to Ink, border to Hairline Strong. Height 36px (toolbar variant `.tbtn` is 32px).
- **Danger (`.btn--danger`):** Translucent danger wash (`rgba(251,113,133,0.08)`), Danger text and border; hover deepens the wash. Reserved for delete / clear.
- **Icon button (`.row-btn`, 26px square):** Transparent at rest, revealed on row hover; hover gives Elevated fill + Hairline border. The danger variant tints toward Danger on hover only.
- **Disabled:** `opacity: 0.4`, `cursor: not-allowed`. Never remove the element; dim it.

### Chips
- **Style:** Pill (99px radius), Elevated fill, Hairline border, Mono 11px in Ink Dim. The `--ghost` variant swaps to a 2% white fill for header metadata.
- **State:** Read-only metadata badges (node counts, level counts, depth). Not interactive, not colored.

### Cards / Work Surfaces
- **Corner Style:** 12px (`{rounded.md}`) for boards and panel sections; popovers also 12px.
- **Background:** Panel (`#11151e`) on the blueprint grid.
- **Shadow Strategy:** Only the two large boards (canvas, panes) carry Board shadow. Right-rail sections are flat with a Hairline border.
- **Border:** 1px Hairline on every surface. The focused pane swaps to a lime border plus inset lime ring.
- **Internal Padding:** 14px (`{spacing.base}`) for sections, 14 to 16px for board bars.

**The No Floating Cards Rule.** Content lives inside two bordered work surfaces (the canvas board and the right rail of stacked sections), not in a field of loose drop-shadowed cards. Sections in the rail are separated by borders and 14px gaps, never by shadow. Nested cards are forbidden.

### Inputs / Fields
- **Style:** Recessed into the surface: Void fill (`#0a0d13`), 1px Hairline border, 8px radius, 36px height, Body text. Search and stepper share the language at smaller sizes.
- **Focus:** Border shifts to lime (`#c8f750`). No glow, no shadow, just the ink line.
- **JSON wells:** Mono 11.5 to 12px, Void fill, used for the export preview (read-only) and import editor (`resize: vertical`).
- **Error:** A single line of Danger text with a warning glyph, directly under the field. No modal, no toast.

### Navigation (Tabs + View controls)
- **Tabs:** Browser-style folder tabs with a 9px top radius, sitting on a bottom Hairline. Resting tabs use Panel; the active tab uses Panel Raised, Ink text, a lime icon, and a 2px lime underline bleeding to its bottom edge. A split tab shows a small lime "2" badge; close (×) appears from the second tab onward. Double-click to rename inline (lime-bordered input).
- **View controls:** A 3-button segmented group (single / vertical split / horizontal split) in a Void track; the active mode fills lime with Accent Ink.

### Switch
- 44x26px track, Elevated at rest with a Muted knob; "on" turns the track to a 20%-lime wash with a lime border and a lime knob translated 18px. Knob easing uses a slight overshoot (`cubic-bezier(0.34, 1.56, 0.64, 1)`), the one place a spring is allowed.

### Color Swatches (signature)
- A 7-column grid of square swatches (6px radius) plus a "no color" cell (Ban glyph) and a custom-color row that opens the native picker. Active swatch shows a 2px Ink ring (`::after`, inset -2px). Hover scales to 1.12. The grid is sized so 21 cells form exactly 3 rows.

### Tree Node Row (signature)
- A 42px row: a grip (drag handle, revealed on hover), a disclosure chevron that rotates 90deg when open, a 9px color dot, the Body label, and a mono count badge for parents. Indentation is 22px per level.
- **Selected:** 8%-lime fill plus an inset lime ring (`inset 0 0 0 1px rgba(200,247,80,0.35)`).
- **Drop target:** 10%-lime fill plus a stronger inset lime ring while dragging.
- **Color encoding:** A node's user-assigned color is shown as the 9px dot and reinforced by a thin 2px vertical tick at the row's left edge. This tick encodes data (the node's color), it is not a decorative accent stripe.

## 6. Do's and Don'ts

### Do:
- **Do** keep lime to roughly 10% of any screen, only on live state and the single primary action (The One Cursor Rule).
- **Do** print every number, code fragment, status line, tab label and section header in JetBrains Mono, usually uppercase with 0.14 to 0.22em tracking.
- **Do** build depth by climbing the tonal ramp (Void to Panel to Panel Raised to Elevated) with 1px Hairline borders, before considering a shadow.
- **Do** recess data-entry surfaces to Void fill so inputs read as cut into the board, and shift their border to lime on focus.
- **Do** keep the fixed blueprint background (corner lime glow + 26px white grid) on the page floor only, with solid panels on top.
- **Do** print dark Accent Ink text on every lime fill; lime is too bright for white text.
- **Do** reveal row controls (grip, action buttons) on hover and for the selected/focused state, keeping the resting row quiet.

### Don't:
- **Don't** introduce a second accent hue. One lime, full stop. No teal/lime, no amber/lime pairings for chrome (user-assigned node colors are data, and are the only place other hues appear).
- **Don't** use `#000` or `#fff`; every neutral is tinted toward the blueprint hue.
- **Don't** ship the generic AI-tool look: purple-to-blue gradients on white, neon-on-black crypto sheen, the hero-metric dashboard template, or grids of identical icon-heading-text cards.
- **Don't** spread glassmorphism. The only `backdrop-filter` blur in the system is the sticky top header; panels, popovers and cards are solid fills. No frosted glass cards.
- **Don't** use `background-clip: text` gradient text. Emphasis comes from weight, size, and the lime fill, never from gradient text.
- **Don't** add a colored `border-left` or `border-right` greater than 1px as a decorative stripe on cards, sections, list items or alerts. The node row's 2px color tick is the single exception, and only because it encodes the node's own color as data.
- **Don't** drop-shadow buttons, chips, inputs, rows or rail sections. Shadow is for the two big boards, popovers, and the lime brand mark only.
- **Don't** reach for a modal. Editing happens inline (node rows, the right-rail inspector); errors render as a line under the field.
