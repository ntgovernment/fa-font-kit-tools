import { afterEach, describe, expect, it, vi } from 'vitest';
import { FontawesomeGraphQL, getAccessToken, queryGraphQL } from '../src/FontawesomeGraphQL.client.js';

function jsonResponse(
  body: unknown,
  init?: { ok?: boolean; status?: number; statusText?: string },
): Response {
  return {
    ok: init?.ok ?? true,
    status: init?.status ?? 200,
    statusText: init?.statusText ?? 'OK',
    json: async () => body,
  } as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('getAccessToken', () => {
  it('exchanges an API token for an access token', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      access_token: 'tok',
      expires_in: 3600,
      scopes: ['kits_read'],
      token_type: 'Bearer',
    }));
    vi.stubGlobal('fetch', fetchMock);

    const data = await getAccessToken('api-key');

    expect(fetchMock).toHaveBeenCalledWith('https://api.fontawesome.com/token', {
      method: 'POST',
      headers: { Authorization: 'Bearer api-key' },
    });
    expect(data.access_token).toBe('tok');
  });

  it('throws when the token request fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({}, {
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
    })));

    await expect(getAccessToken('bad')).rejects.toThrow('Token request failed: 401 Unauthorized');
  });
});

describe('queryGraphQL', () => {
  it('posts the query and returns data', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      data: { me: { kits: [{ name: 'Kit' }] } },
    }));
    vi.stubGlobal('fetch', fetchMock);

    const data = await queryGraphQL<{ me: { kits: { name: string }[] } }>(
      'tok',
      'query { me { kits { name } } }',
      { id: '1' },
    );

    expect(fetchMock).toHaveBeenCalledWith('https://api.fontawesome.com', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer tok',
      },
      body: JSON.stringify({
        query: 'query { me { kits { name } } }',
        variables: { id: '1' },
      }),
    });
    expect(data.me.kits).toEqual([{ name: 'Kit' }]);
  });

  it('throws when the response includes GraphQL errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      errors: [{ message: 'nope' }],
    })));

    await expect(queryGraphQL('tok', 'query { me { id } }')).rejects.toThrow('GraphQL errors:');
  });

  it('throws when the HTTP request fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({}, {
      ok: false,
      status: 500,
      statusText: 'Server Error',
    })));

    await expect(queryGraphQL('tok', 'query { me { id } }')).rejects.toThrow(
      'GraphQL request failed: 500 Server Error',
    );
  });
});

describe('FontawesomeGraphQL', () => {
  it('loads kits and reuses the access token', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        access_token: 'one',
        expires_in: 10_000,
        scopes: [],
        token_type: 'Bearer',
      }))
      .mockResolvedValueOnce(jsonResponse({
        data: {
          me: {
            kits: [{ name: 'A', token: 't', version: '1', licenseSelected: 'pro' }],
          },
        },
      }))
      .mockResolvedValueOnce(jsonResponse({
        data: { me: { kits: [] } },
      }));
    vi.stubGlobal('fetch', fetchMock);

    const client = new FontawesomeGraphQL('api');
    await expect(client.getKits()).resolves.toEqual([
      { name: 'A', token: 't', version: '1', licenseSelected: 'pro' },
    ]);
    await expect(client.getKits()).resolves.toEqual([]);

    const tokenCalls = fetchMock.mock.calls.filter((call) => call[0] === 'https://api.fontawesome.com/token');
    expect(tokenCalls).toHaveLength(1);
  });

  it('refreshes the access token once it has expired', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        access_token: 'one',
        expires_in: -1,
        scopes: [],
        token_type: 'Bearer',
      }))
      .mockResolvedValueOnce(jsonResponse({
        access_token: 'two',
        expires_in: 10_000,
        scopes: [],
        token_type: 'Bearer',
      }));
    vi.stubGlobal('fetch', fetchMock);

    const client = new FontawesomeGraphQL('api');
    await expect(client.accessToken()).resolves.toBe('one');
    await expect(client.accessToken()).resolves.toBe('two');
  });

  it('returns an empty list when the account has no kits', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        access_token: 'one',
        expires_in: 10_000,
        scopes: [],
        token_type: 'Bearer',
      }))
      .mockResolvedValueOnce(jsonResponse({ data: {} })));

    const client = new FontawesomeGraphQL('api');
    await expect(client.getKits()).resolves.toEqual([]);
  });
});

describe.skipIf(!process.env.FA_API_TOKEN)('FontawesomeGraphQL live', () => {
  it('returns kits for the configured token', async () => {
    const client = new FontawesomeGraphQL(process.env.FA_API_TOKEN ?? '');
    const kits = await client.getKits();
    expect(Array.isArray(kits)).toBe(true);
  }, 20_000);
});
