import { z } from 'zod';

export const EvidenceKindSchema = z.enum(['observed', 'inferred', 'declared', 'confirmed']);
export type EvidenceKind = z.infer<typeof EvidenceKindSchema>;

export const NodeKindSchema = z.enum([
  'project',
  'capability',
  'component',
  'route',
  'contract',
  'data_store',
  'external_service',
  'test',
  'change_event',
  'open_question',
]);
export type NodeKind = z.infer<typeof NodeKindSchema>;

export const EdgeKindSchema = z.enum([
  'implements',
  'imports',
  'calls',
  'exposes',
  'consumes',
  'reads_from',
  'writes_to',
  'tested_by',
  'changed_by',
  'risks',
]);
export type EdgeKind = z.infer<typeof EdgeKindSchema>;

export const EvidenceSchema = z.object({
  id: z.string().min(1),
  kind: EvidenceKindSchema,
  sourceType: z.enum(['file', 'symbol', 'git', 'config', 'user']),
  path: z.string().min(1).optional(),
  symbol: z.string().min(1).optional(),
  ref: z.string().min(1).optional(),
  lineStart: z.number().int().positive().optional(),
  lineEnd: z.number().int().positive().optional(),
  note: z.string().min(1).optional(),
});
export type Evidence = z.infer<typeof EvidenceSchema>;

export const GraphNodeSchema = z
  .object({
    id: z.string().min(1),
    kind: NodeKindSchema,
    name: z.string().min(1),
    description: z.string().min(1).optional(),
    evidenceIds: z.array(z.string().min(1)),
    confidence: EvidenceKindSchema,
    createdAt: z.string().datetime({ offset: true }),
    updatedAt: z.string().datetime({ offset: true }),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .superRefine((node, context) => {
    if (
      node.kind === 'capability' &&
      node.confidence === 'confirmed' &&
      node.evidenceIds.length === 0
    ) {
      context.addIssue({
        code: 'custom',
        message: 'A confirmed capability must reference at least one evidence item.',
        path: ['evidenceIds'],
      });
    }
  });
export type GraphNode = z.infer<typeof GraphNodeSchema>;

export const GraphEdgeSchema = z.object({
  id: z.string().min(1),
  kind: EdgeKindSchema,
  from: z.string().min(1),
  to: z.string().min(1),
  evidenceIds: z.array(z.string().min(1)),
  confidence: EvidenceKindSchema,
});
export type GraphEdge = z.infer<typeof GraphEdgeSchema>;

export const DiagnosticSchema = z.object({
  level: z.enum(['warning', 'error']),
  code: z.string().min(1),
  message: z.string().min(1),
  path: z.string().min(1).optional(),
});
export type Diagnostic = z.infer<typeof DiagnosticSchema>;

export const ProjectContextSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  root: z.string().min(1),
  packageManager: z.enum(['pnpm', 'npm', 'yarn', 'bun', 'unknown']),
  frameworks: z.array(z.string()),
  sourceRoots: z.array(z.string()),
  entrypoints: z.array(z.string()),
  scannedRef: z.string().min(1).optional(),
  commit: z.string().min(1).optional(),
  purpose: z.string().min(1).optional(),
});
export type ProjectContext = z.infer<typeof ProjectContextSchema>;

export const SnapshotStatsSchema = z.object({
  files: z.number().int().nonnegative(),
  nodes: z.number().int().nonnegative(),
  edges: z.number().int().nonnegative(),
  capabilities: z.number().int().nonnegative(),
  tests: z.number().int().nonnegative(),
});
export type SnapshotStats = z.infer<typeof SnapshotStatsSchema>;

export const GraphSnapshotSchema = z.object({
  modelVersion: z.literal(1),
  id: z.string().min(1),
  project: ProjectContextSchema,
  scannedAt: z.string().datetime({ offset: true }),
  contentHash: z.string().min(1),
  nodes: z.array(GraphNodeSchema),
  edges: z.array(GraphEdgeSchema),
  evidence: z.array(EvidenceSchema),
  diagnostics: z.array(DiagnosticSchema),
  stats: SnapshotStatsSchema,
});
export type GraphSnapshot = z.infer<typeof GraphSnapshotSchema>;

