const faqs = [
  ["Is this legal advice?", "No. RuleRadar provides informational alerts with official source links and diff excerpts so your team can verify the source."],
  ["Is the current website spending money?", "No. The public demo is configured as a free Render web service with fixture data. Paid Postgres, worker, cron, email, and checkout are intentionally off."],
  ["Which sources are included first?", "Skatteverket, Verksamt, Forsakringskassan, Bolagsverket, and a lower-priority Arbetsgivarverket track."],
  ["Why manual review?", "Tax-rate, filing-deadline, form-field, and low-confidence changes can affect customer work. Those changes should be approved before customer delivery."],
  ["Do you send SMS?", "Email is the default MVP channel. SMS is modeled as a paid critical-alert add-on, not a requirement."],
  ["What should a beta customer test?", "Ask whether the alert evidence is clear, whether the recommended action is specific enough, and whether the review flow fits their current payroll or accounting process."]
];

export default function FaqPage() {
  return (
    <main className="page">
      <section className="page-hero compact-hero">
        <div>
          <div className="eyebrow">Questions</div>
          <h1>FAQ for the demo and paid beta.</h1>
          <p className="lead">The key boundary: the public site shows the product workflow with sample data. The paid beta adds live monitoring, persistence, scheduled scans, and email delivery.</p>
        </div>
      </section>
      <div className="faq-list">
        {faqs.map(([question, answer]) => (
          <article className="faq-item" key={question}>
            <h2>{question}</h2>
            <p className="muted">{answer}</p>
          </article>
        ))}
      </div>
    </main>
  );
}
