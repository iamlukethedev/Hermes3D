import {describe,it,expect} from 'vitest';
import {stepHouseLeisure,createHouseRandom,HOUSE_POOL_CHANCE_PERCENT,stepHousePoolExit} from '../../src/features/retro-office/core/houseLeisure';
import {approvedHouseGrid,createApprovedHouse} from '../../src/features/retro-office/core/houseLayout';
const grid=approvedHouseGrid(createApprovedHouse([]));
const initial=()=>({x:1180,y:480,cycle:0,dwellUntil:0,path:[]});
describe('natural House leisure',()=>{
 it('uses reproducible independent seeded streams and long variable arrival dwell',()=>{
  expect(createHouseRandom('a')()).toEqual(createHouseRandom('a')());
  expect(createHouseRandom('a')()).not.toEqual(createHouseRandom('b')());
  const a=stepHouseLeisure('a',['a'],initial(),grid,1000,3,{random:()=>0.5});
  expect(a.dwellUntil-1000).toBeGreaterThanOrEqual(45000);
  expect(a.dwellUntil-1000).toBeLessThanOrEqual(180000);
  const b=stepHouseLeisure('a',['a'],a,grid,11000,3,{random:()=>0.5});
  expect(b.cycle).toBe(a.cycle);expect(b.x).toBe(a.x);expect(b.y).toBe(a.y);
 });
 it('does not force round robin; may stay and does not duplicate occupied targets',()=>{
  const start=stepHouseLeisure('a',['a'],initial(),grid,0,3,{random:()=>0.5});
  const stay=stepHouseLeisure('a',['a'],start,grid,start.dwellUntil+1,3,{random:()=>0,poolChancePercent:0});
  expect(stay.targetX).toBe(start.targetX);expect(stay.targetY).toBe(start.targetY);
  const occupied=[{targetX:1180,targetY:480}];
  const other=stepHouseLeisure('b',['a','b'],initial(),grid,0,3,{random:()=>0.5,occupied});
  expect(Math.hypot(other.targetX-1180,other.targetY-480)).toBeGreaterThan(25);
 });
 it('samples the configured percentage and independent decisions over many seeded agents',()=>{
  let entered=0;const choices=new Set();
  for(let i=0;i<1000;i++){const s=stepHouseLeisure(`agent-${i}`,['a'],{...initial(),x:1200,y:500},grid,0,3,{random:createHouseRandom(`agent-${i}`)});if(s.poolPhase)entered++;choices.add(`${s.targetX}:${s.targetY}`);}
  expect(entered).toBeGreaterThan(100);expect(entered).toBeLessThan(200);expect(choices.size).toBeGreaterThan(8);
 });
 it('has explicit 15 percent water chance with 0/100 boundaries and exits before work routing',()=>{
  expect(HOUSE_POOL_CHANCE_PERCENT).toBe(15);
  const no=stepHouseLeisure('a',['a'],initial(),grid,0,3,{random:()=>0,poolChancePercent:0});expect(no.poolPhase).toBeUndefined();
  let water=stepHouseLeisure('a',['a'],initial(),grid,0,9,{random:()=>0,poolChancePercent:100});
  for(let n=1;n<1500&&water.poolPhase!=='swimming';n++)water=stepHouseLeisure('a',['a'],water,grid,n*100,9,{random:()=>0,poolChancePercent:100});
  expect(water.poolPhase).toBe('swimming');expect(water.y).toBeGreaterThan(1260);
  let exit=stepHousePoolExit(water,9);
  for(let n=0;n<1000&&!exit.exited;n++)exit=stepHousePoolExit({...water,...exit},9);
  expect(exit.exited).toBe(true);expect(exit.y).toBeLessThan(1260);
 });
});
