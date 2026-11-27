export interface FaUsageMatch {
    value: string;
    count: number;
    lines: number[];
    warcTargetUri?: string;
}
export interface FaUsageClassMatch extends FaUsageMatch {
    families: Array<'modern' | 'legacy'>;
}
export interface FaUsageDetectorResult {
    source?: string;
    classes: FaUsageClassMatch[];
    escapes: FaUsageMatch[];
    skippedWarcTargetUris?: string[];
}
export interface FaUsageDetectorOptions {
    ignoreWarcTargetUris?: readonly string[];
}
export declare function faUsageDetector(content: string, source?: string, options?: FaUsageDetectorOptions): FaUsageDetectorResult;
export declare function faUsageDetectorFile(filePath: string, options?: FaUsageDetectorOptions): Promise<FaUsageDetectorResult>;
//# sourceMappingURL=faUsageDetector.d.ts.map