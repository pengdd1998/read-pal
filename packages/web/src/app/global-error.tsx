'use client';

const _MESSAGES: Record<string, Record<string, string>> = {
 en: {
  title: 'Something went wrong',
  message: 'An unexpected error occurred. Please try again.',
  error_id: 'Error ID:',
  try_again: 'Try again',
  go_home: 'Go Home',
 },
 zh: {
  title: '出了点问题',
  message: '发生了意外错误，请重试。',
  error_id: '错误 ID：',
  try_again: '重试',
  go_home: '回到首页',
 },
};

function getMessages(): Record<string, string> {
 const lang = typeof navigator !== 'undefined' ? navigator.language : 'en';
 const locale = lang.startsWith('zh') ? 'zh' : 'en';
 return _MESSAGES[locale];
}

export default function GlobalError({
 error,
 reset,
}: {
 error: Error & { digest?: string };
 reset: () => void;
}) {
 const m = getMessages();

 return (
 <html>
 <body>
  <div style={{
   display: 'flex',
   flexDirection: 'column',
   alignItems: 'center',
   justifyContent: 'center',
   minHeight: '100vh',
   padding: '2rem',
   fontFamily: 'system-ui, -apple-system, sans-serif',
   backgroundColor: '#f9fafb',
   color: '#111827',
  }}>
   <div style={{
    width: 56,
    height: 56,
    borderRadius: '50%',
    backgroundColor: '#fef3c7',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    fontSize: 24,
   }}>
    ⚠️
   </div>
   <h1 style={{ fontSize: 24, fontWeight: 600, marginBottom: 8 }}>
    {m.title}
   </h1>
   <p style={{ color: '#6b7280', marginBottom: 24, textAlign: 'center', maxWidth: 400 }}>
    {m.message}
   </p>
   {error.digest && (
    <p style={{ color: '#9ca3af', fontSize: 12, marginBottom: 16 }}>
     {m.error_id} {error.digest}
    </p>
   )}
   <div style={{ display: 'flex', gap: 12 }}>
    <button
     onClick={reset}
     style={{
      padding: '10px 20px',
      backgroundColor: '#d97706',
      color: 'white',
      border: 'none',
      borderRadius: 8,
      fontSize: 14,
      fontWeight: 500,
      cursor: 'pointer',
     }}
    >
     {m.try_again}
    </button>
    <a
     href="/"
     style={{
      padding: '10px 20px',
      backgroundColor: '#f3f4f6',
      color: '#374151',
      border: 'none',
      borderRadius: 8,
      fontSize: 14,
      fontWeight: 500,
      textDecoration: 'none',
     }}
    >
     {m.go_home}
    </a>
   </div>
  </div>
 </body>
 </html>
 );
}
