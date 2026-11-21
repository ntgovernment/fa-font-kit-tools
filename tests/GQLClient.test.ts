import { afterEach, describe, expect, it, vi } from 'vitest';
import { GQLClient, getAccessToken, queryGraphQL } from '../src/GQLClient.client.js';
import type { GraphQLSchema } from '../src/GQLClient.client.js';

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

describe('GQLClient', () => {
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

    const client = new GQLClient('api');
    await expect(client.getKits()).resolves.toEqual([
      { name: 'A', token: 't', version: '1', licenseSelected: 'pro', major: 1 },
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

    const client = new GQLClient('api');
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

    const client = new GQLClient('api');
    await expect(client.getKits()).resolves.toEqual([]);
  });

  it('lists the family styles included in each kit and follows extra pages', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        access_token: 'one',
        expires_in: 10_000,
        scopes: ['kits_read'],
        token_type: 'Bearer',
      }))
      .mockResolvedValueOnce(jsonResponse({
        data: {
          me: {
            kits: [{
              name: 'Subset',
              token: 'subset',
              version: '7.x',
              subsetType: 'AUTO',
              familyStylesPaginated: {
                totalPageCount: 2,
                familyStyles: [{
                  familyStyle: {
                    family: 'classic',
                    style: 'light',
                    prefix: 'fal',
                    shorthand: 'light',
                    label: 'Classic Light',
                  },
                  only: null,
                }],
              },
            }, {
              name: 'Custom',
              token: 'custom',
              version: 'latest',
              subsetType: 'CUSTOM',
              familyStylesPaginated: {
                totalPageCount: 1,
                familyStyles: [{
                  familyStyle: {
                    family: 'classic',
                    style: 'solid',
                    prefix: 'fas',
                    shorthand: 'solid',
                    label: 'Classic Solid',
                  },
                  only: { totalIconVariantCount: 4 },
                }],
              },
            }],
          },
        },
      }))
      .mockResolvedValueOnce(jsonResponse({
        data: {
          me: {
            kits: [{
              name: 'Subset',
              token: 'subset',
              version: '7.x',
              subsetType: 'AUTO',
              familyStylesPaginated: {
                totalPageCount: 2,
                familyStyles: [{
                  familyStyle: {
                    family: 'sharp',
                    style: 'solid',
                    prefix: 'fass',
                    shorthand: 'sharp-solid',
                    label: 'Sharp Solid',
                  },
                  only: null,
                }],
              },
            }, {
              name: 'Custom',
              token: 'custom',
              version: 'latest',
              subsetType: 'CUSTOM',
              familyStylesPaginated: {
                totalPageCount: 1,
                familyStyles: [{
                  familyStyle: {
                    family: 'ignored',
                    style: 'ignored',
                    prefix: 'nope',
                    shorthand: 'ignored',
                    label: 'Ignored',
                  },
                  only: { totalIconVariantCount: 99 },
                }],
              },
            }],
          },
        },
      }));
    vi.stubGlobal('fetch', fetchMock);

    const client = new GQLClient('api');
    await expect(client.getKitFamilyStyles()).resolves.toEqual([
      {
        name: 'Subset',
        token: 'subset',
        version: '7.x',
        major: 7,
        subsetType: 'AUTO',
        familyStyles: [
          {
            family: 'classic',
            style: 'light',
            prefix: 'fal',
            shorthand: 'light',
            label: 'Classic Light',
            selectedIconCount: null,
          },
          {
            family: 'sharp',
            style: 'solid',
            prefix: 'fass',
            shorthand: 'sharp-solid',
            label: 'Sharp Solid',
            selectedIconCount: null,
          },
        ],
      },
      {
        name: 'Custom',
        token: 'custom',
        version: 'latest',
        major: 5,
        subsetType: 'CUSTOM',
        familyStyles: [{
          family: 'classic',
          style: 'solid',
          prefix: 'fas',
          shorthand: 'solid',
          label: 'Classic Solid',
          selectedIconCount: 4,
        }],
      },
    ]);

    const graphqlCalls = fetchMock.mock.calls.filter((call) => call[0] === 'https://api.fontawesome.com');
    expect(graphqlCalls).toHaveLength(2);
    expect(JSON.parse(graphqlCalls[0][1].body).variables).toEqual({ page: 1 });
    expect(JSON.parse(graphqlCalls[1][1].body).variables).toEqual({ page: 2 });
    expect(JSON.parse(graphqlCalls[0][1].body).query).toContain('familyStylesPaginated(page: $page, pageSize: 50)');
  });

  it('returns an empty style list when the account has no kits', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        access_token: 'one',
        expires_in: 10_000,
        scopes: [],
        token_type: 'Bearer',
      }))
      .mockResolvedValueOnce(jsonResponse({ data: {} })));

    const client = new GQLClient('api');
    await expect(client.getKitFamilyStyles()).resolves.toEqual([]);
  });
});

