import * as THREE from 'three';

const SIZE = 160;
const PADDING = 3;
const DILATION = 4;
const HALO_PLATEAU = .04;
const HALO_EXTENT = .22;

/**
 * Bake the lowest vertical hit against the original, tilted hat geometry.
 * Mesh transforms are intentionally ignored: callers sample with the live hat
 * translation removed. RG stores a 16-bit height, B collision coverage, and A
 * stores compression pressure, including a soft halo outside that footprint.
 */
export function createHatContactMap(hatMeshes) {
  const started = performance.now();
  const meshes = hatMeshes.filter(mesh => mesh.geometry?.attributes?.position);
  const min = new THREE.Vector3(Infinity, Infinity, Infinity);
  const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
  let vertexCount = 0;
  for (const mesh of meshes) {
    const position = mesh.geometry.attributes.position;
    vertexCount += position.count;
    for (let i = 0; i < position.count; i++) {
      const x = position.getX(i), y = position.getY(i), z = position.getZ(i);
      if (!Number.isFinite(x + y + z)) throw new Error('Hat geometry contains non-finite vertices.');
      min.x = Math.min(min.x, x); min.y = Math.min(min.y, y); min.z = Math.min(min.z, z);
      max.x = Math.max(max.x, x); max.y = Math.max(max.y, y); max.z = Math.max(max.z, z);
    }
  }
  if (!vertexCount || max.x - min.x < 1e-8 || max.z - min.z < 1e-8) {
    throw new Error('Hat geometry needs a non-empty X/Z footprint.');
  }

  // Leave room for the hard footprint expansion, the world-space pressure halo,
  // and a final empty border so the halo reaches zero before the texture edge.
  const border = PADDING + DILATION;
  const texelX = (max.x - min.x + HALO_EXTENT * 2) / (SIZE - border * 2);
  const texelZ = (max.z - min.z + HALO_EXTENT * 2) / (SIZE - border * 2);
  const bounds = new THREE.Vector4(min.x - texelX * border - HALO_EXTENT,
    min.z - texelZ * border - HALO_EXTENT,
    texelX * SIZE, texelZ * SIZE);
  const heightRange = new THREE.Vector2(min.y, Math.max(max.y - min.y, 1e-6));
  let heights = new Float32Array(SIZE * SIZE).fill(Infinity);
  let covered = new Uint8Array(SIZE * SIZE);
  let triangleCount = 0, projectedTriangleCount = 0;

  for (const mesh of meshes) {
    const position = mesh.geometry.attributes.position, index = mesh.geometry.index;
    const count = index ? index.count : position.count;
    for (let i = 0; i + 2 < count; i += 3) {
      triangleCount++;
      const ia = index ? index.getX(i) : i;
      const ib = index ? index.getX(i + 1) : i + 1;
      const ic = index ? index.getX(i + 2) : i + 2;
      const ax = position.getX(ia), ay = position.getY(ia), az = position.getZ(ia);
      const bx = position.getX(ib), by = position.getY(ib), bz = position.getZ(ib);
      const cx = position.getX(ic), cy = position.getY(ic), cz = position.getZ(ic);
      const determinant = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
      if (Math.abs(determinant) < 1e-12) continue;
      projectedTriangleCount++;
      const inverse = 1 / determinant;
      const x0 = Math.max(0, Math.ceil((Math.min(ax, bx, cx) - bounds.x) / texelX - .5));
      const x1 = Math.min(SIZE - 1, Math.floor((Math.max(ax, bx, cx) - bounds.x) / texelX - .5));
      const z0 = Math.max(0, Math.ceil((Math.min(az, bz, cz) - bounds.y) / texelZ - .5));
      const z1 = Math.min(SIZE - 1, Math.floor((Math.max(az, bz, cz) - bounds.y) / texelZ - .5));
      for (let iz = z0; iz <= z1; iz++) {
        const z = bounds.y + (iz + .5) * texelZ;
        for (let ix = x0; ix <= x1; ix++) {
          const x = bounds.x + (ix + .5) * texelX;
          const u = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) * inverse;
          const v = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) * inverse;
          const w = 1 - u - v;
          if (u < -1e-7 || v < -1e-7 || w < -1e-7) continue;
          const offset = iz * SIZE + ix, y = u * ay + v * by + w * cy;
          if (y < heights[offset]) heights[offset] = y;
          covered[offset] = 1;
        }
      }
    }
  }

  const sourceCoveredTexels = covered.reduce((sum, value) => sum + value, 0);
  if (!sourceCoveredTexels) throw new Error('Hat geometry has no rasterizable underside.');

  // Expand the collision footprint, assigning newly covered cells the lowest
  // adjacent hit. Existing samples retain their actual mesh-derived heights.
  for (let pass = 0; pass < DILATION; pass++) {
    const nextHeights = heights.slice(), nextCovered = covered.slice();
    for (let z = 0; z < SIZE; z++) {
      for (let x = 0; x < SIZE; x++) {
        const offset = z * SIZE + x;
        if (covered[offset]) continue;
        let lowest = Infinity;
        for (let dz = -1; dz <= 1; dz++) {
          const nz = z + dz;
          if (nz < 0 || nz >= SIZE) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx;
            if (nx < 0 || nx >= SIZE) continue;
            const neighbor = nz * SIZE + nx;
            if (covered[neighbor]) lowest = Math.min(lowest, heights[neighbor]);
          }
        }
        if (Number.isFinite(lowest)) {
          nextHeights[offset] = lowest;
          nextCovered[offset] = 1;
        }
      }
    }
    heights = nextHeights;
    covered = nextCovered;
  }

  // Extend valid heights through every uncovered texel without extending its
  // coverage. Linear sampling at the mask edge can never blend with zero/NaN.
  const queue = new Int32Array(SIZE * SIZE), filled = covered.slice();
  let head = 0, tail = 0;
  for (let i = 0; i < covered.length; i++) if (covered[i]) queue[tail++] = i;
  const coveredTexels = tail;
  while (head < tail) {
    const offset = queue[head++], x = offset % SIZE, z = Math.floor(offset / SIZE);
    const neighbors = [x > 0 ? offset - 1 : -1, x < SIZE - 1 ? offset + 1 : -1,
      z > 0 ? offset - SIZE : -1, z < SIZE - 1 ? offset + SIZE : -1];
    for (const neighbor of neighbors) {
      if (neighbor < 0 || filled[neighbor]) continue;
      filled[neighbor] = 1;
      heights[neighbor] = heights[offset];
      queue[tail++] = neighbor;
    }
  }

  // Two-pass, eight-neighbor chamfer distance in world units. This inexpensive
  // Euclidean approximation keeps the halo isotropic despite rectangular texels.
  const distance = new Float32Array(SIZE * SIZE);
  for (let i = 0; i < covered.length; i++) distance[i] = covered[i] ? 0 : Infinity;
  const diagonal = Math.hypot(texelX, texelZ);
  for (let z = 0; z < SIZE; z++) {
    for (let x = 0; x < SIZE; x++) {
      const i = z * SIZE + x;
      if (covered[i]) continue;
      let d = distance[i];
      if (x > 0) d = Math.min(d, distance[i - 1] + texelX);
      if (z > 0) {
        d = Math.min(d, distance[i - SIZE] + texelZ);
        if (x > 0) d = Math.min(d, distance[i - SIZE - 1] + diagonal);
        if (x < SIZE - 1) d = Math.min(d, distance[i - SIZE + 1] + diagonal);
      }
      distance[i] = d;
    }
  }
  for (let z = SIZE - 1; z >= 0; z--) {
    for (let x = SIZE - 1; x >= 0; x--) {
      const i = z * SIZE + x;
      if (covered[i]) continue;
      let d = distance[i];
      if (x < SIZE - 1) d = Math.min(d, distance[i + 1] + texelX);
      if (z < SIZE - 1) {
        d = Math.min(d, distance[i + SIZE] + texelZ);
        if (x > 0) d = Math.min(d, distance[i + SIZE - 1] + diagonal);
        if (x < SIZE - 1) d = Math.min(d, distance[i + SIZE + 1] + diagonal);
      }
      distance[i] = d;
    }
  }

  const data = new Uint8Array(SIZE * SIZE * 4);
  let pressureTexels = 0;
  for (let i = 0; i < heights.length; i++) {
    // Rounding down is conservative: quantization cannot raise the ceiling.
    const height = Math.max(0, Math.min(65535,
      Math.floor((heights[i] - heightRange.x) / heightRange.y * 65535)));
    data[i * 4] = height >>> 8;
    data[i * 4 + 1] = height & 255;
    data[i * 4 + 2] = covered[i] ? 255 : 0;
    const fade = Math.max(0, Math.min(1, (distance[i] - HALO_PLATEAU) / (HALO_EXTENT - HALO_PLATEAU)));
    data[i * 4 + 3] = Math.round((1 - fade * fade * (3 - 2 * fade)) * 255);
    if (data[i * 4 + 3]) pressureTexels++;
  }
  const texture = new THREE.DataTexture(data, SIZE, SIZE, THREE.RGBAFormat, THREE.UnsignedByteType);
  texture.name = 'Gizmo actual hat underside';
  texture.minFilter = texture.magFilter = THREE.LinearFilter;
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.generateMipmaps = false;
  texture.flipY = false;
  texture.colorSpace = THREE.NoColorSpace;
  texture.unpackAlignment = 1;
  texture.needsUpdate = true;

  const map = {
    texture, bounds, heightRange,
    center: new THREE.Vector3().addVectors(min, max).multiplyScalar(.5),
    metadata: {
      size: SIZE, paddingTexels: PADDING, dilationTexels: DILATION,
      haloPlateau: HALO_PLATEAU, haloExtent: HALO_EXTENT,
      haloDistanceMethod: '8-neighbor chamfer in world units', pressureTexels,
      vertexCount, triangleCount, projectedTriangleCount, sourceCoveredTexels,
      coveredTexels, texelSize: [texelX, texelZ], heightPrecision: heightRange.y / 65535,
      buildMilliseconds: performance.now() - started,
    },
  };
  map.sample = (x, z) => sampleHatContact(map, x, z);
  return map;
}

