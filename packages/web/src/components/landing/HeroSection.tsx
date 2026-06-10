import { memo } from 'react';
import { Link } from '@/i18n/navigation';

interface HeroSectionProps {
 beta_badge: string;
 hero_title_before: string;
 hero_title_highlight: string;
 hero_subtitle: string;
 cta_primary: string;
 cta_signin: string;
}

export const HeroSection = memo(function HeroSection({
 beta_badge,
 hero_title_before,
 hero_title_highlight,
 hero_subtitle,
 cta_primary,
 cta_signin,
}: HeroSectionProps) {
 return (
 <section aria-labelledby="landing-hero-title" className="relative overflow-hidden noise-overlay">
  {/* Animated gradient orbs */}
  <div className="absolute inset-0 -z-10">
  <div className="hero-orb hero-orb-1" />
  <div className="hero-orb hero-orb-2" />
  <div className="hero-orb hero-orb-3" />
  </div>

  <div className="relative z-10 px-4 sm:px-6 lg:px-8 pt-28 pb-24 text-center">
  {/* Animated gradient badge */}
  <div className="animate-fade-in">
   <span className="badge-gradient inline-flex items-center gap-2 px-5 py-2 text-white text-sm font-semibold rounded-full shadow-glow">
   <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
   {beta_badge}
   </span>
  </div>

  <h1 id="landing-hero-title" className="mt-10 text-4xl sm:text-6xl md:text-7xl lg:text-8xl font-extrabold tracking-tight text-gray-900 leading-[0.95] animate-slide-up font-display">
   {hero_title_before}
   <br />
   <span className="text-gradient">{hero_title_highlight}</span>
  </h1>

  <p className="mt-8 text-lg sm:text-xl text-gray-600 max-w-2xl mx-auto leading-relaxed animate-slide-up-delayed">
   {hero_subtitle}
  </p>

  <div className="mt-10 flex flex-col sm:flex-row gap-4 justify-center animate-slide-up-delayed">
   <Link
   href="/auth?mode=register"
   className="btn btn-primary btn-glow px-8 py-4 text-base rounded-2xl shadow-glow-amber"
   >
   {cta_primary}
   <svg className="ml-2 w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
   </svg>
   </Link>
   <Link
   href="/auth?mode=login"
   className="btn btn-secondary px-8 py-4 text-base rounded-2xl"
   >
   {cta_signin}
   </Link>
  </div>
  </div>
 </section>
 );
});
