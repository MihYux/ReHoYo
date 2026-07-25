# ReHoYo UI Feel Guide

This document defines the visual and interaction language of the ReHoYo global release intelligence workspace. It is written for designers, engineers, and AI agents who need to extend the product or build a new interface that feels like it belongs to the same system.

The goal is not to copy isolated CSS values. The goal is to preserve the product's temperament: quiet, exact, evidence-led, and operationally serious.

## 1. The design read

ReHoYo is a desktop research and planning instrument for game publishing teams. It combines three familiar objects:

1. A well-edited strategy document
2. A research analyst's evidence workspace
3. A controlled AI workflow with explicit human approval

The interface should feel like a calm internal publication that happens to be editable. It should not feel like a generic SaaS dashboard, a consumer game launcher, a chat app, or a futuristic AI demo.

### Current design dials

- `DESIGN_VARIANCE: 4/10` - structured and aligned, with editorial scale changes and a few asymmetric workspaces
- `MOTION_INTENSITY: 3/10` - almost static, with motion reserved for state, feedback, and orientation
- `VISUAL_DENSITY: 7/10` - information-rich, but controlled through hierarchy, whitespace, and hairline dividers

### North-star sentence

Build a pale, precise, document-like desktop workspace where important judgments read like editorial headlines, supporting facts read like a research dossier, and controls remain quiet until action is required.

## 2. Emotional character

Use these words to judge every screen:

- Calm
- Analytical
- Editorial
- Trustworthy
- Local-first
- Deliberate
- Dense but breathable
- Technical without looking like a terminal
- Premium through restraint, not decoration

Avoid these qualities:

- Loud
- Playful
- Glossy
- Neon
- Game-themed
- Cyberpunk
- Chat-first
- Card-heavy
- Sales-oriented
- Excessively rounded
- Visually busy for its own sake

The experience should make a user feel that the system has done careful work, but the user remains the editor and final authority.

## 3. Core visual principles

### 3.1 The document is the main object

Content is not placed into a collection of floating widgets. Large portions of the product behave like one continuous research document with internal columns, rails, headings, evidence, and editable text.

Use a single large surface when information belongs to one artifact. Split it internally with borders and background shifts. Avoid wrapping every subsection in its own card.

Good:

- One bordered plan workspace with a contents rail, document body, and quality rail
- One region analysis surface divided into selected regions, analysis, and sources
- One brief surface with an executive summary and a structured grid beneath it

Wrong:

- A dashboard made from twelve independent shadowed cards
- Every metric enclosed in a pill or tile
- Repeated white boxes floating on the canvas with large gaps between them

### 3.2 Hierarchy comes from type, space, and rules

The system rarely uses shadow. Depth is communicated by:

- Large changes in type scale
- Pale background shifts
- Thin borders
- Column structure
- Sticky rails
- Deliberate whitespace

The page title can be very large. Most supporting interface text should be modest. The contrast between those scales creates the editorial identity.

### 3.3 Cyan is a signal, not a mood

Cyan marks active workflow, selected state, AI-assisted action, evidence linkage, and progress. It is not a decorative glow and should not flood the page.

Use cyan for:

- The active navigation underline
- Primary workflow progress
- Selected regions or controls
- Evidence IDs and active references
- AI action buttons
- Focus outlines
- Small section metadata
- A pale wash behind important synthesized content

Do not use cyan for:

- Large gradients
- Decorative blobs
- Every icon
- Every heading
- Large areas with no semantic meaning

### 3.4 Controls are subordinate to judgment

Buttons and fields should be immediately usable but visually quieter than the content they operate on. A release judgment or executive summary should dominate the screen. The controls used to save it should not.

### 3.5 State must be explicit

The product has a controlled sequence: draft, processing, review, approved, stale, failed. State is never implied only by color. Pair color with text and, where useful, an icon.

Human approval is a product principle and a visual principle. Generated work remains visibly editable. Approval controls appear at the boundary between stages.

## 4. Color system

The palette is cool, low-saturation, and paper-like. It uses a blue-gray canvas, white working surfaces, dark blue ink, restrained cyan, and muted semantic washes.

### 4.1 Canonical tokens

```css
:root {
  --canvas: #f5f8fa;
  --surface: #ffffff;
  --surface-muted: #f8fafb;

  --ink: #102433;
  --ink-soft: #304655;
  --muted: #60717d;
  --faint: #8b99a2;

  --line: #dde6eb;
  --line-strong: #c7d4dc;

  --cyan: #27b7ca;
  --cyan-deep: #167d8d;
  --cyan-wash: #eaf8fa;

  --green: #2f7255;
  --green-wash: #edf6f1;
  --amber: #8a6523;
  --amber-wash: #fbf5e7;
  --red: #9b4844;
  --red-wash: #faeeee;
}
```

