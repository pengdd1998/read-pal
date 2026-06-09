import type { Metadata } from 'next';
import ReadPage from './Client';

export const metadata: Metadata = {
 title: 'Reader | read-pal',
};

export async function generateStaticParams() {
 return [{ bookId: '_' }];
}

export default function Page() {
 return <ReadPage />;
}
