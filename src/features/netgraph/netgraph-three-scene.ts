import * as THREE from "three";

import type { NetgraphGraph, NetgraphRole } from "./netgraph-model";
import { NETGRAPH_GLOBE_RADIUS, projectLatLngToSphere } from "./netgraph-geo";
import { NATURAL_EARTH_110M_LAND_OUTLINES } from "./natural-earth-110m";
import { clamp } from "./netgraph-three-geometry";

const MAX_LABELS = 3200;

export function routeCountLabelScale(routeCount: number, maxRouteCount: number, denseGraph: boolean): number {
  const maxWeight = Math.max(1, Math.log1p(Math.max(0, maxRouteCount)));
  const routeWeight = Math.log1p(Math.max(0, routeCount));
  const normalized = clamp(routeWeight / maxWeight, 0, 1);
  const base = denseGraph ? 0.88 : 0.92;
  const lift = denseGraph ? 0.28 : 0.38;
  return base + normalized * lift;
}

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
    new THREE.AmbientLight(0xffffff, 0.82 * options.lightIntensityScale * (0.74 + options.atmosphereScale * 0.18)),
  ];
  const keyLight = new THREE.DirectionalLight(0xffffff, 2.42 * options.lightIntensityScale);
  keyLight.position.set(30, 52, 92);
  lights.push(keyLight);

  const rimLight = new THREE.DirectionalLight(0x75ccff, 1.42 * options.lightIntensityScale * (0.78 + options.atmosphereScale * 0.22));
  rimLight.position.set(-86, -44, 70);
  lights.push(rimLight);

  const underLight = new THREE.DirectionalLight(0x54e1a6, 0.32 * options.lightIntensityScale * (0.72 + options.atmosphereScale * 0.18));
  underLight.position.set(36, -58, 28);
  lights.push(underLight);

  if (options.richPacketLighting) {
    const packetFillLight = new THREE.DirectionalLight(0xffd166, 0.36 * options.lightIntensityScale * (0.72 + options.atmosphereScale * 0.24));
    packetFillLight.position.set(-34, 48, 40);
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
    options.radius * 4.2,
    options.narrowViewport || options.batteryQuality ? 16 : 28,
    options.primary,
    options.muted,
  );
  referenceGrid.rotation.x = Math.PI / 2;
  referenceGrid.position.set(options.center.x, options.center.y, options.center.z - options.radius * 0.96);
  const referenceGridMaterial = referenceGrid.material as THREE.LineBasicMaterial;
  referenceGridMaterial.transparent = true;
  referenceGridMaterial.opacity = options.batteryQuality ? 0.055 : 0.105;
  referenceGridMaterial.depthWrite = false;
  return referenceGrid;
}

