import path from 'node:path';

import { ChangedFileSchema, WdmcdError, normalizeProjectPath, type ChangedFile } from '@wdmcd/core';
import { simpleGit } from 'simple-git';

export interface RepositoryState {
  gitRoot: string;
  ref: string;
  commit: string;
}

export interface GitRange {
  range: string;
  base: string;
  head: string;
}

const REF_PATTERN = /^(?!-)(?!.*\.\.)[A-Za-z0-9_./@{}~^+-]+$/;

export function parseGitRange(value: string): GitRange {
  const parts = value.split('...');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new WdmcdError('INVALID_GIT_RANGE', `Invalid range "${value}". Use base...head.`);
  }
  const [base, head] = parts;
  if (!REF_PATTERN.test(base) || !REF_PATTERN.test(head)) {
    throw new WdmcdError('INVALID_GIT_RANGE', `Invalid Git ref in range "${value}".`);
  }
  return { range: value, base, head };
}

export async function resolveCommit(root: string, ref: string): Promise<string> {
  if (!REF_PATTERN.test(ref)) throw new WdmcdError('INVALID_GIT_REF', `Invalid Git ref: ${ref}.`);
  const git = simpleGit({ baseDir: path.resolve(root) });
  try {
    return (await git.revparse([`${ref}^{commit}`])).trim();
  } catch {
    throw new WdmcdError('GIT_REF_NOT_FOUND', `Git ref not found: ${ref}.`);
  }
}

function changedStatus(value: string): ChangedFile['status'] | undefined {
  if (value.startsWith('A')) return 'added';
  if (value.startsWith('M') || value.startsWith('T')) return 'modified';
  if (value.startsWith('D')) return 'deleted';
  if (value.startsWith('R')) return 'renamed';
  return undefined;
}

export async function getChangedFiles(root: string, input: GitRange): Promise<ChangedFile[]> {
  const git = simpleGit({ baseDir: path.resolve(root) });
  const output = await git.diff(['--name-status', '--find-renames', input.range, '--']);
  const files: ChangedFile[] = [];
  for (const line of output.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const [rawStatus, firstPath, secondPath] = line.split('\t');
    const status = rawStatus ? changedStatus(rawStatus) : undefined;
    if (!status || !firstPath) continue;
    if (status === 'renamed' && secondPath) {
      files.push({
        status,
        oldPath: normalizeProjectPath(firstPath),
        path: normalizeProjectPath(secondPath),
      });
    } else {
      files.push(ChangedFileSchema.parse({ status, path: normalizeProjectPath(firstPath) }));
    }
  }
  return files.sort((left, right) => left.path.localeCompare(right.path));
}

export async function getRepositoryState(root: string): Promise<RepositoryState> {
  const git = simpleGit({ baseDir: path.resolve(root) });
  if (!(await git.checkIsRepo())) {
    throw new WdmcdError('GIT_NOT_FOUND', `No Git repository contains ${path.resolve(root)}.`);
  }

  const gitRoot = path.resolve((await git.revparse(['--show-toplevel'])).trim());
  try {
    const [ref, commit] = await Promise.all([
      git.revparse(['--abbrev-ref', 'HEAD']),
      git.revparse(['HEAD']),
    ]);
    return { gitRoot, ref: ref.trim(), commit: commit.trim() };
  } catch {
    return { gitRoot, ref: 'working-tree', commit: 'uncommitted' };
  }
}
