import { createApprovedHouse, approvedHouseCapacity, approvedHouseSlot, approvedHouseGrid } from './houseLayout';
import type { FurnitureItem } from './types';

/** Shared authored aperture dimensions for wall meshes and navigation. */
export const HOUSE_LOUNGE_DOOR = { start:470, end:630, x:1020 };
export const HOUSE_GYM_DOOR = { start:1020, end:1180, x:780 };
/** Cut geometry, not just a navigation hole. Idempotent on saved house layouts. */
export function prepareHouseArchitecture(items: FurnitureItem[]) {return createApprovedHouse(items);}
export function buildHouseNavGrid(items: FurnitureItem[]) {return approvedHouseGrid(items);}
export function ensureHouseWorkstations(items: FurnitureItem[], count:number) {return approvedHouseCapacity(items,count);}
export function leisureSlot(id:string,ids:string[],_gym: {x:number;y:number;facing:number;workoutStyle?: "run"|"lift"|"bike"|"box"|"row"|"stretch"}[]=[],cycle=0) {return approvedHouseSlot(id,ids,cycle);}

/** Slow, per-agent repositioning within four units of the same activity station. */
export function idleLeisurePosition(id:string, slot:{x:number;y:number}, now:number) {
 let seed=0;for(const c of id)seed=(seed*31+c.charCodeAt(0))>>>0;
 const phase=(seed%1000)/1000*Math.PI*2;
 return {x:slot.x+Math.sin(now/(3500+seed%2500)+phase)*3,y:slot.y};
}

/** Bounded movement; arrival never snaps across a room. */
export function advanceOfficeCommute(position: {x:number;y:number}, target: {x:number;y:number}, speed:number) {
 const dx=target.x-position.x, dy=target.y-position.y, distance=Math.hypot(dx,dy);
 const step=Math.min(Math.max(0,speed),distance);
 return { x:position.x+(distance ? dx/distance*step : 0), y:position.y+(distance ? dy/distance*step : 0), arrived:distance<=speed };
}
