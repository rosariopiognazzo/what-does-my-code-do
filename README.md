# What Does My Code Do?

WDMCD builds a local, evidence-backed semantic map of a TypeScript or JavaScript project. The v1 focuses on capability-oriented navigation, traceable technical facts, Git impact analysis, and a lightweight local UI.

## Development

Create the requested Conda environment and install workspace dependencies:

```powershell
conda env create -f environment.yml
conda activate wdmcd
pnpm install
```

Useful commands:

```powershell
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm dev:cli -- --help
```

Run the current CLI against a local Git repository:

```powershell
pnpm dev:cli -- --root C:\path\to\project init
pnpm dev:cli -- --root C:\path\to\project scan
pnpm dev:cli -- --root C:\path\to\project overview
pnpm dev:cli -- --root C:\path\to\project capability "Billing"
pnpm dev:cli -- --root C:\path\to\project impact main...feature/billing
pnpm build
pnpm dev:cli -- --root C:\path\to\project open
pnpm dev:cli -- --root C:\path\to\project validate
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

`scan` recognizes TypeScript and JavaScript modules, exported symbols, local imports, statically resolvable calls, test imports, and basic Next.js, Express, and NestJS routes. It writes the validated graph to both `.wdmcd/snapshots/latest.json` and the ignored `.wdmcd/cache/graph.sqlite` store. Unsupported or malformed files are reported as diagnostics without aborting the repository scan.

The semantic pass gives curated capabilities in `.wdmcd/capabilities.yaml` precedence, then proposes transparent domain-area capabilities with `inferred` evidence. `overview` is capability-first; `capability <name>` drills into roles, flows, source evidence, and review questions without requiring the user to inspect the whole file graph.

Each semantic model change is appended to `.wdmcd/history/change-events.jsonl`. Impact analysis compares evidence-backed snapshots instead of guessing a graph from patch text: scan each ref once, then run `wdmcd impact base...head`. The report includes changed files and symbols, directly affected capabilities, evidence-backed downstream chains up to two hops, relation changes, linked tests, and review questions.

`open` starts a read-mostly Hono API and the React interface on `127.0.0.1`; if port `4317` is occupied it selects the next available port. The web app consumes the same validated overview, capability, and impact view models as the CLI. Confirming a capability is the only mutating UI action: it updates `.wdmcd/capabilities.yaml` and immediately rescans the local model.

## Controlled example

`examples/todo-saas` is a small acceptance repository with Auth, Todos, and Notifications capabilities:

```powershell
pnpm dev:cli -- --root examples/todo-saas init
pnpm dev:cli -- --root examples/todo-saas scan
pnpm dev:cli -- --root examples/todo-saas overview
```

The product is local-first. Repository contents are not sent to remote services.

The local graph store uses Node.js 22's built-in SQLite module, so no native database package or external database process is required.
