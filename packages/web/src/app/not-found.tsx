export default function RootNotFound() {
  return (
    <html lang="en">
      <body>
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="text-center px-4">
            <h1 className="text-6xl font-bold text-gray-900">404</h1>
            <p className="mt-4 text-lg text-gray-600">Page not found</p>
            <a
              href="/en"
              className="mt-6 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-600 text-white hover:bg-amber-700 transition-colors"
            >
              Go Home
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}
