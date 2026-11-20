export function faKit(kitID: string, baseFallbackPath: string, debug = false): void {
  const s = document.createElement('script');
  s.src = `https://kit.fontawesome.com/${kitID}.js`;
  s.crossOrigin = 'anonymous';
  document.head.appendChild(s);
  document.fonts.ready.then(() => {
    document.fonts.load('1px "Fontawesome 7 Pro"')
      .then(() => {
        if (debug) console.log('Fontawesome cdn loaded');
      })
      .catch(() => {
        if (debug) console.log('Load Fontawesome fallback');
        const l = document.createElement('link');
        l.rel = 'stylesheet';
        l.href = `${baseFallbackPath}/${kitID}.css`;
        if (debug) l.onload = () => { console.log('Fontawesome fallback loaded'); };
        document.head.appendChild(l);
      });
  });
}
