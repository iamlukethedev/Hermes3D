import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
describe('Brazil flag geometry',()=>{
 it('uses an inset horizontal yellow diamond, not an overflowing rotated square',()=>{
  const source=readFileSync('src/features/retro-office/scene/environment.tsx','utf8');
  expect(source).toContain('scale={[0.21, 0.12, 1]}');
  expect(source).toContain('circleGeometry args={[1, 4]}');
  expect(source).toContain('circleGeometry args={[0.068, 28]}');
 });
});
