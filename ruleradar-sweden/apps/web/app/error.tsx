"use client";

import { AlertTriangle, RotateCcw } from "lucide-react";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main className="system-page"><AlertTriangle size={31} /><span>TEKNISKT FEL</span><h1>Något gick fel.</h1><p>Försök igen. Om problemet kvarstår, kontakta hello@ruleradar.se.</p><button className="button primary" type="button" onClick={() => reset()}><RotateCcw size={16} /> Försök igen</button></main>;
}
