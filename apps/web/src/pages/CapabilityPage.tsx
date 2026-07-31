import type { CapabilityDetail, ComponentOption } from '@wdmcd/core';
import {
  ArrowLeft,
  CheckCircle2,
  ExternalLink,
  GitCommitHorizontal,
  Network,
  Pencil,
  Save,
  Search,
  X,
} from 'lucide-react';
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
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [searching, setSearching] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [draftDescription, setDraftDescription] = useState('');
  const [componentQuery, setComponentQuery] = useState('');
  const [componentResults, setComponentResults] = useState<ComponentOption[]>([]);
  const [selectedComponents, setSelectedComponents] = useState<Set<string>>(new Set());

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
  const allComponents = Object.values(detail.components).flat();

  const openEditor = () => {
    setDraftName(detail.name);
    setDraftDescription(detail.description ?? '');
    setSelectedComponents(new Set(allComponents.map((component) => component.id)));
    setComponentResults(
      allComponents.slice(0, 50).map((component) => ({
        id: component.id,
        name: component.name,
        kind: component.kind,
        ...(typeof component.metadata?.path === 'string' ? { path: component.metadata.path } : {}),
      })),
    );
    setComponentQuery('');
    setEditing(true);
  };

  const searchComponents = async (event: React.FormEvent) => {
    event.preventDefault();
    setSearching(true);
    try {
      setComponentResults(await api.components(componentQuery.trim()));
    } catch (reason) {
      setError(String(reason));
    } finally {
      setSearching(false);
    }
  };

  const toggleComponent = (componentId: string) => {
    setSelectedComponents((current) => {
      const next = new Set(current);
      if (next.has(componentId)) next.delete(componentId);
      else next.add(componentId);
      return next;
    });
  };

  const saveCorrection = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      await api.confirm(id, {
        name: draftName.trim(),
        description: draftDescription.trim(),
        components: [...selectedComponents].sort(),
      });
      setEditing(false);
      await load();
    } catch (reason) {
      setError(String(reason));
    } finally {
      setSaving(false);
    }
  };

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
        <div className="header-actions">
          <button className="secondary-button" type="button" onClick={openEditor}>
            <Pencil size={16} aria-hidden="true" />
            Edit model
          </button>
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
        </div>
      </section>

      {editing && (
        <form className="model-editor" onSubmit={saveCorrection}>
          <div className="section-title-row">
            <div>
              <p className="context-label">Curated capability</p>
              <h2>Edit model</h2>
            </div>
            <button
              className="icon-button"
              type="button"
              onClick={() => setEditing(false)}
              title="Close editor"
              aria-label="Close editor"
            >
              <X size={17} aria-hidden="true" />
            </button>
          </div>
          <div className="editor-fields">
            <label>
              <span>Name</span>
              <input
                value={draftName}
                onChange={(event) => setDraftName(event.target.value)}
                required
                maxLength={120}
              />
            </label>
            <label>
              <span>Description</span>
              <textarea
                value={draftDescription}
                onChange={(event) => setDraftDescription(event.target.value)}
                maxLength={1000}
                rows={3}
              />
            </label>
          </div>
          <div className="scope-editor">
            <div className="scope-heading">
              <div>
                <strong>Component scope</strong>
                <small>{selectedComponents.size} selected</small>
              </div>
              <div className="component-search">
                <input
                  value={componentQuery}
                  onChange={(event) => setComponentQuery(event.target.value)}
                  placeholder="Search name or path"
                  aria-label="Search components"
                />
                <button
                  className="icon-button"
                  type="button"
                  onClick={(event) => void searchComponents(event)}
                  disabled={searching}
                  title="Search components"
                  aria-label="Search components"
                >
                  <Search size={17} aria-hidden="true" />
                </button>
              </div>
            </div>
            <div className="scope-results">
              {componentResults.map((component) => (
                <label className="scope-row" key={component.id}>
                  <input
                    type="checkbox"
                    checked={selectedComponents.has(component.id)}
                    onChange={() => toggleComponent(component.id)}
                  />
                  <span>
                    <strong>{component.name}</strong>
                    <small>{component.path ?? component.kind}</small>
                  </span>
                </label>
              ))}
              {componentResults.length === 0 && (
                <p className="empty-text">No matching components.</p>
              )}
            </div>
          </div>
          <div className="editor-actions">
            <small>
              Updates <code>.wdmcd/capabilities.yaml</code>
            </small>
            <button className="secondary-button" type="button" onClick={() => setEditing(false)}>
              <X size={16} aria-hidden="true" />
              Cancel
            </button>
            <button className="primary-button" type="submit" disabled={saving}>
              <Save size={16} aria-hidden="true" />
              {saving ? 'Saving' : 'Save and confirm'}
            </button>
          </div>
        </form>
      )}

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
