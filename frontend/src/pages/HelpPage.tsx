import { helpProblems, helpTopics } from '../data/platform';

export function HelpPage() {
  return (
    <div className="stack-large">
      {helpTopics.map((topic) => (
        <section key={topic.title} className="card-panel">
          <span className="section-label">Ajuda</span>
          <h2>{topic.title}</h2>
          <ol className="step-list">
            {topic.items.map((item, index) => (
              <li key={item}>
                <strong>{index + 1}.</strong> {item}
              </li>
            ))}
          </ol>
        </section>
      ))}

      <section className="card-panel">
        <span className="section-label">Problemas comuns</span>
        <ul className="bullet-list two-columns-list">
          {helpProblems.map((problem) => (
            <li key={problem}>{problem}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}