export const WdmcdConfigSchema = z.object({
  version: z.literal(1),
  include: z.array(z.string().min(1)).default(['src', 'app', 'apps', 'pages', 'packages', 'libs']),
  exclude: z
    .array(z.string().min(1))
    .default(['node_modules', 'dist', 'build', '.next', 'coverage', '.wdmcd/cache']),
  entrypoints: z.array(z.string().min(1)).default([]),
  semanticEngine: z.object({ mode: z.literal('rules') }).default({ mode: 'rules' }),
});
export type WdmcdConfig = z.infer<typeof WdmcdConfigSchema>;

export const DEFAULT_CONFIG: WdmcdConfig = WdmcdConfigSchema.parse({ version: 1 });

export const CuratedEvidenceSchema = z.object({
  path: z.string().min(1).optional(),
  symbol: z.string().min(1).optional(),
  note: z.string().min(1).optional(),
});
export type CuratedEvidence = z.infer<typeof CuratedEvidenceSchema>;

export const CuratedCapabilitySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1).optional(),
  confidence: z.enum(['declared', 'confirmed']).default('declared'),
  components: z.array(z.string().min(1)).default([]),
  evidence: z.array(CuratedEvidenceSchema).default([]),
});
export type CuratedCapability = z.infer<typeof CuratedCapabilitySchema>;

export const CapabilitiesFileSchema = z.object({
  capabilities: z.array(CuratedCapabilitySchema).default([]),
});
export type CapabilitiesFile = z.infer<typeof CapabilitiesFileSchema>;

export const OpenQuestionSchema = z.object({
  id: z.string().min(1),
  question: z.string().min(1),
  capabilityId: z.string().min(1).optional(),
  evidenceIds: z.array(z.string().min(1)).default([]),
  status: z.enum(['open', 'resolved']).default('open'),
});
export type OpenQuestion = z.infer<typeof OpenQuestionSchema>;

export const OpenQuestionsFileSchema = z.object({
  questions: z.array(OpenQuestionSchema).default([]),
});
export type OpenQuestionsFile = z.infer<typeof OpenQuestionsFileSchema>;

export const ChangeEventSchema = z.object({
  id: z.string().min(1),
  occurredAt: z.string().datetime({ offset: true }),
  snapshotId: z.string().min(1),
  ref: z.string().min(1).optional(),
  commit: z.string().min(1).optional(),
  summary: z.string().min(1),
  capabilityIds: z.array(z.string().min(1)),
  addedNodeIds: z.array(z.string().min(1)),
  removedNodeIds: z.array(z.string().min(1)),
  changedNodeIds: z.array(z.string().min(1)).default([]),
  addedEdgeIds: z.array(z.string().min(1)),
  removedEdgeIds: z.array(z.string().min(1)),
  changedEdgeIds: z.array(z.string().min(1)).default([]),
});
export type ChangeEvent = z.infer<typeof ChangeEventSchema>;

export const ValidationIssueSchema = z.object({
  level: z.enum(['error', 'warning']),
  file: z.string().min(1),
  message: z.string().min(1),
  path: z.string().optional(),
});
export type ValidationIssue = z.infer<typeof ValidationIssueSchema>;

export const ValidationResultSchema = z.object({
  valid: z.boolean(),
  root: z.string().min(1),
  issues: z.array(ValidationIssueSchema),
});
export type ValidationResult = z.infer<typeof ValidationResultSchema>;

export const SymbolFactSchema = z.object({
  name: z.string().min(1),
  kind: z.enum(['class', 'function', 'interface', 'type', 'variable', 'enum', 'unknown']),
  line: z.number().int().positive(),
  exported: z.boolean(),
});
export type SymbolFact = z.infer<typeof SymbolFactSchema>;

