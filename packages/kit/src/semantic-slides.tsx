import type { ReactNode } from 'react';
import type {
  CaseSlideSpec,
  ComparisonSlideSpec,
  DecisionSlideSpec,
  ProcessSlideSpec,
  SemanticSlideSpec,
} from './authoring-contract.ts';

function SlideHeader({
  kicker,
  title,
  takeaway,
}: {
  kicker?: string;
  title: string;
  takeaway: string;
}) {
  return (
    <header className="ve-slide-header">
      {kicker ? <p className="ve-slide-kicker">{kicker}</p> : null}
      <h2 className="ve-slide-title">{title}</h2>
      <p className="ve-slide-takeaway">{takeaway}</p>
    </header>
  );
}

/**
 * Semantic single-case briefing slide: evidence on the left, structured metrics on the right.
 */
export function CaseSlide({ spec, aside }: { spec: CaseSlideSpec; aside?: ReactNode }) {
  return (
    <section className="ve-slide-semantic" data-slide-layout="case" data-slide-id={spec.id}>
      <SlideHeader kicker={spec.kicker} title={spec.title} takeaway={spec.takeaway} />
      <div className="ve-slide-case-grid">
        <div className="ve-slide-panel">
          <div className="ve-slide-kicker">Subject</div>
          <p style={{ marginTop: 12, fontSize: 18, lineHeight: 1.5, color: 'var(--ve-heading)' }}>
            {spec.subject}
          </p>
          {aside ? <div style={{ marginTop: 16 }}>{aside}</div> : null}
        </div>
        <div className="ve-slide-panel ve-slide-facts">
          {spec.facts.map((fact) => (
            <div key={fact.label} className="ve-slide-fact">
              <div>
                <div className="ve-slide-fact-label">{fact.label}</div>
                {fact.detail ? (
                  <div style={{ fontSize: 13, color: 'var(--ve-muted)', marginTop: 2 }}>
                    {fact.detail}
                  </div>
                ) : null}
              </div>
              <div className="ve-slide-fact-value">{fact.value}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="ve-slide-outcome">
        <strong>Outcome:</strong> {spec.outcome}
      </div>
    </section>
  );
}

/**
 * Semantic comparison slide rendering parallel evaluated alternatives.
 */
export function ComparisonSlide({
  spec,
  footer,
}: {
  spec: ComparisonSlideSpec;
  footer?: ReactNode;
}) {
  const metricKeys =
    spec.criteria ??
    Array.from(new Set(spec.items.flatMap((item) => Object.keys(item.metrics ?? {}))));
  return (
    <section className="ve-slide-semantic" data-slide-layout="comparison" data-slide-id={spec.id}>
      <SlideHeader kicker={spec.kicker} title={spec.title} takeaway={spec.takeaway} />
      <div className="ve-slide-comparison-grid">
        {spec.items.map((item) => (
          <article
            key={item.name}
            className="ve-slide-comparison-card"
            data-highlight={item.highlight ? 'true' : 'false'}
          >
            <h3 className="ve-slide-comparison-name">{item.name}</h3>
            <p style={{ margin: 0, fontSize: 17, lineHeight: 1.5, color: 'var(--ve-muted)' }}>
              {item.summary}
            </p>
            {metricKeys.length > 0 ? (
              <div className="ve-slide-facts" style={{ marginTop: 10 }}>
                {metricKeys.map((key) => (
                  <div key={key} className="ve-slide-fact">
                    <span className="ve-slide-fact-label">{key}</span>
                    <span
                      style={{
                        fontFamily: 'var(--ve-font-mono)',
                        fontSize: 15,
                        color: 'var(--ve-heading)',
                      }}
                    >
                      {item.metrics?.[key] ?? '—'}
                    </span>
                  </div>
                ))}
              </div>
            ) : null}
          </article>
        ))}
      </div>
      {footer ? <div className="ve-slide-outcome">{footer}</div> : null}
    </section>
  );
}

/**
 * Semantic multi-stage process slide.
 */
export function ProcessSlide({ spec, footer }: { spec: ProcessSlideSpec; footer?: ReactNode }) {
  return (
    <section className="ve-slide-semantic" data-slide-layout="process" data-slide-id={spec.id}>
      <SlideHeader kicker={spec.kicker} title={spec.title} takeaway={spec.takeaway} />
      <div className="ve-slide-process-grid">
        {spec.steps.map((step, index) => (
          <article key={step.title} className="ve-slide-panel">
            <div className="ve-slide-kicker">{String(index + 1).padStart(2, '0')}</div>
            <h3 className="ve-slide-comparison-name" style={{ marginTop: 10 }}>
              {step.title}
            </h3>
            <p
              style={{
                margin: '10px 0 0',
                fontSize: 15,
                lineHeight: 1.5,
                color: 'var(--ve-muted)',
              }}
            >
              {step.body}
            </p>
            {step.owner || step.artifact ? (
              <div
                style={{
                  marginTop: 14,
                  fontFamily: 'var(--ve-font-mono)',
                  fontSize: 12,
                  color: 'var(--ve-muted)',
                }}
              >
                {[step.owner, step.artifact].filter(Boolean).join(' · ')}
              </div>
            ) : null}
          </article>
        ))}
      </div>
      {footer ? <div className="ve-slide-outcome">{footer}</div> : null}
    </section>
  );
}

/**
 * Semantic decision slide weighing candidate options against one concrete recommendation.
 */
export function DecisionSlide({ spec, aside }: { spec: DecisionSlideSpec; aside?: ReactNode }) {
  return (
    <section className="ve-slide-semantic" data-slide-layout="decision" data-slide-id={spec.id}>
      <SlideHeader kicker={spec.kicker} title={spec.title} takeaway={spec.takeaway} />
      <div className="ve-slide-panel">
        <div className="ve-slide-kicker">Decision prompt</div>
        <p style={{ margin: '8px 0 0', fontSize: 18, color: 'var(--ve-heading)' }}>{spec.prompt}</p>
      </div>
      <div className="ve-slide-decision-options">
        {spec.options.map((option) => (
          <article
            key={option.label}
            className="ve-slide-comparison-card"
            data-highlight={option.recommended ? 'true' : 'false'}
          >
            <div className="ve-slide-kicker">
              {option.recommended ? 'Recommended' : 'Alternative'}
            </div>
            <h3 className="ve-slide-comparison-name">{option.label}</h3>
            <p style={{ margin: 0, fontSize: 15, lineHeight: 1.5, color: 'var(--ve-muted)' }}>
              {option.tradeoff}
            </p>
          </article>
        ))}
      </div>
      {aside}
      <div className="ve-slide-outcome">
        <strong>Recommendation:</strong> {spec.recommendation}
      </div>
    </section>
  );
}

/**
 * Dispatches any validated SemanticSlideSpec to its matching layout component.
 */
export function SemanticSlide({ spec, slot }: { spec: SemanticSlideSpec; slot?: ReactNode }) {
  switch (spec.layout) {
    case 'case':
      return <CaseSlide spec={spec} aside={slot} />;
    case 'comparison':
      return <ComparisonSlide spec={spec} footer={slot} />;
    case 'process':
      return <ProcessSlide spec={spec} footer={slot} />;
    case 'decision':
      return <DecisionSlide spec={spec} aside={slot} />;
  }
}
