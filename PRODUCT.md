# WealthFlow — Piano Investimenti

A single-file, zero-dependency dashboard that shows where one monthly salary goes: a
current account for everyday spending, a deposit-account emergency fund, and an
investment bucket (PIC & PAC) with a target-allocation breakdown.

It is a **static explanatory artifact**, not a live app. There is no data layer, no
build step, no server. Figures are hand-edited in `Piano_investimenti.html`.

## Register

product

Design serves the task. The user is reading a financial plan, not admiring a page.
Earned familiarity beats novelty; the interface should disappear into the numbers.

## Users & Purpose

- **Primary use:** shown to other people — a partner, family, or anyone the plan is
  being explained to — as well as reviewed personally.
- **Consequence for design:** legibility and first-read clarity outrank information
  density. Someone seeing this for the first time, on a handed-over phone, must be
  able to read every figure and reach every detail without being told how.
- **Job to be done:** answer three questions at a glance — how much goes where each
  month, how much is accumulated in each bucket, and what the investment allocation
  is targeting.
- **Language:** Italian. Currency is EUR, formatted `1.970 €` (dot thousands
  separator, space before the symbol).

## Target platforms

- **Confirmed scope:** mobile portrait, **360px to 430px** wide, plus desktop up to
  the existing 1180px container maximum.
- Landscape phone / short-viewport tablet was explicitly **out of scope** as a
  verification target. The root-height fix incidentally helps it; nothing is
  designed for it.
- Touch is a first-class input. Nothing may depend on hover.

## Brand & Personality

Dark, high-contrast, instrument-panel. Neon accents on near-black, monospace
numerals, glass surfaces. Reads as a financial terminal rather than a consumer
banking app.

**This aesthetic is settled and not up for revision.** Visual identity changes are
out of scope for current work. Where the implementation carries known design
anti-patterns (heavy glassmorphism, `1px` border paired with wide drop shadow,
neon glow stacking), those are **recorded as findings, not acted on** — see
`docs/superpowers/specs/2026-09-21-mobile-responsive-audit.md`. The single
exception: blur may be removed from surfaces that are already near-opaque, because
there the blur is invisible and only costs frame rate.

## Anti-references

- Consumer banking apps (Revolut, N26): too soft, too rounded, too illustrative.
- Marketing/landing-page grammar: no section eyebrows, no numbered section markers,
  no hero-metric template. This is a panel, not a pitch.

## Accessibility

WCAG 2.2 AA was **not** adopted as a formal target. The floor actually being held:

- **Touch targets ≥ 44×44px** for anything tappable (explicitly requested).
- **Legible minimum type.** No rendered text below 11px. Sub-10px labels are
  treated as defects because the primary use is showing this to other people.
- **No hover-only functionality.** Every interaction reachable by touch.
- **Reduced motion honoured.** Required by the design skill regardless of AA scope;
  the file currently has one infinite animation and no `prefers-reduced-motion`
  block.
- Keyboard access and ARIA are improved opportunistically where a task already
  touches the markup, not pursued exhaustively.

## Strategic design principles

1. **Structure is the responsive lever, not fluid type.** Collapse columns, change
   layout mode, promote the detail panel to a sheet. Clamp only the large numeric
   displays, which genuinely must span 360px→1180px.
2. **Nothing disappears on mobile.** Every figure and every breakdown available on
   desktop must be reachable on a 360px phone. Hiding a section is a bug, not a
   breakpoint.
3. **One source of truth per figure.** A number rendered twice in two layout modes
   is a maintenance trap; exactly one must be in the accessibility tree at a time.
4. **Desktop-first CSS is the established pattern here** (one `max-width: 960px`
   block). Honour it rather than inverting 3000 lines to mobile-first, but prefer
   intrinsic sizing (`min()`, `clamp()`, `aspect-ratio`, container queries) over
   adding breakpoints.

## Constraints

- Single self-contained `.html` file. No bundler, no framework, no external JS.
  Only external requests are two Google Fonts families.
- Tests are PowerShell scripts in `tests/` that assert against the HTML source as
  text. They catch structural regressions, **not** rendered layout — visual
  verification across viewports is always a manual step.
- Plans and specs live in `docs/superpowers/plans/` and `docs/superpowers/specs/`.