export const ImportFactSchema = z.object({
  specifier: z.string().min(1),
  names: z.array(z.string()),
  line: z.number().int().positive(),
  resolvedPath: z.string().min(1).optional(),
});
export type ImportFact = z.infer<typeof ImportFactSchema>;

export const CallFactSchema = z.object({
  callee: z.string().min(1),
  line: z.number().int().positive(),
  resolvedPath: z.string().min(1).optional(),
});
export type CallFact = z.infer<typeof CallFactSchema>;

export const RouteFactSchema = z.object({
  method: z.string().min(1),
  routePath: z.string().min(1),
  sourcePath: z.string().min(1),
  framework: z.enum(['next-app', 'next-pages', 'express', 'nest']),
  handler: z.string().min(1).optional(),
  line: z.number().int().positive(),
});
export type RouteFact = z.infer<typeof RouteFactSchema>;

export const SourceFileFactSchema = z.object({
  path: z.string().min(1),
  hash: z.string().min(1),
  isTest: z.boolean(),
  symbols: z.array(SymbolFactSchema),
  imports: z.array(ImportFactSchema),
  calls: z.array(CallFactSchema),
  routes: z.array(RouteFactSchema),
});
export type SourceFileFact = z.infer<typeof SourceFileFactSchema>;

export const DependencyFactSchema = z.object({
  name: z.string().min(1),
  version: z.string(),
  development: z.boolean(),
});
export type DependencyFact = z.infer<typeof DependencyFactSchema>;

export const TechnicalAnalysisSchema = z.object({
  files: z.array(SourceFileFactSchema),
  dependencies: z.array(DependencyFactSchema),
  diagnostics: z.array(DiagnosticSchema),
  cache: z.object({
    hit: z.boolean(),
    files: z.number().int().nonnegative(),
  }),
});
export type TechnicalAnalysis = z.infer<typeof TechnicalAnalysisSchema>;

export const ChangedFileSchema = z.object({
  status: z.enum(['added', 'modified', 'deleted', 'renamed']),
  path: z.string().min(1),
  oldPath: z.string().min(1).optional(),
});
export type ChangedFile = z.infer<typeof ChangedFileSchema>;

export const GraphDifferenceSchema = z.object({
  addedNodeIds: z.array(z.string()),
  removedNodeIds: z.array(z.string()),
  changedNodeIds: z.array(z.string()),
  addedEdgeIds: z.array(z.string()),
  removedEdgeIds: z.array(z.string()),
  changedEdgeIds: z.array(z.string()),
});
export type GraphDifference = z.infer<typeof GraphDifferenceSchema>;

export const ImpactCapabilitySchema = z.object({
  capabilityId: z.string(),
  name: z.string(),
  componentIds: z.array(z.string()),
  reason: z.string(),
  chain: z.array(z.string()),
  evidenceIds: z.array(z.string()),
});
export type ImpactCapability = z.infer<typeof ImpactCapabilitySchema>;

export const ImpactReportSchema = z.object({
  range: z.string(),
  base: z.object({ ref: z.string(), commit: z.string(), snapshotId: z.string() }),
  head: z.object({ ref: z.string(), commit: z.string(), snapshotId: z.string() }),
  files: z.array(ChangedFileSchema),
  symbols: z.array(z.object({ path: z.string(), names: z.array(z.string()) })),
  direct: z.array(ImpactCapabilitySchema),
  downstream: z.array(ImpactCapabilitySchema),
  relations: z.object({
    added: z.array(GraphEdgeSchema),
    removed: z.array(GraphEdgeSchema),
    changed: z.array(z.object({ before: GraphEdgeSchema, after: GraphEdgeSchema })),
  }),
  tests: z.array(GraphNodeSchema),
  questions: z.array(z.string()),
});
export type ImpactReport = z.infer<typeof ImpactReportSchema>;
