import { access, readFile } from 'node:fs/promises';
import path from 'node:path';

import {
  normalizeProjectPath,
  parseJsonText,
  slugify,
  type ProjectContext,
  type WdmcdConfig,
} from '@wdmcd/core';
import fg from 'fast-glob';

interface PackageJson {
  name?: string;
  description?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function packageManager(root: string): Promise<ProjectContext['packageManager']> {
  const lockfiles: Array<[string, ProjectContext['packageManager']]> = [
    ['pnpm-lock.yaml', 'pnpm'],
    ['yarn.lock', 'yarn'],
    ['bun.lock', 'bun'],
    ['bun.lockb', 'bun'],
    ['package-lock.json', 'npm'],
  ];
  for (const [file, manager] of lockfiles) {
    if (await exists(path.join(root, file))) return manager;
  }
  return 'unknown';
}

function detectFrameworks(packageJson: PackageJson): string[] {
  const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };
  const candidates: Array<[string, string]> = [
    ['next', 'Next.js'],
    ['@nestjs/core', 'NestJS'],
    ['express', 'Express'],
    ['react', 'React'],
    ['vue', 'Vue'],
    ['@angular/core', 'Angular'],
    ['hono', 'Hono'],
  ];
  return candidates.filter(([dependency]) => dependency in dependencies).map(([, name]) => name);
}

async function readPurpose(root: string, packageJson: PackageJson): Promise<string | undefined> {
  if (packageJson.description?.trim()) return packageJson.description.trim();
  for (const fileName of ['README.md', 'readme.md']) {
    try {
      const content = await readFile(path.join(root, fileName), 'utf8');
      const paragraph = content
        .split(/\r?\n\s*\r?\n/)
        .map((part) => part.replace(/^#+\s+.*$/gm, '').trim())
        .find((part) => part && !part.startsWith('![') && !part.startsWith('[!['));
      if (paragraph) return paragraph.replace(/\s+/g, ' ').slice(0, 300);
    } catch {
      // README is optional.
    }
  }
  return undefined;
}

export async function discoverProject(root: string, config: WdmcdConfig): Promise<ProjectContext> {
  const resolvedRoot = path.resolve(root);
  const packageJson = parseJsonText(
    await readFile(path.join(resolvedRoot, 'package.json'), 'utf8'),
  ) as PackageJson;
  const name = packageJson.name?.trim() || path.basename(resolvedRoot);
  const sourceRoots: string[] = [];
  for (const candidate of config.include) {
    if (candidate === '.' || (await exists(path.join(resolvedRoot, candidate)))) {
      sourceRoots.push(normalizeProjectPath(candidate));
    }
  }

  const entrypointCandidates = await fg(
    [
      'src/{index,main,server}.{ts,tsx,js,jsx}',
      'app/{layout,page}.{ts,tsx,js,jsx}',
      'pages/index.{ts,tsx,js,jsx}',
    ],
    { cwd: resolvedRoot, onlyFiles: true, unique: true },
  );
  const purpose = await readPurpose(resolvedRoot, packageJson);

  return {
    id: `project:${slugify(name)}`,
    name,
    root: resolvedRoot,
    packageManager: await packageManager(resolvedRoot),
    frameworks: detectFrameworks(packageJson),
    sourceRoots,
    entrypoints: [
      ...new Set([...config.entrypoints, ...entrypointCandidates.map(normalizeProjectPath)]),
    ].sort(),
    ...(purpose ? { purpose } : {}),
  };
}
