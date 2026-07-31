import {
  GraphSnapshotSchema,
  capabilityId,
  contentHash,
  normalizeProjectPath,
  shortHash,
  slugify,
  stableStringify,
  type CapabilitiesFile,
  type Evidence,
  type GraphEdge,
  type GraphNode,
  type GraphSnapshot,
  type OpenQuestionsFile,
} from '@wdmcd/core';

const GENERIC_SEGMENTS = new Set([
  'src',
  'app',
  'pages',
  'api',
  'lib',
  'libs',
  'components',
  'features',
  'modules',
  'routes',
  'controllers',
  'services',
  'shared',
  'common',
  'core',
  'server',
  'client',
  'test',
  'tests',
  '__tests__',
]);
const WORKSPACE_ROOTS = new Set(['apps', 'packages', 'libs']);

export interface SemanticModelOptions {
  snapshot: GraphSnapshot;
  capabilities: CapabilitiesFile;
  questions: OpenQuestionsFile;
  previous?: GraphSnapshot;
}

function domainKey(filePath: string): string {
  const segments = normalizeProjectPath(filePath).split('/').slice(0, -1);
  if (segments[0] && WORKSPACE_ROOTS.has(segments[0]) && segments[1]) {
    return slugify(segments[1]);
  }
  const candidate = segments.find(
    (segment) => !GENERIC_SEGMENTS.has(segment.toLowerCase()) && !/^\(.*\)$/.test(segment),
  );
  return slugify(candidate ?? 'application');
}

function humanize(value: string): string {
  return value
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(' ');
}

function graphNodePath(node: GraphNode): string | undefined {
  const value = node.metadata?.path;
  return typeof value === 'string' ? value : undefined;
}

function nodeTimes(
  candidate: Omit<GraphNode, 'createdAt' | 'updatedAt'>,
  previous: GraphNode | undefined,
  timestamp: string,
): Pick<GraphNode, 'createdAt' | 'updatedAt'> {
  if (!previous) return { createdAt: timestamp, updatedAt: timestamp };
  const previousContent = {
    id: previous.id,
    kind: previous.kind,
    name: previous.name,
    description: previous.description,
    evidenceIds: previous.evidenceIds,
    confidence: previous.confidence,
    metadata: previous.metadata,
  };
  return {
    createdAt: previous.createdAt,
    updatedAt:
      stableStringify(previousContent) === stableStringify(candidate)
        ? previous.updatedAt
        : timestamp,
  };
}

function expandMembers(seed: Set<string>, edges: GraphEdge[]): Set<string> {
  const expanded = new Set(seed);
  for (const edge of edges) {
    if (edge.kind === 'exposes' && expanded.has(edge.from)) expanded.add(edge.to);
    if (edge.kind === 'tested_by' && expanded.has(edge.from)) expanded.add(edge.to);
  }
  return expanded;
}

function addCapability(
  candidate: Omit<GraphNode, 'createdAt' | 'updatedAt'>,
  members: Set<string>,
  evidenceId: string,
  timestamp: string,
  previousNodes: Map<string, GraphNode>,
  nodes: GraphNode[],
  edges: GraphEdge[],
): void {
  nodes.push({ ...candidate, ...nodeTimes(candidate, previousNodes.get(candidate.id), timestamp) });
  for (const memberId of [...members].sort()) {
    edges.push({
      id: `implements:${candidate.id}->${memberId}`,
      kind: 'implements',
      from: candidate.id,
      to: memberId,
      evidenceIds: [evidenceId],
      confidence: candidate.confidence,
    });
  }
}

function semanticHash(
  snapshot: GraphSnapshot,
  nodes: GraphNode[],
  edges: GraphEdge[],
  evidence: Evidence[],
): string {
  return contentHash({
    project: snapshot.project,
    nodes: nodes.map((node) => ({
      id: node.id,
      kind: node.kind,
      name: node.name,
      ...(node.description ? { description: node.description } : {}),
      evidenceIds: node.evidenceIds,
      confidence: node.confidence,
      ...(node.metadata ? { metadata: node.metadata } : {}),
    })),
    edges,
    evidence,
    diagnostics: snapshot.diagnostics,
  });
}

