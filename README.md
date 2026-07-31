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

The product is local-first. Repository contents are not sent to remote services.

The local graph store uses Node.js 22's built-in SQLite module, so no native database package or external database process is required.
