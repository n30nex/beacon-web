import * as THREE from "three";

import type { NetgraphGraph, NetgraphRole } from "./netgraph-model";
import { clamp } from "./netgraph-three-geometry";

const MAX_LABELS = 160;

export function cssColor(element: HTMLElement, name: string, fallback: string): THREE.Color {
  const value = getComputedStyle(element).getPropertyValue(name).trim();
  return new THREE.Color(value || fallback);
}

export function createNetgraphSceneLights(options: {
  atmosphereScale: number;
  lightIntensityScale: number;
  richPacketLighting: boolean;
}): THREE.Light[] {
  const lights: THREE.Light[] = [
    new THREE.AmbientLight(0xffffff, 0.9 * options.lightIntensityScale * (0.72 + options.atmosphereScale * 0.2)),
  ];
  const keyLight = new THREE.DirectionalLight(0xffffff, 2.25 * options.lightIntensityScale);
  keyLight.position.set(24, 44, 84);
  lights.push(keyLight);

  const rimLight = new THREE.DirectionalLight(0x75ccff, 1.2 * options.lightIntensityScale * (0.8 + options.atmosphereScale * 0.2));
  rimLight.position.set(-72, -40, 62);
  lights.push(rimLight);

  if (options.richPacketLighting) {
    const packetFillLight = new THREE.DirectionalLight(0x54e1a6, 0.42 * options.lightIntensityScale * (0.75 + options.atmosphereScale * 0.28));
    packetFillLight.position.set(38, -52, 44);
    lights.push(packetFillLight);
  }
  return lights;
}

export function createReferenceGrid(options: {
  batteryQuality: boolean;
  center: THREE.Vector3;
  muted: THREE.Color;
  narrowViewport: boolean;
  primary: THREE.Color;
  radius: number;
}): THREE.GridHelper {
  const referenceGrid = new THREE.GridHelper(
    options.radius * 3.8,
    options.narrowViewport || options.batteryQuality ? 18 : 30,
    options.primary,
    options.muted,
  );
  referenceGrid.rotation.x = Math.PI / 2;
  referenceGrid.position.set(options.center.x, options.center.y, options.center.z - options.radius * 0.86);
  const referenceGridMaterial = referenceGrid.material as THREE.LineBasicMaterial;
  referenceGridMaterial.transparent = true;
  referenceGridMaterial.opacity = options.batteryQuality ? 0.08 : 0.13;
  referenceGridMaterial.depthWrite = false;
  return referenceGrid;
}

export function createNetgraphSceneStage(options: {
  atmosphereDensity: number;
  backdropTexture?: THREE.Texture | null;
  batteryQuality: boolean;
  bg: THREE.Color;
  cameraDistanceScale: number;
  dustLayerTexture?: THREE.Texture | null;
  graph: NetgraphGraph;
  green: THREE.Color;
  lightIntensityScale: number;
  muted: THREE.Color;
  narrowViewport: boolean;
  primary: THREE.Color;
  reduced: boolean;
  referenceGroup: THREE.Object3D;
  richPacketLighting: boolean;
  scanGridTexture?: THREE.Texture | null;
  scene: THREE.Scene;
  starDensity: number;
  starDriftTexture?: THREE.Texture | null;
  visibleNodeIds: Set<string>;
}): { center: THREE.Vector3; radius: number } {
  const atmosphereScale = clamp(options.atmosphereDensity, 0.25, 2.2);
  const depthSpread = 0.84 + atmosphereScale * 0.18;
  options.scene.add(...createNetgraphSceneLights({
    atmosphereScale,
    lightIntensityScale: options.lightIntensityScale,
    richPacketLighting: options.richPacketLighting,
  }));

  const nodePositions = options.graph.nodes
    .filter((node) => options.visibleNodeIds.has(node.id))
    .map((node) => new THREE.Vector3(node.position.x, node.position.y, node.position.z));
  const box = new THREE.Box3().setFromPoints(nodePositions);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const radius = Math.max(56, Math.max(size.x, size.y, Math.abs(size.z) * 1.3) * 1.16 * options.cameraDistanceScale * depthSpread);

  options.scene.fog = new THREE.Fog(
    options.bg,
    radius * (options.narrowViewport ? 1.06 : 0.86),
    radius * (options.narrowViewport ? 5.2 : 3.8) * (0.88 + atmosphereScale * 0.24),
  );
  options.scene.add(createSpaceBackdrop(
    center,
    radius,
    options.primary,
    options.green,
    options.reduced,
    options.backdropTexture,
    options.starDriftTexture,
    options.scanGridTexture,
    options.dustLayerTexture,
    options.starDensity,
    atmosphereScale,
  ));
  options.referenceGroup.add(createReferenceGrid({
    batteryQuality: options.batteryQuality,
    center,
    muted: options.muted,
    narrowViewport: options.narrowViewport,
    primary: options.primary,
    radius,
  }));

  return { center, radius };
}

