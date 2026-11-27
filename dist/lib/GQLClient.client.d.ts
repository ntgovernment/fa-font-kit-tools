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
export interface FAKitExtended extends FAKit {
    major: number;
}
export type FAKitSubsetType = 'AUTO' | 'CUSTOM' | 'FULL';
export interface FAKitFamilyStyle {
    family: string;
    style: string;
    prefix: string;
    shorthand: string;
    label: string;
    /** Null when the whole style is included. A number when a custom subset selects individual icons. */
    selectedIconCount: number | null;
}
export interface FAKitStyles {
    name: string;
    token: string;
    version: string;
    major: number;
    subsetType: FAKitSubsetType;
    familyStyles: FAKitFamilyStyle[];
}
export type GraphQLTypeKind = 'SCALAR' | 'OBJECT' | 'INTERFACE' | 'UNION' | 'ENUM' | 'INPUT_OBJECT' | 'LIST' | 'NON_NULL';
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
    queryType: {
        name: string;
    };
    mutationType: {
        name: string;
    } | null;
    subscriptionType: {
        name: string;
    } | null;
    types: GraphQLSchemaType[];
}
export declare class GQLClient {
    #private;
    constructor(apiToken: string);
    accessToken(): Promise<string>;
    getKits(): Promise<FAKitExtended[]>;
    getKitFamilyStyles(): Promise<FAKitStyles[]>;
    discoverSchema(): Promise<GraphQLSchema>;
}
export declare function getAccessToken(apiToken: string): Promise<AccessTokenData>;
export declare function queryGraphQL<T = unknown>(accessToken: string, query: string, variables?: Record<string, unknown>): Promise<T>;
//# sourceMappingURL=GQLClient.client.d.ts.map