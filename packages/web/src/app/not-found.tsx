export default function RootNotFound() {
  const lang = typeof navigator !== 'undefined' && navigator.language?.startsWith('zh') ? 'zh' : 'en';
  const texts = {
    en: { title: 'Page Not Found', desc: 'The page you are looking for does not exist or has been moved.', home: 'Go Home' },
    zh: { title: '页面未找到', desc: '您访问的页面不存在或已被移动。', home: '返回首页' },
  }[lang];
  return (
    <html lang={lang}>
      <body>
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--surface-0, #fefdfb)', padding: '1rem' }}>
          <div style={{ textAlign: 'center' }}>
            <h1 style={{ fontSize: '3.75rem', fontWeight: 700, color: 'var(--gray-900, #1e1812)' }}>404</h1>
            <h2 style={{ marginTop: '1rem', fontSize: '1.25rem', fontWeight: 600, color: 'var(--gray-900, #1e1812)' }}>{texts.title}</h2>
            <p style={{ marginTop: '0.5rem', color: 'var(--gray-600, #6b5e4d)', maxWidth: '28rem', marginLeft: 'auto', marginRight: 'auto' }}>
              {texts.desc}
            </p>
            <div style={{ marginTop: '1.5rem' }}>
              <a
                href={`/${lang}`}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.75rem 1.5rem',
                  borderRadius: '0.75rem',
                  backgroundColor: '#d97706',
                  color: 'white',
                  fontWeight: 500,
                  textDecoration: 'none',
                }}
              >
                {texts.home}
              </a>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
