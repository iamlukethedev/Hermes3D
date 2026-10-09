import {astar,isNavPointFree,type NavGrid} from './navigation';
import {approvedHouseSlot} from './houseLayout';
export const HOUSE_POOL_CHANCE_PERCENT=15;
export const HOUSE_WALK_SPEED_FACTOR=0.75;
export const HOUSE_DWELL_MIN_MS=45000;
export const HOUSE_DWELL_MAX_MS=180000;
type Slot=ReturnType<typeof approvedHouseSlot>;
export interface HouseLeisureState {x:number;y:number;cycle:number;dwellUntil:number;path:{x:number;y:number}[];targetX?:number;targetY?:number;slot?:Slot;randomState?:number;lastKey?:string;poolPhase?:'approach'|'entering'|'swimming'|'exiting';poolEntry?:{x:number;y:number};poolTarget?:{x:number;y:number};}
function hash(id:string){let n=2166136261;for(const c of id)n=Math.imul(n^c.charCodeAt(0),16777619);return n>>>0;}
/** Independent streams can be injected in tests; production state survives heartbeat refreshes. */
export function createHouseRandom(id:string){let n=hash(id);return ()=>{n=(Math.imul(n,1664525)+1013904223)>>>0;return n/4294967296;};}
interface Options {random?:()=>number;poolChancePercent?:number;occupied?:{targetX?:number;targetY?:number}[];}
const key=(s:{x:number;y:number})=>`${s.x}:${s.y}`;
function move(p:{x:number;y:number},t:{x:number;y:number},speed:number){const d=Math.hypot(t.x-p.x,t.y-p.y),step=Math.min(speed,d);return {x:p.x+(d?(t.x-p.x)/d*step:0),y:p.y+(d?(t.y-p.y)/d*step:0)};}
/** Pool navigation is an explicit top-edge entry/exit; normal A* always blocks water. */
export function stepHousePoolExit(previous:HouseLeisureState,speed:number){
 const entry=previous.poolEntry??{x:1320,y:1200};const p=move(previous,entry,speed);
 return {...p,poolPhase:Math.hypot(p.x-entry.x,p.y-entry.y)<=1?undefined:'exiting' as const,exited:Math.hypot(p.x-entry.x,p.y-entry.y)<=1,state:'walking' as const};
}
export function stepHouseLeisure(id:string,ids:string[],previous:HouseLeisureState,grid:NavGrid,now:number,speed:number,options:Options={}){
 let s={...previous};let seed=s.randomState??hash(id);
 const random=options.random??(()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;});
 const available=(p:{x:number;y:number})=>!(options.occupied??[]).some(o=>Math.hypot((o.targetX??-9999)-p.x,(o.targetY??-9999)-p.y)<38);
 if(s.poolPhase==='swimming'&&now>=s.dwellUntil){const exit=stepHousePoolExit(s,speed);return {...s,...exit,randomState:seed,facing:Math.PI,area:'garden' as const,workoutStyle:undefined,targetX:s.poolTarget!.x,targetY:s.poolTarget!.y};}
 if(s.poolPhase==='exiting'){
  const exit=stepHousePoolExit(s,speed);s={...s,...exit};
  if(!exit.exited)return {...s,state:'walking' as const,facing:Math.PI,area:'garden' as const,workoutStyle:undefined,targetX:s.poolTarget!.x,targetY:s.poolTarget!.y};
  s.slot=undefined;s.poolTarget=undefined;s.poolEntry=undefined;s.dwellUntil=0;s.path=[];
  return {...s,state:'standing' as const,facing:Math.PI,area:'garden' as const,workoutStyle:undefined,targetX:s.x,targetY:s.y};
 }
 if(!s.slot||(s.dwellUntil>0&&now>=s.dwellUntil)){
  const expired=!!s.slot;if(expired)s.cycle++;
  const water=[1180,1300,1420].map(x=>({x,y:1340})).filter(available);
  const chance=Math.max(0,Math.min(100,options.poolChancePercent??HOUSE_POOL_CHANCE_PERCENT));
  if(water.length&&random()*100<chance){
   const target=water[Math.floor(random()*water.length)];s.poolEntry={x:target.x,y:1200};s.poolTarget=target;s.poolPhase='approach';
   s.slot={...target,facing:Math.PI,area:'garden',activity:'relax',workoutStyle:undefined};
  }else{
   const catalog=Array.from({length:24},(_,j)=>`slot-${String(j).padStart(2,'0')}`);
   const free=catalog.map(id=>approvedHouseSlot(id,catalog,0)).filter(p=>available(p)&&isNavPointFree(grid,p.x,p.y));
   const nearest=free.toSorted((a,b)=>Math.hypot(a.x-s.x,a.y-s.y)-Math.hypot(b.x-s.x,b.y-s.y))[0];
   if(!expired&&nearest&&Math.hypot(nearest.x-s.x,nearest.y-s.y)<=1)s.slot=nearest;
   else if(expired&&s.slot&&available(s.slot)&&random()<0.24){/* A quiet stay is intentional; never force a room change. */}
   else{
    const favorite=hash(id)%3;
    const weights=free.map(p=>(1+350/(70+Math.hypot(p.x-s.x,p.y-s.y)))*(p.area===['lounge','gym','garden'][favorite]?1.5:1)*(key(p)===s.lastKey?0.12:1)*(s.slot&&key(p)===key(s.slot)?0.12:1));
    let pick=random()*weights.reduce((a,b)=>a+b,0);s.slot=free[free.length-1]??approvedHouseSlot(id,ids);
    for(let i=0;i<free.length;i++){pick-=weights[i];if(pick<=0){s.slot=free[i];break;}}
   }
  }
  s.lastKey=previous.slot?key(previous.slot):undefined;s.dwellUntil=0;s.path=[];
 }
 const slot=s.slot!;const target=s.poolPhase==='approach'?s.poolEntry!:slot;
 if(s.poolPhase==='entering'){
  Object.assign(s,move(s,s.poolTarget!,speed*0.55));
  if(Math.hypot(s.x-s.poolTarget!.x,s.y-s.poolTarget!.y)<=1)s.poolPhase='swimming';
 }else if(s.poolPhase!=='swimming'&&Math.hypot(s.x-target.x,s.y-target.y)>1){
  if(!s.path.length||previous.targetX!==slot.x||previous.targetY!==slot.y)s.path=astar(s.x,s.y,target.x,target.y,grid);
  const waypoint=s.path[0];if(waypoint){Object.assign(s,move(s,waypoint,speed));if(Math.hypot(s.x-waypoint.x,s.y-waypoint.y)<=1)s.path=s.path.slice(1);}
 }
 if(s.poolPhase==='approach'&&Math.hypot(s.x-target.x,s.y-target.y)<=1){s.poolPhase='entering';s.path=[];}
 const arrived=s.poolPhase==='swimming'||(!s.poolPhase&&Math.hypot(s.x-slot.x,s.y-slot.y)<=1);
 if(arrived&&!s.dwellUntil)s.dwellUntil=now+HOUSE_DWELL_MIN_MS+Math.floor(random()*(HOUSE_DWELL_MAX_MS-HOUSE_DWELL_MIN_MS));
 return {...s,randomState:seed,targetX:slot.x,targetY:slot.y,area:slot.area,workoutStyle:slot.workoutStyle,facing:s.poolPhase?Math.PI:slot.facing,
 state:!arrived?'walking' as const:s.poolPhase==='swimming'?'standing' as const:slot.area==='gym'?'working_out' as const:slot.activity==='pinball'||slot.activity==='coffee'?'standing' as const:'sitting' as const};
}
