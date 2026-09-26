import { OpsNav } from '@/components/ops/OpsNav';

/**
 * Ops scope layout (P-H9): sidebar nav wraps every /ops page. Pages keep
 * their own unlock gate (ops key in sessionStorage); this layout is pure
 * chrome and renders nothing secret.
 */
export default function OpsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="container-content px-4 sm:px-6 py-8 flex flex-col md:flex-row gap-0 md:gap-6">
      <OpsNav />
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}