### 4.2 Color proportions

On a typical screen, aim for roughly:

- 65 to 75 percent canvas or muted surface
- 20 to 30 percent white working surface
- 3 to 6 percent ink and border structure
- Less than 3 percent cyan and semantic color

This is a directional ratio, not a literal measurement. The key is that accent color remains scarce enough to mean something.

### 4.3 Text hierarchy

- `--ink`: page titles, major judgments, active labels, essential values
- `--ink-soft`: field labels, subsection titles, strong supporting text
- `--muted`: descriptions, editable body copy, inactive navigation
- `--faint`: metadata, timestamps, helper text, counts of secondary importance

Never use faint text for information required to complete a task. Helper text can be subtle, but labels, errors, and required conditions must remain readable.

### 4.4 Semantic color behavior

- Green means approved, completed, or safe to proceed
- Amber means review, boundary, uncertainty, or a condition requiring attention
- Red means failed, stale, destructive, or invalid
- Cyan means active, selected, in progress, linked, or AI-assisted

Semantic colors appear primarily as text plus a very pale wash. Avoid saturated alert blocks.

## 5. Typography

### 5.1 Font pairing

Use two families only:

```css
--font-ui: "Noto Sans SC Variable", "Noto Sans SC", "Microsoft YaHei", sans-serif;
--font-mono: "IBM Plex Mono", "SFMono-Regular", Consolas, monospace;
```

Noto Sans SC carries all Chinese interface and editorial text. IBM Plex Mono carries machine-readable metadata, evidence IDs, workflow numbering, dates, counts, and compact English labels.

Do not introduce a serif font. Do not use mono for long paragraphs. Do not mix several display fonts.

### 5.2 Editorial scale

Recommended roles:

| Role | Size | Weight | Line height | Tracking |
| --- | ---: | ---: | ---: | ---: |
| Page title | `38-58px` responsive | `620` | `1.08` | `-0.045em` |
| Gate title | `32px` | `600-620` | `1.2` | `-0.035em` |
| Region or document title | `26-32px` | `600-620` | `1.3-1.55` | `-0.03em` |
| Executive summary | `22-26px` | `400-520` | `1.55-1.65` | `-0.02em` |
| Section title | `20px` | `620` | `1.35` | `-0.02em` |
| Body | `14-15px` | `400` | `1.6-1.85` | normal |
| Control label | `11-12px` | `560-600` | `1.4-1.6` | normal |
| Mono metadata | `8-10px` | `400-500` | `1.3-1.6` | `0.08-0.15em` |

### 5.3 Headline behavior

Page titles are short Chinese statements, usually two lines, with editorial punctuation and a clear point of view. They are not generic nouns such as “Dashboard” or “Overview.”

Examples of the right form:

- 先让系统准确理解，这次版本为何重要。
- 同一个版本，在不同区域意味着什么。
- 一个全球主轴，多种当地表达。

The title describes the decision the user is making, not the database object being edited.

### 5.4 English microcopy

English appears as small mono metadata, not as primary content. Keep it uppercase, sparse, and functional:

- `VERSION INTELLIGENCE / INPUT`
- `REGIONAL SIGNALS / EVIDENCE`
- `GLOBAL RELEASE / ORCHESTRATION`
- `EXECUTIVE SUMMARY`
- `SELECTED REGIONS`

Use English to establish an instrument-panel rhythm. Use Chinese to explain, decide, and act.

### 5.5 Numbers

Use tabular mono numerals for:

- Completion values
- Region counts
- Workflow indices
- Evidence identifiers
- Dates and campaign weeks
- Source counts
- Confidence values

Large numbers should be light or medium weight, never ultra-bold.

## 6. Layout and spacing

### 6.1 Desktop canvas

The product is deliberately desktop-only in its current form.

- Minimum supported viewport: `1180px`
- Main content width: `min(1512px, calc(100% - 64px))`
- Header height: `72px`
- Main top padding: `58px`
- Main bottom padding: `96px`
- Footer height: `58px`

Below 1180px, show a clear desktop requirement instead of compressing the research workspace into an unusable mobile layout.

### 6.2 Page rhythm

The typical vertical rhythm is:

