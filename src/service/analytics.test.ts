import { describe, expect, it } from 'vitest';
import { kindToTypes } from './analytics.js';

describe('kindToTypes', () => {
  it('maps stream kinds to NewAPI log types', () => {
    expect(kindToTypes('all')).toEqual([2, 3, 5, 7]);
    expect(kindToTypes('consume')).toEqual([2]);
    expect(kindToTypes('error')).toEqual([5]);
    expect(kindToTypes('success')).toEqual([2]);
    expect(kindToTypes('failure')).toEqual([5]);
  });
});
