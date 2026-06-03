import React from 'react';
import { useProduct, Product } from '@/context/ProductContext';
import { cn } from '@/lib/utils';
import { Crown, Map } from 'lucide-react';

export default function ProductSwitcher() {
  const { product, setProduct } = useProduct();

  const btn = (p: Product, label: string, Icon: typeof Crown, active: boolean) => (
    <button
      key={p}
      onClick={() => setProduct(p)}
      className={cn(
        'flex-1 flex items-center justify-center gap-1.5 px-2 py-2 text-xs font-bold uppercase tracking-wider rounded-md transition-all border',
        active
          ? p === 'nomia'
            ? 'bg-[hsl(45,90%,55%)]/15 text-[hsl(45,90%,65%)] border-[hsl(45,90%,55%)]/40 shadow-[0_0_18px_hsl(45_90%_55%/0.18)]'
            : 'bg-white/10 text-white border-white/30 shadow-[0_0_18px_rgba(255,255,255,0.12)]'
          : 'bg-sidebar-accent/30 text-muted-foreground border-transparent hover:text-foreground'
      )}
    >
      <Icon size={12} />
      <span>{label}</span>
    </button>
  );

  return (
    <div className="px-3 pt-2">
      <div className="flex gap-1.5 p-1 rounded-lg bg-sidebar-accent/20 border border-sidebar-border/40">
        {btn('nomia', 'Nomia', Crown, product === 'nomia')}
        {btn('leadmap', 'Leadmap', Map, product === 'leadmap')}
      </div>
    </div>
  );
}
