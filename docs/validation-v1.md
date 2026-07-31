# WDMCD v1 validation report

Date: 2026-07-31  
Runtime: Windows, Node.js 22.23.1, Conda environment `wdmcd`

## Scope

This report validates the v1 against the five repositories selected in `repository_test`. Each repository was cloned with `--depth 1`, initialized without product-specific code changes, scanned twice, opened through the shared JSON view models, and checked with `wdmcd validate`.

Times are indicative measurements from one local development machine. The first scan includes file discovery, TypeScript parsing, semantic modeling, snapshot export, history, and SQLite persistence. The cached scan still hashes source files and rebuilds the semantic snapshot, but skips the TypeScript compiler pass.

## Repository matrix

| Repository                                                                | Ref and commit         | Files | Nodes |  Edges | Routes | Tests | Capabilities | First scan | Cached scan | Result |
| ------------------------------------------------------------------------- | ---------------------- | ----: | ----: | -----: | -----: | ----: | -----------: | ---------: | ----------: | ------ |
| [NestJS TypeScript Starter](https://github.com/nestjs/typescript-starter) | `master` at `c4d9330`  |     5 |     8 |     16 |      1 |     1 |            1 |     1.00 s |      0.47 s | Valid  |
| [Next.js SaaS Starter](https://github.com/nextjs/saas-starter)            | `main` at `6e33e58`    |    38 |    55 |    150 |      4 |     0 |           12 |     1.31 s |      0.46 s | Valid  |
| [Novu](https://github.com/novuhq/novu)                                    | `next` at `9365e18`    | 7,921 | 8,413 | 37,426 |    459 |   587 |           32 |    77.88 s |      4.48 s | Valid  |
| [Medusa](https://github.com/medusajs/medusa)                              | `develop` at `b052008` | 8,241 | 8,295 | 25,909 |      8 |   915 |           45 |    74.24 s |      3.57 s | Valid  |
| [Cal.com](https://github.com/calcom/cal.com)                              | `main` at `3894f37`    | 4,989 | 5,335 | 12,405 |    263 |   436 |           82 |    56.08 s |      2.20 s | Valid  |

All five final scans produced zero analyzer diagnostics and all five stores passed `wdmcd validate` with zero issues. The `calcom/cal.diy` test URL resolves to the current `calcom/cal.com` repository.

## Real impact case

A local, unpushed branch named `wdmcd-impact-validation` was created in the Next.js SaaS Starter. The change added `lib/team/audit.ts` and made `GET /api/team` call `recordTeamRead`.

`wdmcd impact main...wdmcd-impact-validation` completed in 0.42 seconds and reported:

- both changed files and their exported symbols;
- Team as the directly affected capability;
- new observed `imports` and `calls` relations;
- the evidence IDs supporting those relations;
- a review question because no linked test covered the changed components.

No branch or test change was pushed to the source repository.

## Findings resolved

The real repositories exposed issues that the controlled fixture did not:

1. NestJS route decorators required case normalization from `Get` to `GET`.
2. Git refs with standard hyphens were rejected by impact range validation.
3. Monorepo discovery needed `apps` and `libs` in addition to `packages`.
4. Common application roots `lib` and `components` were missing from first-run discovery.
5. Grouping every `apps/*` file as one capability produced an unusable abstraction.
6. Organizational paths such as `packages/modules/order` needed the nested business domain.
7. External test repositories had to be excluded explicitly from flat ESLint and Prettier configuration.

Each issue has a focused regression test or a repeatable repository result.

## Acceptance evidence

- `examples/todo-saas` completes `init`, `scan`, `overview`, `capability`, and `validate` without manual configuration.
- The automated suite covers deterministic IDs, parser facts, route patterns, semantic precedence, non-fatal syntax diagnostics, graph differences, evidence-backed impact, history, storage, API contracts, correction, and confirmation.
- The production UI was checked at desktop size and at `390x844`. The capability editor, component search, filtered graph, overview, and impact views had no horizontal overflow.
- A capability can be renamed, described, associated with or removed from components, and confirmed through one explicit mutation that previews `.wdmcd/capabilities.yaml` as its destination.
- Capability graphs render at most 60 connected, prioritized nodes; the complete scope remains available to search and edit.
- The release tarball was installed into an isolated consumer. Its `wdmcd` binary reported version `0.1.0`, validated the fixture, served the bundled UI, and returned HTTP 200 from `/api/project`.

## Known limits

- Route extraction is intentionally limited to static Next.js App/Pages Router, Express, and NestJS patterns. Framework-specific route factories can be undercounted, as visible in Medusa.
- Cache invalidation is conservative: any analyzed source or configuration change rebuilds the full technical analysis. This keeps v1 behavior simple and deterministic.
- Very large first scans can exceed one minute. The stated target is 1,000 files under 60 seconds; the 4,989-file Cal.com scan completed in 56.08 seconds.
- Node.js 22 prints an experimental warning for its built-in SQLite module. WDMCD does not require a native database dependency or external process.
- Capability inference is a transparent starting point, not an architectural verdict. Large projects are expected to refine names and scope in versioned YAML or through the local editor.

## Reproduction

For a clean clone of any test repository:

```powershell
pnpm wdmcd --root C:\path\to\repository init
pnpm wdmcd --root C:\path\to\repository --format json scan
pnpm wdmcd --root C:\path\to\repository --format json scan
pnpm wdmcd --root C:\path\to\repository --format json overview
pnpm wdmcd --root C:\path\to\repository --format json validate
```

For impact analysis, check out and scan each ref once before running:

```powershell
pnpm wdmcd --root C:\path\to\repository --format json impact main...feature/name
```
