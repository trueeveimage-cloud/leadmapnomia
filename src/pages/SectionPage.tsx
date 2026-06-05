import React from 'react';
import AppLayout from '@/components/AppLayout';
import LeadList from '@/components/LeadList';
import { LeadSection, LeadStatus, type Product } from '@/lib/supabase';

interface SectionPageProps {
  section?: LeadSection;
  allSections?: boolean;
  status?: LeadStatus;
  optOut?: boolean;
  title: string;
  showTriage?: boolean;
  emptyMessage?: string;
  excludeSection?: LeadSection;
  product?: Product | 'all';
}

export default function SectionPage({ section, allSections, status, optOut, title, showTriage, emptyMessage, excludeSection, product }: SectionPageProps) {
  return (
    <AppLayout>
      <div className="flex flex-col h-full">
        <LeadList
          section={section}
          allSections={allSections}
          status={status}
          optOut={optOut}
          showTriage={showTriage}
          title={title}
          emptyMessage={emptyMessage}
          excludeSection={excludeSection}
          product={product}
        />
      </div>
    </AppLayout>
  );
}
