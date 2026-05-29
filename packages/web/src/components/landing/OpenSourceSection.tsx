interface OpenSourceSectionProps {
  oss_title: string;
  oss_subtitle: string;
  oss_tags: string[];
  oss_stats: { value: string; label: string }[];
}

export function OpenSourceSection({
  oss_title,
  oss_subtitle,
  oss_tags,
  oss_stats,
}: OpenSourceSectionProps) {
  return (
    <section className="px-4 sm:px-6 lg:px-8 py-20">
      <div className="rounded-3xl border border-gray-200 dark:border-gray-800 bg-gradient-to-br from-navy-700/5 to-primary-500/5 dark:from-navy-700/20 dark:to-primary-500/10 p-10 sm:p-14">
        <div className="grid sm:grid-cols-2 gap-8 items-center">
          <div>
            <h2 className="text-3xl font-bold text-navy-700 dark:text-white tracking-tight font-display">
              {oss_title}
            </h2>
            <p className="mt-4 text-gray-600 dark:text-gray-400 leading-relaxed">
              {oss_subtitle}
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              {oss_tags.map((tag) => (
                <span key={tag} className="px-3 py-1.5 text-xs font-medium rounded-full bg-surface-0 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300">
                  {tag}
                </span>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 text-center">
            {oss_stats.map((stat) => (
              <div key={stat.label} className="p-4 rounded-2xl bg-surface-0 border border-gray-200 dark:border-gray-700">
                <div className="text-2xl font-bold text-primary-500">{stat.value}</div>
                <div className="text-xs text-gray-500 mt-1">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
