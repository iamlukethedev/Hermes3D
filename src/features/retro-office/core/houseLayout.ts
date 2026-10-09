import {buildNavGrid} from './navigation';
import type {FurnitureItem} from './types';
export const HOUSE_LAYOUT_VERSION='house-layout-v4';
export const HOUSE_POOL={x:1100,y:1260,w:460,h:250};
/** Versioned house-only migration. Original saved furniture is never rewritten. */
export function createApprovedHouse(items:FurnitureItem[]):FurnitureItem[]{
 if(items.some(i=>i._uid===HOUSE_LAYOUT_VERSION))return ensureHouseFunctionalObjects(items);
 const next:FurnitureItem[]=[];
 const add=(type:string,x:number,y:number,extra:Partial<FurnitureItem>={})=>next.push({_uid:`house-v4-${next.length}`,type,x,y,...extra});
 add('plant',70,70,{_uid:HOUSE_LAYOUT_VERSION});
 for(const x of [780,1020])for(const [y,h] of [[60,410],[630,390],[1180,370]])add('wall',x,y,{w:8,h});
 for(const [x,w] of [[60,720],[1020,720]])add('wall',x,750,{w,h:8});
 add('wall',60,60,{w:1680,h:8});add('wall',60,60,{w:8,h:1490});add('wall',1740,60,{w:8,h:1490});
 for(const [x,w] of [[60,720],[1020,720]])add('wall',x,1550,{w,h:8});
 for(let i=0;i<12;i++)addHouseDesk(next,i);
 add('cabinet',1100,100,{w:200,h:40});add('coffee_machine',1130,104,{elevation:0.56});
 add('mug',1200,115,{elevation:0.6});add('mug',1240,115,{elevation:0.6});add('bookshelf',1600,100,{w:80,h:120});
 add('couch',1150,370,{w:180,h:40,color:'#ce7550'});add('couch',1490,350,{w:140,h:40,color:'#2f7778'});add('table_rect',1380,410,{w:80,h:40});
 add('beanbag',1170,620,{color:'#168b83'});add('beanbag',1320,620,{color:'#cf8a50'});
 for(const [type,x,y] of [['treadmill',150,900],['weight_bench',350,900],['dumbbell_rack',580,880],['rowing_machine',150,1090],['exercise_bike',360,1080],['punching_bag',650,1090],['yoga_mat',180,1380],['kettlebell_rack',510,1380]] as const)add(type,x,y);
 add('couch',1550,925,{w:140,h:40,color:'#e5d5b5'});add('round_table',1640,1160,{r:38});
 for(const [x,y] of [[80,650],[690,80],[700,670],[1060,90],[1680,660],[80,820],[690,1450],[1070,830],[1680,1450],[1670,1020]])add('plant',x,y);
 return ensureHouseFunctionalObjects(next);
}
/** Shared Original components retain their callbacks; only House placements differ. */
export const HOUSE_FUNCTIONAL_PLACEMENTS: FurnitureItem[] = [
 ['server_rack',700,180],['server_terminal',695,300],
 ['kanban_board',1350,95],['atm',1045,250],['sms_booth',1045,180],['phone_booth',1045,650],
 ['jukebox',1650,270],['pingpong',1380,660],
 ['qa_terminal',1490,560],['device_rack',1470,620],['test_bench',1590,650],
].map(([type,x,y])=>({_uid:`house-functional-${type}`,type:type as string,x:x as number,y:y as number}));
export function ensureHouseFunctionalObjects(items:FurnitureItem[]):FurnitureItem[]{
 const marker='house-functional-v1';if(items.some(i=>i._uid===marker))return items;
 const next=items.map(i=>i.type==='plant'&&i.x>=788&&i.x<1020?{...i,type:'house_shrub'}:i);
 for(const item of HOUSE_FUNCTIONAL_PLACEMENTS)if(!next.some(i=>i.type===item.type))next.push(item);
 next.push({_uid:marker,type:'house_shrub',x:900,y:820,w:22,h:22});
 next.push({_uid:'house-standup-table',id:'house-standup-table',type:'round_table',x:1290,y:240,r:25});
 return next;
}
function addHouseDesk(items:FurnitureItem[],i:number){const x=130+(i%4)*150,y=210+Math.floor(i/4)*150;
 items.push({_uid:`house-desk-${i}`,id:`desk_${i}`,type:'desk_cubicle',x,y},
 {_uid:`house-computer-${i}`,type:'computer',x:x+20,y:y-13},
 {_uid:`house-chair-${i}`,type:'chair',x:x+20,y:y-10,facing:180},
 {_uid:`house-keyboard-${i}`,type:'keyboard',x:x+30,y:y-5});}
export function approvedHouseCapacity(items:FurnitureItem[],count:number){let next=createApprovedHouse(items);const desks=next.filter(i=>i.type==='desk_cubicle').length;if(desks>=count)return next;next=[...next];
 for(let i=desks;i<count;i++){const x=110+((i-12)%8)*78,y=610+Math.floor((i-12)/8)*55;
 next.push({_uid:`house-desk-${i}`,id:`desk_${i}`,type:'desk_cubicle',x,y,w:70,h:40},
 {_uid:`house-computer-${i}`,type:'computer',x:x+20,y:y-13},{_uid:`house-chair-${i}`,type:'chair',x:x+20,y:y-10,facing:180},{_uid:`house-keyboard-${i}`,type:'keyboard',x:x+30,y:y-5});}return next;}
/** Custom mesh collision proxies use the same bounds as rendered geometry. */
export function houseActivityObstacles():FurnitureItem[]{return [{_uid:'house-pool-collision',type:'wall',...HOUSE_POOL},{_uid:'house-tv-collision',type:'wall',x:1400,y:170,w:145,h:35},{_uid:'house-pinball-collision',type:'wall',x:1610,y:530,w:60,h:85}];}
export function approvedHouseGrid(items:FurnitureItem[]){const house=createApprovedHouse(items);return buildNavGrid([...house.filter(i=>['wall','desk_cubicle','table_rect','round_table','couch','couch_v','beanbag','bookshelf','cabinet','plant',...HOUSE_FUNCTIONAL_PLACEMENTS.map(p=>p.type)].includes(i.type)),...houseActivityObstacles()]);}
export function approvedHouseSlot(id:string,ids:string[],cycle=0){
 const index=Math.max(0,[...new Set(ids)].sort().indexOf(id)),area=(index+cycle)%3,local=Math.floor(index/3),offset=(local%4)*90,row=Math.floor(local/4)*65;
 if(area===1){const points=[{x:185,y:935,style:'run'},{x:390,y:935,style:'lift'},{x:195,y:1120,style:'row'},{x:380,y:1120,style:'bike'},{x:640,y:1125,style:'box'},{x:215,y:1410,style:'stretch'}] as const;const p=points[local%points.length];return {x:p.x+Math.floor(local/6)*45,y:p.y,facing:0,area:'gym' as const,activity:'workout' as const,workoutStyle:p.style};}
 if(area===2)return {x:1140+offset,y:990+row,facing:Math.PI,area:'garden' as const,activity:'relax' as const,workoutStyle:undefined};
 const activity=(['tv','videogame','pinball','coffee'] as const)[local%4];
 const point=activity==='pinball'?{x:1570,y:570+row}:activity==='coffee'?{x:1180+(local%2)*70,y:210+row}:{x:1180+offset,y:480+row};
 return {...point,facing:activity==='pinball'?Math.PI/2:Math.PI,area:'lounge' as const,activity,workoutStyle:undefined};
}
