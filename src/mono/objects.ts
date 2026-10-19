import * as THREE from 'three';
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';
import type { DoorGraphics } from '../types';
import { CONFIG } from './config';
import { blockCenterY, blockHeight, buildEdges, type BlockData, type Segment } from './blocks';
import { MonoRenderer } from './renderer';
import exitSign from './assets/exit-sign.png';
import transparentExitSign from './icons/exit_sign.svg';
import font32 from './assets/font-32-0.png';
import font64 from './assets/font-64-0.png';
import fontMetrics from './assets/font-metrics.json';
import { DoorTitle } from './door-title';

const flagCorners = [new THREE.Vector3(0, 30, 0), new THREE.Vector3(17, 25, 0), new THREE.Vector3(0, 19, 0)];

export class VisualBuilder {
  public readonly materialBlack = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide });
  private readonly textures = new Set<THREE.Texture>();
  private readonly textureLoads: Promise<void>[] = [];
  private readonly fontTextures = new Map<number, THREE.Texture>();
  private readonly doorTitles = new Set<DoorTitle>();
  public constructor(public readonly rendering: MonoRenderer) {}

  public createLevelMesh(blocks: readonly BlockData[], roundCaps = true): THREE.Group {
    const group = new THREE.Group();
    group.name = 'LevelGroup';
    const standard = blocks.filter((block) => block.type === 'standard');
    const boxes = new THREE.InstancedMesh(new THREE.BoxGeometry(40, 40, 40), this.materialBlack, standard.length);
    boxes.name = 'BlackBlocks';
    standard.forEach((block, index) => boxes.setMatrixAt(index, new THREE.Matrix4().compose(
      new THREE.Vector3(block.gx * 40, blockCenterY(block), block.gz * 40), new THREE.Quaternion(),
      new THREE.Vector3(1, blockHeight(block) / 40, 1))));
    group.add(boxes);
    const spikes = blocks.filter((block) => block.type === 'spike');
    if (spikes.length) {
      const spikeMesh = new THREE.InstancedMesh(this.createSpikeGeometry(), this.materialBlack, spikes.length);
      spikeMesh.name = 'BlackSpikes';
      spikes.forEach((block, index) => spikeMesh.setMatrixAt(index, new THREE.Matrix4().makeTranslation(block.gx * 40, blockCenterY(block) - 20, block.gz * 40)));
      group.add(spikeMesh);
    }
    group.add(this.createStroke(buildEdges(blocks), roundCaps));
    return group;
  }

  public createStroke(segments: readonly Segment[], roundCaps = true): THREE.Mesh {
    if (!segments.length) throw new Error('Stroke requires a segment');
    const positions: number[] = [];
    const directions: number[] = [];
    const uvs: number[] = [];
    const caps: number[] = [];
    const vertex = (point: THREE.Vector3, direction: THREE.Vector3, uv: THREE.Vector2, cap: number): void => {
      positions.push(...point.toArray());
      directions.push(...direction.toArray());
      uvs.push(...uv.toArray());
      caps.push(cap);
    };
    if (roundCaps) {
      const joints = new Map<string, THREE.Vector3>();
      for (const [start, end] of segments) {
        joints.set(start.toArray().join(':'), start);
        joints.set(end.toArray().join(':'), end);
      }
      for (const point of joints.values()) {
        for (let index = 0; index < 24; index += 1) {
          for (const offset of [new THREE.Vector2(), new THREE.Vector2(Math.cos(index * Math.PI / 12), Math.sin(index * Math.PI / 12)),
            new THREE.Vector2(Math.cos((index + 1) * Math.PI / 12), Math.sin((index + 1) * Math.PI / 12))]) {
            vertex(point, new THREE.Vector3(0, 1, 0), offset, 1);
          }
        }
      }
    }
    for (const [start, end] of segments) {
      if (start.equals(end)) throw new Error('Stroke length must be positive');
      const direction = end.clone().sub(start).normalize();
      for (const [index, side] of [[0, -1], [1, -1], [1, 1], [0, -1], [1, 1], [0, 1]]) {
        vertex(index === 0 ? start : end, direction, new THREE.Vector2(side, 0), 0);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('direction', new THREE.Float32BufferAttribute(directions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setAttribute('cap', new THREE.Float32BufferAttribute(caps, 1));
    const mesh = new THREE.Mesh(geometry, this.rendering.stroke);
    mesh.name = 'WhiteEdges';
    mesh.layers.set(1);
    mesh.frustumCulled = false;
    return mesh;
  }

  public createPlayerMesh(): THREE.Group {
    const group = new THREE.Group();
    group.name = 'PlayerMesh';
    const geometry = new THREE.PlaneGeometry(CONFIG.playerRadius * 2, CONFIG.playerRadius * 2);
    const fill = new THREE.Mesh(geometry, this.rendering.playerFill);
    fill.name = 'Fill';
    const outline = new THREE.Mesh(geometry, this.rendering.playerOutline);
    outline.name = 'Outline';
    outline.layers.set(1);
    fill.frustumCulled = outline.frustumCulled = false;
    group.add(fill, outline);
    return group;
  }

  public createGate(text: string, position: THREE.Vector3, angle = 0, completed = false): THREE.Group {
    const group = new THREE.Group();
    group.name = 'Gate';
    group.position.copy(position).add(new THREE.Vector3(0, -CONFIG.playerRadius, 0));
    group.rotation.y = angle;
    if (completed) {
      const panel = new THREE.Mesh(new THREE.PlaneGeometry(58, 72), this.rendering.gatePanel);
      panel.name = 'CompletedInterior';
      panel.position.y = 36;
      panel.frustumCulled = false;
      group.add(panel);
    } else {
      group.add(this.createGateFrame());
    }
    if (text) {
      this.addLabel(group, text, 36, completed ? '#000' : '#fff', 64, 0.35);
    } else {
      const board = new THREE.Mesh(new THREE.BoxGeometry(64, 32, 1.5), this.materialBlack);
      board.name = 'ExitSign';
      board.position.y = 90;
      group.add(board);
      const texture = this.loadTexture(exitSign);
      for (const side of [1, -1]) {
        const face = new THREE.Mesh(new THREE.PlaneGeometry(64, 32), new THREE.MeshBasicMaterial({ map: texture, toneMapped: false }));
        face.name = side === 1 ? 'ExitSignFront' : 'ExitSignBack';
        face.position.set(0, 90, side * 0.81);
        face.rotation.y = side === 1 ? 0 : Math.PI;
        group.add(face);
      }
    }
    return group;
  }

  public createSiteGate(position: THREE.Vector3, angle = 0, graphics?: DoorGraphics): THREE.Group {
    const group = new THREE.Group();
    group.name = 'SiteGate';
    group.position.copy(position).add(new THREE.Vector3(0, -CONFIG.playerRadius, 0));
    group.rotation.y = angle;
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(58, 72), this.rendering.sitePanel);
    panel.name = 'OpaqueInterior'; panel.position.y = 36;
    panel.layers.set(2);
    panel.userData.playerCenterOcclusion = Boolean(graphics);
    group.add(panel);
    group.add(this.createGateFrame());
    if (graphics) {
      if (graphics.title) {
        const title = new DoorTitle(graphics.title);
        this.doorTitles.add(title); this.textureLoads.push(title.loaded); group.add(title);
      }
      const symbol = this.createDoorGraphic(graphics.symbol, 38);
      symbol.name = 'DoorSymbol'; symbol.position.y = 36;
      symbol.material = this.rendering.doorSymbol;
      group.add(symbol);
    } else {
      const face = new THREE.Mesh(new THREE.PlaneGeometry(64, 32), new THREE.MeshBasicMaterial({
        map: this.loadTexture(transparentExitSign), transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
      }));
      face.name = 'ExitGraphic'; face.position.y = 90;
      group.add(face);
    }
    return group;
  }

  private createDoorGraphic(source: string, extent: number): THREE.Mesh {
    const paths = new SVGLoader().parse(source).paths
      .filter((path) => path.userData?.style.stroke && path.userData.style.stroke !== 'none')
      .flatMap((path) => path.subPaths.map((subPath) => subPath.getPoints(32)));
    const bounds = new THREE.Box2().setFromPoints(paths.flat());
    const size = bounds.getSize(new THREE.Vector2());
    const longestSide = Math.max(size.x, size.y);
    if (!Number.isFinite(longestSide) || longestSide <= 0 || extent <= 0) throw new Error('Door graphic requires visible strokes');
    const center = bounds.getCenter(new THREE.Vector2());
    const scale = extent / longestSide;
    const segments: Segment[] = [];
    for (const path of paths) {
      for (let index = 1; index < path.length; index += 1) {
        if (path[index - 1].equals(path[index])) continue;
        const points = [path[index - 1], path[index]].map((point) => new THREE.Vector3(
          (point.x - center.x) * scale, -(point.y - center.y) * scale, 0,
        ));
        segments.push([points[0], points[1]]);
      }
    }
    return this.createStroke(segments);
  }

  public addLabel(group: THREE.Group, text: string, height: number, color = '#fff', fontSize = 64, pixelSize = 0.35): void {
    const geometry = this.createFontGeometry(text, fontSize, pixelSize);
    const material = new THREE.MeshBasicMaterial({
      map: this.loadFontTexture(fontSize), color, transparent: true, toneMapped: false, depthWrite: false, side: THREE.DoubleSide,
    });
    for (const side of [1, -1]) {
      const face = new THREE.Mesh(geometry, material);
      face.name = side === 1 ? 'LevelNumberFront' : 'LevelNumberBack';
      face.position.set(0, height, side * 0.42);
      face.rotation.y = side === 1 ? 0 : Math.PI;
      group.add(face);
    }
  }

  private createFontGeometry(text: string, fontSize: number, pixelSize: number): THREE.BufferGeometry {
    if (fontSize !== 32 && fontSize !== 64) throw new Error('Unsupported MONO TOWER font size');
    const font = fontMetrics[String(fontSize) as '32' | '64'];
    const glyphs = font.glyphs as Record<string, { advance: number; offset: number[]; size: number[]; rect: number[]; texture: number }>;
    const kerning = font.kerning as Record<string, number>;
    const characters = Array.from(text);
    const advances = characters.map((character, index) => {
      const glyph = glyphs[character];
      if (!glyph || glyph.texture > 0) throw new Error(`Unsupported MONO TOWER glyph: ${character}`);
      return glyph.advance - (kerning[character + (characters[index + 1] ?? '')] ?? 0);
    });
    let x = -advances.reduce((sum, advance) => sum + advance, 0) / 2;
    const baseline = font.height / 2 - font.ascent;
    const atlasSize = fontSize === 32 ? 256 : 512;
    const positions: number[] = [];
    const uvs: number[] = [];
    for (const [index, character] of characters.entries()) {
      const glyph = glyphs[character];
      const left = x + glyph.offset[0], top = baseline - glyph.offset[1];
      const right = left + glyph.size[0], bottom = top - glyph.size[1];
      const [u, v, width, glyphHeight] = glyph.rect;
      for (const [px, py, tu, tv] of [
        [left, top, u, v], [left, bottom, u, v + glyphHeight], [right, bottom, u + width, v + glyphHeight],
        [left, top, u, v], [right, bottom, u + width, v + glyphHeight], [right, top, u + width, v],
      ]) {
        positions.push(px * pixelSize, py * pixelSize, 0);
        uvs.push(tu / atlasSize, tv / atlasSize);
      }
      x += advances[index];
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    return geometry;
  }

  private loadFontTexture(fontSize: number): THREE.Texture {
    let texture = this.fontTextures.get(fontSize);
    if (!texture) {
      texture = this.loadTexture(fontSize === 32 ? font32 : font64);
      texture.flipY = false;
      this.fontTextures.set(fontSize, texture);
    }
    return texture;
  }

  public createContactMarker(): THREE.Group {
    const group = new THREE.Group();
    group.name = 'ContactMarker';
    group.rotation.y = Math.PI / 4;
    const points = [[-16, 0, -16], [16, 0, -16], [16, 0, 16], [-16, 0, 16]]
      .map((point) => new THREE.Vector3(...point as [number, number, number]));
    group.add(this.createStroke(points.map((point, index) => [point, points[(index + 1) % 4]])));
    return group;
  }

  public createCheckpoint(position: THREE.Vector3): CheckpointMarker {
    return new CheckpointMarker(this, position);
  }

  public dispose(): void {
    this.materialBlack.dispose();
    for (const title of this.doorTitles) title.dispose();
    for (const texture of this.textures) texture.dispose();
  }

  public async ready(): Promise<void> { await Promise.all(this.textureLoads); }

  private createGateFrame(): THREE.Mesh {
    const points = [new THREE.Vector3(-29, 0, 0), new THREE.Vector3(-29, 72, 0), new THREE.Vector3(29, 72, 0), new THREE.Vector3(29, 0, 0)];
    return this.createStroke([[points[0], points[1]], [points[1], points[2]], [points[2], points[3]]]);
  }

  private loadTexture(url: string): THREE.Texture {
    let resolveTexture!: () => void;
    let rejectTexture!: (reason: unknown) => void;
    this.textureLoads.push(new Promise<void>((resolve, reject) => {
      resolveTexture = resolve;
      rejectTexture = reject;
    }));
    const texture = new THREE.TextureLoader().load(url, resolveTexture, undefined, rejectTexture);
    texture.generateMipmaps = false;
    texture.minFilter = THREE.LinearFilter;
    this.textures.add(texture);
    return texture;
  }

  private createSpikeGeometry(): THREE.BufferGeometry {
    const points = [new THREE.Vector3(20, 0, 20), new THREE.Vector3(20, 0, -20), new THREE.Vector3(-20, 0, -20), new THREE.Vector3(-20, 0, 20)];
    const vertices: number[] = [];
    for (let index = 0; index < 4; index += 1) {
      vertices.push(0, 40, 0, ...points[(index + 1) % 4].toArray(), ...points[index].toArray());
      vertices.push(0, 0, 0, ...points[index].toArray(), ...points[(index + 1) % 4].toArray());
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.computeVertexNormals();
    return geometry;
  }
}

export class CheckpointMarker extends THREE.Group {
  public isActive = false;
  public hiddenByPlayer = false;
  private pulseRemaining = 0;
  private readonly flag: THREE.Mesh;
  private readonly mask: THREE.Mesh;

  public constructor(builder: VisualBuilder, position: THREE.Vector3) {
    super();
    this.name = 'Checkpoint';
    this.position.copy(position).add(new THREE.Vector3(0, -19.2, 0));
    this.rotation.y = Math.PI / 4;
    this.add(builder.createContactMarker().children[0]);
    this.flag = new THREE.Mesh(new THREE.PlaneGeometry(17, 30), builder.rendering.createFlagMaterial());
    this.flag.name = 'FlagGraphic';
    this.flag.layers.set(1);
    this.flag.frustumCulled = false;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(flagCorners.flatMap((point) => point.toArray()), 3));
    this.mask = new THREE.Mesh(geometry, builder.materialBlack);
    this.mask.name = 'FlagMask';
    this.add(this.flag, this.mask);
  }

  public setActive(active: boolean): void {
    if (this.isActive === active) return;
    this.isActive = active;
    this.pulseRemaining = active ? 0.24 : 0;
    this.scale.setScalar(active ? 1.16 : 1);
    (this.flag.material as THREE.ShaderMaterial).uniforms.filled.value = active;
  }

  public update(camera: THREE.OrthographicCamera, players: readonly THREE.Group[], delta: number, viewportHeight: number): void {
    if (this.pulseRemaining > 0) {
      this.pulseRemaining = Math.max(0, this.pulseRemaining - delta);
      this.scale.setScalar(1 + Math.sin((1 - this.pulseRemaining / 0.24) * Math.PI) * 0.16);
    }
    this.updateWorldMatrix(true, false);
    const center = this.getWorldPosition(new THREE.Vector3());
    const worldScale = this.getWorldScale(new THREE.Vector3()).x;
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
    const facingScale = new THREE.Vector3(worldScale, worldScale * Math.abs(up.y), worldScale);
    const world = new THREE.Matrix4().compose(center, camera.quaternion, facingScale);
    const inverse = this.matrixWorld.clone().invert();
    this.flag.matrixAutoUpdate = this.mask.matrixAutoUpdate = false;
    this.flag.matrix.copy(inverse).multiply(world);
    const maskWorld = world.clone().multiply(new THREE.Matrix4().makeTranslation(0, 0, -0.02));
    this.mask.matrix.copy(inverse).multiply(maskWorld);
    this.updateWorldMatrix(true, true);
    this.hiddenByPlayer = false;
    const view = camera.matrixWorldInverse;
    const worldPixel = 2 / (Math.abs(camera.projectionMatrix.elements[5]) * viewportHeight);
    const toView = (point: THREE.Vector3): THREE.Vector3 => point.clone().applyMatrix4(this.flag.matrixWorld).applyMatrix4(view);
    const polygon = flagCorners.map(toView);
    for (const player of players) {
      const playerPosition = player.getWorldPosition(new THREE.Vector3()).applyMatrix4(view);
      const playerScale = player.getWorldScale(new THREE.Vector3()).x;
      const radius = 20 * playerScale + CONFIG.thickness * (playerScale + worldScale) / 2 + worldPixel * 2 + worldScale * 0.02;
      const segments: Segment[] = [[toView(new THREE.Vector3()), polygon[0]], ...polygon.map((point, index): Segment => [point, polygon[(index + 1) % 3]])];
      for (const [start, end] of segments) {
        const depth = Math.max(0, Math.min(start.z, end.z) - playerPosition.z);
        if (depth >= radius) continue;
        const a = new THREE.Vector2(start.x, start.y);
        const edge = new THREE.Vector2(end.x - start.x, end.y - start.y);
        const point = new THREE.Vector2(playerPosition.x, playerPosition.y);
        const amount = THREE.MathUtils.clamp(point.clone().sub(a).dot(edge) / edge.lengthSq(), 0, 1);
        if (a.addScaledVector(edge, amount).distanceToSquared(point) + depth * depth < radius * radius) this.hiddenByPlayer = true;
      }
      const triangle = new THREE.Triangle(new THREE.Vector3(polygon[0].x, polygon[0].y, 0),
        new THREE.Vector3(polygon[1].x, polygon[1].y, 0), new THREE.Vector3(polygon[2].x, polygon[2].y, 0));
      if (polygon[0].z - playerPosition.z < radius && triangle.containsPoint(new THREE.Vector3(playerPosition.x, playerPosition.y, 0))) this.hiddenByPlayer = true;
    }
    this.flag.visible = this.mask.visible = !this.hiddenByPlayer;
  }
}
