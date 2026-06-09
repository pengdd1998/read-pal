import type { Metadata } from 'next';
import BookDetailPage from './Client';

export const metadata: Metadata = {
 title: 'Book Details | read-pal',
};

export async function generateStaticParams() {
 return [{ id: '_' }];
}

export default function Page() {
 return <BookDetailPage />;
}
