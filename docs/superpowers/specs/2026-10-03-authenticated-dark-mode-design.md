# Authenticated workspace dark mode

## Goal

Replace the current partial dark mode with a coherent, Instagram-inspired
true-dark theme for the authenticated WinTrack workspace. The visual direction
uses a near-black canvas, charcoal surfaces, quiet dividers, high-legibility
text, and one ModAE-red action accent. It preserves the existing information
architecture, layout density, workflow behavior, and semantic status meaning.

## Evidence and root cause

`ThemeProvider` enables dark mode by adding `dark` to the document root, so the
active selector is `html.dark`. Several late, more specific overrides instead
target `.shell.theme-dark`, which is never set. Separate late dashboard rules
also hardcode light backgrounds and text. As a result, screens combine black
inputs or cards with a white page background, as shown in the supplied
Approvals and My Dashboard screenshots.

## Theme contract

The theme has one authoritative root selector: `html.dark`. It owns semantic
tokens and the legacy aliases that existing screens consume.

| Role | Value | Use |
| --- | --- | --- |
| Canvas | `#000000` | App/page background |
| Base surface | `#121212` | Cards, tables, modals |
| Raised surface | `#1c1c1e` | Inputs, toolbars, hover states |
| Divider | `#262626` | Borders and row rules |
| Primary text | `#f5f5f5` | Headings and values |
| Secondary text | `#a8a8a8` | Supporting copy and labels |
| ModAE action | existing dark red token | Primary actions, selection, active navigation |

Semantic success, warning, danger, and information colours remain distinct;
they are not repurposed as brand decoration. Focus indicators retain visible
keyboard contrast. Print output and the public showcase landing are excluded.

## Implementation boundaries

1. Consolidate global theme variables under `html.dark` and remove selector
   drift between `html.dark` and `.shell.theme-dark`.
2. Convert the final workspace/dashboard, table, filter, card, and form rules
   from hardcoded light values to the shared dark semantic roles.
3. Preserve existing light-mode rules and all current component behavior.
4. Add source-level regression checks that the dark theme targets the active
   root selector and no late authenticated-workspace rule hardcodes a white
   surface.

## Acceptance checks

- Toggling dark mode changes the entire authenticated desktop and tablet
  workspace without white cards, white inputs, or light table bodies.
- Dashboard, Approvals, Opportunities, Inbox, and modals share the defined
  canvas/surface/border/text hierarchy.
- Primary actions stay recognisably ModAE red; text, fields, and focus states
  meet the existing contrast checks.
- The public showcase and print styling are unchanged.
- Relevant tests, the production build, and `git diff --check` run cleanly;
  any unrelated existing test failures are reported separately.
