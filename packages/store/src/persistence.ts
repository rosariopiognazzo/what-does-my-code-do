import type { GraphSnapshot } from '@wdmcd/core';

import { writeLatestSnapshot } from './files.js';
import { GraphDatabase } from './sqlite.js';

export async function persistSnapshot(root: string, snapshot: GraphSnapshot): Promise<void> {
  const database = GraphDatabase.forProject(root);
  try {
    database.saveSnapshot(snapshot);
    await writeLatestSnapshot(root, snapshot);
  } finally {
    database.close();
  }
}
