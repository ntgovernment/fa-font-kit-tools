import { afterEach, describe, expect, it, vi } from 'vitest';
import { faKit } from '../src/faKit.client.js';

interface ScriptEl {
  tag: 'script';
  src?: string;
  crossOrigin?: string;
}

interface LinkEl {
  tag: 'link';
  rel?: string;
  href?: string;
  onload?: () => void;
}

function installDocument(versions: Record<string, string[]> = { '7': ['abc123'] }) {
  const children: Array<ScriptEl | LinkEl> = [];
  const fonts = {
    ready: Promise.resolve(),
    load: vi.fn<(font: string) => Promise<unknown[]>>().mockResolvedValue([]),
  };
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true,
    json: async () => versions,
  })));
  const documentMock = {
    head: {
      appendChild(node: ScriptEl | LinkEl) {
        children.push(node);
        return node;
      },
    },
    createElement(tag: string) {
      if (tag === 'link') return { tag: 'link' } as LinkEl;
      return { tag: 'script' } as ScriptEl;
    },
    fonts,
  };

  vi.stubGlobal('document', documentMock);
  return { children, fonts };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('faKit', () => {
  it('injects the kit script', async () => {
    const { children, fonts } = installDocument();

    faKit('abc123', '/fallback');

    expect(children).toEqual([
      {
        tag: 'script',
        src: 'https://kit.fontawesome.com/abc123.js',
        crossOrigin: 'anonymous',
      },
    ]);
    await vi.waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('/fallback/kit-versions.json');
      expect(fonts.load).toHaveBeenCalledWith('1px "Font Awesome 7 Pro"');
    });
  });

  it('uses the major whose kit list contains the token', async () => {
    const { fonts } = installDocument({ '6': ['abc123'], '7': ['other'] });

    faKit('abc123', '/fallback');

    await vi.waitFor(() => {
      expect(fonts.load).toHaveBeenCalledWith('1px "Font Awesome 6 Pro"');
    });
  });

  it('logs when the CDN font loads', async () => {
    const { fonts } = installDocument();
    fonts.load.mockResolvedValue([]);
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    faKit('abc123', '/fallback', undefined, true);
    await vi.waitFor(() => {
      expect(fonts.load).toHaveBeenCalledWith('1px "Font Awesome 7 Pro"');
    });
    await vi.waitFor(() => {
      expect(log).toHaveBeenCalledWith('Fontawesome cdn loaded');
    });
  });

  it('adds the stylesheet fallback when the font fails to load', async () => {
    const { children, fonts } = installDocument();
    fonts.load.mockRejectedValue(new Error('missing'));
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    faKit('abc123', '/fallback', undefined, true);

    await vi.waitFor(() => {
      expect(children).toHaveLength(2);
    });

    const link = children[1] as LinkEl;
    expect(link).toMatchObject({
      tag: 'link',
      rel: 'stylesheet',
      href: '/fallback/kit-abc123/all.min.js',
    });
    expect(log).toHaveBeenCalledWith('Load Fontawesome fallback');

    link.onload?.();
    expect(log).toHaveBeenCalledWith('Fontawesome fallback loaded');
  });
});
