import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import ErrorBoundary from './components/ErrorBoundary.tsx';
import './index.css';

// ============================================================
// PROTECTION AGAINST GOOGLE TRANSLATE EXTENSION
//
// PROBLEM: Google Translate Chrome extension replaces text nodes
// in the DOM to show translated text. React's virtual DOM expects
// to control all DOM mutations. When the extension modifies nodes
// that React manages, React throws:
//   "NotFoundError: Failed to execute 'removeChild' on 'Node'"
// This unhandled error crashes the entire React component tree,
// causing a blank/white screen.
//
// SOLUTION: We detect when Google Translate has injected itself
// into the page, and only then suppress the DOM errors it causes.
// Without the extension active, ALL errors propagate normally.
// ============================================================

/**
 * Detects if Google Translate extension has injected elements into the page.
 * The extension creates specific DOM elements:
 * - A banner iframe with class "goog-te-banner-frame"
 * - A wrapper div with class "skiptranslate" around body content
 * - Elements with id starting with "goog-"
 * - A floating toolbar with class "goog-te-spinner-pos"
 *
 * This function returns true ONLY when these specific markers are present.
 * Without the extension, it returns false and errors are NOT suppressed.
 */
function isGoogleTranslateActive(): boolean {
  try {
    // Check 1: Google Translate injects a banner iframe
    if (document.querySelector('.goog-te-banner-frame')) return true;

    // Check 2: Google Translate wraps body content in skiptranslate div
    if (document.body?.classList?.contains('skiptranslate')) return true;

    // Check 3: Any element with id starting with "goog-" (Translate toolbar, etc.)
    if (document.querySelector('[id^="goog-"]')) return true;

    // Check 4: Google Translate floating spinner/toolbar
    if (document.querySelector('.goog-te-spinner-pos')) return true;

    // Check 5: The translation element overlay
    if (document.querySelector('#goog-gt-tt')) return true;

    return false;
  } catch {
    return false;
  }
}

// 1. Global error handler — ONLY suppresses DOM errors when Google Translate is active
window.addEventListener('error', (event) => {
  const msg = event?.message || '';

  // Only check errors that look like DOM manipulation failures
  const isDomError = (
    msg.includes('removeChild') ||
    msg.includes('appendChild') ||
    msg.includes('insertBefore') ||
    msg.includes('replaceChild')
  );

  if (!isDomError) return; // Not a DOM error — always let it propagate

  // Check if Google Translate is actually present in the DOM right now
  if (isGoogleTranslateActive()) {
    console.warn(
      '[App] Suppressed DOM error caused by Google Translate extension:',
      msg,
      '\nTo fix permanently: disable translation for this site (click the translate icon in the address bar → "Never translate this site")'
    );
    event.preventDefault();
    return true;
  }

  // Google Translate is NOT active — this is a real app bug. Let it propagate
  // so developers see it in the console and can fix the actual issue.
}, { capture: true });

// 2. Global handler for unhandled promise rejections — same logic
window.addEventListener('unhandledrejection', (event) => {
  const msg = String(event?.reason?.message || event?.reason || '');
  const isDomError = msg.includes('removeChild') || msg.includes('NotFoundError');

  if (!isDomError) return;

  if (isGoogleTranslateActive()) {
    console.warn('[App] Suppressed promise rejection from Google Translate:', msg);
    event.preventDefault();
    return true;
  }
}, { capture: true });

// 3. MutationObserver — removes ONLY elements with Google Translate-specific markers
// Uses "goog-te-" prefix (Translate-specific, not just generic "goog-" which
// covers all Google services). Also targets "skiptranslate" and translate iframes.
try {
  const GOOGLE_TRANSLATE_SELECTORS = [
    '.goog-te-banner-frame',      // Translate banner
    '.goog-te-spinner-pos',       // Translate toolbar spinner
    '#goog-gt-tt',                // Translation tooltip
    '.goog-te-ftab-frame',        // Translation settings frame
    '[id^="google_translate_"]',  // Google translate container elements
  ];

  const protectionObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type !== 'childList') continue;

      for (const node of Array.from(mutation.addedNodes)) {
        if (node.nodeType !== Node.ELEMENT_NODE) continue;

        const el = node as HTMLElement;
        const tag = el.tagName;
        const className = String(el.className || '');
        const id = String(el.id || '');

        // Check 1: Element has a Google Translate-specific CSS class
        // We use "goog-te-" (not just "goog-") to avoid false positives
        // with other Google services like reCAPTCHA (goog- prefix too)
        const hasTranslateClass = GOOGLE_TRANSLATE_SELECTORS.some(sel => {
          try { return el.matches?.(sel); } catch { return false; }
        }) || className.includes('goog-te-');

        // Check 2: Element is an iframe loading translate.googleapis.com
        const isTranslateIframe = (
          tag === 'IFRAME' &&
          typeof (el as HTMLIFrameElement).src === 'string' &&
          (el as HTMLIFrameElement).src.includes('translate.google')
        );

        // Check 3: Element has skiptranslate class (body wrapper from Translate)
        const hasSkipTranslate = className.includes('skiptranslate');

        if (hasTranslateClass || isTranslateIframe || hasSkipTranslate) {
          try {
            el.remove();
            console.warn('[App] Removed Google Translate injected element:', tag, id || className);
          } catch {}
        }
      }
    }
  });

  protectionObserver.observe(document.body, {
    childList: true,
    subtree: true,
  });
} catch {}

// ============================================================
// RENDER
// ============================================================
createRoot(document.getElementById('root')!).render(
  <ErrorBoundary fallback={
    <div style={{ minHeight: '100vh', background: '#0f172a', color: '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ textAlign: 'center', padding: '2rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '1rem' }}>Algo deu errado</h1>
        <p style={{ color: '#94a3b8', marginBottom: '1.5rem' }}>Ocorreu um erro inesperado. Tente recarregar a página.</p>
        <button
          onClick={() => window.location.reload()}
          style={{ padding: '0.75rem 1.5rem', background: '#6366f1', color: 'white', border: 'none', borderRadius: '0.75rem', cursor: 'pointer', fontWeight: 600 }}
        >
          Recarregar
        </button>
        <p style={{ color: '#64748b', fontSize: '0.75rem', marginTop: '1rem' }}>
          Dica: Se a tela ficou branca, desative a tradução automática do navegador (ícone de tradução na barra de endereço &gt; nunca traduzir este site).
        </p>
      </div>
    </div>
  }>
    <StrictMode>
      <App />
    </StrictMode>
  </ErrorBoundary>,
);
