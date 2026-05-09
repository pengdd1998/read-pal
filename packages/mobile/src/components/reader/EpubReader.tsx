import React, { useRef, useCallback, useEffect, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, Text, ActivityIndicator } from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import { useReaderStore, type ReaderTheme } from '@/stores/reader-store';
import type { Annotation } from '@read-pal/shared';

interface EpubReaderProps {
  bookUrl: string;
  initialChapter?: number;
  onChapterChange?: (index: number, title: string) => void;
  onSelection: (text: string, cfiRange: string, boundingRect: { top: number; left: number }) => void;
  onProgress: (progress: number) => void;
  annotations?: Annotation[];
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

const EPUB_JS = `
(function() {
  var book = null;
  var rendition = null;

  window.initEpub = function(url) {
    book = ePub(url);
    rendition = book.renderTo('epub-container', {
      width: '100%',
      height: '100%',
      spread: 'none',
      flow: 'scrolled-doc',
    });

    rendition.on('relocated', function(location) {
      var progress = book.locations.percentageFromCfi(location.start.cfi);
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'progress',
        progress: Math.round(progress * 100) / 100,
        chapterIndex: location.start.index,
      }));
    });

    rendition.on('selected', function(cfiRange, contents) {
      var text = contents.window.getSelection().toString().trim();
      if (!text) return;

      var range = contents.window.getSelection().getRangeAt(0);
      var rect = range.getBoundingClientRect();

      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'selection',
        text: text,
        cfiRange: cfiRange,
        rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
      }));
    });

    rendition.on('markClicked', function(cfiRange) {
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'markClicked',
        cfiRange: cfiRange,
      }));
    });

    rendition.display().then(function() {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'ready' }));
    });

    book.locations.generate(1024).catch(function() {});
  };

  window.nextPage = function() {
    if (rendition) rendition.next();
  };

  window.prevPage = function() {
    if (rendition) rendition.prev();
  };

  window.goToChapter = function(href) {
    if (rendition) rendition.display(href);
  };

  window.applyTheme = function(bg, fg, fontSize, fontFamily, lineHeight) {
    if (!rendition) return;
    rendition.themes.default({
      body: {
        'background-color': bg + ' !important',
        'color': fg + ' !important',
        'font-size': fontSize + 'px !important',
        'font-family': fontFamily + ' !important',
        'line-height': lineHeight + ' !important',
        'padding': '16px 20px !important',
      },
      'a': { 'color': '#d97706 !important' },
      'p': { 'margin-bottom': '1em !important' },
    });
  };

  window.addHighlight = function(cfiRange, color) {
    if (!rendition) return;
    rendition.annotations.highlight(cfiRange, {}, function() {}, 'epub-highlight', {
      fill: color || 'rgba(217, 119, 6, 0.3)',
    });
  };

  window.removeHighlight = function(cfiRange) {
    if (!rendition) return;
    rendition.annotations.remove(cfiRange, 'highlight');
  };
})();
`;

function buildHtml(url: string, theme: ReaderTheme, fontSize: number, fontFamily: string, lineHeight: number): string {
  const bg = THEME_BG[theme];
  const fg = THEME_TEXT[theme];
  return `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <script src="https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/epubjs@0.3.93/dist/epub.min.js"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100%; height: 100%; overflow: hidden; background: ${bg}; }
    #epub-container { width: 100%; height: 100%; }
  </style>
</head>
<body>
  <div id="epub-container"></div>
  <script>
    ${EPUB_JS}
    document.addEventListener('DOMContentLoaded', function() {
      initEpub('${url}');
      applyTheme('${bg}', '${fg}', ${fontSize}, '${fontFamily}', ${lineHeight});
    });
  </script>
</body>
</html>`;
}

export default function EpubReader({
  bookUrl,
  initialChapter,
  onChapterChange,
  onSelection,
  onProgress,
  annotations = [],
}: EpubReaderProps) {
  const webViewRef = useRef<WebView>(null);
  const { fontSize, fontFamily, lineHeight, theme } = useReaderStore();
  const [ready, setReady] = useState(false);

  // Apply highlights when annotations change
  useEffect(() => {
    if (!ready) return;
    annotations.forEach((a) => {
      if (a.type === 'highlight' && (a.location as any)?.cfiRange) {
        webViewRef.current?.injectJavaScript(
          `addHighlight('${(a.location as any).cfiRange}', '${a.color || 'rgba(217,119,6,0.3)'}'); true;`
        );
      }
    });
  }, [annotations, ready]);

  // Apply theme changes
  useEffect(() => {
    if (!ready) return;
    webViewRef.current?.injectJavaScript(
      `applyTheme('${THEME_BG[theme]}', '${THEME_TEXT[theme]}', ${fontSize}, '${fontFamily}', ${lineHeight}); true;`
    );
  }, [theme, fontSize, fontFamily, lineHeight, ready]);

  const handleMessage = useCallback((event: WebViewMessageEvent) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      switch (data.type) {
        case 'ready':
          setReady(true);
          break;
        case 'progress':
          onProgress?.(data.progress);
          onChapterChange?.(data.chapterIndex, '');
          break;
        case 'selection':
          onSelection?.(data.text, data.cfiRange, data.rect);
          break;
      }
    } catch { /* ignore */ }
  }, [onChapterChange, onSelection, onProgress]);

  const goNext = useCallback(() => {
    webViewRef.current?.injectJavaScript('nextPage(); true;');
  }, []);

  const goPrev = useCallback(() => {
    webViewRef.current?.injectJavaScript('prevPage(); true;');
  }, []);

  const html = buildHtml(bookUrl, theme, fontSize, fontFamily, lineHeight);

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
        allowsInlineMediaPlayback
        scrollEnabled
        style={[styles.webview, { backgroundColor: THEME_BG[theme] }]}
        onMessage={handleMessage}
        onTouchEnd={goNext}
        nestedScrollEnabled
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  webview: { flex: 1 },
  loader: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    justifyContent: 'center', alignItems: 'center',
    backgroundColor: '#fefdfb', zIndex: 10,
  },
  loaderText: { marginTop: 8, color: '#8a99ae', fontSize: 14 },
});
