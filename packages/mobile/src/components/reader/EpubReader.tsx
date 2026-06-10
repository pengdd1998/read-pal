import React, { useRef, useCallback, useState, useEffect } from 'react';
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

function sanitizeHtml(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/\bon\w+\s*=\s*["'][^"']*["']/gi, '')
    .replace(/\bon\w+\s*=\s*\{[^}]*\}/gi, '')
    .replace(/href\s*=\s*["']javascript:[^"']*["']/gi, 'href="#"')
    .replace(/src\s*=\s*["']javascript:[^"']*["']/gi, '');
}

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

    // Handle text selection via selectionchange (works on touch + mouse)
    var selectionTimeout;
    document.addEventListener('selectionchange', function() {
      clearTimeout(selectionTimeout);
      selectionTimeout = setTimeout(function() {
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
      }, 300);
    });

    // Fallback: mouseup for emulator/testing
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

    // Exposed function to update chapter content without remounting WebView
    window.updateChapter = function(html) {
      var container = document.getElementById('chapter-content');
      if (container) {
        container.innerHTML = html;
        window.scrollTo(0, 0);
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'chapterReady' }));
      }
    };

    // Exposed function to update theme/styles without remounting
    window.updateStyles = function(bg, fg, fontSize, fontFamily, lineHeight) {
      document.body.style.background = bg;
      document.body.style.color = fg;
      document.body.style.fontSize = fontSize + 'px';
      document.body.style.fontFamily = "'" + fontFamily + "', serif";
      document.body.style.lineHeight = lineHeight;
    };
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
  const prevChapterRef = useRef(currentChapter);
  const prevSettingsRef = useRef({ fontSize, fontFamily, lineHeight, theme });

  const initialChapterHtml = sanitizeHtml(chapters[0]?.content || '<p>No content available.</p>');
  const html = buildHtml(initialChapterHtml, theme, fontSize, fontFamily, lineHeight);

  // Update chapter content via injectJavaScript (no remount)
  useEffect(() => {
    if (!ready) return;
    if (currentChapter === prevChapterRef.current) return;
    prevChapterRef.current = currentChapter;

    const chapterHtml = sanitizeHtml(chapters[currentChapter]?.content || '<p>No content available.</p>');
    const escaped = chapterHtml.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$/g, '\\$');
    webViewRef.current?.injectJavaScript(
      `window.updateChapter(\`${escaped}\`); true;`
    );
  }, [currentChapter, chapters, ready]);

  // Update styles via injectJavaScript (no remount)
  useEffect(() => {
    if (!ready) return;
    const prev = prevSettingsRef.current;
    if (prev.fontSize === fontSize && prev.fontFamily === fontFamily &&
        prev.lineHeight === lineHeight && prev.theme === theme) return;
    prevSettingsRef.current = { fontSize, fontFamily, lineHeight, theme };

    const bg = THEME_BG[theme];
    const fg = THEME_TEXT[theme];
    webViewRef.current?.injectJavaScript(
      `window.updateStyles('${bg}', '${fg}', ${fontSize}, '${fontFamily}', ${lineHeight}); true;`
    );
  }, [fontSize, fontFamily, lineHeight, theme, ready]);

  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => {
      try {
        const data = JSON.parse(event.nativeEvent.data);
        switch (data.type) {
          case 'ready':
          case 'chapterReady':
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
    [onSelection, onProgress],
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
