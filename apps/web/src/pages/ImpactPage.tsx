import type { ImpactReport, OverviewView } from '@wdmcd/core';
import { AlertCircle, ArrowRight, FileCode2, GitCompareArrows, TestTube2 } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';

import { api } from '../api.js';
import { ErrorState } from '../components/AsyncState.js';

export function ImpactPage() {
  const [base, setBase] = useState('main');
  const [head, setHead] = useState('HEAD');
  const [overview, setOverview] = useState<OverviewView>();
  const [report, setReport] = useState<ImpactReport>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.overview().then((value) => {
      setOverview(value);
      if (value.project.scannedRef && value.project.scannedRef !== 'main')
        setHead(value.project.scannedRef);
    });
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(undefined);
    setLoading(true);
    try {
      setReport(await api.impact(base.trim(), head.trim()));
    } catch (reason) {
      setError(String(reason));
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="page-shell impact-page">
      <section className="impact-header">
        <div>
          <p className="context-label">Change intelligence</p>
          <h1>Impact</h1>
          <p>{overview?.project.name ?? 'Project'} architecture across two scanned refs.</p>
        </div>
        <GitCompareArrows size={28} aria-hidden="true" />
      </section>

      <form className="impact-form" onSubmit={submit}>
        <label>
          <span>Base</span>
          <input value={base} onChange={(event) => setBase(event.target.value)} required />
        </label>
        <ArrowRight size={20} aria-hidden="true" />
        <label>
          <span>Head</span>
          <input value={head} onChange={(event) => setHead(event.target.value)} required />
        </label>
        <button className="primary-button" type="submit" disabled={loading}>
          <GitCompareArrows size={17} aria-hidden="true" />
          {loading ? 'Analyzing' : 'Compare'}
        </button>
      </form>

      {error && <ErrorState message={error} />}
      {report && (
        <div className="impact-results">
          <div className="impact-summary">
            <span>{report.files.length} files changed</span>
            <span>{report.direct.length} direct capabilities</span>
            <span>{report.downstream.length} downstream capabilities</span>
            <span>
              {report.relations.added.length +
                report.relations.removed.length +
                report.relations.changed.length}{' '}
              relation changes
            </span>
          </div>

          <div className="impact-columns">
            <section>
              <div className="section-title-row">
                <h2>Direct impact</h2>
                <FileCode2 size={19} aria-hidden="true" />
              </div>
              {report.direct.map((impact) => (
                <div className="impact-row direct-impact" key={impact.capabilityId}>
                  <strong>{impact.name}</strong>
                  <span>{impact.reason}</span>
                  <small>{impact.chain.join(' → ')}</small>
                </div>
              ))}
              {report.direct.length === 0 && (
                <p className="empty-text">No direct capability identified.</p>
              )}
            </section>

            <section>
              <div className="section-title-row">
                <h2>Downstream</h2>
                <ArrowRight size={19} aria-hidden="true" />
              </div>
              {report.downstream.map((impact) => (
                <div className="impact-row downstream-impact" key={impact.capabilityId}>
                  <strong>{impact.name}</strong>
                  <span>{impact.reason}</span>
                  <small>{impact.chain.join(' → ')}</small>
                </div>
              ))}
              {report.downstream.length === 0 && (
                <p className="empty-text">No evidenced downstream chain.</p>
              )}
            </section>
          </div>

          <div className="impact-columns lower-impact">
            <section>
              <div className="section-title-row">
                <h2>Changed files</h2>
                <FileCode2 size={19} aria-hidden="true" />
              </div>
              {report.files.map((file) => (
                <div className="file-row" key={`${file.status}-${file.path}`}>
                  <span className={`file-status status-${file.status}`}>
                    {file.status[0]?.toUpperCase()}
                  </span>
                  <code>{file.path}</code>
                </div>
              ))}
            </section>
            <section>
              <div className="section-title-row">
                <h2>Tests and review</h2>
                <TestTube2 size={19} aria-hidden="true" />
              </div>
              {report.tests.map((test) => (
                <div className="test-row" key={test.id}>
                  <TestTube2 size={16} aria-hidden="true" />
                  <span>{test.name}</span>
                </div>
              ))}
              {report.questions.map((question) => (
                <div className="review-row" key={question}>
                  <AlertCircle size={16} aria-hidden="true" />
                  <span>{question}</span>
                </div>
              ))}
            </section>
          </div>
        </div>
      )}
    </main>
  );
}
