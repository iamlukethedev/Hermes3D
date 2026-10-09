import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
// Exercise the exact frame predicate used by the rendered material, not a mock.
const source = fs.readFileSync('src/features/retro-office/objects/agents.tsx', 'utf8');
const expression = source.match(/const working =\s*([\s\S]*?);\s*const isError/)! [1];
// Only trusted repository source is evaluated; no API/user input reaches Function.
const working = new Function('agent', 'isWorkout', 'isDancing', 'statusOnly', `return (${expression});`);
describe('House status markers', () => {
  it.each(['sitting','working_out','dancing','standing','walking'])('idle %s never has a working marker', state => {
    expect(working({state,status:'idle'}, state==='working_out', state==='dancing', true)).toBe(false);
  });
  it.each(['walking','sitting'])('active %s has a working marker', state => {
    expect(working({state,status:'working'},false,false,true)).toBe(true);
  });
  it('preserves original office seated marker', () => {
    expect(working({state:'sitting',status:'idle'},false,false,false)).toBe(true);
  });
});
