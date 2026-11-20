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

export type GraphQLTypeKind =
  | 'SCALAR'
  | 'OBJECT'
  | 'INTERFACE'
  | 'UNION'
  | 'ENUM'
  | 'INPUT_OBJECT'
  | 'LIST'
  | 'NON_NULL';

export interface GraphQLTypeRef {
  kind: GraphQLTypeKind;
  name: string | null;
  ofType?: GraphQLTypeRef | null;
}

export interface GraphQLInputValue {
  name: string;
  description: string | null;
  type: GraphQLTypeRef;
  defaultValue: string | null;
}

export interface GraphQLField {
  name: string;
  description: string | null;
  args: GraphQLInputValue[];
  type: GraphQLTypeRef;
  isDeprecated: boolean;
  deprecationReason: string | null;
}

export interface GraphQLSchemaType {
  kind: GraphQLTypeKind;
  name: string;
  description: string | null;
  fields: GraphQLField[] | null;
  inputFields: GraphQLInputValue[] | null;
  interfaces: GraphQLTypeRef[] | null;
  enumValues: {
    name: string;
    description: string | null;
    isDeprecated: boolean;
    deprecationReason: string | null;
  }[] | null;
  possibleTypes: GraphQLTypeRef[] | null;
}

export interface GraphQLSchema {
  queryType: { name: string };
  mutationType: { name: string } | null;
  subscriptionType: { name: string } | null;
  types: GraphQLSchemaType[];
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
            status
            licenseSelected
          }
        }
      }
    `;
    const token = await this.accessToken();
    const data = await queryGraphQL<KitsQuery>(token, query);
    return data?.me?.kits ?? [];
  }

  async discoverSchema(): Promise<GraphQLSchema> {
    const query = `
      query DiscoverSchema {
        __schema {
          queryType { name }
          mutationType { name }
          subscriptionType { name }
          types {
            kind
            name
            description
            fields(includeDeprecated: true) {
              name
              description
              args { ...InputValue }
              type { ...TypeRef }
              isDeprecated
              deprecationReason
            }
            inputFields { ...InputValue }
            interfaces { ...TypeRef }
            enumValues(includeDeprecated: true) {
              name
              description
              isDeprecated
              deprecationReason
            }
            possibleTypes { ...TypeRef }
          }
        }
      }

      fragment InputValue on __InputValue {
        name
        description
        type { ...TypeRef }
        defaultValue
      }

      fragment TypeRef on __Type {
        kind
        name
        ofType {
          kind
          name
          ofType {
            kind
            name
            ofType {
              kind
              name
              ofType {
                kind
                name
                ofType {
                  kind
                  name
                  ofType {
                    kind
                    name
                    ofType { kind name }
                  }
                }
              }
            }
          }
        }
      }
    `;
    const token = await this.accessToken();
    const data = await queryGraphQL<{ __schema: GraphQLSchema | null }>(token, query);
    if (!data?.__schema) {
      throw new Error('GraphQL schema discovery returned no schema; introspection may be disabled.');
    }
    return data.__schema;
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
