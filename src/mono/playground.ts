import * as THREE from 'three';
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';
import { VisualBuilder } from './objects';
import { PenroseLoop } from './penrose';
import { BlivetSpace } from './blivet';
import blivetSource from './assets/blivet.svg?raw';

export class PlaygroundVisual extends THREE.Group {
  public readonly stairs: THREE.Mesh;
  public readonly blivet: THREE.Mesh;
  private stairStroke!: THREE.Mesh;
  private blivetStroke!: THREE.Mesh;
  private angle = Number.NaN;
  private readonly outlines: THREE.Vector2[][];
  private readonly patches: THREE.Vector2[][];

  public constructor(private readonly builder: VisualBuilder, public readonly penrose: PenroseLoop,
    public readonly space: BlivetSpace) {
    super(); this.name = 'IllusionObjects';
    this.outlines = new SVGLoader().parse(blivetSource).paths.flatMap((path) => path.subPaths.map((subpath) =>
      subpath.getPoints(48).map((point) => new THREE.Vector2(point.x, -point.y))));
    this.patches = [
      [[34, 40], [480, 40], [500, 80], [34, 80]],
      [[34, 120], [420, 120], [420, 160], [34, 160]],
      [[34, 200], [500, 200], [500, 240], [34, 240]],
      [[340, 80], [500, 80], [440, 120], [340, 120]],
      [[340, 160], [440, 160], [440, 200], [340, 200]],
      [[440, 120], [440, 200], [420, 160], [420, 120]],
      [[440, 80], [500, 80], [500, 240], [440, 240]],
    ].map((polygon) => polygon.map(([x, y]) => new THREE.Vector2(x, y)));
    this.stairs = new THREE.Mesh(new THREE.BufferGeometry(), builder.materialBlack);
    this.stairs.name = 'PenroseStairs'; this.stairs.frustumCulled = false;
    this.blivet = new THREE.Mesh(new THREE.BufferGeometry(), builder.materialBlack);
    this.blivet.name = 'Blivet'; this.blivet.frustumCulled = false;
    this.add(this.stairs, this.blivet); this.update(Math.PI / 4);
  }

  public update(angle: number): void {
    if (Math.abs(angle - this.angle) < 0.000001) return;
    this.angle = angle;
    const stair = this.penrose.geometry(angle);
    this.stairs.geometry.setAttribute('position', new THREE.Float32BufferAttribute(stair.positions, 3));
    this.stairs.geometry.computeVertexNormals(); this.stairs.geometry.computeBoundingSphere();
    if (this.stairStroke) { this.remove(this.stairStroke); this.stairStroke.geometry.dispose(); }
    this.stairStroke = this.builder.createStroke(stair.segments); this.stairStroke.name = 'PenroseEdges'; this.add(this.stairStroke);
    const fill: number[] = [];
    for (const polygon of [...this.patches, ...this.outlines.slice(0, 3)]) {
      const contour = polygon.slice();
      if (contour[0].equals(contour.at(-1)!)) contour.pop();
      for (const triangle of THREE.ShapeUtils.triangulateShape(contour, [])) {
        for (const index of triangle) fill.push(...this.space.artToWorld(contour[index], angle, 59.95).toArray());
      }
    }
    this.blivet.geometry.setAttribute('position', new THREE.Float32BufferAttribute(fill, 3));
    this.blivet.geometry.computeVertexNormals(); this.blivet.geometry.computeBoundingSphere();
    if (this.blivetStroke) { this.remove(this.blivetStroke); this.blivetStroke.geometry.dispose(); }
    this.blivetStroke = this.builder.createStroke(this.space.outline(this.outlines, angle));
    this.blivetStroke.name = 'BlivetEdges'; this.add(this.blivetStroke);
  }
}
