import BookClubDetailPage from './Client';

export async function generateStaticParams() {
  return [{ id: '_' }];
}

export default function Page() {
  return <BookClubDetailPage />;
}
