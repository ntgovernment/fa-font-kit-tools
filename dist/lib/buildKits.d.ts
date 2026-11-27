import { FAKitExtended } from "./GQLClient.client.js";
export interface KitVersionRecord {
    [major: string]: string[];
}
export declare function copyInstalledKit(kit: FAKitExtended): Promise<string>;
export declare function placeKitVersion(record: KitVersionRecord, token: string, version: string): KitVersionRecord;
//# sourceMappingURL=buildKits.d.ts.map