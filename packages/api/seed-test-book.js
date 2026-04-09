const { Sequelize } = require('sequelize');
const sequelize = new Sequelize('readpal', 'readpal', 'REDACTED_PASSWORD', {
  host: 'localhost',
  port: 5432,
  dialect: 'postgres',
  logging: false
});

async function seed() {
  try {
    await sequelize.authenticate();
    console.log('DB connected');

    const bookId = '8f6a09db-345f-4bb2-bd79-45c48a9c5280';
    const userId = '3b8858bc-018c-49e5-afa8-74c55da84e93';

    // Update book totalPages
    await sequelize.query('UPDATE books SET "totalPages" = 2 WHERE id = ?', { replacements: [bookId] });
    console.log('Book updated');

    // Check if document already exists
    const [existing] = await sequelize.query('SELECT id FROM documents WHERE "bookId" = ?', { replacements: [bookId] });
    if (existing.length > 0) {
      console.log('Document already exists, deleting...');
      await sequelize.query('DELETE FROM documents WHERE "bookId" = ?', { replacements: [bookId] });
    }

    const chapters = [
      {
        id: 'ch1',
        title: 'Chapter 1: The Beginning',
        content: '<h1>Chapter 1: The Beginning</h1><p>This is the first chapter of our test book. It contains several paragraphs of text that we can use to test the reading interface and annotation features of the read-pal application.</p><p>The read-pal app is designed to be an AI-powered reading companion. It helps readers engage more deeply with their books through intelligent conversations, annotations, and personalized insights.</p><p>One of the key features is the ability to select text and create highlights or notes. When you select a passage of text, a floating toolbar should appear near your selection with options to highlight the text in different colors or add a note annotation.</p><p>Another important feature is the annotations sidebar. This sidebar slides in from the right side of the screen when you click the annotations badge button in the header. It shows a list of all your annotations including highlights, notes, and bookmarks.</p><p>The bookmark toggle allows you to mark the current page for easy reference later. You can toggle it on and off by clicking the bookmark icon in the header bar. Bookmarked pages are visually indicated and can be accessed from the annotations sidebar.</p><p>The reading interface also includes a companion chat feature. This is an AI-powered chat that can answer questions about the text, provide explanations, and engage in discussions about the content you are reading.</p><p>As you progress through the book, the app tracks your reading position and allows you to navigate between chapters using the built-in navigation controls. The header bar shows the book title and provides quick access to key features.</p>',
        startIndex: 0,
        endIndex: 500,
        order: 0
      },
      {
        id: 'ch2',
        title: 'Chapter 2: Going Deeper',
        content: '<h1>Chapter 2: Going Deeper</h1><p>In this chapter, we explore more advanced features of the reading experience. The annotation system supports multiple types of annotations including highlights, notes, and bookmarks.</p><p>Highlights allow you to mark important passages with different colors. You can choose from yellow, green, blue, pink, or purple highlight colors. Each highlight is saved and can be reviewed later in the annotations sidebar.</p><p>Notes are similar to highlights but also include a text note that you can write. This is useful for recording your thoughts, questions, or observations about a particular passage.</p><p>The knowledge graph feature connects concepts across different books in your library. As you read more, the graph grows and reveals unexpected connections between ideas from different sources.</p>',
        startIndex: 500,
        endIndex: 1000,
        order: 1
      }
    ];

    await sequelize.query(
      `INSERT INTO documents ("bookId", "userId", content, chapters, "createdAt", "updatedAt") VALUES (?, ?, ?, ?::jsonb, NOW(), NOW())`,
      { replacements: [bookId, userId, 'Full book content here', JSON.stringify(chapters)] }
    );
    console.log('Document inserted successfully');

    await sequelize.close();
  } catch (err) {
    console.error('Error:', err.message);
    console.error(err);
    process.exit(1);
  }
}

seed();