export function createAbstractGlobe(options: {
  atmosphereDensity: number;
  batteryQuality: boolean;
  globeRadius?: number;
  green: THREE.Color;
  primary: THREE.Color;
  reduced: boolean;
}): THREE.Group {
  const radius = options.globeRadius ?? NETGRAPH_GLOBE_RADIUS;
  const group = new THREE.Group();
  group.name = "netgraph-geo-globe";

  const surface = new THREE.Mesh(
    new THREE.SphereGeometry(radius, options.batteryQuality ? 40 : 72, options.batteryQuality ? 24 : 48),
    new THREE.MeshPhongMaterial({
      color: options.primary.clone().lerp(options.green, 0.22),
      emissive: options.primary.clone().multiplyScalar(0.08),
      emissiveIntensity: 0.7,
      transparent: true,
      opacity: options.batteryQuality ? 0.035 : 0.055,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  surface.renderOrder = -1;
  group.add(surface);

  const atmosphere = new THREE.Mesh(
    new THREE.SphereGeometry(radius * 1.045, options.batteryQuality ? 32 : 56, options.batteryQuality ? 20 : 38),
    new THREE.MeshBasicMaterial({
      color: options.primary,
      transparent: true,
      opacity: (options.batteryQuality ? 0.025 : 0.052) * clamp(options.atmosphereDensity, 0.4, 1.8),
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.BackSide,
    }),
  );
  atmosphere.renderOrder = -2;
  group.add(atmosphere);

  const graticule = new THREE.BufferGeometry();
  const graticulePositions: number[] = [];
  const latitudeStep = options.batteryQuality ? 30 : 20;
  const longitudeStep = options.batteryQuality ? 30 : 20;
  const segmentStep = options.batteryQuality ? 10 : 6;
  for (let latitude = -60; latitude <= 60; latitude += latitudeStep) {
    for (let longitude = -180; longitude < 180; longitude += segmentStep) {
      pushGeoSegment(graticulePositions, latitude, longitude, latitude, longitude + segmentStep, radius * 1.003);
    }
  }
  for (let longitude = -180; longitude < 180; longitude += longitudeStep) {
    for (let latitude = -90; latitude < 90; latitude += segmentStep) {
      pushGeoSegment(graticulePositions, latitude, longitude, latitude + segmentStep, longitude, radius * 1.003);
    }
  }
  graticule.setAttribute("position", new THREE.Float32BufferAttribute(graticulePositions, 3));
  const graticuleLines = new THREE.LineSegments(graticule, new THREE.LineBasicMaterial({
    color: options.primary,
    transparent: true,
    opacity: options.batteryQuality ? 0.045 : 0.075,
    depthWrite: false,
  }));
  graticuleLines.renderOrder = 0;
  group.add(graticuleLines);

  if (!options.batteryQuality) {
    const landPositions: number[] = [];
    for (const ring of NATURAL_EARTH_110M_LAND_OUTLINES) {
      for (let index = 0; index < ring.length - 1; index += 1) {
        const start = ring[index]!;
        const end = ring[index + 1]!;
        if (Math.abs(end[0] - start[0]) > 180) continue;
        pushGeoSegment(landPositions, start[1], start[0], end[1], end[0], radius * 1.007);
      }
    }
    const landGeometry = new THREE.BufferGeometry();
    landGeometry.setAttribute("position", new THREE.Float32BufferAttribute(landPositions, 3));
    const land = new THREE.LineSegments(landGeometry, new THREE.LineBasicMaterial({
      color: options.green.clone().lerp(options.primary, 0.32),
      transparent: true,
      opacity: options.reduced ? 0.12 : 0.22,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }));
    land.renderOrder = 1;
    group.add(land);
  }

  return group;
}

function pushGeoSegment(
  values: number[],
  startLat: number,
  startLng: number,
  endLat: number,
  endLng: number,
  radius: number,
): void {
  const start = projectLatLngToSphere(startLat, startLng, radius);
  const end = projectLatLngToSphere(endLat, endLng, radius);
  values.push(start.x, start.y, start.z, end.x, end.y, end.z);
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
  const geoMode = options.graph.layoutMode === "geo";
  const center = geoMode ? new THREE.Vector3() : box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const radius = geoMode
    ? options.graph.globeRadius * (options.graph.locationStats.unlocated > 0 ? 1.92 : 1.45) * options.cameraDistanceScale
    : Math.max(options.narrowViewport ? 42 : 38, Math.max(size.x, size.y, Math.abs(size.z) * 1.3) * 1.16 * options.cameraDistanceScale * depthSpread);

  options.scene.fog = new THREE.Fog(
    options.bg,
    radius * (geoMode ? 1.34 : options.narrowViewport ? 1.06 : 0.86),
    radius * (geoMode ? 5.6 : options.narrowViewport ? 5.2 : 3.8) * (0.88 + atmosphereScale * 0.24),
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
  if (geoMode) {
    options.referenceGroup.add(createAbstractGlobe({
      atmosphereDensity: options.atmosphereDensity,
      batteryQuality: options.batteryQuality,
      globeRadius: options.graph.globeRadius,
      green: options.green,
      primary: options.primary,
      reduced: options.reduced,
    }));
  } else {
    options.referenceGroup.add(createReferenceGrid({
      batteryQuality: options.batteryQuality,
      center,
      muted: options.muted,
      narrowViewport: options.narrowViewport,
      primary: options.primary,
      radius,
    }));
  }

  return { center, radius };
}

type LabelTier = "primary" | "secondary";

export function makeLabelSprite(text: string, color: string, tier: LabelTier = "primary"): THREE.Sprite {
  const primary = tier === "primary";
  const font = primary
    ? "800 27px Inter, ui-sans-serif, system-ui, sans-serif"
    : "750 17px Inter, ui-sans-serif, system-ui, sans-serif";
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d")!;
  context.font = font;
  const metrics = context.measureText(text);
  canvas.width = Math.min(primary ? 640 : 420, Math.max(primary ? 180 : 96, Math.ceil(metrics.width + (primary ? 58 : 28))));
  canvas.height = primary ? 68 : 38;
  context.font = font;
  context.textBaseline = "middle";
  context.lineJoin = "round";
  context.lineWidth = primary ? 6 : 4;
  context.strokeStyle = "rgba(0,0,0,0.94)";
  context.fillStyle = color;
  const plateInset = primary ? 6 : 3;
  const plateRadius = primary ? 8 : 5;
  context.beginPath();
  context.roundRect(plateInset, plateInset, canvas.width - plateInset * 2, canvas.height - plateInset * 2, plateRadius);
  context.fillStyle = primary ? "rgba(4,10,22,0.78)" : "rgba(4,10,22,0.52)";
  context.fill();
  context.lineWidth = primary ? 2 : 1.25;
  context.strokeStyle = color;
  context.globalAlpha = primary ? 0.54 : 0.34;
  context.stroke();
  context.globalAlpha = 1;
  context.lineWidth = primary ? 6 : 4;
  context.strokeStyle = "rgba(0,0,0,0.94)";
  context.fillStyle = color;
  context.shadowColor = "rgba(0,0,0,0.96)";
  context.shadowBlur = primary ? 14 : 8;
  const textX = primary ? 29 : 14;
  context.strokeText(text, textX, canvas.height / 2 + 1);
  context.fillText(text, textX, canvas.height / 2 + 1);
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
  sprite.scale.set(canvas.width / (primary ? 4200 : 5200), canvas.height / (primary ? 4200 : 5200), 1);
  sprite.renderOrder = 120;
  return sprite;
}

export function createNodeLabelSprites(options: {
  group: THREE.Group;
  graph: NetgraphGraph;
  importantLabels: Set<string>;
  visibleNodeIds: Set<string>;
  selectedNodeId?: string | null;
  directNodeNeighbors: Set<string>;
  searchMatches: Set<string>;
  selectedNodes: Set<string>;
  roleColors: Record<NetgraphRole, string>;
  nodeFocusActive: boolean;
  labelScale: number;
  labelDensity: number;
  labelBudgetScale: number;
  batteryQuality: boolean;
  balancedQuality: boolean;
  denseGraph: boolean;
  narrowViewport: boolean;
}): THREE.Sprite[] {
  const visibleLabelIds = Array.from(options.importantLabels).filter((id) => options.visibleNodeIds.has(id));
  const priorityLabelCount = visibleLabelIds.filter((id) =>
    options.selectedNodeId === id ||
    options.searchMatches.has(id) ||
    options.directNodeNeighbors.has(id) ||
    options.selectedNodes.has(id)
  ).length;
  const requestedLabelCap = Math.floor(visibleLabelIds.length * options.labelDensity * options.labelBudgetScale);
  const minimumLabelCap = options.labelDensity >= 0.98 ? visibleLabelIds.length : Math.max(1, priorityLabelCount);
  const labelCap = Math.min(MAX_LABELS, Math.max(minimumLabelCap, requestedLabelCap));
  const labelIds = visibleLabelIds.slice(0, labelCap);
  const maxRouteCount = Math.max(0, ...labelIds.map((id) => options.graph.nodeById.get(id)?.routeCount ?? 0));
  const sprites: THREE.Sprite[] = [];
  const primaryCount = options.denseGraph
    ? options.narrowViewport ? 10 : 18
    : options.narrowViewport ? 16 : 32;
  for (const [index, id] of labelIds.entries()) {
    const node = options.graph.nodeById.get(id);
    if (!node) continue;
    const isDirectFocus = options.directNodeNeighbors.has(id);
    const isSelectedOrSearch = options.selectedNodeId === id || options.searchMatches.has(id);
    const isRouteContext = options.selectedNodes.has(id) && !options.nodeFocusActive;
    const labelColor = isSelectedOrSearch || isDirectFocus || isRouteContext ? "#ffffff" : options.roleColors[node.role];
    const isPriority = isSelectedOrSearch || isDirectFocus || isRouteContext || (!options.nodeFocusActive && index < primaryCount);
    const sprite = makeLabelSprite(node.label, labelColor, isPriority ? "primary" : "secondary");
    const routeScale = routeCountLabelScale(node.routeCount, maxRouteCount, options.denseGraph);
    const tierScale = isPriority ? (options.denseGraph ? 1.04 : 1.08) : (options.denseGraph ? 0.66 : 0.78);
    sprite.scale.multiplyScalar(options.labelScale * tierScale * routeScale);
    const labelRadius = node.radius * options.labelScale * routeScale;
    const labelDrop = labelRadius * (options.narrowViewport ? 2.55 : 1.92) + sprite.scale.y * (isPriority ? 0.3 : 0.18);
    sprite.position.set(node.position.x, node.position.y - labelDrop, node.position.z + labelRadius * (isPriority ? 1.34 : 0.96) + (isPriority ? 10 : 5));
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
      opacity: 0.18 * (0.7 + atmosphereFactor * 0.5),
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    }));
    drift.position.copy(center);
    drift.position.z -= radius * 2.55;
    drift.scale.set(radius * 4.8, radius * 4.5, 1);
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
      opacity: 0.12 * (0.8 + atmosphereFactor * 0.35),
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    }));
    scanGrid.position.copy(center);
    scanGrid.position.z -= radius * 2.18;
    scanGrid.scale.set(radius * 4.25, radius * 3.25, 1);
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
      opacity: 0.095 * (0.88 + atmosphereFactor * 0.42),
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    }));
    dust.position.copy(center);
    dust.position.z -= radius * 2.28;
    dust.scale.set(radius * 5.9, radius * 4.4, 1);
    dust.renderOrder = -29;
    dust.center.set(0.5, 0.5);
    group.add(dust);
  }

  const starCount = Math.max(1, Math.round((reduced ? 110 : 330) * density * (0.74 + atmosphereFactor)));
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
      opacity: (reduced ? 0.18 : 0.28) * (0.72 + atmosphereFactor * 0.28),
      depthWrite: false,
    }),
  );
  stars.renderOrder = -20;
  group.add(stars);

  if (!reduced) {
    const nebula = new THREE.Sprite(new THREE.SpriteMaterial({
      map: makeNebulaTexture(primary, green),
      transparent: true,
      opacity: 0.36 * (0.72 + atmosphereFactor * 0.28),
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
    }));
    nebula.position.set(center.x - radius * 0.58, center.y + radius * 0.16, center.z - radius * 2.36);
    nebula.scale.set(radius * (4.8 + atmosphereFactor * 0.82), radius * (2.7 + atmosphereFactor * 0.48), 1);
    nebula.renderOrder = -30;
    group.add(nebula);
  }
  return group;
}