describe('GQLClient.discoverSchema', () => {
  const tokenData = {
    access_token: 'discovery-token',
    expires_in: 10_000,
    scopes: ['kits_read'],
    token_type: 'Bearer',
  };

  it('returns schema metadata without fetching kits and reuses the access token', async () => {
    const schema: GraphQLSchema = {
      queryType: { name: 'RootQuery' },
      mutationType: null,
      subscriptionType: null,
      types: [{
        kind: 'OBJECT',
        name: 'Kit',
        description: 'A kit',
        fields: [{
          name: 'exampleMetadata',
          description: 'Example additional kit metadata',
          args: [{
            name: 'format',
            description: 'Output format',
            defaultValue: '"short"',
            type: { kind: 'SCALAR', name: 'String', ofType: null },
          }],
          type: {
            kind: 'NON_NULL',
            name: null,
            ofType: {
              kind: 'LIST',
              name: null,
              ofType: { kind: 'SCALAR', name: 'String', ofType: null },
            },
          },
          isDeprecated: true,
          deprecationReason: 'Use the replacement field',
        }],
        inputFields: null,
        interfaces: [],
        enumValues: null,
        possibleTypes: null,
      }, {
        kind: 'ENUM',
        name: 'ExampleFormat',
        description: null,
        fields: null,
        inputFields: null,
        interfaces: null,
        enumValues: [{
          name: 'SHORT',
          description: 'Short format',
          isDeprecated: false,
          deprecationReason: null,
        }],
        possibleTypes: null,
      }],
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(tokenData))
      .mockResolvedValueOnce(jsonResponse({ data: { __schema: schema } }));
    vi.stubGlobal('fetch', fetchMock);

    const client = new GQLClient('api');
    await expect(client.discoverSchema()).resolves.toEqual(schema);
    await expect(client.accessToken()).resolves.toBe('discovery-token');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [url, request] = fetchMock.mock.calls[1];
    expect(url).toBe('https://api.fontawesome.com');
    expect(request.method).toBe('POST');
    const { query, variables } = JSON.parse(request.body);
    expect(variables).toEqual({});
    for (const selection of [
      '__schema', 'queryType', 'mutationType', 'subscriptionType',
      'description', 'fields(includeDeprecated: true)', 'args { ...InputValue }',
      'inputFields', 'interfaces', 'enumValues(includeDeprecated: true)',
      'possibleTypes', 'defaultValue', 'isDeprecated', 'deprecationReason', 'ofType',
    ]) {
      expect(query).toContain(selection);
    }
    expect(query).not.toMatch(/\bme\s*\{/);
    expect(query).not.toMatch(/\bkits\s*\{/);
  });

  it('propagates rejected introspection instead of returning an empty schema', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(jsonResponse(tokenData))
      .mockResolvedValueOnce(jsonResponse({
        data: { __schema: null },
        errors: [{ message: 'Introspection is disabled' }],
      })));

    await expect(new GQLClient('api').discoverSchema()).rejects.toThrow(
      'Introspection is disabled',
    );
  });

  it.each([{ __schema: null }, {}, undefined])('rejects missing schema data: %j', async (data) => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(jsonResponse(tokenData))
      .mockResolvedValueOnce(jsonResponse({ data })));

    await expect(new GQLClient('api').discoverSchema()).rejects.toThrow(
      'GraphQL schema discovery returned no schema',
    );
  });

  it('propagates HTTP errors during discovery', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(jsonResponse(tokenData))
      .mockResolvedValueOnce(jsonResponse({}, {
        ok: false,
        status: 403,
        statusText: 'Forbidden',
      })));

    await expect(new GQLClient('api').discoverSchema()).rejects.toThrow(
      'GraphQL request failed: 403 Forbidden',
    );
  });

  it('does not request the schema when authentication fails', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}, {
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
    }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(new GQLClient('api').discoverSchema()).rejects.toThrow(
      'Token request failed: 401 Unauthorized',
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe.skipIf(!process.env.FA_API_TOKEN)('GQLClient live', () => {
  it('returns kits for the configured token', async () => {
    const client = new GQLClient(process.env.FA_API_TOKEN ?? '');
    const kits = await client.getKits();
    expect(Array.isArray(kits)).toBe(true);
  }, 20_000);

  it('discovers the schema and the fields behind me.kits', async () => {
    const client = new GQLClient(process.env.FA_API_TOKEN ?? '');
    const schema = await client.discoverSchema();
    const queryType = schema.types.find((type) => type.name === schema.queryType.name);
    const meField = queryType?.fields?.find((field) => field.name === 'me');
    expect(meField).toBeDefined();

    let meType = meField?.type;
    while (meType?.ofType) meType = meType.ofType;
    const accountType = schema.types.find((type) => type.name === meType?.name);
    const kitsField = accountType?.fields?.find((field) => field.name === 'kits');
    expect(kitsField).toBeDefined();

    let kitType = kitsField?.type;
    while (kitType?.ofType) kitType = kitType.ofType;
    const kit = schema.types.find((type) => type.name === kitType?.name);
    expect(kit?.fields?.map((field) => field.name)).toEqual(
      expect.arrayContaining(['name', 'token', 'version', 'licenseSelected']),
    );
  }, 20_000);

  it('returns the family styles included in each kit', async () => {
    const client = new GQLClient(process.env.FA_API_TOKEN ?? '');
    const kits = await client.getKitFamilyStyles();
    expect(kits.length).toBeGreaterThan(0);
    for (const kit of kits) {
      expect(['AUTO', 'CUSTOM', 'FULL']).toContain(kit.subsetType);
      expect(kit.familyStyles.length).toBeGreaterThan(0);
      expect(kit.familyStyles[0]).toEqual(expect.objectContaining({
        family: expect.any(String),
        style: expect.any(String),
        prefix: expect.any(String),
        label: expect.any(String),
      }));
    }
  }, 30_000);
});
