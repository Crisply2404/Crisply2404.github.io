import * as THREE from 'three';

export const doorTitleFont = 'Latin Modern Roman';
let fontLoading: Promise<FontFace> | undefined;

function loadFont(): Promise<FontFace> {
  if (!fontLoading) {
    const font = new FontFace(doorTitleFont, 'url(/fonts/lmroman10-regular.otf)', { weight: '400' });
    fontLoading = font.load().then((loaded) => { document.fonts.add(loaded); return loaded; });
  }
  return fontLoading;
}

export class DoorTitle extends THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> {
  public readonly loaded: Promise<void>;
  private disposed = false;

  public constructor(text: string) {
    super(new THREE.PlaneGeometry(0, 0), new THREE.MeshBasicMaterial({
      transparent: true, toneMapped: false, depthWrite: false, side: THREE.DoubleSide,
    }));
    this.name = 'DoorTitle'; this.visible = false;
    const cameraPosition = new THREE.Vector3();
    const inverseGate = new THREE.Matrix4();
    this.onBeforeRender = (_renderer, _scene, camera): void => {
      camera.getWorldPosition(cameraPosition).applyMatrix4(inverseGate.copy(this.parent!.matrixWorld).invert());
      // 同一份文字沿门平面转向，保持背面的阅读方向。
      this.scale.x = cameraPosition.z < 0 ? -1 : 1;
      this.updateMatrix(); this.updateWorldMatrix(false, false);
    };
    this.loaded = this.load(text);
  }

  public dispose(): void {
    this.disposed = true;
    this.geometry.dispose(); this.material.map?.dispose(); this.material.dispose();
  }

  private async load(text: string): Promise<void> {
    await loadFont();
    if (this.disposed) return;
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Door titles require Canvas 2D');
    const setFont = (): void => { context.font = `400 256px "${doorTitleFont}"`; context.fontKerning = 'normal'; };
    setFont();
    const metrics = context.measureText(text);
    const scale = 14 / context.measureText('H').actualBoundingBoxAscent;
    const padding = 4;
    canvas.width = Math.ceil(metrics.actualBoundingBoxLeft + metrics.actualBoundingBoxRight) + padding * 2;
    canvas.height = Math.ceil(metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent) + padding * 2;
    setFont(); context.fillStyle = '#fff';
    context.fillText(text, padding + metrics.actualBoundingBoxLeft, padding + metrics.actualBoundingBoxAscent);
    const texture = new THREE.CanvasTexture(canvas);
    texture.name = `${doorTitleFont}: ${text}`;
    texture.colorSpace = THREE.SRGBColorSpace;
    this.geometry.dispose();
    this.geometry = new THREE.PlaneGeometry(canvas.width * scale, canvas.height * scale);
    this.position.y = 84 + (canvas.height / 2 - padding) * scale;
    this.material.map = texture; this.material.needsUpdate = true; this.visible = true;
  }
}