1. Sticky workflow header
2. Large editorial page introduction
3. Optional notice or state message
4. Hairline separator
5. Section heading with actions
6. Working surface
7. Repeated sections
8. Destructive boundary, when needed
9. Quiet local-workspace footer

Use approximately:

- `44px` after the page header
- `30px` before a new standard section
- `26px` after a section's top rule
- `22px` between a section heading and its surface
- `24-32px` internal padding for important work surfaces
- `8-18px` internal padding for compact operational rows

Spacing should feel measured, not mathematically identical. Large narrative areas receive more space than controls and metadata.

### 6.3 Page header

The page header is a two-column grid:

- Left: kicker, title, explanatory sentence
- Right: a compact reading such as completeness, region coverage, campaign window, or status

The right-hand reading begins with a top border and stays narrow. It is an analytical annotation, not a promotional hero card.

### 6.4 Section headers

Section headers generally contain:

- A compact section code such as `01-A`
- A Chinese section title
- A one-sentence note
- Actions aligned to the right

Keep section codes meaningful to workflow structure. Do not add numbering merely as decoration.

### 6.5 Workspace layouts

Use three-column application workspaces when the task has a clear navigation-document-reference model:

```text
[ selection or outline rail ] [ editable document ] [ evidence or quality rail ]
```

Canonical widths:

- Left rail: `210-226px`
- Center: `minmax(0, 1fr)`
- Right rail: `260-316px`

Rails use `--surface-muted`. The document uses white. Borders separate the zones. Sticky behavior begins below the 72px header, usually near `top: 92px`.

### 6.6 Grids

Use grids to compare content that belongs to one artifact:

- Two columns for form entry
- Three columns for a brief or global plan summary
- Two columns for character strategy blocks
- Seven equal cells only for the seven supported regions

Grid cells are usually separated by a single hairline. They do not need independent border radii.

## 7. Shape and material

### 7.1 Radius system

The shape language is compact and lightly softened:

- Major surfaces: `7-8px`
- Notices and compact containers: `5-6px`
- Inputs and buttons: `4-5px`
- Tiny metadata labels: `2-3px`
- Status badges only: full pill radius

Avoid radii above `12px`. Avoid large pill buttons. The interface should feel like a precise tool, not a friendly consumer app.

### 7.2 Borders

The 1px border is the primary organizing material.

Use `--line` for normal structure and `--line-strong` for interactive outlines or higher-emphasis boundaries. Borders should form continuous systems across rows and columns.

Avoid double borders. If adjacent cells share an edge, only one cell should draw it.

### 7.3 Shadows

Default to no shadow. Use a very subtle shadow only for true overlays such as a modal or floating picture-in-picture graph. Even then, border contrast should do most of the work.

### 7.4 Background shifts

Use background shifts to identify semantic zones:

- White for editable working surfaces
- `--surface-muted` for rails, support areas, and document utilities
- `--cyan-wash` for synthesized AI content, active selection, or an important global axis
- Semantic wash colors for review, completion, and failure

## 8. Components

### 8.1 Buttons

Buttons are compact, rectangular, and text-led.

Base recipe:

```css
min-height: 38px;
padding: 8px 15px;
border: 1px solid var(--line-strong);
border-radius: 5px;
font-weight: 560;
```

Variants:

- Default: white surface, ink text
- Primary: ink background, white text
- AI or stage-forward action: deep cyan background, white text
- Quiet: transparent border and background, muted text
- Danger: white background, muted red border and text

Rules:

- Use one primary action per local decision boundary
- Add an icon only when it improves scanning or clarifies the action
- Keep labels on one line
- On active press, scale to approximately `0.98`
- Disabled controls remain visible but lose contrast
- Never use gradients, glows, or oversized pills

### 8.2 Inputs

Fields are white, flat, and border-led.

- Label above input
- Optional helper text between label and control
- Required marker in deep cyan
- Input height around `41px`
- Textarea minimum height around `112px`
- Radius `5px`
- Hover strengthens the border
- Focus uses cyan border plus a very faint cool background

Large generated judgments can use borderless textareas when they live inside a clearly bounded document surface. This makes the artifact feel editable without making every paragraph look like a form field.

### 8.3 Status badges

Status badges are the main justified use of pills.

```css
min-height: 23px;
padding: 3px 8px;
font-family: var(--font-mono);
font-size: 9px;
letter-spacing: 0.05em;
border-radius: 999px;
```

Always display a textual state. Color alone is insufficient.

### 8.4 Notices

Notices use a two-column layout with an icon and content. They have a thin border, pale semantic wash, and concise copy.

