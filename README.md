# What Does My Code Do?

WDMCD builds a local, evidence-backed semantic map of a TypeScript or JavaScript project. The v1 focuses on capability-oriented navigation, traceable technical facts, Git impact analysis, and a lightweight local UI.

## Quick start

Run WDMCD directly from GitHub inside the repository you want to understand:

```powershell
npx --yes github:rosariopiognazzo/what-does-my-code-do init
npx --yes github:rosariopiognazzo/what-does-my-code-do scan
npx --yes github:rosariopiognazzo/what-does-my-code-do open
```

No account, token, global installation, or remote service is required. Source code stays on the local machine.

## Development

Create the requested Conda environment and install workspace dependencies:

```powershell
conda env create -f environment.yml
conda activate wdmcd
pnpm install
pnpm build
```

Useful commands:

```powershell
pnpm typecheck
pnpm lint
pnpm test
pnpm wdmcd --help
```

Run the current CLI against a local Git repository:

```powershell
pnpm wdmcd --root C:\path\to\project init
pnpm wdmcd --root C:\path\to\project scan
pnpm wdmcd --root C:\path\to\project overview
pnpm wdmcd --root C:\path\to\project capability "Billing"
pnpm wdmcd --root C:\path\to\project impact main...feature/billing
pnpm wdmcd --root C:\path\to\project open
pnpm wdmcd --root C:\path\to\project validate
```

`init` is idempotent and creates the smallest versionable model surface:

```text
.wdmcd/
  config.json
  capabilities.yaml
  open-questions.yaml
  .gitignore
```

The generated `.wdmcd/.gitignore` excludes only `cache/`; curated YAML and exported snapshots remain versionable. Add `--format json` to any command when a stable machine-readable response is needed.

`init` detects common application and monorepo roots including `src`, `app`, `apps`, `pages`, `packages`, `lib`, `libs`, and `components`. The generated configuration remains small and can be narrowed for a repository with unusual boundaries.

`scan` recognizes TypeScript and JavaScript modules, exported symbols, local imports, statically resolvable calls, test imports, and basic Next.js, Express, and NestJS routes. It writes the validated graph to both `.wdmcd/snapshots/latest.json` and the ignored `.wdmcd/cache/graph.sqlite` store. Unsupported or malformed files are reported as diagnostics without aborting the repository scan. A content-addressed cache skips the compiler pass when source and configuration are unchanged.

The semantic pass gives curated capabilities in `.wdmcd/capabilities.yaml` precedence, then proposes transparent domain-area capabilities with `inferred` evidence. `overview` is capability-first; `capability <name>` drills into roles, flows, source evidence, and review questions without requiring the user to inspect the whole file graph.

Each semantic model change is appended to `.wdmcd/history/change-events.jsonl`. Impact analysis compares evidence-backed snapshots instead of guessing a graph from patch text: scan each ref once, then run `wdmcd impact base...head`. The report includes changed files and symbols, directly affected capabilities, evidence-backed downstream chains up to two hops, relation changes, linked tests, and review questions.

`open` starts a read-mostly Hono API and the React interface on `127.0.0.1`; if port `4317` is occupied it selects the next available port. The web app consumes the same validated overview, capability, and impact view models as the CLI. Its single explicit mutation can rename, describe, rescope, and confirm a capability; it shows `.wdmcd/capabilities.yaml` as the destination and immediately rescans the local model.

Large capability graphs are reduced to at most 60 connected, prioritized nodes in the canvas. Component search and the curated scope editor still operate on the complete snapshot.

## Controlled example

`examples/todo-saas` is a small acceptance repository with Auth, Todos, and Notifications capabilities:

```powershell
pnpm wdmcd --root examples/todo-saas init
pnpm wdmcd --root examples/todo-saas scan
pnpm wdmcd --root examples/todo-saas overview
```

The product is local-first. Repository contents are not sent to remote services.

The local graph store uses Node.js 22's built-in SQLite module, so no native database package or external database process is required.

See [the v1 validation report](docs/validation-v1.md) for the five-repository matrix, measured scan times, the real Git impact case, and known limits.
