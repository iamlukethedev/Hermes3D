import {describe,it,expect} from 'vitest';
import {stepHouseLeisure} from '../../src/features/retro-office/core/houseLeisure';
import {approvedHouseGrid,createApprovedHouse} from '../../src/features/retro-office/core/houseLayout';
describe('house activity cycle',()=>{
 it('dwells then deliberately walks to reachable activities in all three leisure zones',()=>{
  const ids=['a','b','c'];const grid=approvedHouseGrid(createApprovedHouse([]));
  let state:ReturnType<typeof stepHouseLeisure>|Parameters<typeof stepHouseLeisure>[2]={x:1180,y:480,cycle:0,dwellUntil:0,path:[]};const areas=new Set();let travelled=0,reached=0;
  for(let now=0;now<1800000;now+=100){const previous=state;state=stepHouseLeisure('a',ids,state,grid,now,9);const current=state as ReturnType<typeof stepHouseLeisure>;const d=Math.hypot(current.x-previous.x,current.y-previous.y);expect(d).toBeLessThanOrEqual(9.001);travelled+=d;if(current.state!=='walking'){areas.add(current.area);reached++;}expect(!(state.x<780&&state.y<750)).toBe(true);}
  expect(travelled).toBeGreaterThan(1800);expect(areas).toEqual(new Set(['lounge','gym','garden']));expect(reached).toBeGreaterThan(20);
 });
});
