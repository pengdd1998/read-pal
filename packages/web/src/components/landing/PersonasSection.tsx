interface Friend {
  emoji: string;
  name: string;
  desc: string;
  accent: string;
}

interface PersonasSectionProps {
  personas_title: string;
  personas_subtitle: string;
  friends: Friend[];
}

export function PersonasSection({
  personas_title,
  personas_subtitle,
  friends,
}: PersonasSectionProps) {
  return (
    <section className="px-4 sm:px-6 lg:px-8 py-20">
      <div className="text-center mb-14">
        <h2 className="text-3xl sm:text-4xl font-bold text-navy-700 dark:text-white tracking-tight font-display">
          {personas_title}
        </h2>
        <p className="mt-4 text-gray-600 dark:text-gray-400 max-w-2xl mx-auto text-lg">
          {personas_subtitle}
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
        {friends.map((friend) => (
          <div key={friend.name} className={`card-hover text-center border-l-4 ${friend.accent}`}>
            <div className="text-4xl mb-3">{friend.emoji}</div>
            <h3 className="font-bold text-gray-900 dark:text-white">{friend.name}</h3>
            <p className="text-xs text-gray-500 mt-1.5 leading-relaxed">{friend.desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
