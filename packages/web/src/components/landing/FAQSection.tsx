interface Faq {
  q: string;
  a: string;
}

interface FAQSectionProps {
  faq_title: string;
  faqs: Faq[];
}

export function FAQSection({ faq_title, faqs }: FAQSectionProps) {
  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((faq) => ({
      '@type': 'Question',
      name: faq.q,
      acceptedAnswer: {
        '@type': 'Answer',
        text: faq.a,
      },
    })),
  };

  return (
    <section className="px-4 sm:px-6 lg:px-8 py-20">
      <div className="text-center mb-14">
        <h2 className="text-3xl sm:text-4xl font-bold text-navy-700 dark:text-white tracking-tight font-display">
          {faq_title}
        </h2>
      </div>
      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-5">
        {faqs.map((faq) => (
          <div key={faq.q} className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-surface-0 p-6">
            <h3 className="font-bold text-gray-900 dark:text-white mb-2">{faq.q}</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">{faq.a}</p>
          </div>
        ))}
      </div>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(faqSchema),
        }}
      />
    </section>
  );
}
