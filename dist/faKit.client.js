export function faKit(kitID, baseFallbackPath, fileName = 'all.min.js', debug = false) {
    const s = document.createElement('script');
    s.src = `https://kit.fontawesome.com/${kitID}.js`;
    s.crossOrigin = 'anonymous';
    document.head.appendChild(s);
    document.fonts.ready.then(async () => {
        const major = await kitMajor(baseFallbackPath, kitID);
        if (!major) {
            if (debug)
                console.log('Fontawesome fallback kit version not found');
            return;
        }
        document.addEventListener("DOMContentLoaded", () => {
            document.fonts.load(`1px "Font Awesome ${major} Pro"`)
                .then(() => {
                if (debug)
                    console.log('Fontawesome cdn loaded');
            })
                .catch(() => {
                if (debug)
                    console.log('Load Fontawesome fallback');
                const l = document.createElement('link');
                l.rel = 'stylesheet';
                l.href = `${baseFallbackPath}/kit-${kitID}/${fileName}`;
                if (debug)
                    l.onload = () => { console.log('Fontawesome fallback loaded'); };
                document.head.appendChild(l);
            });
        });
    });
}
async function kitMajor(baseFallbackPath, kitID) {
    try {
        const response = await fetch(`${baseFallbackPath}/kit-versions.json`);
        if (!response.ok)
            return;
        const versionRecord = await response.json();
        return Object.keys(versionRecord).find((major) => versionRecord[major]?.includes(kitID));
    }
    catch {
        return;
    }
}
//# sourceMappingURL=faKit.client.js.map