# Grov interface refinement

## Direction

- Product: a personal finance workspace for reviewing balances, recording transactions, and understanding spending
- Character: calm, exact, a little warm
- World: financial ledgers, ruled paper, and blue ink
- Moments: the net worth history and the full-width spending comparison; color belongs to the data rather than the chrome
- Signature: tabular amounts, right-aligned money columns, and fine rules separating financial records

Keep Grov’s serif wordmark, bundled Geist font, blue brand accent, features, and navigation order. This is a refinement of the existing app, not a new brand or landing page.

## Audit and changes

1. Spacing: unify page gutters, card spacing, control heights, and compact desktop navigation. Remove duplicated spacing above the account chart and inside grouped accounts.
2. Color: replace competing green surfaces and teal hover fills with an ink-tinted neutral ramp. Keep blue for primary actions and chart series, with semantic colors for signed changes. Provide equivalent dark tokens.
3. Icons: retain Lucide navigation icons and remove decorative category emoji from transaction pickers, ledger rows, and trip details. Category data remains unchanged.
4. Copy: replace generic page descriptions, label financial comparisons, and remove the unsupported “Just now” account timestamp.
5. Type: use lighter page headings and larger balance figures. Replace uppercase, tracked table headings with readable sentence-style labels.
6. Layout: give net worth more width than the category-change list while preserving the full-width spending chart. Reuse the shared metric strip for trips.
7. Details: use actual buttons for account groups and separate account links from edit/archive controls. Constrain dialogs to the dynamic viewport and increase their close target. Show unknown totals as dashes, distinguish errors from empty data, preserve previously loaded trips on failure, and provide retry/create actions.
8. Visuals: keep real financial charts as the visual focus. Add a readable latest-balance summary, simplify chart axes and dots, and make tooltips theme-aware. No decorative imagery or new dependencies.
9. Motion: restrict button transitions to color, remove dialog zoom, disable account-chart animation, and retain the existing reduced-motion rules.

## Validation boundaries

Component tests cover net worth summaries, zero/empty/loading distinctions, dashboard filter preservation, trip retry and stale-data behavior, and keyboard account navigation. Existing finance, ledger, and editor tests remain the source of truth for calculations and transactions. Authenticated browser appearance still needs a review with real account data; no authentication or database policies are changed by this pass.

- `npm test`: 82 Vitest tests and 11 Node tests pass
- `npm run build`: production compilation and TypeScript checks pass
- Theme check: seven text/surface token pairs in each theme meet at least 4.5:1 contrast; this is not a complete accessibility audit
- `git diff --check`: passes
- `npm run lint`: still reports the existing explicit-`any` errors in `components/add-account-dialog.tsx:18` and `lib/constants.ts:3`, plus two existing unused-variable warnings in `lib/balances.ts`

Method: **unslop** by **Damir Sokolovsky**, licensed **CC BY 4.0**, used from the installed skill. Source: https://github.com/heydamir/unslop
