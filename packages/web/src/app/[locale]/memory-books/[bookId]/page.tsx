import PersonalBookPage from './Client';

export async function generateStaticParams() {
 return [{ bookId: '_' }];
}

export default function Page() {
 return <PersonalBookPage />;
}