/** CPU equivalent of the shader's linear texture sample; outside bounds is null. */
export function sampleHatContact(map, x, z) {
  const { bounds, heightRange, texture } = map;
  const u = (x - bounds.x) / bounds.z, v = (z - bounds.y) / bounds.w;
  if (!Number.isFinite(u + v) || u < 0 || u > 1 || v < 0 || v > 1) return null;
  const { data, width, height } = texture.image;
  const px = u * width - .5, pz = v * height - .5;
  const ix = Math.floor(px), iz = Math.floor(pz), fx = px - ix, fz = pz - iz;
  let encodedHeight = 0, coverage = 0, pressure = 0;
  for (let dz = 0; dz <= 1; dz++) {
    const tz = Math.max(0, Math.min(height - 1, iz + dz));
    for (let dx = 0; dx <= 1; dx++) {
      const tx = Math.max(0, Math.min(width - 1, ix + dx));
      const offset = (tz * width + tx) * 4;
      const weight = (dx ? fx : 1 - fx) * (dz ? fz : 1 - fz);
      encodedHeight += (data[offset] * 256 + data[offset + 1]) * weight;
      coverage += data[offset + 2] / 255 * weight;
      pressure += data[offset + 3] / 255 * weight;
    }
  }
  return { height: heightRange.x + encodedHeight / 65535 * heightRange.y,
    coverage, covered: coverage > .5, pressure };
}
