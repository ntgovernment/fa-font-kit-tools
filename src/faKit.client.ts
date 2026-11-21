export function faKit(kitID: string, baseFallbackPath: string, fileName = 'all.min.js', debug = false): void {
  const s = document.createElement('script');
  s.src = `https://kit.fontawesome.com/${kitID}.js`;
  s.crossOrigin = 'anonymous';
  document.head.appendChild(s);
  const fallback = () => {
    document.fonts.ready.then(async () => {
      const major = await kitMajor(baseFallbackPath, kitID);
      if (!major) {
        if (debug) console.log('Fontawesome fallback kit version not found');
        return;
      }
      document.fonts.load(`1px "Font Awesome ${major} Pro"`)
        .then(() => {
          if (debug) console.log('Fontawesome cdn loaded');
        })
        .catch(() => {
          if (debug) console.log('Load Fontawesome fallback');
          const l = document.createElement('link');
          l.rel = 'stylesheet';
          l.href = `${baseFallbackPath}/kit-${kitID}/${fileName}`;
          if (debug) l.onload = () => { console.log('Fontawesome fallback loaded'); };
          document.head.appendChild(l);
        });
    });
  };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", fallback);
  } else {
    fallback();
  }
}

async function kitMajor(baseFallbackPath: string, kitID: string): Promise<string | undefined> {
  try {
    const response = await fetch(`${baseFallbackPath}/kit-versions.json`);
    if (!response.ok) return;
    const versionRecord = await response.json() as Record<string, string[]>;
    return Object.keys(versionRecord).find((major) => versionRecord[major]?.includes(kitID));
  } catch {
    return;
  }
}
