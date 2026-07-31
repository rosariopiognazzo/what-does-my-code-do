import { z } from 'zod';

import { WdmcdError } from './errors.js';
import {
  ChangeEventSchema,
  EvidenceKindSchema,
  EvidenceSchema,
  GraphEdgeSchema,
  GraphNodeSchema,
  type ChangeEvent,
  type GraphNode,
  type GraphSnapshot,
  type OpenQuestionsFile,
} from './schemas.js';

export const CapabilitySummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  confidence: EvidenceKindSchema,
  components: z.number().int().nonnegative(),
  tests: z.number().int().nonnegative(),
  routes: z.number().int().nonnegative(),
  evidence: z.number().int().nonnegative(),
  rule: z.string().optional(),
});
export type CapabilitySummary = z.infer<typeof CapabilitySummarySchema>;

export const OverviewViewSchema = z.object({
  project: z.object({
    name: z.string(),
    purpose: z.string().optional(),
    scannedRef: z.string().optional(),
    commit: z.string().optional(),
    scannedAt: z.string(),
  }),
  capabilities: z.array(CapabilitySummarySchema),
  boundaries: z.object({
    frameworks: z.array(z.string()),
    routes: z.number().int().nonnegative(),
    tests: z.number().int().nonnegative(),
    dependencies: z.array(z.string()),
  }),
  openQuestions: z.array(
    z.object({ id: z.string(), question: z.string(), capabilityId: z.string().optional() }),
  ),
  stats: z.object({ files: z.number(), nodes: z.number(), edges: z.number() }),
});
export type OverviewView = z.infer<typeof OverviewViewSchema>;

export const CapabilityDetailSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  confidence: EvidenceKindSchema,
  rule: z.string().optional(),
  flows: z.array(z.object({ label: z.string(), steps: z.array(z.string()) })),
  components: z.object({
    entry: z.array(GraphNodeSchema),
    orchestration: z.array(GraphNodeSchema),
    data: z.array(GraphNodeSchema),
    integrations: z.array(GraphNodeSchema),
    tests: z.array(GraphNodeSchema),
    other: z.array(GraphNodeSchema),
  }),
  relations: z.array(GraphEdgeSchema),
  evidence: z.array(EvidenceSchema),
  history: z.array(ChangeEventSchema),
  needsReview: z.array(z.string()),
});
export type CapabilityDetail = z.infer<typeof CapabilityDetailSchema>;

export const ComponentOptionSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: GraphNodeSchema.shape.kind,
  path: z.string().optional(),
});
export type ComponentOption = z.infer<typeof ComponentOptionSchema>;

function metadataArray(node: GraphNode | undefined, key: string): unknown[] {
  const value = node?.metadata?.[key];
  return Array.isArray(value) ? value : [];
}

function capabilityMembers(snapshot: GraphSnapshot, capabilityId: string): GraphNode[] {
  const ids = new Set(
    snapshot.edges
      .filter((edge) => edge.kind === 'implements' && edge.from === capabilityId)
      .map((edge) => edge.to),
  );
  return snapshot.nodes.filter((node) => ids.has(node.id));
}

function ruleOf(node: GraphNode): string | undefined {
  const rule = node.metadata?.rule;
  return typeof rule === 'string' ? rule : undefined;
}

export function buildOverview(
  snapshot: GraphSnapshot,
  questions: OpenQuestionsFile = { questions: [] },
): OverviewView {
  const projectNode = snapshot.nodes.find((node) => node.kind === 'project');
  const dependencies = metadataArray(projectNode, 'dependencies')
    .map((dependency) =>
      dependency && typeof dependency === 'object' && 'name' in dependency
        ? String((dependency as { name: unknown }).name)
        : undefined,
    )
    .filter((name): name is string => Boolean(name));
  const capabilities = snapshot.nodes
    .filter((node) => node.kind === 'capability')
    .map((node) => {
      const members = capabilityMembers(snapshot, node.id);
      return {
        id: node.id,
        name: node.name,
        ...(node.description ? { description: node.description } : {}),
        confidence: node.confidence,
        components: members.filter((member) => member.kind === 'component').length,
        tests: members.filter((member) => member.kind === 'test').length,
        routes: members.filter((member) => member.kind === 'route').length,
        evidence: node.evidenceIds.length,
        ...(ruleOf(node) ? { rule: ruleOf(node) } : {}),
      };
    })
    .sort((left, right) => {
      const leftScore = left.components + left.tests * 2 + left.routes * 3;
      const rightScore = right.components + right.tests * 2 + right.routes * 3;
      return rightScore - leftScore || left.name.localeCompare(right.name);
    });

  return OverviewViewSchema.parse({
    project: {
      name: snapshot.project.name,
      ...(snapshot.project.purpose ? { purpose: snapshot.project.purpose } : {}),
      ...(snapshot.project.scannedRef ? { scannedRef: snapshot.project.scannedRef } : {}),
      ...(snapshot.project.commit ? { commit: snapshot.project.commit } : {}),
      scannedAt: snapshot.scannedAt,
    },
    capabilities,
    boundaries: {
      frameworks: snapshot.project.frameworks,
      routes: snapshot.nodes.filter((node) => node.kind === 'route').length,
      tests: snapshot.nodes.filter((node) => node.kind === 'test').length,
      dependencies,
    },
    openQuestions: questions.questions
      .filter((question) => question.status === 'open')
      .slice(0, 3)
      .map((question) => ({
        id: question.id,
        question: question.question,
        ...(question.capabilityId ? { capabilityId: question.capabilityId } : {}),
      })),
    stats: {
      files: snapshot.stats.files,
      nodes: snapshot.stats.nodes,
      edges: snapshot.stats.edges,
    },
  });
}

