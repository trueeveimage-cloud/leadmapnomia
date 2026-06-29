const faqs = [
  ["Is this legal advice?", "No. RuleRadar provides informational alerts with official source links and diff excerpts so your team can verify the source."],
  ["Which sources are included first?", "Skatteverket, Verksamt, Forsakringskassan, Bolagsverket, and a lower-priority Arbetsgivarverket track."],
  ["Why manual review?", "Tax-rate, filing-deadline, form-field, and low-confidence changes can affect customer work. Those changes should be approved before customer delivery."],
  ["Do you send SMS?", "Email is the default MVP channel. SMS is modeled as a paid critical-alert add-on, not a requirement."]
];

export default function FaqPage() {
  return (
    <main className="page">
      <h1>FAQ</h1>
      <div className="grid two">
        {faqs.map(([question, answer]) => (
          <article className="card" key={question}>
            <h2>{question}</h2>
            <p className="muted">{answer}</p>
          </article>
        ))}
      </div>
    </main>
  );
}