Structure:

- Short strong title
- One supporting sentence
- Optional next action elsewhere, not embedded in a wall of text

### 8.5 Empty states

Empty states should look like the quiet opening page of a document.

- Left aligned
- Minimum height around `260px`
- One small meaningful icon
- A 20-22px title
- A short explanation of what creates the missing content
- No illustration, confetti, mascot, or fake preview

### 8.6 Loading states

Use skeletons shaped like the final page: kicker, title, line, then the actual panel proportions. Do not use a centered spinner as the entire screen.

Use spinning progress icons only inside compact controls or active workflow markers.

### 8.7 Tables and rows

Rows should read like research records:

- Compact leading icon or code
- Strong primary label
- Muted metadata beneath or beside it
- Status or action aligned right
- One bottom divider between rows

Do not turn every row into a rounded card. Evidence cards may be individually bordered because they behave as selectable references.

### 8.8 Evidence cards

Evidence cards are compact white references inside a muted rail. They include:

- Evidence ID and source type in cyan or mono
- Two-line title maximum
- Three-line excerpt maximum
- Publisher or date as faint metadata

Hover raises the card by only `1px` and strengthens the border. When a citation is selected from the document, the card can briefly flash with a cyan outline and pale fill to establish the connection.

### 8.9 Modals

Modals are reserved for consequential confirmation.

- Width around `460px`
- White surface
- 8px radius
- Dark translucent ink backdrop
- Short title and explanation
- Explicit confirmation input for destructive reset
- Actions aligned right

Do not use modal dialogs for routine editing.

## 9. Navigation and workflow

### 9.1 Global header

The header is sticky, 72px tall, and almost opaque white. It contains three zones:

1. Brand and product descriptor
2. Centered three-stage workflow navigation
3. Model and project metadata

The workflow labels stay on one line. Each stage shows a small number and a state marker. The active stage receives a 2px cyan underline. Hover uses only a muted background shift.

### 9.2 Workflow model

The three major stages are persistent and ordered:

1. Version understanding
2. Regional judgment
3. Release plan

The UI should always help the user answer:

- Where am I?
- What has been approved?
- What is processing?
- What became stale because an upstream fact changed?
- What action unlocks the next stage?

### 9.3 Approval boundaries

Approval bars sit at the bottom of an artifact. They use a muted surface, top border, explanatory copy on the left, and the next-stage action on the right.

This is an important signature. Do not scatter approval actions throughout the document. Let the user review the complete artifact, then encounter one clear boundary.

## 10. Motion and interaction

Motion exists to communicate state and spatial connection.

### 10.1 Timing

Use the shared ease:

```css
--ease: cubic-bezier(0.16, 1, 0.3, 1);
```

Typical durations:

- Hover and focus: `180-200ms`
- Progress width: `220ms`
- Expand, collapse, or picture-in-picture resize: `220ms`
- Page entrance: `460ms`
- Evidence connection flash: about `1100ms`

### 10.2 Allowed motion

- A page enters with a subtle `10px` upward settle
- Buttons scale to `0.98` when pressed
- Hovered evidence cards move up `1px`
- Progress bars change width smoothly
- Disclosure arrows rotate
- Processing icons rotate
- Active graph nodes pulse
- Active graph links show restrained directional particles
- A selected citation flashes its matching evidence card
- The graph can expand, collapse, or enter picture-in-picture mode

### 10.3 Forbidden motion

- Decorative parallax
- Infinite floating cards
- Bouncy navigation
- Gradient animation
- Cursor followers
- Large springy modals
- Auto-playing carousels
- Motion that suggests work is happening when no state has changed

### 10.4 Reduced motion

All nonessential motion must collapse under `prefers-reduced-motion: reduce`. Preserve the final state and selection clarity. Remove pulses, spins where possible, transitions, and flashes that are not required for comprehension.

## 11. The regional intelligence graph

The graph is the most visual part of the system, but it must still look like an analytical instrument.

### 11.1 Visual treatment

- Same pale canvas as the application
- Small circular nodes
- Cool cyan hierarchy from dark core to pale evidence
- Thin gray-cyan links
- Ink labels with no decorative bubbles
- Small mono legend and controls
- White detail bar beneath the canvas

### 11.2 Node hierarchy

- Core node: darkest cyan, visually stable at the center
- Region nodes: medium cyan and strongest labels
- Dimension nodes: pale cyan
- Evidence nodes: lightest cyan
- Selected node: thin ink ring
- Active node: restrained cyan pulse

