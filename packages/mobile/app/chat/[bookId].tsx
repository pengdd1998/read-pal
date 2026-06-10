import { Stack, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import ChatPanel from '@/components/chat/ChatPanel';
import type { Book } from '@read-pal/shared';

export default function ChatScreen() {
  const { bookId, initialQuestion } = useLocalSearchParams<{ bookId: string; initialQuestion?: string }>();

  const { data: book } = useQuery({
    queryKey: ['book', bookId],
    queryFn: async () => {
      const result = await api.get<Book>(`/api/books/${bookId}`);
      return result.success ? result.data : null;
    },
  });

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <ChatPanel bookId={bookId} bookTitle={book?.title} initialQuestion={initialQuestion} />
    </>
  );
}
