# Tempo style

Tempo is a calm, editorial fitness-coach interface. It should feel personal and considered rather than clinical or aggressively “AI.” The visual contrast is deliberate: a warm coral action color against a quiet sage-and-cream workspace.

The source of truth for reusable code tokens is [`styles/tempo-tokens.css`](styles/tempo-tokens.css). The complete app treatment, including layout and memory-card states, lives in [`app/globals.css`](app/globals.css) and the components under [`components/`](components/).

## Copy the style into another project

1. Copy `styles/tempo-tokens.css` into the new project.
2. Add the token file to the global stylesheet, or import it from the app shell:

```css
@import "./styles/tempo-tokens.css";
```

3. Add `tempo-theme` to the app root.
4. Use `tempo-display` for large editorial headings and `tempo-eyebrow` for small uppercase labels.
5. Use `tempo-card` for panels and `tempo-button-primary` for the single high-attention action on a screen.

The token file is intentionally dependency-free. It works with plain CSS, CSS Modules, Tailwind layers, or a component library.

## Design tokens

| Role | Token | Value | Use |
| --- | --- | --- | --- |
| Canvas | `--tempo-paper` | `#f6f6f0` | Page background |
| Surface | `--tempo-surface` | `#fafbf6` | Header and light surfaces |
| Strong surface | `--tempo-surface-strong` | `#fdfdf9` | Chat and memory cards |
| Muted surface | `--tempo-surface-muted` | `#f0f2e8` | Memory-board background |
| Ink | `--tempo-ink` | `#303a32` | Primary text |
| Soft ink | `--tempo-ink-soft` | `#536348` | Body copy and memory labels |
| Muted text | `--tempo-muted` | `#8a8c80` | Metadata and helper copy |
| Rule | `--tempo-line` | `#e4e6dc` | Borders and dividers |
| Action | `--tempo-coral` | `#d56b47` | Primary CTA and brand accent |
| Action hover | `--tempo-coral-dark` | `#c7613f` | CTA hover state |
| Sage | `--tempo-sage` | `#536e58` | Coach actions and calm emphasis |
| Amber | `--tempo-amber` | `#b39860` | Check-in and expiring-memory state |
| Serif | `--tempo-serif` | Georgia stack | Editorial headings |
| Sans | `--tempo-sans` | Arial stack | UI, labels, and body text |

Use rounded corners sparingly: 5px for controls, 8px for cards inside a panel, and 14px for primary panels. Keep shadows nearly invisible; separation comes from a one-pixel rule and a small difference in surface color.

## Typography

- Large page and welcome headings use the serif stack, regular weight, and tight tracking. Keep them short and let the line break create rhythm.
- Interface labels are sans-serif, uppercase, small, and letter-spaced. They should explain where the user is without competing with the content.
- Body copy is compact but generous in line height: 12–14px with roughly 1.75–1.85 line height.
- Metadata is quiet: 8–10px and muted sage/gray.
- Do not use bold, saturated, or oversized text for ordinary data. Reserve the visual peak for the primary invitation and the current memory state.

## Layout recipe

```text
Top bar:       brand + descriptor                 | data mode + reset + avatar
Memory clock:  current simulation date            | fast-forward action
Page heading:  editorial title                    | health-snapshot date
Health strip:  sleep       HRV       steps       | source note
Workspace:     chat / coach (60%)                 | memory board (40%)
Footer:        quiet principle                    | product signature
```

Use a desktop-first two-column workspace. The chat panel is the primary narrative surface; the memory board should remain visible beside it so a judge can connect a sentence to a card immediately. Keep both panels approximately the same height and use internal scrolling for long conversations.

## Memory tiers

| Tier | Icon language | Surface cue | Meaning |
| --- | --- | --- | --- |
| Core | Lock | Warm cream / peach | Durable safety or identity facts |
| Goals | Target | Cool pale blue-green | What the person is working toward |
| Moments | Waves | Pale sage | Temporary context that may fade |

Cards should show a short label, one quiet status line, and a lifespan ring. Core and goals use a full ring. Moments drain over time. A moment that needs confirmation uses an amber border and a gentle pulse; it must never disappear silently.

## Interaction and motion

- New memories enter with a small upward motion, scale from 0.97 to 1, and a brief glow.
- A fading moment reduces opacity and shifts its ring toward amber.
- A pending check-in pulses gently, with no more than a two-pixel visual change.
- A resolved memory moves to a collapsed history row with a checkmark.
- A naturally faded moment shrinks and fades out; preserve it in history when the product needs an audit trail.
- Buttons move only one pixel on press. Avoid bounce, parallax, confetti, or looping decorative animation.
- Respect `prefers-reduced-motion` at all times.

## Copy style

Write like a thoughtful coach: warm, direct, and specific. Use plain language, short paragraphs, and concrete next actions. A check-in should sound like a person beginning a conversation: “How’s the knee feeling?” Keep system language out of the user-facing copy. Labels such as “memory clock” and “health snapshot” are enough to make the demo legible.

## Accessibility rules

- Keep body and chip text readable against the cream surfaces; do not use the muted color for essential content.
- Never use color alone to communicate a memory state. Pair it with text such as “Awaiting your check-in,” “7 days remaining,” or “Confirmed resolved.”
- Give lifespan rings an accessible label.
- Keep keyboard focus visible with a sage outline.
- Provide a text fallback for charts and streaming states.

## Do / avoid

**Do:** use one warm action color, pale surfaces, quiet rules, editorial headings, visible provenance chips, and generous whitespace.

**Avoid:** dark dashboards, neon gradients, glassmorphism, dense metrics grids, generic “AI assistant” language, or cards that all look equally urgent.
