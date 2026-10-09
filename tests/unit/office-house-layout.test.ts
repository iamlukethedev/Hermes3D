import {describe,it,expect} from 'vitest';
import {prepareHouseArchitecture,ensureHouseWorkstations,buildHouseNavGrid,leisureSlot} from '../../src/features/retro-office/core/leisure';
import {materializeDefaults} from '../../src/features/retro-office/core/furnitureDefaults';
import {astar,getDeskLocations,isNavPointFree} from '../../src/features/retro-office/core/navigation';
describe('approved four-zone house',()=>{
 it('migrates only house furniture into a twelve-desk upper-left studio',()=>{
  const original=materializeDefaults();const before=JSON.stringify(original);
  const house=prepareHouseArchitecture(original);const desks=house.filter(i=>i.type==='desk_cubicle');
  expect(desks).toHaveLength(12);
  expect(desks.every(d=>d.x<780&&d.y<700)).toBe(true);
  expect(house.some(i=>i._uid==='house-layout-v4')).toBe(true);
  expect(JSON.stringify(original)).toBe(before);
  expect(prepareHouseArchitecture(house)).toBe(house);
  const expanded=ensureHouseWorkstations(house,20);
  expect(new Set(getDeskLocations(expanded).map(p=>`${p.x}:${p.y}`)).size).toBe(20);
 });
 it('connects three leisure zones through four physical corridor apertures without crossing pool',()=>{
  const house=prepareHouseArchitecture(materializeDefaults());const grid=buildHouseNavGrid(house);
  for(const [x,y,free] of [[780,300,false],[780,550,true],[1020,300,false],[1020,550,true],[780,1100,true],[1020,1100,true],[1300,1370,false],[1200,390,false],[1650,1160,false]] as const)expect(isNavPointFree(grid,x,y),`${x}:${y}`).toBe(free);
  const ids=Array.from({length:12},(_,i)=>`p${i}`);
  const slots=ids.map(id=>leisureSlot(id,ids));
  expect(new Set(slots.map(s=>s.area))).toEqual(new Set(['lounge','gym','garden']));
  for(const slot of slots)for(const desk of getDeskLocations(house)){
   expect(astar(slot.x,slot.y,desk.x,desk.y,grid).length,JSON.stringify({slot,desk})).toBeGreaterThan(0);
   expect(astar(desk.x,desk.y,slot.x,slot.y,grid).length).toBeGreaterThan(0);
  }
 });
});
