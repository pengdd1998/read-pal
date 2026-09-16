export const DISCUSSION_GUIDE_STYLES = `
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Georgia', 'Times New Roman', serif;
      max-width: 800px;
      margin: 0 auto;
      padding: 48px 24px;
      color: #1a1a1a;
      background: #fff;
      line-height: 1.7;
    }
    header {
      text-align: center;
      margin-bottom: 40px;
      padding-bottom: 32px;
      border-bottom: 2px solid #d97706;
    }
    header h1 { font-size: 28px; margin-bottom: 4px; color: #111; }
    header .author { font-size: 18px; color: #555; font-style: italic; }
    header .meta { font-size: 13px; color: #888; margin-top: 8px; }
    h2 {
      font-size: 20px; color: #92400e; margin: 32px 0 16px;
      padding-bottom: 6px; border-bottom: 1px solid #fbbf24;
    }
    .count { font-size: 13px; color: #aaa; font-weight: normal; }
    section { margin-bottom: 24px; }
    blockquote {
      border-left: 3px solid #d97706;
      margin: 12px 0;
      padding: 8px 16px;
      background: #fffbeb;
      border-radius: 0 6px 6px 0;
    }
    blockquote p { font-style: italic; }
    blockquote footer { font-size: 12px; color: #888; margin-top: 4px; }
    .quote-note { font-size: 13px; color: #555; font-style: normal; margin-top: 4px; }
    .ref { font-size: 12px; color: #999; }
    .note-item { margin: 10px 0; padding: 8px 12px; background: #f9fafb; border-radius: 6px; }
    .note-content { font-weight: 500; }
    .note-detail { font-size: 13px; color: #666; margin-top: 4px; }
    ul.themes, ul.stats { list-style: none; }
    ul.themes li { padding: 4px 0; }
    ul.stats li { padding: 3px 0; font-size: 14px; }
    ol.questions { padding-left: 24px; }
    ol.questions li { margin: 10px 0; line-height: 1.6; }
    .progress-bar {
      height: 8px; background: #f3f4f6; border-radius: 4px;
      margin-top: 12px; overflow: hidden;
    }
    .progress-fill {
      height: 100%; background: linear-gradient(90deg, #f59e0b, #d97706);
      border-radius: 4px; transition: width 0.3s;
    }
    .footer {
      margin-top: 48px; padding-top: 16px; border-top: 1px solid #e5e7eb;
      text-align: center; font-size: 12px; color: #aaa;
    }
    @media print {
      body { padding: 0; }
      h2 { break-after: avoid; }
      blockquote { break-inside: avoid; }
    }
  </style>`;
