# Preview Cursor Fidelity Plan

## Goal

Show collaborator cursors and selections in the preview with character-level fidelity when source text maps cleanly to rendered output. When exact mapping is not possible, especially inside templates, highlight the full rendered template output instead of showing a misleading exact cursor.

## Core Approach

Use preview-time instrumentation. Render a temporary preview variant of the wikitext with invisible source markers inserted around collaborator cursor and selection boundaries, plus template-boundary markers where needed. After parsing, recover those markers from the rendered HTML and convert them into DOM ranges for overlays.

This avoids relying on the current coarse source map, which only maps top-level rendered blocks back to source lines.

## Implementation Plan

1. Track preview snapshots in `SplitPaneEditor`.

   Store `html`, `source`, `sourceVersion`, and marker metadata for the exact source text used to produce the currently displayed preview. This is required because preview rendering is debounced.

2. Collect collaborator cursors and selections.

   Use existing Yjs awareness data from `useYjs.ts`. A cursor with `anchor === head` renders as a caret. A cursor with `anchor !== head` renders as a selection from `min(anchor, head)` to `max(anchor, head)`.

3. Send marker requests with preview requests.

   Include collaborator cursor and selection positions for the source snapshot being rendered. The current custom WS protocol only supports strings and booleans, so marker requests can be encoded as JSON strings unless the protocol is extended.

4. Instrument wikitext before rendering.

   On the server, insert marker tokens into the temporary preview input at cursor and selection boundaries. Markers must survive parsing without visibly altering output and must never be written to Yjs or persisted.

5. Preserve only safe marker attributes through sanitization.

   Allow tightly scoped marker spans such as `span[data-wc-marker]`. Do not allow arbitrary `data-*` attributes.

6. Recover exact DOM positions in `PreviewContent`.

   After writing sanitized HTML into the shadow root, scan for marker spans. For carets, create a browser `Range` at the marker position and draw a vertical caret. For selections, create a `Range` from the start marker to the end marker and draw translucent rectangles from `range.getClientRects()`.

7. Render overlays outside the preview HTML.

   Add an absolutely positioned overlay layer inside the preview shadow root. Draw collaborator carets, selection rectangles, and labels there so wiki CSS and layout are not disturbed.

8. Handle debounced and stale preview state.

   Keep overlays tied to the preview snapshot that produced the displayed HTML. While a newer preview is pending, keep existing overlays visible but visually muted or marked as updating. Do not map live cursor offsets onto stale HTML.

9. Detect template contexts.

   Identify whether a cursor or selection intersects a template invocation. If so, also instrument the entire template call with template-boundary markers.

10. Highlight whole template output when exact mapping is unavailable.

    If exact cursor or selection markers cannot be recovered inside template-generated output, highlight the recovered template output region and place the collaborator label at the region edge.

11. Define a deterministic fallback chain.

    Use exact marker-to-marker DOM range first, exact caret marker second, whole-template output highlight third, coarse source-map block highlight fourth, and an unmapped preview presence strip last.

12. Test the behavior.

    Cover plain paragraph carets, text selections, inline formatting, headings, lists, tables, multi-block selections, template invocation fallback, marker sanitization, debounced stale preview behavior, and WS preview payload handling.

## Expected UX

Collaborator carets appear exactly where their source cursor renders in the preview when mapping survives. Text selections appear as translucent colored rectangles over rendered preview text. Labels appear near carets and selections. While preview rendering is debounced, overlays remain visible but become subtly stale. If someone edits a template parameter and exact mapping is not available, the rendered template output is highlighted with their label.

## Fidelity Expectations

This should provide character-level fidelity for normal rendered source text such as paragraphs, headings, lists, inline bold and italic text, and most local parser output. It will not be truly character-exact for template internals, parser functions, transclusions, or remote MediaWiki output that strips or reorders markers. Those cases intentionally fall back to whole-template output highlighting or coarser presence.
