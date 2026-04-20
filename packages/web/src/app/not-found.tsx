import Link from 'next/link';

export default function NotFound() {
  return (
    <html lang="en">
      <body>
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center px-4">
            <h1 className="text-5xl font-bold">404</h1>
            <h2 className="mt-4 text-xl font-semibold">Page not found</h2>
            <p className="mt-2 text-gray-600 max-w-md mx-auto">
              The page you&apos;re looking for doesn&apos;t exist or has been moved.
            </p>
            <Link
              href="/"
              className="mt-6 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
            >
              Back to Home
            </Link>
          </div>
        </div>
      </body>
    </html>
  );
}
