'use client';

import React from 'react';
import { useTranslations } from 'next-intl';

interface HubConcept {
  name: string;
  why_central: string;
}

interface SurprisingConnection {
  from: string;
  to: string;
  insight: string;
}

interface HubConceptCardProps {
  hub: HubConcept;
}

const HubConceptCard = React.memo(function HubConceptCard({ hub }: HubConceptCardProps) {
  return (
    <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-1.5">
        <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
        <span className="font-serif font-semibold text-gray-900 dark:text-gray-100">{hub.name}</span>
      </div>
      <p className="text-sm text-gray-600 dark:text-gray-300 m-0 leading-relaxed">{hub.why_central}</p>
    </div>
  );
});

interface ConnectionCardProps {
  connection: SurprisingConnection;
}

const ConnectionCard = React.memo(function ConnectionCard({ connection }: ConnectionCardProps) {
  return (
    <div className="flex items-start gap-3 bg-surface-0 border border-surface-3 rounded-lg p-3">
      <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
        <span className="px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/40 text-xs font-medium text-amber-800 dark:text-amber-200">
          {connection.from}
        </span>
        <svg aria-hidden="true" className="w-4 h-4 text-gray-400 dark:text-gray-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
        </svg>
        <span className="px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/40 text-xs font-medium text-amber-800 dark:text-amber-200">
          {connection.to}
        </span>
      </div>
      <p className="text-sm text-gray-600 dark:text-gray-400 m-0 leading-relaxed">{connection.insight}</p>
    </div>
  );
});

interface PeripheralChipProps {
  concept: string;
}

const PeripheralChip = React.memo(function PeripheralChip({ concept }: PeripheralChipProps) {
  return (
    <span className="px-2.5 py-1 rounded-full bg-surface-1 border border-surface-3 text-xs text-gray-600 dark:text-gray-400">
      {concept}
    </span>
  );
});

interface ConceptWebSectionProps {
  data: Record<string, unknown>;
}

export default React.memo(function ConceptWebSection({ data }: ConceptWebSectionProps) {
  const t = useTranslations('readingMirror');
  const hubs = (data.hub_concepts as HubConcept[]) || [];
  const connections = (data.surprising_connections as SurprisingConnection[]) || [];
  const peripheral = (data.peripheral_concepts as string[]) || [];
  const narrative = data.map_narrative as string | undefined;

  if (hubs.length === 0 && connections.length === 0) {
    return (
      <div className="py-8 text-center">
        <span className="text-2xl">🕸️</span>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-2 italic">{t('no_concepts')}</p>
      </div>
    );
  }

  return (
    <div className="py-8 space-y-6">
      {narrative && (
        <p className="text-gray-600 dark:text-gray-300 text-base italic leading-relaxed max-w-[65ch]">
          {narrative}
        </p>
      )}

      {/* Hub concepts */}
      {hubs.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            {t('hub_concepts')}
          </h4>
          <div className="grid gap-3 sm:grid-cols-2">
            {hubs.map((hub) => (
              <HubConceptCard key={hub.name} hub={hub} />
            ))}
          </div>
        </div>
      )}

      {/* Surprising connections */}
      {connections.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            {t('surprising_connections')}
          </h4>
          <div className="space-y-2">
            {connections.map((conn) => (
              <ConnectionCard key={`${conn.from}-${conn.to}`} connection={conn} />
            ))}
          </div>
        </div>
      )}

      {/* Peripheral concepts */}
      {peripheral.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
            {t('peripheral_concepts')}
          </h4>
          <div className="flex flex-wrap gap-2">
            {peripheral.map((concept) => (
              <PeripheralChip key={concept} concept={concept} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
});
