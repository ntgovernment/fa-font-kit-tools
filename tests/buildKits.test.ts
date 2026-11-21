import { describe, expect, it } from 'vitest';
import { placeKitVersion } from '../src/buildKits.js';

describe('placeKitVersion', () => {
  it('records a kit under its major version', () => {
    expect(placeKitVersion({}, '41b791824a', '6.x')).toEqual({
      '6': ['41b791824a'],
    });
  });

  it('keeps a full semver on the major record', () => {
    expect(placeKitVersion({ '7': ['00b1b3bcf8'] }, '00b1b3bcf8', '7.3.1')).toEqual({
      '7': ['00b1b3bcf8'],
    });
  });

  it('moves a kit when its major changes', () => {
    expect(placeKitVersion({
      '6': ['41b791824a', 'd8e5f638f7'],
      '7': ['00b1b3bcf8'],
    }, '41b791824a', '7.3.1')).toEqual({
      '6': ['d8e5f638f7'],
      '7': ['00b1b3bcf8', '41b791824a'],
    });
  });

  it('treats latest as major 5', () => {
    expect(placeKitVersion({}, 'bda218d76e', 'latest')).toEqual({
      '5': ['bda218d76e'],
    });
  });
});
