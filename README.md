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

The product is local-first. Repository contents are not sent to remote services.

The local graph store uses Node.js 22's built-in SQLite module, so no native database package or external database process is required.
