"use client";
import {memo} from 'react';
import {Text} from '@react-three/drei';
import {toWorld} from '../core/geometry';
import {SCALE} from '../core/constants';
import {HOUSE_POOL} from '../core/houseLayout';
import type {FurnitureItem} from '../core/types';
import {BrazilFlagArt,UsaFlagArt} from './environment';

function Block({x,y,w,h,height=0.1,elevation=0,color,name}: {x:number;y:number;w:number;h:number;height?:number;elevation?:number;color:string;name?:string}){
 const [wx,,wz]=toWorld(x+w/2,y+h/2);
 return <mesh name={name} position={[wx,elevation+height/2,wz]} castShadow receiveShadow><boxGeometry args={[w*SCALE,height,h*SCALE]}/><meshStandardMaterial color={color} roughness={0.8}/></mesh>;
}
function Sign({x,y,text,width=4.6,height=0.64,elevation=1.7}: {x:number;y:number;text:string;width?:number;height?:number;elevation?:number}){
 const [wx,,wz]=toWorld(x,y);
 return <group position={[wx,elevation,wz]}><mesh castShadow><boxGeometry args={[width,height,0.10]}/><meshStandardMaterial color="#28372f"/></mesh><Text position={[0,0,0.061]} fontSize={height*0.44} color="#fff6de" maxWidth={width-0.15} anchorX="center" anchorY="middle">{text}</Text></group>;
}
function Tree({x,y,small=false}:{x:number;y:number;small?:boolean}){
 const [wx,,wz]=toWorld(x,y);const scale=small?0.55:1;
 return <group position={[wx,0,wz]} scale={scale}><mesh position={[0,0.75,0]} castShadow><cylinderGeometry args={[0.10,0.14,1.5,6]}/><meshStandardMaterial color="#826346"/></mesh>{[[-0.25,1.7,0],[0.25,2.2,0.15],[0,2.55,-0.10]].map((p,i)=><mesh key={i} position={p as [number,number,number]} castShadow><icosahedronGeometry args={[0.75,0]}/><meshStandardMaterial color={['#789147','#43734a','#92aa50'][i]}/></mesh>)}</group>;
}
function Planter({x,y,w=70}:{x:number;y:number;w?:number}){
 return <group><Block x={x} y={y} w={w} h={24} height={0.4} color="#d5d6be"/>{Array.from({length:4},(_,i)=>{const [wx,,wz]=toWorld(x+10+i*(w-20)/3,y+12);return <group key={i} position={[wx,0.65,wz]}><mesh castShadow><icosahedronGeometry args={[0.32,0]}/><meshStandardMaterial color={i%2?'#3d8053':'#86a64b'}/></mesh><mesh position={[0,0.19,0.04]}><sphereGeometry args={[0.07,6,4]}/><meshStandardMaterial color={i%2?'#efb447':'#ee827c'}/></mesh></group>;})}</group>;
}
function Lounger({x,y}:{x:number;y:number}){
 return <group><Block x={x} y={y} w={42} h={95} height={0.22} elevation={0.12} color="#c69d6c"/><Block x={x+3} y={y+4} w={36} h={85} height={0.16} elevation={0.34} color="#fff0d5"/><Block x={x+5} y={y+12} w={32} h={20} height={0.08} elevation={0.51} color="#328c86"/></group>;
}
/** All geometry is real world-space mesh; static water avoids costly shaders. */
export const HouseScene=memo(function HouseScene({furniture,nationalFlag}:{furniture:FurnitureItem[];nationalFlag:'us'|'br'}){
 const pool=HOUSE_POOL;
 return <group name="dellanios-house-v4">
  <Block x={-100} y={-80} w={2000} h={1850} height={0.12} elevation={-0.45} color="#758a64"/>
  <Block x={35} y={35} w={1735} h={1540} height={0.3} elevation={-0.3} color="#c5c6b5"/>
  <Block x={60} y={60} w={720} h={690} color="#c4a47b" name="DEV STUDIO"/>
  <Block x={1020} y={60} w={720} h={690} color="#c4a47b" name="LOUNGE & GAMES"/>
  <Block x={60} y={758} w={720} h={792} color="#465452" name="GYM"/>
  <Block x={1020} y={758} w={720} h={792} color="#ae8b64" name="GARDEN & POOL"/>
  <Block x={788} y={60} w={232} h={1490} color="#d2b58d" name="CENTRAL CORRIDOR"/>
  {/* Parquet / deck seams are low-cost narrow mesh strips. */}
  {Array.from({length:29},(_,i)=><group key={i}>
   <Block x={60} y={80+i*23} w={720} h={1.3} height={0.004} elevation={0.101} color="#a88863"/>
   <Block x={1020} y={80+i*23} w={720} h={1.3} height={0.004} elevation={0.101} color="#a88863"/>
  </group>)}
  {Array.from({length:30},(_,i)=><Block key={i} x={1020} y={770+i*26} w={720} h={1.5} height={0.004} elevation={0.101} color="#896c4f"/>)}
  {Array.from({length:12},(_,i)=><Block key={i} x={805} y={90+i*120} w={200} h={1.5} height={0.004} elevation={0.101} color="#b19470"/>)}
  <Block x={850} y={380} w={95} h={260} height={0.015} elevation={0.11} color="#818783"/>
  <Block x={850} y={1020} w={95} h={270} height={0.015} elevation={0.11} color="#818783"/>
  {/* Same partition bounds drive pathfinding. No mesh spans any doorway. */}
  {furniture.filter(i=>i.type==='wall').map(i=>{
   const north=i.y===60&&(i.w??0)>100;
   const [wx,,wz]=toWorld(i.x+(i.w??8)/2,i.y+(i.h??8)/2);
   return <group key={i._uid}>
    <Block x={i.x} y={i.y} w={i.w??8} h={i.h??8} height={north?2.1:0.45} color="#d9cbb3"/>
    {!north&&<><mesh position={[wx,0.98,wz]}><boxGeometry args={[(i.w??8)*SCALE,0.85,(i.h??8)*SCALE]}/><meshStandardMaterial color="#b9d6cd" transparent opacity={0.24} roughness={0.15} depthWrite={false}/></mesh><Block x={i.x} y={i.y} w={i.w??8} h={i.h??8} height={0.055} elevation={1.42} color="#52615a"/></>}
   </group>;
  })}
  {/* Four open timber doors sit against jambs, never across passage. */}
  {[{x:780,y:470},{x:1020,y:470},{x:780,y:1020},{x:1020,y:1020}].map((p,i)=><group key={i}>
   <Block x={p.x===780?p.x-55:p.x} y={p.y} w={55} h={8} height={1.4} color="#bd8a50"/>
   <Block x={p.x-6} y={p.y+2} w={12} h={5} height={1.5} color="#886543"/>
  </group>)}
  <Sign x={440} y={76} text="DEV STUDIO"/>
  <Sign x={1360} y={76} text="LOUNGE & GAMES" width={5.8}/>
  <Sign x={420} y={790} text="GYM" elevation={1.1} width={3}/>
  <Sign x={1350} y={790} text="GARDEN & POOL" elevation={1.1} width={5.4}/>
  <Sign x={900} y={-28} text="Dellanio's House" elevation={3.2} width={12} height={1.15}/>
  {/* Reuse tested national flag art, house preference independent of original. */}
  <group position={(()=>{const [x,,z]=toWorld(200,73);return [x,1.35,z] as [number,number,number];})()} scale={3.5}>{nationalFlag==='br'?<BrazilFlagArt/>:<UsaFlagArt/>}</group>
  {/* TV, console controllers and pinball are shared lounge fixtures, not per-agent clones. */}
  <Block x={1400} y={175} w={145} h={25} height={0.7} color="#936a45"/>
  <Block x={1405} y={179} w={135} h={7} height={1.4} elevation={0.7} color="#172e31"/>
  <Block x={1412} y={186} w={120} h={2} height={1.15} elevation={0.82} color="#52bace"/>
  <Sign x={1472} y={189} text="PLAY" width={1.4} height={0.3} elevation={1.45}/>
  <Block x={1440} y={215} w={35} h={18} height={0.12} elevation={0.15} color="#e6e2d8"/>
  <Block x={1610} y={530} w={60} h={85} height={0.75} color="#465e68"/>
  <Block x={1614} y={534} w={52} h={77} height={0.055} elevation={0.78} color="#ac7993"/>
  <Block x={1610} y={528} w={60} h={8} height={0.85} elevation={0.72} color="#d99e43"/>
  <Sign x={1640} y={537} text="PINBALL" width={0.95} height={0.26} elevation={1.1}/>
  {Array.from({length:7},(_,i)=>{const [x,,z]=toWorld(1622+(i%3)*14,550+Math.floor(i/3)*19);return <mesh key={i} position={[x,0.86,z]}><sphereGeometry args={[0.06,8,6]}/><meshStandardMaterial color={i%2?'#ffd156':'#e9646d'}/></mesh>;})}
  {furniture.filter(i=>i.type==='house_shrub').map(i=>{const [x,,z]=toWorld(i.x,i.y);return <group key={i._uid} name="SMALL CORRIDOR SHRUB" position={[x,0.22,z]}><mesh castShadow><icosahedronGeometry args={[0.28,1]}/><meshStandardMaterial color="#61864c"/></mesh></group>;})}
  {/* Blue tiled basin, inset flat water, rim and wide surrounding timber deck. */}
  <Block {...pool} height={0.025} elevation={0.101} color="#075474" name="POOL BASIN"/>
  <Block x={pool.x} y={pool.y} w={pool.w} h={10} height={0.28} elevation={0.105} color="#e5d4b6" name="POOL RIM"/>
  <Block x={pool.x} y={pool.y+pool.h-10} w={pool.w} h={10} height={0.28} elevation={0.105} color="#e5d4b6"/>
  <Block x={pool.x} y={pool.y+10} w={10} h={pool.h-20} height={0.28} elevation={0.105} color="#e5d4b6"/>
  <Block x={pool.x+pool.w-10} y={pool.y+10} w={10} h={pool.h-20} height={0.28} elevation={0.105} color="#e5d4b6"/>
  <Block x={pool.x+10} y={pool.y+10} w={pool.w-20} h={pool.h-20} height={0.015} elevation={0.15} color="#1687ae" name="POOL WATER"/>
  {Array.from({length:16},(_,i)=><Block key={i} x={pool.x+12+i*28} y={pool.y+10} w={1.3} h={pool.h-20} height={0.002} elevation={0.167} color="#83d5e0"/>)}
  {Array.from({length:8},(_,i)=><Block key={i} x={pool.x+10} y={pool.y+12+i*29} w={pool.w-20} h={1.3} height={0.002} elevation={0.167} color="#83d5e0"/>)}
  {(()=>{const [x,,z]=toWorld(1450,1390);return <group position={[x,0.31,z]} name="POOL FLOAT"><mesh rotation={[-Math.PI/2,0,0]} castShadow><torusGeometry args={[0.39,0.13,8,24]}/><meshStandardMaterial color="#ec7cab"/></mesh><mesh position={[0.35,0.25,0]}><capsuleGeometry args={[0.07,0.45,4,8]}/><meshStandardMaterial color="#ef8bb8"/></mesh><mesh position={[0.39,0.54,0]}><sphereGeometry args={[0.11,10,8]}/><meshStandardMaterial color="#ef8bb8"/></mesh></group>;})()}
  {[1120,1210,1300,1390].map(x=><Lounger key={x} x={x} y={940}/>)}<Lounger x={1620} y={1370}/>
  {[1180,1270,1360,1450].map(x=><group key={x}><Block x={x-18} y={460} w={36} h={38} height={0.42} color="#337d7b"/><Block x={x-18} y={493} w={36} h={6} height={0.42} elevation={0.42} color="#235c5c"/></group>)}
  {/* Pergola beams and slatted roof, open sides with reused sofa underneath. */}
  {[1500,1710].flatMap(x=>[860,1010].map(y=><Block key={`${x}:${y}`} x={x} y={y} w={9} h={9} height={2.3} color="#9f7850"/>))}
  {[860,1010].map(y=><Block key={y} x={1490} y={y} w={240} h={10} height={0.13} elevation={2.24} color="#b28a5a"/>)}
  {Array.from({length:9},(_,i)=><Block key={i} x={1490+i*29} y={850} w={8} h={180} height={0.09} elevation={2.36} color="#c5a273"/>)}
  {(()=>{const [x,,z]=toWorld(1650,1190);return <group position={[x,0,z]}><mesh position={[0,1,0]}><cylinderGeometry args={[0.025,0.025,2,8]}/><meshStandardMaterial color="#886949"/></mesh><mesh position={[0,2,0]}><coneGeometry args={[1.15,0.3,8]}/><meshStandardMaterial color="#f4e6c7"/></mesh></group>;})()}
  {[[15,100],[15,420],[15,1000],[15,1450],[1780,160],[1780,520],[1780,1080],[1780,1490]].map(([x,y])=><Tree key={`${x}:${y}`} x={x} y={y}/>)}
  {[[1100,830],[1720,850],[1720,1530],[1050,1520]].map(([x,y])=><Tree key={`${x}:${y}`} x={x} y={y} small/>)}
  {[150,360,570,1100,1330,1550].map(x=><Planter key={x} x={x} y={1530} w={110}/>)}
  {[850,940].map(x=><Planter key={x} x={x} y={120} w={45}/>)}
  <Block x={800} y={1540} w={200} h={45} height={0.10} elevation={-0.10} color="#c8c2ac"/>
  <Block x={800} y={1585} w={200} h={45} height={0.10} elevation={-0.20} color="#c8c2ac"/>
 </group>;
});
