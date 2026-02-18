import React from 'react';
import AppLayout from '@/components/AppLayout';
import LeadList from '@/components/LeadList';
import { LeadSection, LeadStatus } from '@/lib/supabase';

interface SectionPageProps {
  section?: LeadSection;
  status?: LeadStatus;
  title: string;
  showTriage?: boolean;
  emptyMessage?: string;
}

export default function SectionPage({ section, status, title, showTriage, emptyMessage }: SectionPageProps) {
  return (
    <AppLayout>
      <div className="flex flex-col h-full">
        <LeadList
          section={section}
          status={status}
          showTriage={showTriage}
          title={title}
          emptyMessage={emptyMessage}
        />
      </div>
    </AppLayout>
  );
}
