import * as THREE from 'three';

export function doorTitleFont(): string { return getComputedStyle(document.documentElement).fontFamily; }
export function doorTitleFontWeight(): number {
  const weight = Number(getComputedStyle(document.documentElement).getPropertyValue('--door-title-font-weight'));
  if (!Number.isFinite(weight) || weight < 1 || weight > 1000) throw new Error('Door title font weight must be between 1 and 1000');
  return weight;
}

export class DoorTitle extends THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> {
  public loaded: Promise<void>;
  private disposed = false;
  private font = '';
  private revision = 0;

  public constructor(text: string) {
    super(new THREE.PlaneGeometry(0, 0), new THREE.MeshBasicMaterial({
      transparent: true, toneMapped: false, depthWrite: false, side: THREE.DoubleSide,
    }));
    this.name = 'DoorTitle'; this.visible = false;
    const cameraPosition = new THREE.Vector3();
    const inverseGate = new THREE.Matrix4();
    this.onBeforeRender = (_renderer, _scene, camera): void => {
      const font = `${doorTitleFontWeight()} 256px ${doorTitleFont()}`;
      if (font !== this.font) this.loaded = this.load(text, font);
      camera.getWorldPosition(cameraPosition).applyMatrix4(inverseGate.copy(this.parent!.matrixWorld).invert());
      // 同一份文字沿门平面转向，保持背面的阅读方向。
      this.scale.x = cameraPosition.z < 0 ? -1 : 1;
      this.updateMatrix(); this.updateWorldMatrix(false, false);
    };
    this.loaded = this.load(text, `${doorTitleFontWeight()} 256px ${doorTitleFont()}`);
  }

  public dispose(): void {
    this.disposed = true;
    this.geometry.dispose(); this.material.map?.dispose(); this.material.dispose();
  }

  private async load(text: string, font: string): Promise<void> {
    this.font = font;
    const revision = ++this.revision;
    await document.fonts.load(font, text);
    if (this.disposed || revision !== this.revision) return;
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Door titles require Canvas 2D');
    const setFont = (): void => { context.font = font; context.fontKerning = 'normal'; };
    setFont();
    const metrics = context.measureText(text);
    const scale = 14 / context.measureText('H').actualBoundingBoxAscent;
    const padding = 4;
    canvas.width = Math.ceil(metrics.actualBoundingBoxLeft + metrics.actualBoundingBoxRight) + padding * 2;
    canvas.height = Math.ceil(metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent) + padding * 2;
    setFont(); context.fillStyle = '#fff';
    context.fillText(text, padding + metrics.actualBoundingBoxLeft, padding + metrics.actualBoundingBoxAscent);
    const texture = new THREE.CanvasTexture(canvas);
    texture.name = `${font}: ${text}`;
    texture.colorSpace = THREE.SRGBColorSpace;
    this.geometry.dispose();
    this.geometry = new THREE.PlaneGeometry(canvas.width * scale, canvas.height * scale);
    this.position.y = 84 + (canvas.height / 2 - padding) * scale;
    this.material.map?.dispose();
    this.material.map = texture; this.material.needsUpdate = true; this.visible = true;
  }
}
