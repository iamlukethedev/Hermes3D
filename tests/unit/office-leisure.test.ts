import { describe, expect, it } from 'vitest';
import { leisureSlot, idleLeisurePosition, advanceOfficeCommute, buildHouseNavGrid, ensureHouseWorkstations } from '../../src/features/retro-office/core/leisure';
import { materializeDefaults } from '../../src/features/retro-office/core/furnitureDefaults';
import { astar } from '../../src/features/retro-office/core/navigation';
describe('office leisure commute', () => {
 it('moves subtly at its own leisure station with varied phases and no office roam',()=>{
  const ids=['a','b','c','d'];
  for(const id of ids){
   const slot=leisureSlot(id,ids);const positions=[];
   for(let now=0;now<60000;now+=500){const p=idleLeisurePosition(id,slot,now);positions.push(`${p.x}:${p.y}`);expect(Math.hypot(p.x-slot.x,p.y-slot.y)).toBeLessThanOrEqual(4);expect(p.y).toBe(slot.y);}
   expect(new Set(positions).size).toBeGreaterThan(10);
  }
  expect(idleLeisurePosition('a',{x:100,y:100},1000)).not.toEqual(idleLeisurePosition('b',{x:100,y:100},1000));
 });
 it('adds unique workstation capacity as a late roster grows',()=>{
  let house=ensureHouseWorkstations(materializeDefaults(),9);
  house=ensureHouseWorkstations(house,12);
  const added=house.filter(i=>i._uid.startsWith('house-'));
  expect(new Set(added.map(i=>i._uid)).size).toBe(added.length);
  expect(new Set(house.filter(i=>i.type==='desk_cubicle').map(i=>`${i.x}:${i.y}`)).size).toBe(12);
 });
 it('makes marked lounge and gym apertures the only local wall crossings',()=>{
  const grid=buildHouseNavGrid(materializeDefaults());
  for(const [x,y,free] of [[780,300,false],[780,550,true],[1020,300,false],[1020,550,true]] as const) {
   expect(grid[Math.floor(y as number/25)*72+Math.floor(x as number/25)]===0,`${x},${y}`).toBe(free);
  }
 });
 it('derives twelve workstations without changing the original layout',()=>{
  const original=materializeDefaults();const before=JSON.stringify(original);
  const house=ensureHouseWorkstations(original,12);
  expect(house.filter(i=>i.type==='desk_cubicle')).toHaveLength(12);
  expect(JSON.stringify(original)).toBe(before);
  expect(ensureHouseWorkstations(house,12)).toBe(house);
 });
 it('routes both leisure areas to a computer and back through the real nav grid',()=>{
  const grid=buildHouseNavGrid(materializeDefaults());
  for(const id of ['a','b']) {
   const slot=leisureSlot(id,['a','b']);
   expect(astar(slot.x,slot.y,140,295,grid).length, id).toBeGreaterThan(0);
   expect(astar(140,295,slot.x,slot.y,grid).length).toBeGreaterThan(0);
  }
 });
 it('assigns twelve stable non-overlapping leisure activities', () => {
  const ids = Array.from({length:16}, (_,i)=>`agent-${i}`);
  const slots = ids.map(id=>leisureSlot(id,ids));
  expect(slots.filter(s=>s.area==='gym')).toHaveLength(5);
  expect(slots.filter(s=>s.area==='lounge')).toHaveLength(6);
  expect(slots.filter(s=>s.area==='garden')).toHaveLength(5);
  expect(new Set(slots.map(s=>`${s.x}:${s.y}`)).size).toBe(16);
  expect(leisureSlot(ids[3], [...ids].reverse())).toEqual(slots[3]);
  expect(new Set(slots.map(s=>s.activity))).toEqual(new Set(['tv','videogame','pinball','coffee','workout','relax']));
  const pinball=leisureSlot('p06',Array.from({length:12},(_,i)=>`p${String(i).padStart(2,'0')}`));
  const coffee=leisureSlot('p09',Array.from({length:12},(_,i)=>`p${String(i).padStart(2,'0')}`));
  expect(pinball.x).toBeGreaterThan(1500);expect(pinball.y).toBeGreaterThan(530);
  expect(coffee.y).toBeLessThan(260);
 });
 it('walks idle to computer and back without teleporting', () => {
  const lounge={x:300,y:800}; const desk={x:100,y:300};
  let p={...lounge};
  const first=advanceOfficeCommute(p,desk,2);
  expect(Math.hypot(first.x-p.x,first.y-p.y)).toBeCloseTo(2);
  expect(first.arrived).toBe(false);
  for(let i=0;i<400;i++) p=advanceOfficeCommute(p,desk,2);
  expect(p).toMatchObject(desk);
  for(let i=0;i<400;i++) p=advanceOfficeCommute(p,lounge,2);
  expect(p).toMatchObject(lounge);
 });
});