### 11.3 Interaction

- Zoom is allowed
- Individual nodes can be dragged
- Empty-canvas panning is intentionally disabled in the current product
- Selecting an evidence node should reveal or focus the corresponding evidence record
- Fit-to-network should happen after layout settles and after size changes

Do not give the graph a black background, neon glow, thick links, oversized nodes, or animated noise. It is research infrastructure, not a sci-fi visualization.

## 12. Content voice

The interface voice is direct, specific, and respectful of operator expertise.

### 12.1 Headings

Use headings that frame a decision or question. Prefer a sentence with meaning over a generic category name.

### 12.2 Instructions

Explain:

- What the user should provide
- What the system will do
- What data leaves the machine
- What remains editable
- What approval changes

Avoid hype about AI. Describe the action and its boundary.

Good:

> AI 只补充空白字段。关键业务事实仍由你检查并确认保存。

Wrong:

> Unleash next-generation AI to revolutionize your global launch.

### 12.3 Safety and trust

Local storage, cloud parsing, source use, stale data, and irreversible actions should be described plainly at the moment they matter.

### 12.4 Labels

- Chinese for actions and user-facing concepts
- English mono for compact system classification
- Evidence IDs in mono
- Avoid emoji
- Avoid clever metaphors in operational copy
- Avoid fake precision and invented metrics

## 13. Accessibility and usability

The current visual style depends on subtle contrast, so accessibility must be deliberate.

- Keep a visible 2px cyan `:focus-visible` outline with 2px offset
- Pair state color with text or icon
- Keep input labels persistent and outside placeholders
- Ensure icon-only buttons have accessible names
- Use semantic regions, headings, nav, details, and dialog roles
- Preserve keyboard access for drop zones and disclosures
- Maintain readable contrast for faint metadata when it carries operational meaning
- Use minimum 34px square targets for icon buttons and 38px height for standard actions
- Announce changing progress and errors where appropriate
- Honor reduced motion
- Keep sticky headers from covering focused content

The desktop-only breakpoint is a product constraint, not an excuse for clipped layouts. Test at 1180px, 1280px, 1440px, and 1920px.

## 14. What to preserve when extending the product

Preserve these signature elements:

- Pale blue-gray canvas and white document surfaces
- Ink-first typography
- Noto Sans SC plus IBM Plex Mono
- Large two-line editorial page titles
- Cyan used as sparse workflow signal
- Thin continuous borders
- Compact radii
- Three-stage workflow navigation
- Narrow analytical readings in page headers
- Editable generated documents
- Evidence IDs and source rails
- Human approval bars at stage boundaries
- Local-workspace trust language
- Quiet, state-motivated motion

## 15. What not to copy blindly

Some implementation details are contextual, not universal rules.

- Do not add a section code if the new screen is not part of a sequential artifact
- Do not use a three-column rail layout unless the task truly has navigation, document, and reference zones
- Do not add status dots without real state
- Do not add progress bars where a number or status label is clearer
- Do not force every new module into cyan wash
- Do not reproduce long hairline tables if grouping or hierarchy would be clearer
- Do not crop or manipulate brand assets differently without checking the original logo treatment
- Do not add more English metadata merely to make a page look technical

## 16. Common failure modes

### Too much cyan

Symptom: most controls, headings, cards, and backgrounds are cyan.

Fix: return the page to canvas, white, and ink. Reserve cyan for active or linked state.

### Generic dashboard composition

Symptom: a top row of metric cards followed by equal feature cards.

Fix: identify the artifact the user is editing. Build one continuous surface with internal hierarchy.

### Excessive cards

Symptom: every paragraph sits in an 8px rounded white box.

Fix: remove containers. Use spacing, headings, and shared borders.

### Weak editorial hierarchy

Symptom: the page title, section titles, and body text all feel similar.

Fix: restore the large page title, compact mono metadata, and clear scale jumps.

### AI theater

Symptom: glowing gradients, sparkles everywhere, fake live counters, or chat bubbles.

Fix: describe actual state. Keep the AI affordance to a compact action and show editable results with sources.

### Soft consumer styling

Symptom: 16-24px radii, pill buttons, large shadows, friendly illustrations.

Fix: return to 4-8px radii, hairline borders, white surfaces, and text-led empty states.

### Uncontrolled density

Symptom: tiny text and dividers everywhere with no visual pause.

Fix: preserve density inside the artifact, then use 24-32px padding and larger judgment text to create breathing room.

### Motion for decoration

