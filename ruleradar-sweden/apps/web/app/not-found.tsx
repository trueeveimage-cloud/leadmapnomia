import Link from "next/link";
import { ArrowLeft, Radar } from "lucide-react";

export default function NotFound() {
  return <main className="system-page"><Radar size={31} /><span>404</span><h1>Sidan finns inte.</h1><p>Länken kan vara gammal eller så har sidan flyttats.</p><Link className="button primary" href="/"><ArrowLeft size={16} /> Till startsidan</Link></main>;
}
