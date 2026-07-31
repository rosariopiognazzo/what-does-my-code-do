import type { ChangeEvent, GraphSnapshot } from '@wdmcd/core';

import { appendChangeEvent, writeLatestSnapshot } from './files.js';
import { GraphDatabase } from './sqlite.js';

export async function persistSnapshot(
  root: string,
  snapshot: GraphSnapshot,
  event?: ChangeEvent,
): Promise<void> {
  const database = GraphDatabase.forProject(root);
  try {
    database.saveSnapshot(snapshot);
    if (event) database.saveChangeEvent(event);
    await writeLatestSnapshot(root, snapshot);
    if (event) await appendChangeEvent(root, event);
  } finally {
    database.close();
  }
}
