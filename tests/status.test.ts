import { describe, expect, it } from 'vitest';
import * as status from '@/lib/status';
// @ts-expect-error -- plain .mjs module without type declarations
import { ENUMS } from '../scripts/airtable/schema.mjs';

// src/lib/status.ts must mirror the Airtable select options exactly (CLAUDE.md rule 12).
const enums = ENUMS as Record<string, string[]>;

describe('status.ts mirrors the Airtable select options', () => {
  it.each([
    ['topicStatus', status.topicStatus],
    ['topicSource', status.topicSource],
    ['projectStatus', status.projectStatus],
    ['versionStatus', status.versionStatus],
    ['itemStatus', status.itemStatus],
    ['publishStatus', status.publishStatus],
    ['graphicStatus', status.graphicStatus],
    ['jobStatus', status.jobStatus],
  ])('%s', (name, map) => {
    expect(Object.keys(map).sort()).toEqual([...enums[name]!].sort());
  });

  it('appRole', () => {
    expect([...status.appRoles].sort()).toEqual([...enums.appRole!].sort());
  });

  it('isStaff', () => {
    expect(status.isStaff('owner')).toBe(true);
    expect(status.isStaff('admin')).toBe(true);
    expect(status.isStaff('editor')).toBe(false);
    expect(status.isStaff(null)).toBe(false);
  });
});
