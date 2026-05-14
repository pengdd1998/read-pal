import React, { useRef, useCallback, useState } from 'react';
import { View, StyleSheet, Text, ActivityIndicator } from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import { useReaderStore, type ReaderTheme } from '@/stores/reader-store';
import type { Chapter } from '@read-pal/shared';

interface EpubReaderProps {
  chapters: Chapter[];
  currentChapter: number;
  onChapterChange?: (index: number) => void;
  onSelection: (text: string, cfiRange: string, boundingRect: { top: number; left: number }, offsets?: { start: number; end: number }) => void;
  onProgress: (progress: number) => void;
}

const THEME_BG: Record<ReaderTheme, string> = {
  light: '#fefdfb',
  dark: '#0f1419',
  sepia: '#f8f4ec',
};

const THEME_TEXT: Record<ReaderTheme, string> = {
  light: '#1e2a38',
  dark: '#e0e0e0',
  sepia: '#3d3020',
};

function buildHtml(
  chapterHtml: string,
  theme: ReaderTheme,
  fontSize: number,
  fontFamily: string,
  lineHeight: number,
): string {
  const bg = THEME_BG[theme];
  const fg = THEME_TEXT[theme];
  return `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body {
      width: 100%; height: 100%;
      background: ${bg}; color: ${fg};
      font-size: ${fontSize}px; font-family: '${fontFamily}', serif;
      line-height: ${lineHeight};
      padding: 20px 24px;
      overflow-y: auto; -webkit-overflow-scrolling: touch;
    }
    p { margin-bottom: 1em; }
    a { color: #d97706; }
    ::selection { background: rgba(217, 119, 6, 0.3); }
  </style>
</head>
<body>
  <div id="chapter-content">${chapterHtml}</div>
  <script>
    // Notify RN when page loads
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'ready' }));

    // Track scroll progress
    var scrollTimeout;
    document.addEventListener('scroll', function() {
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(function() {
        var scrollTop = document.documentElement.scrollTop || document.body.scrollTop;
        var scrollHeight = document.documentElement.scrollHeight - document.documentElement.clientHeight;
        var progress = scrollHeight > 0 ? Math.round((scrollTop / scrollHeight) * 100) / 100 : 0;
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'progress', progress: progress }));
      }, 200);
    });

    // Handle text selection
    document.addEventListener('mouseup', function() {
      var sel = window.getSelection();
      var text = sel ? sel.toString().trim() : '';
      if (!text) return;
      var range = sel.getRangeAt(0);
      var rect = range.getBoundingClientRect();
      var container = document.getElementById('chapter-content');
      var offsets = { start: 0, end: text.length };
      if (container) {
        try {
          var preRange = document.createRange();
          preRange.selectNodeContents(container);
          preRange.setEnd(range.startContainer, range.startOffset);
          offsets.start = preRange.toString().length;
          offsets.end = offsets.start + range.toString().length;
        } catch(e) {}
      }
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'selection',
        text: text,
        cfiRange: '',
        rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
        offsets: offsets,
      }));
    });
  </script>
</body>
</html>`;
}

export default function EpubReader({
  chapters,
  currentChapter,
  onChapterChange,
  onSelection,
  onProgress,
}: EpubReaderProps) {
  const webViewRef = useRef<WebView>(null);
  const { fontSize, fontFamily, lineHeight, theme } = useReaderStore();
  const [ready, setReady] = useState(false);

  const chapterHtml = chapters[currentChapter]?.content || '<p>No content available.</p>';
  const html = buildHtml(chapterHtml, theme, fontSize, fontFamily, lineHeight);

  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => {
      try {
        const data = JSON.parse(event.nativeEvent.data);
        switch (data.type) {
          case 'ready':
            setReady(true);
            break;
          case 'progress':
            onProgress?.(data.progress);
            break;
          case 'selection':
            onSelection?.(data.text, data.cfiRange, data.rect, data.offsets);
            break;
        }
      } catch {
        /* ignore */
      }
    },
    [onChapterChange, onSelection, onProgress],
  );

  return (
    <View style={styles.container}>
      {!ready && (
        <View style={styles.loader}>
          <ActivityIndicator size="large" color="#d97706" />
          <Text style={styles.loaderText}>Loading book...</Text>
        </View>
      )}
      <WebView
        ref={webViewRef}
        source={{ html }}
        originWhitelist={['*']}
        javaScriptEnabled
        domStorageEnabled
        scrollEnabled
        style={[styles.webview, { backgroundColor: THEME_BG[theme] }]}
        onMessage={handleMessage}
        key={currentChapter}
        nestedScrollEnabled
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  webview: { flex: 1 },
  loader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fefdfb',
    zIndex: 10,
  },
  loaderText: { marginTop: 8, color: '#8a99ae', fontSize: 14 },
});
