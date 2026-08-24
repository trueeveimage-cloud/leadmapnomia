import React from 'react';
import Sidebar from './Sidebar';
import { useCRM } from '@/context/CRMContext';
import { Menu } from 'lucide-react';
import { useProduct } from '@/context/ProductContext';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { sidebarOpen, setSidebarOpen } = useCRM();
  const { product } = useProduct();

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Mobile overlay */}
      <div
        className={`fixed inset-0 z-30 bg-black/60 backdrop-blur-sm md:hidden transition-opacity duration-300 ${
          sidebarOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        onClick={() => setSidebarOpen(false)}
      />

      {/* Sidebar — always visible on md+, slide-in on mobile */}
      <div className={`fixed md:static inset-y-0 left-0 z-40 transition-transform duration-300 ease-out ${
        sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
      }`}>
        <Sidebar onClose={() => setSidebarOpen(false)} />
      </div>

      <main className="flex-1 overflow-y-auto flex flex-col min-w-0">
        {/* Mobile top bar */}
        <div className="md:hidden flex items-center gap-3 px-4 py-3 border-b border-border bg-card/80 backdrop-blur-md sticky top-0 z-20">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-all duration-200 active:scale-95"
          >
            <Menu size={20} />
          </button>
          <span className="font-semibold text-sm text-foreground">{product === 'nomia' ? 'Nomia CRM' : 'Leadmap AI'}</span>
        </div>
        {children}
      </main>
    </div>
  );
}