export function makeLabelSprite(text: string, color: string): THREE.Sprite {
  const font = "800 28px Inter, ui-sans-serif, system-ui, sans-serif";
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d")!;
  context.font = font;
  const metrics = context.measureText(text);
  canvas.width = Math.min(640, Math.max(180, Math.ceil(metrics.width + 58)));
  canvas.height = 68;
  context.font = font;
  context.textBaseline = "middle";
  context.lineJoin = "round";
  context.lineWidth = 7;
  context.strokeStyle = "rgba(0,0,0,0.94)";
  context.fillStyle = color;
  const plateInset = 6;
  const plateRadius = 14;
  context.beginPath();
  context.roundRect(plateInset, plateInset, canvas.width - plateInset * 2, canvas.height - plateInset * 2, plateRadius);
  context.fillStyle = "rgba(4,10,22,0.84)";
  context.fill();
  context.lineWidth = 3;
  context.strokeStyle = color;
  context.globalAlpha = 0.62;
  context.stroke();
  context.globalAlpha = 1;
  context.lineWidth = 7;
  context.strokeStyle = "rgba(0,0,0,0.94)";
  context.fillStyle = color;
  context.shadowColor = "rgba(0,0,0,0.96)";
  context.shadowBlur = 14;
  context.strokeText(text, 29, canvas.height / 2 + 1);
  context.fillText(text, 29, canvas.height / 2 + 1);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    sizeAttenuation: false,
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(canvas.width / 4200, canvas.height / 4200, 1);
  sprite.renderOrder = 120;
  return sprite;
}

export function createNodeLabelSprites(options: {
  group: THREE.Group;
  graph: NetgraphGraph;
  importantLabels: Set<string>;
  visibleNodeIds: Set<string>;
  selectedNodeId?: string | null;
  searchMatches: Set<string>;
  selectedNodes: Set<string>;
  roleColors: Record<NetgraphRole, string>;
  labelScale: number;
  labelDensity: number;
  labelBudgetScale: number;
  batteryQuality: boolean;
  balancedQuality: boolean;
  denseGraph: boolean;
  narrowViewport: boolean;
}): THREE.Sprite[] {
  const labelCap = options.batteryQuality
    ? (options.narrowViewport ? 14 : 22)
    : options.balancedQuality
      ? (options.narrowViewport ? 18 : 30)
      : options.denseGraph
        ? (options.narrowViewport ? 20 : 34)
        : options.narrowViewport
          ? 28
          : MAX_LABELS;
  const labelIds = Array.from(options.importantLabels).slice(0, Math.max(1, Math.floor(labelCap * options.labelDensity * options.labelBudgetScale)));
  const sprites: THREE.Sprite[] = [];
  for (const id of labelIds) {
    if (!options.visibleNodeIds.has(id)) continue;
    const node = options.graph.nodeById.get(id);
    if (!node) continue;
    const labelColor = options.selectedNodeId === id || options.searchMatches.has(id) || options.selectedNodes.has(id) ? "#ffffff" : options.roleColors[node.role];
    const sprite = makeLabelSprite(node.label, labelColor);
    sprite.scale.multiplyScalar(options.labelScale * (options.denseGraph ? 1.08 : 1.12));
    const labelRadius = node.radius * options.labelScale;
    const labelDrop = labelRadius * (options.narrowViewport ? 2.7 : 2.08) + sprite.scale.y * 0.34;
    sprite.position.set(node.position.x, node.position.y - labelDrop, node.position.z + labelRadius * 1.22 + 8);
    options.group.add(sprite);
    sprites.push(sprite);
  }
  return sprites;
}

