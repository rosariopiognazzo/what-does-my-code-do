import type { OverviewView } from '@wdmcd/core';
import { Box, CircleHelp, Code2, ExternalLink, Route as RouteIcon, TestTube2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { api } from '../api.js';
import { ErrorState, LoadingState } from '../components/AsyncState.js';
import { OverviewGraph } from '../components/OverviewGraph.js';
import { StatusBadge } from '../components/StatusBadge.js';

export function OverviewPage() {
  const [view, setView] = useState<OverviewView>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    api
      .overview()
      .then(setView)
      .catch((reason: unknown) => setError(String(reason)));
  }, []);

  if (error) return <ErrorState message={error} />;
  if (!view) return <LoadingState />;

  return (
    <main className="page-shell overview-layout">
      <aside className="capability-sidebar">
        <div className="section-heading">
          <span>Capabilities</span>
          <strong>{view.capabilities.length}</strong>
        </div>
        <div className="capability-list">
          {view.capabilities.map((capability) => (
            <Link key={capability.id} to={`/capabilities/${encodeURIComponent(capability.id)}`}>
              <span>{capability.name}</span>
              <StatusBadge value={capability.confidence} />
              <small>
                {capability.components} components · {capability.routes} routes
              </small>
            </Link>
          ))}
        </div>
      </aside>

      <div className="overview-main">
        <section className="project-header">
          <div>
            <p className="context-label">Project model</p>
            <h1>{view.project.name}</h1>
            {view.project.purpose && <p className="project-purpose">{view.project.purpose}</p>}
          </div>
          <div className="ref-block">
            <span>{view.project.scannedRef ?? 'working tree'}</span>
            <code>{view.project.commit?.slice(0, 12) ?? 'uncommitted'}</code>
            <small>{new Date(view.project.scannedAt).toLocaleString()}</small>
          </div>
        </section>

        <section className="model-section">
          <div className="section-title-row">
            <div>
              <p className="context-label">Architecture</p>
              <h2>Capability map</h2>
            </div>
            <span className="technical-count">{view.stats.edges} observed relations</span>
          </div>
          <OverviewGraph project={view.project.name} capabilities={view.capabilities} />
        </section>

        <section className="boundary-section">
          <div className="section-title-row">
            <div>
              <p className="context-label">Detected</p>
              <h2>Technical boundaries</h2>
            </div>
          </div>
          <div className="boundary-grid">
            <div>
              <Code2 size={18} aria-hidden="true" />
              <span>Frameworks</span>
              <strong>{view.boundaries.frameworks.join(', ') || 'TypeScript / JavaScript'}</strong>
            </div>
            <div>
              <RouteIcon size={18} aria-hidden="true" />
              <span>Routes</span>
              <strong>{view.boundaries.routes}</strong>
            </div>
            <div>
              <TestTube2 size={18} aria-hidden="true" />
              <span>Tests</span>
              <strong>{view.boundaries.tests}</strong>
            </div>
            <div>
              <Box size={18} aria-hidden="true" />
              <span>Dependencies</span>
              <strong>{view.boundaries.dependencies.length}</strong>
            </div>
          </div>
        </section>

        {view.openQuestions.length > 0 && (
          <section className="questions-section">
            <div className="section-title-row">
              <div>
                <p className="context-label">Needs review</p>
                <h2>Open questions</h2>
              </div>
              <CircleHelp size={20} aria-hidden="true" />
            </div>
            {view.openQuestions.map((question) => (
              <div className="question-row" key={question.id}>
                <span>{question.question}</span>
                {question.capabilityId && (
                  <Link
                    to={`/capabilities/${encodeURIComponent(question.capabilityId)}`}
                    title="Open capability"
                  >
                    <ExternalLink size={16} aria-hidden="true" />
                  </Link>
                )}
              </div>
            ))}
          </section>
        )}
      </div>
    </main>
  );
}
