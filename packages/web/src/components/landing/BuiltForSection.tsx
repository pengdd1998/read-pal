interface Persona {
 emoji: string;
 title: string;
 desc: string;
 features: string[];
}

interface BuiltForSectionProps {
 built_for_title: string;
 built_for_subtitle: string;
 personas: Persona[];
}

const CheckIcon = () => (
 <svg className="w-3 h-3 text-primary-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
 <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
 </svg>
);

export function BuiltForSection({
 built_for_title,
 built_for_subtitle,
 personas,
}: BuiltForSectionProps) {
 return (
 <section className="bg-surface-1 py-20">
  <div className="px-4 sm:px-6 lg:px-8">
  <div className="text-center mb-14">
   <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-gray-100 tracking-tight font-display">
   {built_for_title}
   </h2>
   <p className="mt-4 text-gray-600 dark:text-gray-400 max-w-xl mx-auto text-lg">
   {built_for_subtitle}
   </p>
  </div>
  <div className="grid sm:grid-cols-3 gap-8">
   {personas.map((persona) => (
   <div key={persona.title} className="card-hover text-center">
    <div className="text-4xl mb-4">{persona.emoji}</div>
    <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-2">{persona.title}</h3>
    <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed mb-4">{persona.desc}</p>
    <ul className="space-y-1.5">
    {persona.features.map((f) => (
     <li key={f} className="text-xs text-gray-500 dark:text-gray-400 flex items-center justify-center gap-1.5">
     <CheckIcon />
     {f}
     </li>
    ))}
    </ul>
   </div>
   ))}
  </div>
  </div>
 </section>
 );
}
