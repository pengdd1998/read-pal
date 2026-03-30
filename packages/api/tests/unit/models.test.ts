/**
 * Model Unit Tests
 *
 * Tests model method signatures and interactions using mocked Sequelize.
 */

import { User, Book, Annotation } from '../../src/models';

describe('User Model', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should call create with user data', async () => {
    const userData = {
      email: 'test@example.com',
      name: 'Test User',
      password: 'hashedpassword',
    };

    (User.create as jest.Mock).mockResolvedValue({
      id: 'user-1',
      ...userData,
      settings: { theme: 'system', fontSize: 16 },
    });

    const user = await User.create(userData);

    expect(User.create).toHaveBeenCalledWith(userData);
    expect(user.id).toBe('user-1');
    expect(user.email).toBe(userData.email);
  });

  it('should find user by id', async () => {
    (User.findByPk as jest.Mock).mockResolvedValue({
      id: 'user-1',
      email: 'test@example.com',
      name: 'Test User',
    });

    const user = await User.findByPk('user-1');

    expect(User.findByPk).toHaveBeenCalledWith('user-1');
    expect(user?.id).toBe('user-1');
  });

  it('should return null for non-existent user', async () => {
    (User.findByPk as jest.Mock).mockResolvedValue(null);

    const user = await User.findByPk('nonexistent');

    expect(user).toBeNull();
  });

  it('should count users', async () => {
    (User.count as jest.Mock).mockResolvedValue(5);

    const count = await User.count();

    expect(count).toBe(5);
  });
});

describe('Book Model', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should create a book with user association', async () => {
    const bookData = {
      userId: 'user-1',
      title: 'Test Book',
      author: 'Test Author',
      fileType: 'epub' as const,
      fileSize: 1024000,
      totalPages: 100,
    };

    (Book.create as jest.Mock).mockResolvedValue({
      id: 'book-1',
      ...bookData,
      status: 'unread',
      progress: 0,
    });

    const book = await Book.create(bookData as any);

    expect(Book.create).toHaveBeenCalledWith(bookData);
    expect(book.id).toBe('book-1');
    expect(book.status).toBe('unread');
  });

  it('should find books by userId', async () => {
    (Book.findAll as jest.Mock).mockResolvedValue([
      { id: 'b1', userId: 'user-1', title: 'Book 1' },
      { id: 'b2', userId: 'user-1', title: 'Book 2' },
    ]);

    const books = await Book.findAll({ where: { userId: 'user-1' } });

    expect(Book.findAll).toHaveBeenCalledWith({ where: { userId: 'user-1' } });
    expect(books).toHaveLength(2);
  });

  it('should update book progress', async () => {
    (Book.update as jest.Mock).mockResolvedValue([1]);

    const result = await Book.update(
      { currentPage: 50, progress: 50 },
      { where: { id: 'book-1', userId: 'user-1' } },
    );

    expect(Book.update).toHaveBeenCalledWith(
      { currentPage: 50, progress: 50 },
      { where: { id: 'book-1', userId: 'user-1' } },
    );
    expect(result[0]).toBe(1);
  });

  it('should delete a book', async () => {
    (Book.destroy as jest.Mock).mockResolvedValue(1);

    const result = await Book.destroy({ where: { id: 'book-1', userId: 'user-1' } });

    expect(Book.destroy).toHaveBeenCalledWith({ where: { id: 'book-1', userId: 'user-1' } });
    expect(result).toBe(1);
  });

  it('should count books by status', async () => {
    (Book.count as jest.Mock).mockResolvedValue(3);

    const count = await Book.count({ where: { userId: 'user-1', status: 'completed' } });

    expect(count).toBe(3);
  });
});

describe('Annotation Model', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should create a highlight annotation', async () => {
    const data = {
      userId: 'user-1',
      bookId: 'book-1',
      type: 'highlight' as const,
      content: 'Important text',
      location: { pageIndex: 5, position: 100 },
      color: '#FFEB3B',
    };

    (Annotation.create as jest.Mock).mockResolvedValue({ id: 'ann-1', ...data });

    const annotation = await Annotation.create(data);

    expect(Annotation.create).toHaveBeenCalledWith(data);
    expect(annotation.type).toBe('highlight');
    expect(annotation.color).toBe('#FFEB3B');
  });

  it('should create a note annotation', async () => {
    const data = {
      userId: 'user-1',
      bookId: 'book-1',
      type: 'note' as const,
      content: 'Important text',
      note: 'My thought',
      location: { pageIndex: 10, position: 200 },
    };

    (Annotation.create as jest.Mock).mockResolvedValue({ id: 'ann-2', ...data });

    const annotation = await Annotation.create(data);

    expect(annotation.type).toBe('note');
    expect(annotation.note).toBe('My thought');
  });

  it('should find annotations by book and type', async () => {
    (Annotation.findAll as jest.Mock).mockResolvedValue([
      { id: 'a1', type: 'highlight', content: 'Text 1' },
      { id: 'a2', type: 'highlight', content: 'Text 2' },
    ]);

    const annotations = await Annotation.findAll({
      where: { userId: 'user-1', bookId: 'book-1', type: 'highlight' },
    });

    expect(annotations).toHaveLength(2);
  });

  it('should count annotations by type', async () => {
    (Annotation.count as jest.Mock).mockResolvedValue(10);

    const count = await Annotation.count({
      where: { userId: 'user-1', type: 'highlight' },
    });

    expect(count).toBe(10);
  });

  it('should delete an annotation', async () => {
    (Annotation.destroy as jest.Mock).mockResolvedValue(1);

    const result = await Annotation.destroy({
      where: { id: 'ann-1', userId: 'user-1' },
    });

    expect(result).toBe(1);
  });
});
