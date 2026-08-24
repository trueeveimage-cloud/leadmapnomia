import { ArrowRight, Building2, MapPinned, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useProduct, type Product } from '@/context/ProductContext';

const workspaces: Array<{
  product: Product;
  title: string;
  description: string;
  path: string;
  icon: typeof Building2;
  primary?: boolean;
}> = [
  {
    product: 'nomia',
    title: 'Nomia',
    description: 'Website sales, cold calls, Gmail outreach, replies and booked meetings.',
    path: '/nomia/dashboard',
    icon: Building2,
    primary: true,
  },
  {
    product: 'leadmap',
    title: 'Leadmap AI',
    description: 'Lead finding, audits, existing AI-call history and Leadmap operations.',
    path: '/leadmap/dashboard',
    icon: MapPinned,
  },
];

export default function WorkspaceChooserPage() {
  const { setProduct } = useProduct();

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex min-h-screen max-w-5xl flex-col justify-center px-5 py-10">
        <div className="mb-8 flex items-end justify-between gap-4 border-b border-border pb-5">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">CRM workspaces</div>
            <h1 className="mt-2 text-3xl font-semibold">Choose where you are working</h1>
            <p className="mt-2 max-w-xl text-sm text-muted-foreground">Each workspace has separate leads, metrics and outreach history.</p>
          </div>
          <div className="hidden items-center gap-2 text-xs text-muted-foreground sm:flex">
            <ShieldCheck size={15} /> Outreach starts paused
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {workspaces.map(({ product, title, description, path, icon: Icon, primary }) => (
            <Link
              key={product}
              to={path}
              onClick={() => setProduct(product)}
              className={`group border bg-card p-6 transition-colors ${primary ? 'border-foreground/30 hover:border-foreground/60' : 'border-border hover:border-foreground/30'}`}
            >
              <div className="flex items-start justify-between gap-5">
                <div className={`grid h-11 w-11 place-items-center rounded-md border ${primary ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300' : 'border-border bg-secondary text-muted-foreground'}`}>
                  <Icon size={20} />
                </div>
                {primary && <span className="rounded border border-emerald-400/25 bg-emerald-400/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-300">Primary</span>}
              </div>
              <h2 className="mt-7 text-xl font-semibold">{title}</h2>
              <p className="mt-2 min-h-10 text-sm leading-5 text-muted-foreground">{description}</p>
              <div className="mt-7 flex items-center gap-2 text-sm font-medium">
                Open workspace <ArrowRight size={15} className="transition-transform group-hover:translate-x-1" />
              </div>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
