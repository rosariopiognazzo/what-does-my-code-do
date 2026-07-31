import { randomUUID } from 'node:crypto';
import { access, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  CapabilitiesFileSchema,
  DEFAULT_CONFIG,
  GraphSnapshotSchema,
  OpenQuestionsFileSchema,
  WdmcdConfigSchema,
  WdmcdError,
  type CapabilitiesFile,
  type GraphSnapshot,
  type OpenQuestionsFile,
  type WdmcdConfig,
} from '@wdmcd/core';
import { parse, stringify } from 'yaml';

import { projectPaths } from './paths.js';

export interface InitResult {
  root: string;
  created: string[];
  existing: string[];
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function writeFileAtomic(filePath: string, content: string): Promise<void> {
  const directory = path.dirname(filePath);
  await mkdir(directory, { recursive: true });
  const temporary = path.join(directory, `.${path.basename(filePath)}.${randomUUID()}.tmp`);

  try {
    await writeFile(temporary, content, { encoding: 'utf8', flag: 'wx' });
    await rename(temporary, filePath);
  } finally {
    await rm(temporary, { force: true });
  }
}

async function writeIfMissing(
  filePath: string,
  content: string,
  result: Pick<InitResult, 'created' | 'existing'>,
  root: string,
): Promise<void> {
  const relative = path.relative(root, filePath).replaceAll('\\', '/');
  if (await exists(filePath)) {
    result.existing.push(relative);
    return;
  }

  await writeFileAtomic(filePath, content);
  result.created.push(relative);
}

export async function initializeProject(root: string): Promise<InitResult> {
  const paths = projectPaths(root);
  const packageJson = path.join(paths.root, 'package.json');
  const gitMarker = path.join(paths.root, '.git');

  if (!(await exists(packageJson))) {
    throw new WdmcdError('PROJECT_NOT_FOUND', `No package.json found in ${paths.root}.`);
  }
  if (!(await exists(gitMarker))) {
    throw new WdmcdError('GIT_NOT_FOUND', `No Git repository found in ${paths.root}.`);
  }

  const sourceCandidates = ['src', 'app', 'pages', 'packages'];
  const detectedSources: string[] = [];
  for (const candidate of sourceCandidates) {
    if (await exists(path.join(paths.root, candidate))) detectedSources.push(candidate);
  }

  const config = WdmcdConfigSchema.parse({
    ...DEFAULT_CONFIG,
    include: detectedSources.length > 0 ? detectedSources : ['.'],
  });
  const result: InitResult = { root: paths.root, created: [], existing: [] };

  await writeIfMissing(paths.config, `${JSON.stringify(config, null, 2)}\n`, result, paths.root);
  await writeIfMissing(
    paths.capabilities,
    stringify(CapabilitiesFileSchema.parse({ capabilities: [] })),
    result,
    paths.root,
  );
  await writeIfMissing(
    paths.openQuestions,
    stringify(OpenQuestionsFileSchema.parse({ questions: [] })),
    result,
    paths.root,
  );
  await writeIfMissing(paths.localIgnore, 'cache/\n', result, paths.root);
  await mkdir(path.dirname(paths.snapshot), { recursive: true });
  await mkdir(path.dirname(paths.history), { recursive: true });

  return result;
}

export async function readConfig(root: string): Promise<WdmcdConfig> {
  const content = await readFile(projectPaths(root).config, 'utf8');
  return WdmcdConfigSchema.parse(JSON.parse(content) as unknown);
}

export async function readCapabilities(root: string): Promise<CapabilitiesFile> {
  const content = await readFile(projectPaths(root).capabilities, 'utf8');
  return CapabilitiesFileSchema.parse(parse(content) as unknown);
}

export async function readOpenQuestions(root: string): Promise<OpenQuestionsFile> {
  const content = await readFile(projectPaths(root).openQuestions, 'utf8');
  return OpenQuestionsFileSchema.parse(parse(content) as unknown);
}

export async function readLatestSnapshot(root: string): Promise<GraphSnapshot | undefined> {
  const filePath = projectPaths(root).snapshot;
  if (!(await exists(filePath))) return undefined;
  const content = await readFile(filePath, 'utf8');
  return GraphSnapshotSchema.parse(JSON.parse(content) as unknown);
}

export async function writeLatestSnapshot(root: string, snapshot: GraphSnapshot): Promise<void> {
  const parsed = GraphSnapshotSchema.parse(snapshot);
  await writeFileAtomic(projectPaths(root).snapshot, `${JSON.stringify(parsed, null, 2)}\n`);
}
