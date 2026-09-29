'use client';

import React, { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/navigation';

/**
 * Ops navigation (P-H9): CCR-style grouped sidebar for the /ops scope.
 * Desktop = collapsible sidebar; < md = horizontal tab bar. All hrefs are
 * locale-aware (F5 residual — plain <a href="/ops/..."> relied on the
 * Next.js redirect fallback and always bounced to /en). The unlock gate
 * itself stays per-page: the ops key lives in sessionStorage which every
 * ops page reads directly.
 */

interface NavItem {
  href: string;
  icon: string;
  key: string;
  exact?: boolean;
}

const MONITOR_ITEMS: NavItem[] = [
  { href: '/ops/llm', icon: '🛰️', key: 'nav_overview', exact: true },
  { href: '/ops/llm/traces', icon: '🔍', key: 'nav_traces' },
  { href: '/ops/llm/sessions', icon: '🧵', key: 'nav_sessions' },
  { href: '/ops/llm/rag', icon: '📊', key: 'nav_rag' },
];
const RUNTIME_ITEMS: NavItem[] = [
  { href: '/ops/llm/providers', icon: '🔌', key: 'nav_providers' },
];

const COLLAPSE_KEY = 'ops-nav-collapsed';

function NavLink({ item, active, collapsed }: { item: NavItem; active: boolean; collapsed: boolean }) {
  const t = useTranslations('opsLlm');
  return (
    <Link
      href={item.href}
      title={collapsed ? t(item.key) : undefined}
      aria-current={active ? 'page' : undefined}
      className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
        active
          ? 'bg-amber-600 text-white font-medium'
          : 'text-gray-600 dark:text-gray-300 hover:bg-surface-2'
      } ${collapsed ? 'justify-center' : ''}`}
    >
      <span aria-hidden="true">{item.icon}</span>
      {!collapsed && <span className="truncate">{t(item.key)}</span>}
    </Link>
  );
}

export function OpsNav() {
  const t = useTranslations('opsLlm');
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    setCollapsed(sessionStorage.getItem(COLLAPSE_KEY) === '1');
  }, []);

  const toggle = () => {
    setCollapsed((c) => {
      sessionStorage.setItem(COLLAPSE_KEY, c ? '0' : '1');
      return !c;
    });
  };

  // Anchor items (#fragment) never match — pathname carries no hash.
  const isActive = (item: NavItem) => {
    if (item.href.includes('#')) return false;
    const base = item.href;
    return item.exact ? pathname === base : pathname === base || pathname.startsWith(`${base}/`);
  };

  const groups = [
    { label: t('nav_group_monitor'), items: MONITOR_ITEMS },
    { label: t('nav_group_runtime'), items: RUNTIME_ITEMS },
  ];

  return (
    <nav aria-label={t('nav_aria')} className="shrink-0">
      {/* Desktop sidebar */}
      <div className={`hidden md:flex flex-col gap-1 sticky top-20 ${collapsed ? 'w-14' : 'w-52'} transition-all`}>
        <Link
          href="/dashboard"
          className="flex items-center gap-2 px-3 py-2 mb-2 text-sm text-gray-500 hover:text-gray-800 dark:hover:text-gray-200"
          title={collapsed ? t('nav_back') : undefined}
        >
          <span aria-hidden="true">←</span>
          {!collapsed && <span>{t('nav_back')}</span>}
        </Link>
        {groups.map((g) => (
          <div key={g.label} className="mb-1">
            {!collapsed && (
              <div className="text-[10px] uppercase tracking-wider text-gray-400 px-3 mb-1">{g.label}</div>
            )}
            <div className="flex flex-col gap-0.5">
              {g.items.map((item) => (
                <NavLink key={item.href} item={item} active={isActive(item)} collapsed={collapsed} />
              ))}
            </div>
          </div>
        ))}
        <button
          type="button"
          onClick={toggle}
          className="mt-2 self-start px-2 py-1 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          aria-label={t(collapsed ? 'nav_expand' : 'nav_collapse')}
          title={t(collapsed ? 'nav_expand' : 'nav_collapse')}
        >
          {collapsed ? '»' : '« ' + t('nav_collapse')}
        </button>
      </div>

      {/* Mobile / narrow: horizontal tabs */}
      <div className="md:hidden -mx-4 px-4 mb-4 overflow-x-auto">
        <div className="flex items-center gap-1.5 py-1">
          <Link href="/dashboard" className="shrink-0 px-2 py-1.5 text-sm text-gray-500" aria-label={t('nav_back')}>←</Link>
          {groups.flatMap((g) => g.items).map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive(item) ? 'page' : undefined}
              className={`shrink-0 px-3 py-1.5 rounded-lg text-sm whitespace-nowrap ${
                isActive(item) ? 'bg-amber-600 text-white font-medium' : 'bg-surface-1 text-gray-600 dark:text-gray-300'
              }`}
            >
              <span aria-hidden="true">{item.icon}</span> {t(item.key)}
            </Link>
          ))}
        </div>
      </div>
    </nav>
  );
}
