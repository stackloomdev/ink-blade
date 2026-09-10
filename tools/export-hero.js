import * as THREE from '../vendor/three.module.js';
import { GLTFExporter } from './vendor/GLTFExporter.js';
import { Warrior } from '../src/warrior.js';

// A portable, articulated modeling base. The game owns animation and cloth simulation.
export async function exportCharacter(type='player') {
  if(!['player','boss'].includes(type))throw new Error('Choose the hero or White Swordsman to export');
  const warrior = new Warrior(type);
  try{await warrior.ready;}catch(error){warrior.dispose();throw error;}
  warrior.update({type,x:0,y:0,vx:0,vy:0,facing:1,state:'model',t:0,move:'slash1',phase:1,flash:0},0,0);
  warrior.root.rotation.y=0;
  const root=warrior.root.clone(true), remove=[], materials=new Map();
  root.traverse(node=>{
    if(node.userData.noGhost||node.isLineSegments){remove.push(node);return;}
    if(!node.isMesh)return;
    const convert=original=>{
      if(!materials.has(original))materials.set(original,new THREE.MeshStandardMaterial({
        color:original.color,map:original.map,roughness:original===warrior.steel?.34:.86,
        metalness:original===warrior.steel?.65:0,side:original.side,
      }));
      return materials.get(original);
    };
    node.material=Array.isArray(node.material)?node.material.map(convert):convert(node.material);
  });
  remove.forEach(node=>node.removeFromParent());
  root.userData={designReference:`assets/reference/turnarounds/${type==='boss'?'boss':'hero'}-front.png`,
    status:'Textured articulated modeling base; no skin or baked animation clips',
    animationSource:'src/warrior.js',cloth:'Runtime deformation; exported in rest pose'};
  root.updateMatrixWorld(true);
  try{return await new GLTFExporter().parseAsync(root,{binary:true,trs:true});}
  finally{materials.forEach(material=>material.dispose());warrior.dispose();}
}
export const exportHero=()=>exportCharacter('player');
