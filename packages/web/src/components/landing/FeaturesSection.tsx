interface Feature {
  icon: string;
  title: string;
  desc: string;
}

interface FeaturesSectionProps {
  everything_title: string;
  everything_subtitle: string;
  features: Feature[];
}

export function FeaturesSection({
  everything_title,
  everything_subtitle,
  features,
}: FeaturesSectionProps) {
  return (
    <section className="px-4 sm:px-6 lg:px-8 py-20">
      <div className="text-center mb-14">
        <h2 className="text-3xl sm:text-4xl font-bold text-navy-700 dark:text-white tracking-tight font-display">
          {everything_title}
        </h2>
        <p className="mt-4 text-gray-600 dark:text-gray-400 max-w-xl mx-auto text-lg">
          {everything_subtitle}
        </p>
      </div>
      <div className="grid sm:grid-cols-2 gap-5">
        {features.map((f) => (
          <div key={f.title} className="flex items-start gap-4 p-5 rounded-2xl border border-gray-200 dark:border-gray-800 bg-surface-0 hover:shadow-md transition-shadow">
            <span className="text-3xl flex-shrink-0">{f.icon}</span>
            <div>
              <h3 className="font-bold text-gray-900 dark:text-white mb-1">{f.title}</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">{f.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
