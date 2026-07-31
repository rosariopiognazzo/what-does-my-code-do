import path from 'node:path';

export interface WdmcdPaths {
  root: string;
  directory: string;
  config: string;
  capabilities: string;
  openQuestions: string;
  snapshot: string;
  history: string;
  database: string;
  localIgnore: string;
}

export function projectPaths(root: string): WdmcdPaths {
  const resolvedRoot = path.resolve(root);
  const directory = path.join(resolvedRoot, '.wdmcd');

  return {
    root: resolvedRoot,
    directory,
    config: path.join(directory, 'config.json'),
    capabilities: path.join(directory, 'capabilities.yaml'),
    openQuestions: path.join(directory, 'open-questions.yaml'),
    snapshot: path.join(directory, 'snapshots', 'latest.json'),
    history: path.join(directory, 'history', 'change-events.jsonl'),
    database: path.join(directory, 'cache', 'graph.sqlite'),
    localIgnore: path.join(directory, '.gitignore'),
  };
}
