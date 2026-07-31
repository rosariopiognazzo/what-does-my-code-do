import { readFile } from 'node:fs/promises';
import path from 'node:path';

import {
  CapabilitiesFileSchema,
  ChangeEventSchema,
  GraphSnapshotSchema,
  OpenQuestionsFileSchema,
  ValidationResultSchema,
  WdmcdConfigSchema,
  type GraphSnapshot,
  type ValidationIssue,
  type ValidationResult,
} from '@wdmcd/core';
import { parse } from 'yaml';
import type { ZodType, core } from 'zod';

import { projectPaths } from './paths.js';

function issuePath(issue: core.$ZodIssue): string {
  return issue.path.map(String).join('.');
}

async function validateStructuredFile<T>(
  filePath: string,
  schema: ZodType<T>,
  format: 'json' | 'yaml',
  issues: ValidationIssue[],
  required = true,
): Promise<T | undefined> {
  try {
    const content = await readFile(filePath, 'utf8');
    const raw = format === 'json' ? (JSON.parse(content) as unknown) : (parse(content) as unknown);
    const result = schema.safeParse(raw);
    if (result.success) return result.data;

    for (const schemaIssue of result.error.issues) {
      issues.push({
        level: 'error',
        file: filePath,
        message: schemaIssue.message,
        path: issuePath(schemaIssue),
      });
    }
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (!required && code === 'ENOENT') return undefined;
    issues.push({
      level: 'error',
      file: filePath,
      message:
        code === 'ENOENT'
          ? 'Required file is missing.'
          : `Cannot read or parse file: ${String(error)}`,
    });
  }

  return undefined;
}

function validateSnapshotReferences(
  snapshot: GraphSnapshot,
  issues: ValidationIssue[],
  filePath: string,
): void {
  const nodeIds = new Set(snapshot.nodes.map((node) => node.id));
  const evidenceIds = new Set(snapshot.evidence.map((evidence) => evidence.id));

  for (const edge of snapshot.edges) {
    if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) {
      issues.push({
        level: 'error',
        file: filePath,
        path: `edges.${edge.id}`,
        message: `Edge references an unknown node (${edge.from} -> ${edge.to}).`,
      });
    }
    for (const evidenceId of edge.evidenceIds) {
      if (!evidenceIds.has(evidenceId)) {
        issues.push({
          level: 'error',
          file: filePath,
          path: `edges.${edge.id}.evidenceIds`,
          message: `Unknown evidence id: ${evidenceId}.`,
        });
      }
    }
  }

  for (const node of snapshot.nodes) {
    for (const evidenceId of node.evidenceIds) {
      if (!evidenceIds.has(evidenceId)) {
        issues.push({
          level: 'error',
          file: filePath,
          path: `nodes.${node.id}.evidenceIds`,
          message: `Unknown evidence id: ${evidenceId}.`,
        });
      }
    }
  }
}

async function validateHistory(filePath: string, issues: ValidationIssue[]): Promise<void> {
  let content: string;
  try {
    content = await readFile(filePath, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    issues.push({
      level: 'error',
      file: filePath,
      message: `Cannot read history: ${String(error)}`,
    });
    return;
  }

  for (const [index, line] of content.split(/\r?\n/).entries()) {
    if (!line.trim()) continue;
    try {
      const result = ChangeEventSchema.safeParse(JSON.parse(line) as unknown);
      if (!result.success) {
        issues.push({
          level: 'error',
          file: filePath,
          path: `line ${index + 1}`,
          message: result.error.issues.map((item) => item.message).join('; '),
        });
      }
    } catch (error) {
      issues.push({
        level: 'error',
        file: filePath,
        path: `line ${index + 1}`,
        message: `Invalid JSON: ${String(error)}`,
      });
    }
  }
}

export async function validateProject(root: string): Promise<ValidationResult> {
  const paths = projectPaths(root);
  const issues: ValidationIssue[] = [];
  await validateStructuredFile(paths.config, WdmcdConfigSchema, 'json', issues);
  const capabilities = await validateStructuredFile(
    paths.capabilities,
    CapabilitiesFileSchema,
    'yaml',
    issues,
  );
  await validateStructuredFile(paths.openQuestions, OpenQuestionsFileSchema, 'yaml', issues);
  const snapshot = await validateStructuredFile(
    paths.snapshot,
    GraphSnapshotSchema,
    'json',
    issues,
    false,
  );
  await validateHistory(paths.history, issues);

  if (snapshot) {
    validateSnapshotReferences(snapshot, issues, paths.snapshot);
    const nodeIds = new Set(snapshot.nodes.map((node) => node.id));
    for (const capability of capabilities?.capabilities ?? []) {
      for (const component of capability.components) {
        if (!nodeIds.has(component)) {
          issues.push({
            level: 'warning',
            file: paths.capabilities,
            path: capability.id,
            message: `Curated component is not present in the latest snapshot: ${component}.`,
          });
        }
      }
    }
  }

  return ValidationResultSchema.parse({
    valid: !issues.some((issue) => issue.level === 'error'),
    root: path.resolve(root),
    issues,
  });
}
