import path from 'node:path';

import { WdmcdError } from '@wdmcd/core';
import { simpleGit } from 'simple-git';

export interface RepositoryState {
  gitRoot: string;
  ref: string;
  commit: string;
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
