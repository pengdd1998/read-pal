import { OpsNav } from '@/components/ops/OpsNav';
import { OpsHealthStrip } from '@/components/ops/OpsHealthStrip';

/**
 * Ops scope layout (P-H9 + P-J): standalone console chrome — health strip
 * on top (J1), sidebar nav, no product shell. Pages keep their own
 * unlock gate (ops key via the shared storage helper); this layout is
 * pure chrome and renders nothing secret.
 */
export const metadata = {
  title: 'read-pal · ops',
};

export default function OpsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <OpsHealthStrip />
      <div className="container-content px-4 sm:px-6 py-8 flex flex-col md:flex-row gap-0 md:gap-6">
        <OpsNav />
        <div className="flex-1 min-w-0">{children}</div>
      </div>
    </div>
  );
}
