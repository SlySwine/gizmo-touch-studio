import * as THREE from 'three';
import { GLTFLoader } from './vendor/GLTFLoader.js';
import { HDRLoader } from './vendor/HDRLoader.js';

// One asset kit and one lighting environment are shared by all five realms.
export async function loadGardenAssets(renderer) {
  const [kit, hdr] = await Promise.all([
    new GLTFLoader().loadAsync('./assets/dream-kit.glb'),
    new HDRLoader().loadAsync('./assets/world-textures/dusk-environment.hdr'),
  ]);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const environmentTarget = pmrem.fromEquirectangular(hdr);
  hdr.dispose(); pmrem.dispose();
  return { kit: kit.scene, textures: {}, environment: environmentTarget.texture };
}
