export interface AccessTokenData {
  access_token: string;
  expires_in: number;
  scopes: string[];
  token_type: 'Bearer';
}

export interface FAKit {
  name: string;
  token: string;
  version: string;
  licenseSelected: string;
}

interface KitsQuery {
  me?: {
    kits?: FAKit[] | null;
  } | null;
}

export class FontawesomeGraphQL {
  #apiToken = '';
  #accessToken = '';
  #accessTokenExpire = 0;

  constructor(apiToken: string) {
    this.#apiToken = apiToken;
  }

  async accessToken(): Promise<string> {
    const now = Date.now();
    if (now > this.#accessTokenExpire) {
      const data = await getAccessToken(this.#apiToken);
      this.#accessTokenExpire = now + data.expires_in;
      this.#accessToken = data.access_token;
    }
    return this.#accessToken;
  }

  async getKits(): Promise<FAKit[]> {
    const query = `
      query {
        me {
          kits {
            name
            token
            version
            licenseSelected
          }
        }
      }
    `;
    const token = await this.accessToken();
    const data = await queryGraphQL<KitsQuery>(token, query);
    return data?.me?.kits ?? [];
  }
}

export async function getAccessToken(apiToken: string): Promise<AccessTokenData> {
  const response = await fetch('https://api.fontawesome.com/token', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Token request failed: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return data;
}

export async function queryGraphQL<T = unknown>(
  accessToken: string,
  query: string,
  variables: Record<string, unknown> = {},
): Promise<T> {
  const response = await fetch('https://api.fontawesome.com', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    throw new Error(`GraphQL request failed: ${response.status} ${response.statusText}`);
  }

  const result = (await response.json()) as { data?: T; errors?: unknown };
  if (result.errors) {
    throw new Error(`GraphQL errors: ${JSON.stringify(result.errors, null, 2)}`);
  }

  return result.data as T;
}
