'use client';

interface ProfileSectionProps {
  userName: string;
  userEmail: string;
}

export function ProfileSection({ userName, userEmail }: ProfileSectionProps) {
  return (
    <section className="mb-6 animate-slide-up stagger-1">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-100 to-purple-200 dark:from-violet-900/40 dark:to-purple-900/40 flex items-center justify-center">
          <svg className="w-[1.125rem] h-[1.125rem] text-violet-600 dark:text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
        </div>
        <h2 className="text-lg font-semibold">Profile</h2>
      </div>
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6 space-y-4">
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Name</label>
          <div className="px-4 py-2.5 rounded-xl bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-sm border border-gray-200 dark:border-gray-700">
            {userName || 'Not set'}
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Email</label>
          <div className="px-4 py-2.5 rounded-xl bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-sm border border-gray-200 dark:border-gray-700">
            {userEmail || 'Not set'}
          </div>
        </div>
      </div>
    </section>
  );
}
