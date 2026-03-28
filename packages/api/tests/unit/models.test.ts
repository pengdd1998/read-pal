/**
 * Model Tests
 */

import { User, Book, Annotation } from '../src/models';

describe('User Model', () => {
  it('should create a user with valid data', async () => {
    const userData = {
      email: 'test@example.com',
      name: 'Test User',
    };

    const user = await User.create(userData);

    expect(user.id).toBeTruthy();
    expect(user.email).toBe(userData.email);
    expect(user.name).toBe(userData.name);
    expect(user.settings).toEqual({
      theme: 'system',
      fontSize: 16,
      fontFamily: 'Inter',
      readingGoal: 2,
      notificationsEnabled: true,
    });
  });

  it('should not create user with invalid email', async () => {
    const userData = {
      email: 'invalid-email',
      name: 'Test User',
    };

    await expect(User.create(userData)).rejects.toThrow();
  });

  it('should update user settings', async () => {
    const user = await User.create({
      email: 'test@example.com',
      name: 'Test User',
    });

    user.settings = {
      ...user.settings,
      theme: 'dark',
      fontSize: 20,
    };

    await user.save();

    const updated = await User.findByPk(user.id);
    expect(updated?.settings.theme).toBe('dark');
    expect(updated?.settings.fontSize).toBe(20);
  });
});

describe('Book Model', () => {
  let user: any;

  beforeEach(async () => {
    user = await User.create({
      email: 'test@example.com',
      name: 'Test User',
    });
  });

  it('should create a book with valid data', async () => {
    const bookData = {
      userId: user.id,
      title: 'Test Book',
      author: 'Test Author',
      fileType: 'epub' as const,
      fileSize: 1024000,
      totalPages: 100,
    };

    const book = await Book.create(bookData);

    expect(book.id).toBeTruthy();
    expect(book.title).toBe(bookData.title);
    expect(book.author).toBe(bookData.author);
    expect(book.status).toBe('unread');
    expect(book.progress).toBe(0);
  });

  it('should update book reading progress', async () => {
    const book = await Book.create({
      userId: user.id,
      title: 'Test Book',
      author: 'Test Author',
      fileType: 'epub',
      fileSize: 1024000,
      totalPages: 100,
    });

    book.currentPage = 50;
    book.progress = 50;
    await book.save();

    const updated = await Book.findByPk(book.id);
    expect(updated?.currentPage).toBe(50);
    expect(updated?.progress).toBe(50);
  });

  it('should update book status to reading when started', async () => {
    const book = await Book.create({
      userId: user.id,
      title: 'Test Book',
      author: 'Test Author',
      fileType: 'epub',
      fileSize: 1024000,
      totalPages: 100,
    });

    book.status = 'reading';
    book.startedAt = new Date();
    await book.save();

    const updated = await Book.findByPk(book.id);
    expect(updated?.status).toBe('reading');
    expect(updated?.startedAt).toBeTruthy();
  });

  it('should update book status to completed when finished', async () => {
    const book = await Book.create({
      userId: user.id,
      title: 'Test Book',
      author: 'Test Author',
      fileType: 'epub',
      fileSize: 1024000,
      totalPages: 100,
      status: 'reading',
    });

    book.status = 'completed';
    book.completedAt = new Date();
    book.progress = 100;
    await book.save();

    const updated = await Book.findByPk(book.id);
    expect(updated?.status).toBe('completed');
    expect(updated?.completedAt).toBeTruthy();
    expect(updated?.progress).toBe(100);
  });
});

describe('Annotation Model', () => {
  let user: any;
  let book: any;

  beforeEach(async () => {
    user = await User.create({
      email: 'test@example.com',
      name: 'Test User',
    });

    book = await Book.create({
      userId: user.id,
      title: 'Test Book',
      author: 'Test Author',
      fileType: 'epub',
      fileSize: 1024000,
      totalPages: 100,
    });
  });

  it('should create a highlight annotation', async () => {
    const annotationData = {
      userId: user.id,
      bookId: book.id,
      type: 'highlight' as const,
      content: 'This is important text',
      location: { pageIndex: 5, position: 100, selection: { start: 100, end: 125 } },
      color: '#FFEB3B',
    };

    const annotation = await Annotation.create(annotationData);

    expect(annotation.id).toBeTruthy();
    expect(annotation.type).toBe('highlight');
    expect(annotation.content).toBe(annotationData.content);
    expect(annotation.color).toBe(annotationData.color);
  });

  it('should create a note annotation', async () => {
    const annotationData = {
      userId: user.id,
      bookId: book.id,
      type: 'note' as const,
      content: 'This is important text',
      note: 'My thought about this',
      location: { pageIndex: 10, position: 200, selection: { start: 200, end: 225 } },
    };

    const annotation = await Annotation.create(annotationData);

    expect(annotation.type).toBe('note');
    expect(annotation.note).toBe(annotationData.note);
  });

  it('should create a bookmark annotation', async () => {
    const annotationData = {
      userId: user.id,
      bookId: book.id,
      type: 'bookmark' as const,
      content: 'Bookmark page 15',
      location: { pageIndex: 15, position: 0, selection: { start: 0, end: 0 } },
    };

    const annotation = await Annotation.create(annotationData);

    expect(annotation.type).toBe('bookmark');
  });

  it('should update annotation with tags', async () => {
    const annotation = await Annotation.create({
      userId: user.id,
      bookId: book.id,
      type: 'highlight',
      content: 'Important text',
      location: { pageIndex: 5, position: 100, selection: { start: 100, end: 125 } },
    });

    annotation.tags = ['important', 'key-concept'];
    await annotation.save();

    const updated = await Annotation.findByPk(annotation.id);
    expect(updated?.tags).toEqual(['important', 'key-concept']);
  });
});
