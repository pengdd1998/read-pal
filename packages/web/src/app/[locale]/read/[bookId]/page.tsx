import ReadPage from './Client';

export async function generateStaticParams() {
 return [{ bookId: '_' }];
}

export default function Page() {
 return <ReadPage />;
}
