import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import type * as NodeSqlite from 'node:sqlite';

import {
  ChangeEventSchema,
  GraphSnapshotSchema,
  type ChangeEvent,
  type GraphSnapshot,
} from '@wdmcd/core';

import { projectPaths } from './paths.js';

const nativeRequire = createRequire(import.meta.url);

function loadSqlite(): typeof NodeSqlite {
  return nativeRequire('node:sqlite') as typeof NodeSqlite;
}

export class GraphDatabase {
  readonly #database: NodeSqlite.DatabaseSync;

  constructor(filePath: string) {
    mkdirSync(path.dirname(filePath), { recursive: true });
    const { DatabaseSync } = loadSqlite();
    this.#database = new DatabaseSync(filePath);
    this.#database.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
    this.#migrate();
  }

  static forProject(root: string): GraphDatabase {
    return new GraphDatabase(projectPaths(root).database);
  }

  #migrate(): void {
    this.#database.exec(`
      CREATE TABLE IF NOT EXISTS snapshots (
        id TEXT PRIMARY KEY,
        model_version INTEGER NOT NULL,
        project_id TEXT NOT NULL,
        scanned_ref TEXT,
        commit_hash TEXT,
        scanned_at TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        model_json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS evidence (
        snapshot_id TEXT NOT NULL,
        id TEXT NOT NULL,
        kind TEXT NOT NULL,
        source_type TEXT NOT NULL,
        path TEXT,
        symbol TEXT,
        ref TEXT,
        line_start INTEGER,
        line_end INTEGER,
        note TEXT,
        PRIMARY KEY (snapshot_id, id),
        FOREIGN KEY (snapshot_id) REFERENCES snapshots(id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS nodes (
        snapshot_id TEXT NOT NULL,
        id TEXT NOT NULL,
        kind TEXT NOT NULL,
        name TEXT NOT NULL,
        confidence TEXT NOT NULL,
        data_json TEXT NOT NULL,
        PRIMARY KEY (snapshot_id, id),
        FOREIGN KEY (snapshot_id) REFERENCES snapshots(id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS edges (
        snapshot_id TEXT NOT NULL,
        id TEXT NOT NULL,
        kind TEXT NOT NULL,
        from_id TEXT NOT NULL,
        to_id TEXT NOT NULL,
        confidence TEXT NOT NULL,
        data_json TEXT NOT NULL,
        PRIMARY KEY (snapshot_id, id),
        FOREIGN KEY (snapshot_id) REFERENCES snapshots(id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS change_events (
        id TEXT PRIMARY KEY,
        snapshot_id TEXT NOT NULL,
        occurred_at TEXT NOT NULL,
        event_json TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_nodes_snapshot_kind ON nodes(snapshot_id, kind);
      CREATE INDEX IF NOT EXISTS idx_edges_snapshot_from ON edges(snapshot_id, from_id);
      CREATE INDEX IF NOT EXISTS idx_edges_snapshot_to ON edges(snapshot_id, to_id);
    `);
  }

  saveSnapshot(input: GraphSnapshot): void {
    const snapshot = GraphSnapshotSchema.parse(input);
    const insertSnapshot = this.#database.prepare(`
      INSERT OR REPLACE INTO snapshots
        (id, model_version, project_id, scanned_ref, commit_hash, scanned_at, content_hash, model_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertEvidence = this.#database.prepare(`
      INSERT INTO evidence
        (snapshot_id, id, kind, source_type, path, symbol, ref, line_start, line_end, note)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertNode = this.#database.prepare(`
      INSERT INTO nodes (snapshot_id, id, kind, name, confidence, data_json)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const insertEdge = this.#database.prepare(`
      INSERT INTO edges (snapshot_id, id, kind, from_id, to_id, confidence, data_json)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    this.#database.exec('BEGIN IMMEDIATE');
    try {
      this.#database.prepare('DELETE FROM snapshots WHERE id = ?').run(snapshot.id);
      insertSnapshot.run(
        snapshot.id,
        snapshot.modelVersion,
        snapshot.project.id,
        snapshot.project.scannedRef ?? null,
        snapshot.project.commit ?? null,
        snapshot.scannedAt,
        snapshot.contentHash,
        JSON.stringify(snapshot),
      );
      for (const evidence of snapshot.evidence) {
        insertEvidence.run(
          snapshot.id,
          evidence.id,
          evidence.kind,
          evidence.sourceType,
          evidence.path ?? null,
          evidence.symbol ?? null,
          evidence.ref ?? null,
          evidence.lineStart ?? null,
          evidence.lineEnd ?? null,
          evidence.note ?? null,
        );
      }
      for (const node of snapshot.nodes) {
        insertNode.run(
          snapshot.id,
          node.id,
          node.kind,
          node.name,
          node.confidence,
          JSON.stringify(node),
        );
      }
      for (const edge of snapshot.edges) {
        insertEdge.run(
          snapshot.id,
          edge.id,
          edge.kind,
          edge.from,
          edge.to,
          edge.confidence,
          JSON.stringify(edge),
        );
      }
      this.#database.exec('COMMIT');
    } catch (error) {
      this.#database.exec('ROLLBACK');
      throw error;
    }
  }

  latestSnapshot(): GraphSnapshot | undefined {
    const row = this.#database
      .prepare('SELECT model_json FROM snapshots ORDER BY scanned_at DESC LIMIT 1')
      .get() as { model_json: string } | undefined;
    return row ? GraphSnapshotSchema.parse(JSON.parse(row.model_json) as unknown) : undefined;
  }

  saveChangeEvent(input: ChangeEvent): void {
    const event = ChangeEventSchema.parse(input);
    this.#database
      .prepare(
        `
        INSERT OR REPLACE INTO change_events (id, snapshot_id, occurred_at, event_json)
        VALUES (?, ?, ?, ?)
      `,
      )
      .run(event.id, event.snapshotId, event.occurredAt, JSON.stringify(event));
  }

  close(): void {
    this.#database.close();
  }
}
