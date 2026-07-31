import type { CapabilityDetail } from '@wdmcd/core';
import { ArrowLeft, CheckCircle2, ExternalLink, GitCommitHorizontal, Network } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { api, sourceUrl } from '../api.js';
import { ErrorState, LoadingState } from '../components/AsyncState.js';
import { CapabilityGraph } from '../components/CapabilityGraph.js';
import { StatusBadge } from '../components/StatusBadge.js';

export function CapabilityPage() {
  const { id = '' } = useParams();
  const [detail, setDetail] = useState<CapabilityDetail>();
  const [error, setError] = useState<string>();
  const [confirming, setConfirming] = useState(false);

  const load = useCallback(() => {
    setError(undefined);
    return api
      .capability(id)
      .then(setDetail)
      .catch((reason: unknown) => setError(String(reason)));
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const confirm = async () => {
    setConfirming(true);
    try {
      await api.confirm(id);
      await load();
    } catch (reason) {
      setError(String(reason));
    } finally {
      setConfirming(false);
    }
  };

  if (error) return <ErrorState message={error} />;
  if (!detail) return <LoadingState />;

  const componentCount = Object.values(detail.components).reduce(
    (total, group) => total + group.length,
    0,
  );
  return (
    <main className="page-shell detail-page">
      <Link className="back-link" to="/overview">
        <ArrowLeft size={16} aria-hidden="true" />
        Overview
      </Link>
      <section className="detail-header">
        <div>
          <div className="title-with-status">
            <h1>{detail.name}</h1>
            <StatusBadge value={detail.confidence} />
          </div>
          {detail.description && <p>{detail.description}</p>}
          {detail.rule && <small>{detail.rule}</small>}
        </div>
        <button
          className="primary-button"
          type="button"
          onClick={confirm}
          disabled={detail.confidence === 'confirmed' || confirming}
        >
          <CheckCircle2 size={17} aria-hidden="true" />
          {detail.confidence === 'confirmed'
            ? 'Confirmed'
            : confirming
              ? 'Confirming'
              : 'Confirm scope'}
        </button>
      </section>

      <div className="detail-summary-strip">
        <span>
          <Network size={17} aria-hidden="true" /> {componentCount} components
        </span>
        <span>{detail.relations.length} relations</span>
        <span>{detail.evidence.length} sources</span>
      </div>

      {detail.flows.length > 0 && (
        <section className="flow-section">
          <p className="context-label">Request and data flow</p>
          {detail.flows.map((flow) => (
            <div className="flow-row" key={flow.label}>
              {flow.steps.map((step, index) => (
                <span key={`${step}-${index}`}>
                  {step}
                  {index < flow.steps.length - 1 && <b aria-hidden="true">→</b>}
                </span>
              ))}
            </div>
          ))}
        </section>
      )}

      <section className="model-section">
        <div className="section-title-row">
          <div>
            <p className="context-label">Implementation</p>
            <h2>Component map</h2>
          </div>
        </div>
        <CapabilityGraph detail={detail} />
      </section>

      <div className="detail-columns">
        <section className="evidence-section">
          <div className="section-title-row">
            <div>
              <p className="context-label">Traceability</p>
              <h2>Evidence</h2>
            </div>
          </div>
          {detail.evidence.map((item) => (
            <div className="evidence-row" key={item.id}>
              <div>
                <StatusBadge value={item.kind} />
                <strong>{item.path ?? item.sourceType}</strong>
                {item.note && <small>{item.note}</small>}
              </div>
              {item.path && !item.path.startsWith('.wdmcd/') && (
                <a
                  href={sourceUrl(item.path, item.lineStart)}
                  target="_blank"
                  rel="noreferrer"
                  title="Open source"
                >
                  <span>{item.lineStart ? `L${item.lineStart}` : 'File'}</span>
                  <ExternalLink size={15} aria-hidden="true" />
                </a>
              )}
            </div>
          ))}
        </section>

        <section className="history-section">
          <div className="section-title-row">
            <div>
              <p className="context-label">Memory</p>
              <h2>Change history</h2>
            </div>
          </div>
          {detail.history.length === 0 && <p className="empty-text">No recorded changes.</p>}
          {detail.history.map((event) => (
            <div className="history-row" key={event.id}>
              <GitCommitHorizontal size={17} aria-hidden="true" />
              <div>
                <strong>{event.summary}</strong>
                <small>
                  {event.ref ?? 'working tree'} · {new Date(event.occurredAt).toLocaleString()}
                </small>
              </div>
            </div>
          ))}
        </section>
      </div>
    </main>
  );
}
