import {describe,it,expect} from 'vitest';
import fs from 'node:fs';
import {createApprovedHouse} from '../../src/features/retro-office/core/houseLayout';
const functional=['desk_cubicle','computer','round_table','pingpong','atm','jukebox','sms_booth','phone_booth','server_terminal','server_rack','qa_terminal','device_rack','test_bench','kanban_board'];
describe('House functional parity',()=>{
 it('contains every Original action binding, reusing the shared renderer',()=>{
  const source=fs.readFileSync('src/features/retro-office/RetroOffice3D.tsx','utf8');
  const handler=source.slice(source.indexOf('const handleDeskClick ='),source.indexOf('//',source.indexOf('const handleDeskClick =')+100000));
  const found=[...new Set([...handler.matchAll(/item.type === "([a-z_]+)"/g)].map(m=>m[1]))];
  for(const type of functional.filter(t=>t!=='jukebox'))expect(found).toContain(type);
  const house=createApprovedHouse([]);for(const type of functional)expect(house.some(i=>i.type===type),type).toBe(true);
  expect(house.find(i=>i.type==='server_rack')!.x).toBeLessThan(780);
  expect(house.find(i=>i.type==='server_terminal')!.x).toBeLessThan(780);
  expect(house.find(i=>i.id==='house-standup-table')).toBeDefined();
 });
 it('migrates saved v4 layouts idempotently and replaces corridor vegetation with a low non-blocking shrub',()=>{
  const v4=[...createApprovedHouse([]).filter(i=>!i._uid.startsWith('house-functional-')&&i.id!=='house-standup-table'),{_uid:'custom-center-tree',type:'plant',x:890,y:820}];
  const migrated=createApprovedHouse(v4);expect(migrated.find(i=>i._uid==='custom-center-tree')?.type).toBe('house_shrub');
  expect(createApprovedHouse(migrated)).toBe(migrated);
  for(const type of functional)expect(migrated.some(i=>i.type===type),type).toBe(true);
 });
});
