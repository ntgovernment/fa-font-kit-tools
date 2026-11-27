const FAMILY_STYLE_PAGE_SIZE = 50;
const kitFamilyStylesQuery = `
  query KitFamilyStyles($page: Int!) {
    me {
      kits {
        name
        token
        version
        subsetType
        familyStylesPaginated(page: $page, pageSize: ${FAMILY_STYLE_PAGE_SIZE}) {
          totalPageCount
          familyStyles {
            familyStyle {
              family
              style
              prefix
              shorthand
              label
            }
            only(page: 1, pageSize: 1) {
              totalIconVariantCount
            }
          }
        }
      }
    }
  }
`;
export class GQLClient {
    #apiToken = '';
    #accessToken = '';
    #accessTokenExpire = 0;
    constructor(apiToken) {
        this.#apiToken = apiToken;
    }
    async accessToken() {
        const now = Date.now();
        if (now > this.#accessTokenExpire) {
            const data = await getAccessToken(this.#apiToken);
            this.#accessTokenExpire = now + data.expires_in;
            this.#accessToken = data.access_token;
        }
        return this.#accessToken;
    }
    async getKits() {
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
        const data = await queryGraphQL(token, query);
        return (data?.me?.kits ?? []).map(kit => ({
            ...kit,
            major: kitMajor(kit.version),
        }));
    }
    async getKitFamilyStyles() {
        const token = await this.accessToken();
        const firstPage = await this.#kitFamilyStylePage(token, 1);
        const pages = new Map(firstPage.map(kit => [kit.token, [kit]]));
        const maxPage = firstPage.reduce((max, kit) => Math.max(max, kit.familyStylesPaginated.totalPageCount), 1);
        for (let page = 2; page <= maxPage; page++) {
            const nextPage = await this.#kitFamilyStylePage(token, page);
            for (const kit of nextPage) {
                const seen = pages.get(kit.token);
                if (!seen || page > seen[0].familyStylesPaginated.totalPageCount)
                    continue;
                seen.push(kit);
            }
        }
        return firstPage.map(kit => ({
            name: kit.name,
            token: kit.token,
            version: kit.version,
            major: kitMajor(kit.version),
            subsetType: kit.subsetType,
            familyStyles: (pages.get(kit.token) ?? [kit]).flatMap(page => page.familyStylesPaginated.familyStyles.map(entry => ({
                family: entry.familyStyle.family,
                style: entry.familyStyle.style,
                prefix: entry.familyStyle.prefix,
                shorthand: entry.familyStyle.shorthand,
                label: entry.familyStyle.label,
                selectedIconCount: entry.only?.totalIconVariantCount ?? null,
            }))),
        }));
    }
    async #kitFamilyStylePage(token, page) {
        const data = await queryGraphQL(token, kitFamilyStylesQuery, { page });
        return data?.me?.kits ?? [];
    }
    async discoverSchema() {
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
        const data = await queryGraphQL(token, query);
        if (!data?.__schema) {
            throw new Error('GraphQL schema discovery returned no schema; introspection may be disabled.');
        }
        return data.__schema;
    }
}
function kitMajor(version) {
    // Note: latest is legacy and equated to 5
    return parseInt(version === 'latest' ? '5' : version.split('.')?.[0] ?? 0);
}
export async function getAccessToken(apiToken) {
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
export async function queryGraphQL(accessToken, query, variables = {}) {
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
    const result = (await response.json());
    if (result.errors) {
        throw new Error(`GraphQL errors: ${JSON.stringify(result.errors, null, 2)}`);
    }
    return result.data;
}
//# sourceMappingURL=GQLClient.client.js.map