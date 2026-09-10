import * as THREE from '../vendor/three.module.js';
import { GLTFExporter } from './vendor/GLTFExporter.js';
import { Warrior } from '../src/warrior.js';

// A portable, articulated modeling base. The game owns animation and cloth simulation.
export async function exportHero() {
  const warrior = new Warrior('player');
  warrior.update({type:'player',x:0,y:0,vx:0,vy:0,facing:1,state:'idle',t:0,move:'slash1',phase:1,flash:0},0,0);
  warrior.root.rotation.y=0;
  const root=warrior.root.clone(true), remove=[], materials=new Map();
  root.traverse(node=>{
    if(node.userData.noGhost||node.isLineSegments){remove.push(node);return;}
    if(!node.isMesh)return;
    const original=node.material;
    if(!materials.has(original))materials.set(original,new THREE.MeshStandardMaterial({
      color:original.color,map:original.map,roughness:original===warrior.steel?.34:.86,
      metalness:original===warrior.steel?.65:0,side:original.side,
    }));
    node.material=materials.get(original);
  });
  remove.forEach(node=>node.removeFromParent());
  root.userData={designReference:'assets/reference/hero-direction.png',
    status:'Articulated reference blockout, not a finished skinned character',
    animationSource:'src/warrior.js',cloth:'Runtime deformation; exported in rest pose'};
  root.updateMatrixWorld(true);
  try{return await new GLTFExporter().parseAsync(root,{binary:true,trs:true});}
  finally{materials.forEach(material=>material.dispose());warrior.dispose();}
}
