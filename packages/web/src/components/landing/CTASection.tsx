import React from 'react';
import { Link } from '@/i18n/navigation';

interface CTASectionProps {
 love_text: string;
 star_button: string;
 cta_join_title: string;
 cta_join_subtitle: string;
 cta_join_button: string;
 free_during_beta: string;
}

export const CTASection = React.memo(function CTASection({
 love_text,
 star_button,
 cta_join_title,
 cta_join_subtitle,
 cta_join_button,
 free_during_beta,
}: CTASectionProps) {
 return (
 <>
  {/* GitHub Star CTA */}
  <section aria-label="GitHub repository" className="px-4 sm:px-6 lg:px-8 py-12 text-center">
  <div className="inline-flex items-center gap-4 px-6 py-4 rounded-2xl border border-surface-3 bg-surface-0 shadow-sm">
   <span className="text-gray-700 dark:text-gray-300 font-medium">{love_text}</span>
   <a
   href="https://github.com/pengdd1998/read-pal"
   target="_blank"
   rel="noopener noreferrer"
   className="inline-flex items-center gap-2 px-5 py-2.5 bg-gray-900 dark:bg-white text-white font-semibold rounded-xl hover:opacity-90 transition-opacity"
   >
   <svg aria-hidden="true" className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" /></svg>
   {star_button}
   </a>
  </div>
  </section>

  {/* CTA */}
  <section aria-labelledby="landing-cta-title" className="relative overflow-hidden bg-gradient-to-br from-navy-700 via-navy-800 to-navy-900 py-16 sm:py-24 noise-overlay">
  <div className="hero-orb hero-orb-1 opacity-30" />
  <div className="relative z-10 px-4 sm:px-6 lg:px-8 text-center">
   <h2 id="landing-cta-title" className="text-3xl sm:text-4xl font-bold text-white tracking-tight mb-5 font-display">
   {cta_join_title}
   </h2>
   <p className="text-gray-300 text-lg mb-10">
   {cta_join_subtitle}
   </p>
   <Link href="/auth?mode=register" className="btn btn-primary btn-glow px-10 py-4 text-base rounded-2xl shadow-glow-amber">
   {cta_join_button}
   </Link>
   <p className="text-sm text-gray-500 mt-5">{free_during_beta}</p>
  </div>
  </section>
 </>
 );
});
