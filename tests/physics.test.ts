import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { PhysicsEngine, PlayerState, physicsReady } from '../src/mono/physics';
import { buildEdges, type BlockData } from '../src/mono/blocks';
import { CONFIG, movementDirection } from '../src/mono/config';
import { SafetyNavigationGraph } from '../src/mono/navigation';
import { corridorBlocks, spawn, doors, doorPosition } from '../src/sceneConfig';

await physicsReady;
const zero = new THREE.Vector3();

test('方块邻接关系隐藏内部接缝，保留共用棱', () => {
  const single: BlockData = { gx: 0, gy: 0, gz: 0, type: 'standard' };
  assert.equal(buildEdges([single]).length, 12);
  const adjacent = buildEdges([single, { ...single, gx: 1 }]);
  assert.equal(adjacent.filter(([a, b]) => a.x === 20 && b.x === 20).length, 0);
  const diagonal = buildEdges([single, { ...single, gx: 1, gy: 1 }]);
  assert.equal(diagonal.filter(([a, b]) => a.x === 20 && b.x === 20 && a.y === 20 && b.y === 20).length, 1);
  assert.equal(buildEdges([{ ...single, type: 'spike' }]).length, 8);
});

test('连续球体检测支撑球体并保留原游戏的跳跃轨迹', () => {
  const physics = new PhysicsEngine(corridorBlocks()); const player = new PlayerState(); player.place(spawn);
  for (let tick = 0; tick < 10; tick += 1) assert.ok(physics.step(player, zero));
  assert.ok(player.grounded); assert.ok(Math.abs(player.pos.y - 40.01) < 0.04);
  const base = player.pos.y; player.jump(true, false);
  let peak = base;
  for (let tick = 0; tick < 35; tick += 1) { physics.step(player, zero); peak = Math.max(peak, player.pos.y); }
  assert.ok(Math.abs(peak - base - 71.925) < 0.15, `jump height ${peak - base}`);
  assert.ok(player.grounded);
  player.jump(true, false); physics.step(player, zero); player.jump(false, true);
  let shortPeak = player.pos.y;
  for (let tick = 0; tick < 35; tick += 1) { physics.step(player, zero); shortPeak = Math.max(shortPeak, player.pos.y); }
  assert.ok(shortPeak - base < 30);
  physics.dispose();
});

test('移动速度按每个物理更新计算，摩擦在每帧生效', () => {
  const physics = new PhysicsEngine(corridorBlocks()); const player = new PlayerState(); player.place(spawn);
  for (let tick = 0; tick < 20; tick += 1) physics.step(player, new THREE.Vector3(0, 0, -CONFIG.moveSpeed));
  assert.ok(player.pos.z < spawn.z - 65); assert.ok(Math.abs(player.vel.z + 5.3694) < 0.01);
  const before = player.vel.z; physics.step(player, zero); assert.ok(Math.abs(player.vel.z - before * 0.82) < 0.001);
  physics.dispose();
});

test('一格间隙允许球体继续下降，尖刺接触返回失败结果', () => {
  const blocks: BlockData[] = [{ gx: -1, gy: 0, gz: 0, type: 'standard' }, { gx: 1, gy: 0, gz: 0, type: 'standard' }];
  const physics = new PhysicsEngine(blocks), player = new PlayerState(); player.place(new THREE.Vector3(0, 80, 0));
  for (let tick = 0; tick < 40; tick += 1) physics.step(player, zero);
  assert.ok(player.pos.y < -100); physics.dispose();
  const hazard = new PhysicsEngine([{ gx: 0, gy: 0, gz: 0, type: 'spike' }]); player.place(new THREE.Vector3(0, 80, 0));
  let safe = true; for (let tick = 0; tick < 30 && safe; tick += 1) safe = hazard.step(player, zero);
  assert.equal(safe, false); hazard.dispose();
});

test('鼠标路径只能进入完整安全地面与门前区域', () => {
  const graph = new SafetyNavigationGraph(corridorBlocks());
  assert.equal(graph.findPath(spawn, new THREE.Vector3(200, 40.02, 0)).length, 0);
  for (const door of doors) {
    const path = graph.findPath(spawn, doorPosition(door)); assert.ok(path.length > 0);
    assert.ok(path.every((point) => graph.isSafe(point.position)));
  }
  const islands = new SafetyNavigationGraph([{ gx: 0, gy: 0, gz: 0, type: 'standard' }, { gx: 3, gy: 0, gz: 0, type: 'standard' }]);
  assert.equal(islands.findPath(new THREE.Vector3(0, 40.02, 0), new THREE.Vector3(120, 40.02, 0)).length, 0);
});

test('三种 WASD 映射保留原游戏方向', () => {
  const left = movementDirection(0, -1, Math.PI / 4, 0); assert.ok(Math.abs(left[0] + 1) < 0.0001 && Math.abs(left[1]) < 0.0001);
  const right = movementDirection(0, -1, Math.PI / 4, 1); assert.ok(Math.abs(right[0]) < 0.0001 && Math.abs(right[1] + 1) < 0.0001);
  const up = movementDirection(0, -1, Math.PI / 4, 2); assert.ok(Math.abs(up[0] + Math.SQRT1_2) < 0.0001 && Math.abs(up[1] + Math.SQRT1_2) < 0.0001);
});

test('跳跃连接通过真实物理路径检查，危险节点不进入导航图', () => {
  const blocks: BlockData[] = [{ gx: 0, gy: 0, gz: 0, type: 'standard' }, { gx: 2, gy: 0, gz: 0, type: 'standard' }];
  const from = new THREE.Vector3(0, 40.02, 0), to = new THREE.Vector3(80, 40.02, 0);
  const graph = new SafetyNavigationGraph(blocks, [{ from, to }]);
  const path = graph.findPath(from, to); assert.ok(path.some((point) => point.jump));
  assert.throws(() => new SafetyNavigationGraph([{ ...blocks[0] }, { ...blocks[1], gx: 20 }], [{ from, to: new THREE.Vector3(800, 40.02, 0) }]), /no safe physical trajectory/);
  const hazardous = new SafetyNavigationGraph([...blocks, { gx: 0, gy: 1, gz: 0, type: 'spike' }]);
  assert.equal(hazardous.isSafe(from), false);
});
