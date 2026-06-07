interface ReadingExperienceSectionProps {
 reading_better_title: string;
 reading_better_subtitle: string;
 experiences: { icon: string; title: string; desc: string }[];
}

export function ReadingExperienceSection({
 reading_better_title,
 reading_better_subtitle,
 experiences,
}: ReadingExperienceSectionProps) {
 return (
 <section className="bg-gradient-to-b from-surface-1 to-transparent py-20">
  <div className="px-4 sm:px-6 lg:px-8">
  <div className="text-center mb-14">
   <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 tracking-tight mb-4 font-display">
   {reading_better_title}
   </h2>
   <p className="text-gray-600 max-w-xl mx-auto text-lg">
   {reading_better_subtitle}
   </p>
  </div>

  <div className="grid md:grid-cols-3 gap-6">
   {experiences.map((item) => (
   <div key={item.title} className="card text-center group hover:shadow-lg transition-shadow duration-300">
    <div className="text-4xl mb-4">{item.icon}</div>
    <h3 className="font-bold text-gray-900 mb-2">{item.title}</h3>
    <p className="text-sm text-gray-600 leading-relaxed">{item.desc}</p>
   </div>
   ))}
  </div>
  </div>
 </section>
 );
}
