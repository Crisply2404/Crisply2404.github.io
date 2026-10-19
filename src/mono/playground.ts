import * as THREE from 'three';
import { VisualBuilder } from './objects';
import { blivetBlocks } from '../sceneConfig';

export function createBlivet(builder: VisualBuilder): THREE.Group {
  const group = builder.createLevelMesh(blivetBlocks());
  group.name = 'Blivet';
  return group;
}
