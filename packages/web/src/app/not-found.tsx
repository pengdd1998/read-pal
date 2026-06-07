export default function RootNotFound() {
  return (
    <html lang="en">
      <body>
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--surface-1, #f9fafb)', padding: '1rem' }}>
          <div style={{ textAlign: 'center' }}>
            <h1 style={{ fontSize: '3.75rem', fontWeight: 700, color: '#111827' }}>404</h1>
            <h2 style={{ marginTop: '1rem', fontSize: '1.25rem', fontWeight: 600, color: '#111827' }}>Page Not Found</h2>
            <p style={{ marginTop: '0.5rem', color: '#4b5563', maxWidth: '28rem', marginLeft: 'auto', marginRight: 'auto' }}>
              The page you are looking for does not exist or has been moved.
            </p>
            <div style={{ marginTop: '1.5rem' }}>
              <a
                href="/en"
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
                Go Home
              </a>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
