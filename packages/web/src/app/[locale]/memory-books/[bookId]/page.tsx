import type { Metadata } from 'next';
import PersonalBookPage from './Client';

export const metadata: Metadata = {
 title: 'Reading Mirror | read-pal',
};

export async function generateStaticParams() {
 return [{ bookId: '_' }];
}

export default function Page() {
 return <PersonalBookPage />;
}
