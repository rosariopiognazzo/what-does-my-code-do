import { randomUUID } from 'node:crypto';
import { access, appendFile, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  CapabilitiesFileSchema,
  ChangeEventSchema,
  DEFAULT_CONFIG,
  GraphSnapshotSchema,
  OpenQuestionsFileSchema,
  parseJsonText,
  WdmcdConfigSchema,
  WdmcdError,
  type CapabilitiesFile,
  type ChangeEvent,
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

async function findGitMarker(root: string): Promise<string | undefined> {
  let current = path.resolve(root);
  while (true) {
    if (await exists(path.join(current, '.git'))) return current;
    const parent = path.dirname(current);
    if (parent === current) return undefined;
    current = parent;
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

  if (!(await exists(packageJson))) {
    throw new WdmcdError('PROJECT_NOT_FOUND', `No package.json found in ${paths.root}.`);
  }
  if (!(await findGitMarker(paths.root))) {
    throw new WdmcdError('GIT_NOT_FOUND', `No Git repository contains ${paths.root}.`);
  }

  const sourceCandidates = ['src', 'app', 'apps', 'pages', 'packages', 'libs'];
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
  return WdmcdConfigSchema.parse(parseJsonText(content));
}

export async function readCapabilities(root: string): Promise<CapabilitiesFile> {
  const content = await readFile(projectPaths(root).capabilities, 'utf8');
  return CapabilitiesFileSchema.parse(parse(content) as unknown);
}

export async function writeCapabilities(root: string, input: CapabilitiesFile): Promise<void> {
  const capabilities = CapabilitiesFileSchema.parse(input);
  await writeFileAtomic(projectPaths(root).capabilities, stringify(capabilities));
}

export async function confirmCapability(
  root: string,
  snapshot: GraphSnapshot,
  capabilityId: string,
): Promise<CapabilitiesFile['capabilities'][number]> {
  const capability = snapshot.nodes.find(
    (node) => node.kind === 'capability' && node.id === capabilityId,
  );
  if (!capability)
    throw new WdmcdError('CAPABILITY_NOT_FOUND', `Capability not found: ${capabilityId}.`);
  const files = await readCapabilities(root);
  const componentIds = snapshot.edges
    .filter((edge) => edge.kind === 'implements' && edge.from === capabilityId)
    .map((edge) => edge.to)
    .sort();
  const source = snapshot.evidence.find(
    (item) =>
      capability.evidenceIds.includes(item.id) && item.path && !item.path.startsWith('.wdmcd/'),
  );
  const confirmed = {
    id: capability.id,
    name: capability.name,
    ...(capability.description ? { description: capability.description } : {}),
    confidence: 'confirmed' as const,
    components: componentIds,
    evidence: source?.path
      ? [{ path: source.path, note: 'Capability confirmed in the local WDMCD interface.' }]
      : [{ note: 'Capability confirmed in the local WDMCD interface.' }],
  };
  const existingIndex = files.capabilities.findIndex((item) => item.id === capabilityId);
  if (existingIndex >= 0) files.capabilities[existingIndex] = confirmed;
  else files.capabilities.push(confirmed);
  await writeCapabilities(root, files);
  return confirmed;
}

export async function readOpenQuestions(root: string): Promise<OpenQuestionsFile> {
  const content = await readFile(projectPaths(root).openQuestions, 'utf8');
  return OpenQuestionsFileSchema.parse(parse(content) as unknown);
}

export async function readLatestSnapshot(root: string): Promise<GraphSnapshot | undefined> {
  const filePath = projectPaths(root).snapshot;
  if (!(await exists(filePath))) return undefined;
  const content = await readFile(filePath, 'utf8');
  return GraphSnapshotSchema.parse(parseJsonText(content));
}

export async function writeLatestSnapshot(root: string, snapshot: GraphSnapshot): Promise<void> {
  const parsed = GraphSnapshotSchema.parse(snapshot);
  await writeFileAtomic(projectPaths(root).snapshot, `${JSON.stringify(parsed, null, 2)}\n`);
}

export async function readChangeEvents(root: string): Promise<ChangeEvent[]> {
  const filePath = projectPaths(root).history;
  if (!(await exists(filePath))) return [];
  const content = await readFile(filePath, 'utf8');
  return content
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line) => ChangeEventSchema.parse(parseJsonText(line)));
}

export async function appendChangeEvent(root: string, input: ChangeEvent): Promise<boolean> {
  const event = ChangeEventSchema.parse(input);
  const existing = await readChangeEvents(root);
  if (existing.some((item) => item.id === event.id)) return false;
  const filePath = projectPaths(root).history;
  await mkdir(path.dirname(filePath), { recursive: true });
  await appendFile(filePath, `${JSON.stringify(event)}\n`, 'utf8');
  return true;
}
