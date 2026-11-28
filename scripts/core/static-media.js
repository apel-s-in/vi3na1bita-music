/* Public media only. Never routes audio, application code, account or backup APIs. */
(function (root) {
  'use strict';
  const CLOUD = 'https://vi3na1bita.s3.cloud.ru/';
  const YANDEX = 'https://storage.yandexcloud.net/vi3na1bita/';
  const base = root.document?.baseURI || root.registration?.scope || root.location.href;
  const scope = new URL('./', base);
  const assetPath = input => {
    try {
      const url = new URL(typeof input === 'string' ? input : input.url, base);
      let path = '';
      if (url.href.startsWith(CLOUD)) path = url.pathname.slice(1);
      else if (url.href.startsWith(YANDEX)) path = url.pathname.slice('/vi3na1bita/'.length);
      else if (url.origin === scope.origin && url.pathname.startsWith(scope.pathname)) path = url.pathname.slice(scope.pathname.length);
      else if (url.origin === 'https://vi3na1bita.website.yandexcloud.net') path = url.pathname.slice(1);
      if (!/^(?:albums|img|icons)\//.test(path) || !/\.(?:json|txt|png|jpe?g|webp|avif|gif|svg|ico)$/i.test(path)) return null;
      return path + url.search;
    } catch { return null; }
  };
  const candidates = input => {
    const path = assetPath(input);
    return path ? [CLOUD + path, YANDEX + path] : [];
  };
  const primary = input => candidates(input)[0] || input;
  const fetchResponse = async (input, init = {}) => {
    const urls = candidates(input);
    if (!urls.length) return root.fetch(input, init);
    if (!(root.NetPolicy?.isNetworkAllowed?.() ?? true)) throw new Error('network_not_allowed');
    let last = new Error('static_media_unavailable');
    for (const url of urls) {
      if (init.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      const controller = new AbortController();
      const abort = () => controller.abort();
      init.signal?.addEventListener('abort', abort, { once: true });
      const timer = setTimeout(abort, 8000);
      try {
        const response = await root.fetch(url, { ...init, mode: 'cors', credentials: 'omit', signal: controller.signal });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        if ((response.headers.get('content-type') || '').includes('text/html')) throw new Error('invalid_static_response');
        if (new URL(url).pathname.endsWith('.json')) await response.clone().json();
        return response;
      } catch (error) {
        if (init.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
        last = error;
      } finally {
        clearTimeout(timer);
        init.signal?.removeEventListener('abort', abort);
      }
    }
    throw last;
  };
  // Fallback for the first visit before a Service Worker controls the page.
  const imageFallback = event => {
    const image = event.target;
    if (image?.tagName !== 'IMG' || String(image.src).startsWith(YANDEX)) return;
    const source = image.currentSrc || image.src;
    const urls = candidates(source);
    if (!urls.length || !String(source).startsWith(CLOUD)) return;
    image.removeAttribute('srcset');
    image.src = urls[1];
  };
  const bindImage = image => { image.addEventListener('error', imageFallback); return image; };
  root.document?.addEventListener('error', imageFallback, true);
  root.StaticMedia = { CLOUD, YANDEX, assetPath, candidates, primary, fetchResponse, bindImage };
})(globalThis);