Symptom: panels float or animate continuously.

Fix: keep only motion that communicates loading, selection, connection, progress, or spatial mode.

## 17. Implementation recipes

### Standard page shell

```text
Sticky 72px header
  Brand | three workflow stages | model and project metadata

Main, max 1512px, 32px side gutters minimum
  Page intro, two columns
    Kicker + two-line title + description
    Compact analytical readout

  Notice if needed

  Section
    Top rule
    Section code + title + note | actions
    Working surface

Quiet footer with local-storage statement
```

### Research document surface

```text
8px outer radius, 1px border, white background

Left rail, 210-226px
  Muted background
  Compact mono heading
  48-54px rows
  White active row

Center document
  Pale cyan synthesis lead
  White editable dimensions
  Muted risk or utility block
  Approval boundary

Right rail, 260-316px
  Muted background
  Evidence or quality checks
  Compact white references
```

### Generated artifact

```text
Pale cyan executive summary
  Small mono label
  Large editable judgment

Structured grid
  Compact titles
  Borderless editable copy
  Shared hairline divisions

Approval bar
  Consequence explanation | one next-stage action
```

## 18. Build checklist for people and agents

Before considering a ReHoYo-style screen complete, verify:

- [ ] The page can be described as a document, research instrument, or workflow artifact
- [ ] The page title frames a decision and fits in two lines at the target width
- [ ] The Noto Sans SC and IBM Plex Mono pairing is preserved
- [ ] The canvas, surface, ink, line, and cyan tokens come from the shared palette
- [ ] Cyan appears only where it carries active, linked, progress, or AI meaning
- [ ] The screen uses one major surface instead of a grid of generic cards
- [ ] Border radii stay within the compact 4-8px system, except status pills
- [ ] Shadows are absent or limited to a true overlay
- [ ] Metadata is smaller and quieter than judgment text
- [ ] Buttons are compact, single-line, and have clear hierarchy
- [ ] Inputs have persistent labels and visible focus states
- [ ] Draft, processing, review, approved, stale, and failed states remain distinguishable without relying only on color
- [ ] Generated content is visibly editable
- [ ] Evidence is traceable through IDs and source surfaces
- [ ] The next approval boundary is clear and singular
- [ ] Empty, loading, error, disabled, stale, and destructive states are designed
- [ ] Animation communicates state, feedback, connection, or mode
- [ ] Reduced motion preserves full usability
- [ ] The screen works at the 1180px minimum desktop width
- [ ] Copy explains data and AI boundaries plainly
- [ ] The result feels like the same calm internal publication as the existing three stages

## 19. Compact prompt for another AI agent

Use this when asking an agent to build a new ReHoYo screen:

> Build this as part of the ReHoYo global release intelligence workspace. The style is a calm, evidence-led Chinese desktop research document, not a generic SaaS dashboard. Use the existing cool palette: `#f5f8fa` canvas, white surfaces, `#102433` ink, blue-gray supporting text and borders, and sparse cyan `#27b7ca` or `#167d8d` only for active workflow, evidence, progress, focus, and AI-assisted actions. Use Noto Sans SC for UI and editorial text and IBM Plex Mono for IDs, counts, dates, and small uppercase English metadata. Favor one large internally divided document surface over many floating cards. Use 1px hairline borders, 4-8px radii, almost no shadow, compact controls, large two-line Chinese page titles, muted rails, editable generated content, traceable evidence, and a clear human approval boundary. Motion must be subtle and state-driven. Support loading, empty, error, disabled, stale, processing, approved, and reduced-motion states. The product is desktop-only at 1180px and above. Do not add gradients, glows, large pills, decorative illustrations, chat UI, excessive cyan, or generic metric-card dashboards.

## 20. Source of truth

This guide was derived from the current implementation and rendered states in:

- `app/globals.css`
- `components/workspace-shell.tsx`
- `app/brief/page.tsx`
- `app/brief/brief.module.css`
- `app/regions/page.tsx`
- `app/regions/regions.module.css`
- `components/region-intelligence-viewport.tsx`
- `components/region-intelligence-viewport.module.css`
- `app/plan/page.tsx`
- `app/plan/plan.module.css`
- `test-results/workspace-shows-the-three-stage-Chinese-workspace/brief-workspace.png`
- `test-results/evidence-card-flash.png`
- `test-results/plan-current-state.png`

When the implementation and this guide disagree, first determine whether the code contains a one-off exception or the guide missed an intentional pattern. Update the shared token or component only after that distinction is clear.