export function applySemanticModel(options: SemanticModelOptions): GraphSnapshot {
  const timestamp = options.snapshot.scannedAt;
  const previousNodes = new Map(options.previous?.nodes.map((node) => [node.id, node]));
  const nodes = options.snapshot.nodes.filter(
    (node) => node.kind !== 'capability' && node.kind !== 'open_question',
  );
  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges = options.snapshot.edges.filter(
    (edge) => edge.kind !== 'implements' && edge.kind !== 'risks',
  );
  const evidence = options.snapshot.evidence.filter(
    (item) =>
      !item.id.startsWith('evidence:rule:') &&
      !item.id.startsWith('evidence:curated:') &&
      !item.id.startsWith('evidence:question:'),
  );
  const groups = new Map<string, Set<string>>();

  for (const node of nodes) {
    if (node.kind !== 'component' && node.kind !== 'test') continue;
    const filePath = graphNodePath(node);
    if (!filePath) continue;
    const key = domainKey(filePath);
    const members = groups.get(key) ?? new Set<string>();
    members.add(node.id);
    groups.set(key, members);
  }
  for (const [key, members] of groups) groups.set(key, expandMembers(members, edges));

  const consumedGroups = new Set<string>();
  for (const curated of options.capabilities.capabilities) {
    const curatedKey = slugify(curated.name);
    const idKey = slugify(curated.id.replace(/^capability:/, ''));
    let matchingKey = [...groups.keys()].find((key) => key === curatedKey || key === idKey);
    const members = new Set(curated.components.filter((component) => nodeIds.has(component)));
    matchingKey ??= [...groups.entries()].find(([, group]) =>
      [...members].some((member) => group.has(member)),
    )?.[0];
    if (matchingKey) {
      consumedGroups.add(matchingKey);
      for (const member of groups.get(matchingKey) ?? []) members.add(member);
    }
    const expandedMembers = expandMembers(members, edges);
    const curatedEvidence: Evidence = {
      id: `evidence:curated:${shortHash(curated.id)}`,
      kind: curated.confidence,
      sourceType: 'config',
      path: '.wdmcd/capabilities.yaml',
      note: 'Capability scope declared by a maintainer.',
    };
    evidence.push(curatedEvidence);
    for (const [index, source] of curated.evidence.entries()) {
      evidence.push({
        id: `evidence:curated:${shortHash(`${curated.id}:${index}:${stableStringify(source)}`)}`,
        kind: curated.confidence,
        sourceType: 'user',
        ...(source.path ? { path: normalizeProjectPath(source.path) } : {}),
        ...(source.symbol ? { symbol: source.symbol } : {}),
        ...(source.note ? { note: source.note } : {}),
      });
    }
    const componentEvidence = nodes
      .filter((node) => expandedMembers.has(node.id))
      .flatMap((node) => node.evidenceIds)
      .slice(0, 3);
    addCapability(
      {
        id: curated.id,
        kind: 'capability',
        name: curated.name,
        ...(curated.description ? { description: curated.description } : {}),
        evidenceIds: [curatedEvidence.id, ...componentEvidence],
        confidence: curated.confidence,
        metadata: { rule: 'Declared in .wdmcd/capabilities.yaml.' },
      },
      expandedMembers,
      curatedEvidence.id,
      timestamp,
      previousNodes,
      nodes,
      edges,
    );
  }

  for (const [key, members] of [...groups.entries()].sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    if (consumedGroups.has(key) || members.size === 0) continue;
    const name = humanize(key);
    const id = capabilityId(name);
    if (nodes.some((node) => node.id === id)) continue;
    const ruleEvidence: Evidence = {
      id: `evidence:rule:directory-${key}`,
      kind: 'inferred',
      sourceType: 'config',
      path: '.wdmcd/config.json',
      note: `Inferred from the ${key} source area and its connected routes/tests.`,
    };
    evidence.push(ruleEvidence);
    const memberEvidence = nodes
      .filter((node) => members.has(node.id))
      .flatMap((node) => node.evidenceIds)
      .slice(0, 3);
    addCapability(
      {
        id,
        kind: 'capability',
        name,
        description: `Software behavior grouped around the ${name} area.`,
        evidenceIds: [ruleEvidence.id, ...memberEvidence],
        confidence: 'inferred',
        metadata: { rule: ruleEvidence.note, domainKey: key },
      },
      members,
      ruleEvidence.id,
      timestamp,
      previousNodes,
      nodes,
      edges,
    );
  }

  const capabilityIds = new Set(
    nodes.filter((node) => node.kind === 'capability').map((node) => node.id),
  );
  for (const question of options.questions.questions.filter((item) => item.status === 'open')) {
    const questionEvidence: Evidence = {
      id: `evidence:question:${shortHash(question.id)}`,
      kind: 'declared',
      sourceType: 'config',
      path: '.wdmcd/open-questions.yaml',
      note: 'Open question maintained by the project team.',
    };
    evidence.push(questionEvidence);
    const candidate: Omit<GraphNode, 'createdAt' | 'updatedAt'> = {
      id: question.id,
      kind: 'open_question',
      name: question.question,
      evidenceIds: [questionEvidence.id, ...question.evidenceIds],
      confidence: 'declared',
    };
    nodes.push({
      ...candidate,
      ...nodeTimes(candidate, previousNodes.get(candidate.id), timestamp),
    });
    if (question.capabilityId && capabilityIds.has(question.capabilityId)) {
      edges.push({
        id: `risks:${question.capabilityId}->${question.id}`,
        kind: 'risks',
        from: question.capabilityId,
        to: question.id,
        evidenceIds: [questionEvidence.id],
        confidence: 'declared',
      });
    }
  }

  nodes.sort((left, right) => left.id.localeCompare(right.id));
  edges.sort((left, right) => left.id.localeCompare(right.id));
  const uniqueEvidence = [...new Map(evidence.map((item) => [item.id, item])).values()].sort(
    (left, right) => left.id.localeCompare(right.id),
  );
  const hash = semanticHash(options.snapshot, nodes, edges, uniqueEvidence);

  return GraphSnapshotSchema.parse({
    ...options.snapshot,
    id: `snapshot:${hash.slice(0, 16)}`,
    contentHash: hash,
    nodes,
    edges,
    evidence: uniqueEvidence,
    stats: {
      ...options.snapshot.stats,
      nodes: nodes.length,
      edges: edges.length,
      capabilities: nodes.filter((node) => node.kind === 'capability').length,
    },
  });
}