function componentRole(node: GraphNode): keyof CapabilityDetail['components'] {
  if (node.kind === 'route') return 'entry';
  if (node.kind === 'test') return 'tests';
  if (node.kind === 'external_service') return 'integrations';
  const text = `${node.name} ${String(node.metadata?.path ?? '')}`.toLowerCase();
  if (/(repository|database|model|entity|schema|store|persistence)/.test(text)) return 'data';
  if (/(service|controller|handler|usecase|manager|orchestrat)/.test(text)) return 'orchestration';
  return 'other';
}

function buildFlows(
  members: GraphNode[],
  relations: CapabilityDetail['relations'],
): CapabilityDetail['flows'] {
  const byId = new Map(members.map((node) => [node.id, node]));
  const outgoing = new Map<string, string[]>();
  for (const edge of relations) {
    if (!['calls', 'imports'].includes(edge.kind)) continue;
    const targets = outgoing.get(edge.from) ?? [];
    targets.push(edge.to);
    outgoing.set(edge.from, targets);
  }

  const flows: CapabilityDetail['flows'] = [];
  for (const route of members.filter((node) => node.kind === 'route')) {
    const owner = relations.find((edge) => edge.kind === 'exposes' && edge.to === route.id)?.from;
    const steps = [route.name];
    let current = owner;
    const visited = new Set<string>();
    while (current && !visited.has(current) && steps.length < 6) {
      visited.add(current);
      const node = byId.get(current);
      if (node) steps.push(node.name);
      current = outgoing.get(current)?.find((target) => !visited.has(target));
    }
    flows.push({ label: route.name, steps });
  }
  return flows;
}

export function buildCapabilityDetail(
  snapshot: GraphSnapshot,
  query: string,
  history: ChangeEvent[] = [],
): CapabilityDetail {
  const normalized = query.trim().toLowerCase();
  const capability = snapshot.nodes.find(
    (node) =>
      node.kind === 'capability' &&
      (node.id.toLowerCase() === normalized || node.name.toLowerCase() === normalized),
  );
  if (!capability) throw new WdmcdError('CAPABILITY_NOT_FOUND', `Capability not found: ${query}.`);

  const members = capabilityMembers(snapshot, capability.id);
  const memberIds = new Set(members.map((member) => member.id));
  memberIds.add(capability.id);
  const relations = snapshot.edges.filter(
    (edge) => memberIds.has(edge.from) && memberIds.has(edge.to) && edge.kind !== 'implements',
  );
  const evidenceIds = new Set([
    ...capability.evidenceIds,
    ...members.flatMap((member) => member.evidenceIds),
    ...relations.flatMap((relation) => relation.evidenceIds),
  ]);
  const components: CapabilityDetail['components'] = {
    entry: [],
    orchestration: [],
    data: [],
    integrations: [],
    tests: [],
    other: [],
  };
  for (const member of members) components[componentRole(member)].push(member);
  for (const group of Object.values(components))
    group.sort((left, right) => left.name.localeCompare(right.name));

  const rule = ruleOf(capability);
  return CapabilityDetailSchema.parse({
    id: capability.id,
    name: capability.name,
    ...(capability.description ? { description: capability.description } : {}),
    confidence: capability.confidence,
    ...(rule ? { rule } : {}),
    flows: buildFlows(members, relations),
    components,
    relations,
    evidence: snapshot.evidence.filter((item) => evidenceIds.has(item.id)),
    history: history.filter((event) => event.capabilityIds.includes(capability.id)),
    needsReview:
      capability.confidence === 'inferred'
        ? [`Confirm the inferred capability name and scope. ${rule ?? ''}`.trim()]
        : [],
  });
}
