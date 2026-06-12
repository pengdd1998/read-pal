const STEP_ICONS = [
 <svg aria-hidden="true" key="1" className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
 <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z" />
 </svg>,
 <svg aria-hidden="true" key="2" className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
 <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
 </svg>,
 <svg aria-hidden="true" key="3" className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
 <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
 </svg>,
];

interface Step {
 number: string;
 title: string;
 desc: string;
}

interface HowItWorksSectionProps {
 trust_items: string[];
 how_title: string;
 how_subtitle: string;
 steps: Step[];
}

const CheckIcon = () => (
 <svg aria-hidden="true" className="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20">
 <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
 </svg>
);

import { memo } from 'react';

export const HowItWorksSection = memo(function HowItWorksSection({
 trust_items,
 how_title,
 how_subtitle,
 steps,
}: HowItWorksSectionProps) {
 return (
 <>
  {/* Trust bar */}
  <section aria-label={how_title} className="bg-surface-1 pt-8 pb-4">
  <div className="px-4 sm:px-6 lg:px-8">
   <div className="flex flex-wrap justify-center gap-x-8 gap-y-3 text-sm text-gray-600 dark:text-gray-400 py-6">
   {trust_items.map((item) => (
    <span key={item} className="flex items-center gap-1.5">
    <CheckIcon />
    {item}
    </span>
   ))}
   </div>
  </div>
  </section>

  {/* How It Works */}
  <section aria-labelledby="landing-how-title" className="bg-surface-1 pt-4 pb-20">
  <div className="px-4 sm:px-6 lg:px-8">
   <div className="text-center mb-14">
   <h2 id="landing-how-title" className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-gray-100 tracking-tight font-display">
    {how_title}
   </h2>
   <p className="mt-4 text-gray-600 dark:text-gray-400 max-w-xl mx-auto text-lg">
    {how_subtitle}
   </p>
   </div>

   <div className="grid md:grid-cols-3 gap-8">
   {steps.map((step, i) => (
    <div key={step.number} className="step-connector text-center group">
    <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary-500/10 text-primary-500 mb-5 group-hover:bg-primary-500 group-hover:text-white transition-all duration-300">
     {STEP_ICONS[i]}
    </div>
    <div className="text-xs font-mono font-bold text-primary-500 tracking-wider mb-2">{step.number}</div>
    <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-2">{step.title}</h3>
    <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">{step.desc}</p>
    </div>
   ))}
   </div>
  </div>
  </section>
 </>
 );
});
