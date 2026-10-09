import { describe, it, expect } from 'vitest';
import { normalizeStudioSettings, mergeStudioSettings, sanitizeStudioOfficePreference } from '../../src/lib/studio/settings';
const key = 'ws://localhost:9120';
describe('per-theme national flags', () => {
 it('defaults legacy offices to United States in both themes', () => {
  const office = normalizeStudioSettings({office:{[key]:{theme:'dellanio-house'}}}).office[key];
  expect(office.flagsByTheme).toEqual({original:'us','dellanio-house':'us'});
 });
 it('persists independent theme flags across patches, serialization and public settings', () => {
  let settings = normalizeStudioSettings({office:{[key]:{theme:'dellanio-house'}}});
  settings = mergeStudioSettings(settings,{office:{[key]:{flagsByTheme:{'dellanio-house':'br'}}}});
  settings = mergeStudioSettings(settings,{office:{[key]:{theme:'original',flagsByTheme:{original:'us'}}}});
  const office = normalizeStudioSettings(JSON.parse(JSON.stringify(settings))).office[key];
  expect(sanitizeStudioOfficePreference(office).flagsByTheme).toEqual({original:'us','dellanio-house':'br'});
 });
});
