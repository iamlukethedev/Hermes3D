import {describe,it,expect} from 'vitest';
import {defaultStudioOfficePreference, normalizeStudioSettings} from '../../src/lib/studio/settings';
describe('office themes',()=>{
 it('defaults existing offices to Original Office',()=>expect(defaultStudioOfficePreference().theme).toBe('original'));
 it('persists house theme through settings normalization',()=>{
  const settings=normalizeStudioSettings({office:{'ws://localhost:9120':{theme:'dellanio-house'}}});
  expect(settings.office?.['ws://localhost:9120'].theme).toBe('dellanio-house');
 });
});