function makeNebulaTexture(primary: THREE.Color, green: THREE.Color): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const blooms = [
    { x: 190, y: 240, r: 210, color: primary, alpha: 0.22 },
    { x: 330, y: 190, r: 180, color: green, alpha: 0.16 },
    { x: 300, y: 330, r: 240, color: new THREE.Color("#7b6cff"), alpha: 0.12 },
  ];
  for (const bloom of blooms) {
    const gradient = ctx.createRadialGradient(bloom.x, bloom.y, 0, bloom.x, bloom.y, bloom.r);
    gradient.addColorStop(0, `rgba(${Math.round(bloom.color.r * 255)},${Math.round(bloom.color.g * 255)},${Math.round(bloom.color.b * 255)},${bloom.alpha})`);
    gradient.addColorStop(0.48, `rgba(${Math.round(bloom.color.r * 255)},${Math.round(bloom.color.g * 255)},${Math.round(bloom.color.b * 255)},${bloom.alpha * 0.22})`);
    gradient.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function createSpaceBackdrop(
  center: THREE.Vector3,
  radius: number,
  primary: THREE.Color,
  green: THREE.Color,
  reduced: boolean,
  backdropTexture?: THREE.Texture | null,
  starDriftTexture?: THREE.Texture | null,
  scanGridTexture?: THREE.Texture | null,
  dustLayerTexture?: THREE.Texture | null,
  starDensity = 1,
  atmosphereDensity = 1,
): THREE.Group {
  const group = new THREE.Group();
  const density = clamp(starDensity, 0.2, 2);
  const atmosphere = clamp(atmosphereDensity, 0.25, 2.4);
  const atmosphereFactor = 0.35 + Math.max(0, atmosphere - 1) * 0.26;
  if (backdropTexture) {
    backdropTexture.colorSpace = THREE.SRGBColorSpace;
    const backdropGeometry = new THREE.SphereGeometry(radius * 3.4, 24, 16);
    const backdropMaterial = new THREE.MeshBasicMaterial({
      map: backdropTexture,
      side: THREE.BackSide,
      transparent: false,
      depthWrite: false,
      toneMapped: false,
    });
    const backdropMesh = new THREE.Mesh(backdropGeometry, backdropMaterial);
    backdropMesh.position.copy(center);
    backdropMesh.renderOrder = -45;
    group.add(backdropMesh);
  }

  if (!reduced && starDriftTexture) {
    const drift = new THREE.Sprite(new THREE.SpriteMaterial({
      map: starDriftTexture,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      opacity: 0.22 * (0.7 + atmosphereFactor * 0.5),
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    }));
    drift.position.copy(center);
    drift.position.z -= radius * 2.4;
    drift.scale.set(radius * 4.4, radius * 4.2, 1);
    drift.renderOrder = -20;
    drift.center.set(0.5, 0.5);
    group.add(drift);
  }

  if (!reduced && scanGridTexture) {
    const scanGrid = new THREE.Sprite(new THREE.SpriteMaterial({
      map: scanGridTexture,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      opacity: 0.15 * (0.8 + atmosphereFactor * 0.4),
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    }));
    scanGrid.position.copy(center);
    scanGrid.position.z -= radius * 2.06;
    scanGrid.scale.set(radius * 3.9, radius * 3.1, 1);
    scanGrid.renderOrder = -28;
    scanGrid.center.set(0.5, 0.5);
    group.add(scanGrid);
  }

  if (!reduced && dustLayerTexture) {
    const dust = new THREE.Sprite(new THREE.SpriteMaterial({
      map: dustLayerTexture,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      opacity: 0.08 * (0.9 + atmosphereFactor * 0.4),
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    }));
    dust.position.copy(center);
    dust.position.z -= radius * 2.1;
    dust.scale.set(radius * 5.5, radius * 4.1, 1);
    dust.renderOrder = -29;
    dust.center.set(0.5, 0.5);
    group.add(dust);
  }

  const starCount = Math.max(1, Math.round((reduced ? 120 : 360) * density * (0.76 + atmosphereFactor)));
  const positions = new Float32Array(starCount * 3);
  const colors = new Float32Array(starCount * 3);
  const shell = radius * 4.8;
  const starColor = new THREE.Color();
  for (let index = 0; index < starCount; index += 1) {
    const theta = index * 2.399963229728653;
    const y = 1 - ((index + 0.5) / starCount) * 2;
    const ring = Math.sqrt(Math.max(0, 1 - y * y));
    const jitter = 0.72 + ((Math.sin(index * 78.233) + 1) / 2) * 0.36;
    positions[index * 3] = center.x + Math.cos(theta) * ring * shell * jitter;
    positions[index * 3 + 1] = center.y + y * shell * jitter;
    positions[index * 3 + 2] = center.z + Math.sin(theta) * ring * shell * jitter;
    starColor.set(index % 5 === 0 ? primary : index % 7 === 0 ? green : "#9aa6bb").lerp(new THREE.Color("#ffffff"), index % 11 === 0 ? 0.32 : 0.08);
    colors[index * 3] = starColor.r;
    colors[index * 3 + 1] = starColor.g;
    colors[index * 3 + 2] = starColor.b;
  }
  const starGeometry = new THREE.BufferGeometry();
  starGeometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  starGeometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  const stars = new THREE.Points(
    starGeometry,
    new THREE.PointsMaterial({
      size: (reduced ? 0.75 : 1.05) * (0.86 + atmosphereFactor * 0.35),
      vertexColors: true,
      transparent: true,
      opacity: (reduced ? 0.22 : 0.34) * (0.72 + atmosphereFactor * 0.28),
      depthWrite: false,
    }),
  );
  stars.renderOrder = -20;
  group.add(stars);

  if (!reduced) {
    const nebula = new THREE.Sprite(new THREE.SpriteMaterial({
      map: makeNebulaTexture(primary, green),
      transparent: true,
      opacity: 0.42 * (0.72 + atmosphereFactor * 0.28),
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
    }));
    nebula.position.set(center.x - radius * 0.5, center.y + radius * 0.12, center.z - radius * 2.2);
    nebula.scale.set(radius * (4.4 + atmosphereFactor * 0.8), radius * (2.6 + atmosphereFactor * 0.45), 1);
    nebula.renderOrder = -30;
    group.add(nebula);
  }
  return group;
}
