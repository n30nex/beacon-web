import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { PointerLockControls } from "three/addons/controls/PointerLockControls.js";
import { NetgraphCanvasHud, type NetgraphControlMode, type NetgraphHoverState } from "./NetgraphCanvasHud";
import {
  importantLabelNodeIds,
  nodeDirectEdgeIds,
  nodeDirectNeighborIds,
  nodeSecondHopNeighborIds,
  resolveNetgraphVisibilitySets,
  resolveNetgraphRenderTier,
  selectedNodeNeighborhoodNodeIds,
  selectedNodeRouteEdgeIds,
  selectedRouteEdgeIds,
  selectedRouteNodeIds,
  type NetgraphGlow,
  type NetgraphGraph,
  type NetgraphNode,
  type NetgraphPulse,
  type NetgraphQualityMode,
  type NetgraphViewMode,
  type NetgraphVisualProfile,
} from "./netgraph-model";
import {
  clamp,
  graphWithPositions,
  nodePosition,
  nodeScale,
  selectedNodeFocus,
  selectedRouteFocus,
  selectedRouteWaypoints,
} from "./netgraph-three-geometry";
import {
  ambientTextureCache,
  ambientTextureFile,
  backdropTextureForViewport,
  chooseAmbientPacketVariant,
  disposeMaterial,
  getCachedTexture,
  preserveDrawingBufferForTest,
} from "./netgraph-three-assets";
import { renderNetgraphEffectFrame } from "./netgraph-three-effects";
import { registerNetgraphCanvasEvents } from "./netgraph-three-events";
import {
  applyCameraFrame as applyCameraFrameToControls,
  createCameraTween,
  createFocusPointFrame,
  createGuidedIntroCameraFrame,
  createObliqueCameraDirection,
  createOverviewCameraFrame,
  createZoomCameraFrame,
  currentCameraDirection as resolveCurrentCameraDirection,
  focusDirectionForNode as createFocusDirectionForNode,
  focusDirectionForPoint as createFocusDirectionForPoint,
  focusLayoutSpan as resolveFocusLayoutSpan,
  setOverviewCameraBounds,
  syncOrbitTargetToCamera as syncOrbitTargetToCameraFrame,
  type CameraTween,
} from "./netgraph-three-camera";
import {
  applyDesktopFlightControls,
  applyTouchFlightControls,
  createNetgraphFlightCommandHandlers,
  createFlightKeys,
} from "./netgraph-three-flight";
import { createNetgraphObjectVisuals } from "./netgraph-three-objects";
import { advanceNetgraphCameraControlFrame, createNetgraphFrameTimingState, startNetgraphRenderLoop } from "./netgraph-three-render-loop";
import { createNetgraphSceneStage, cssColor } from "./netgraph-three-scene";
import { createNetgraphPointerHandlers } from "./netgraph-three-interactions";
import { useNetgraphTouchFlightControls } from "./useNetgraphTouchFlightControls";

interface ThreeNetgraphCanvasProps {
  graph: NetgraphGraph;
  selectedNodeId?: string | null;
  selectedRouteId?: number | null;
  viewMode: NetgraphViewMode;
  qualityMode: NetgraphQualityMode;
  showDataQuality: boolean;
  visualProfile: NetgraphVisualProfile;
  searchMatches: Set<string>;
  pulses: NetgraphPulse[];
  glows: NetgraphGlow[];
  reducedMotion?: boolean;
  onSelectNode: (nodeId: string) => void;
  onSelectRoute: (routeId: number) => void;
  onClearSelection: () => void;
  onError: (message: string) => void;
}

interface CameraCommands {
  flyRoute: () => void;
  focusSelected: () => void;
  reset: () => void;
  toggleOrbit: () => void;
  enterFlight: () => void;
  exitFlight: () => void;
  topView: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
}

const MOBILE_RENDER_QUERY = "(max-width: 767px)";

export function ThreeNetgraphCanvas({
  graph,
  selectedNodeId,
  selectedRouteId,
  viewMode,
  qualityMode,
  showDataQuality,
  visualProfile: visualProfileProp,
  searchMatches,
  pulses,
  glows,
  reducedMotion = false,
  onSelectNode,
  onSelectRoute,
  onError,
}: ThreeNetgraphCanvasProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const commandsRef = useRef<CameraCommands | null>(null);
  const pulsesRef = useRef(pulses);
  const glowsRef = useRef(glows);
  const [hovered, setHovered] = useState<NetgraphHoverState | null>(null);
  const [orbitActive, setOrbitActive] = useState(!reducedMotion);
  const orbitActiveRef = useRef(!reducedMotion);
  const [controlMode, setControlMode] = useState<NetgraphControlMode>("orbit");
  const displayedOrbitActive = orbitActive && !reducedMotion;
  const {
    handleLookPadPointerDown,
    handleLookPadPointerEnd,
    handleLookPadPointerMove,
    handleMovePadPointerDown,
    handleMovePadPointerEnd,
    handleMovePadPointerMove,
    touchFlightRef,
  } = useNetgraphTouchFlightControls(setControlMode);

  useEffect(() => {
    pulsesRef.current = pulses;
  }, [pulses]);

  useEffect(() => {
    glowsRef.current = glows;
  }, [glows]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || graph.nodes.length === 0) return;
    if (!window.WebGLRenderingContext) {
      onError("WebGL is unavailable in this browser.");
      return;
    }

    const nodeFocusActive = viewMode === "focus" && Boolean(selectedNodeId);
    const routeFocusActive = viewMode === "routes" && selectedRouteId != null;
    const liveFocusActive = viewMode === "live";
    const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
    const cores = navigator.hardwareConcurrency;
    const lowPowerHardware = (typeof memory === "number" && memory <= 4) || (typeof cores === "number" && cores <= 4);
    const narrowViewport = window.matchMedia?.(MOBILE_RENDER_QUERY).matches ?? host.clientWidth < 640;
    const focusVisibility = resolveNetgraphVisibilitySets(graph, viewMode, selectedNodeId);
    const tierNodeCount = focusVisibility.focusLayout ? focusVisibility.visibleNodeIds.size : graph.nodes.length;
    const tierEdgeCount = focusVisibility.focusLayout ? focusVisibility.visibleEdgeIds.size : graph.edges.length;
    const denseGraph = tierEdgeCount > 900 || tierNodeCount > 520;
    const renderTier = resolveNetgraphRenderTier({ denseGraph, lowPowerHardware, narrowViewport, qualityMode, reducedMotion });
    const batteryQuality = renderTier.name === "battery";
    const balancedQuality = renderTier.name === "balanced";
    const highQuality = renderTier.name === "cinematic";
    const animationsDisabled = reducedMotion;
    const lowPower = animationsDisabled || batteryQuality;
    const visualProfile = visualProfileProp;
    const cameraFov = visualProfile.cameraFov;
    const labelDensity = visualProfile.labelDensity;
    const labelScale = visualProfile.labelScale;
    const edgeOpacityScale = visualProfile.edgeOpacity;
    const pulseDensity = visualProfile.pulseDensity;
    const glowDensity = visualProfile.glowDensity;
    const glowIntensityScale = visualProfile.glowIntensity;
    const nodeScaleFactor = visualProfile.nodeScale;
    const orbitAutoRotateScale = clamp(visualProfile.autoRotateSpeed, 0, 2.4);
    const orbitControlScale = clamp(visualProfile.orbitControlSpeed, 0.3, 2.7);
    const orbitDamping = clamp(visualProfile.orbitDamping, 0.04, 0.22);
    const starDensity = visualProfile.starDensity;
    const lightIntensityScale = visualProfile.lightIntensity;
    const atmosphereDensity = visualProfile.atmosphereDensity;
    const cameraDistanceScale = clamp(visualProfile.cameraDistanceScale, 0.45, 1.95);
    const focusHaloScale = visualProfile.focusHaloScale;
    const optimizedForMobile = batteryQuality || narrowViewport;
    const bg = cssColor(host, "--color-bg-base", "#070910");
    const primary = cssColor(host, "--color-primary", "#7ab7ff");
    const green = cssColor(host, "--color-green", "#54e1a6");
    const muted = cssColor(host, "--color-text-dim", "#697386");
    const focusLayout = focusVisibility.focusLayout;
    const renderGraph = focusLayout ? graphWithPositions(graph, focusLayout.positions) : graph;
    const visibleNodeIds = focusVisibility.visibleNodeIds;
    const visibleEdgeIds = focusVisibility.visibleEdgeIds;
    const pickableNodeIds = focusVisibility.pickableNodeIds;
    const pickableEdgeIds = focusVisibility.pickableEdgeIds;
    const selectedEdges = nodeFocusActive ? selectedNodeRouteEdgeIds(renderGraph, selectedNodeId) : routeFocusActive ? selectedRouteEdgeIds(renderGraph, selectedRouteId) : new Set<string>();
    const directNodeEdges = nodeFocusActive ? nodeDirectEdgeIds(renderGraph, selectedNodeId) : new Set<string>();
    const selectedNodes = nodeFocusActive ? selectedNodeNeighborhoodNodeIds(renderGraph, selectedNodeId) : routeFocusActive ? selectedRouteNodeIds(renderGraph, selectedRouteId) : new Set<string>();
    const directNodeNeighbors = nodeFocusActive ? nodeDirectNeighborIds(renderGraph, selectedNodeId) : new Set<string>();
    const secondHopNeighbors = nodeFocusActive ? nodeSecondHopNeighborIds(renderGraph, selectedNodeId) : new Set<string>();
    const importantLabels = importantLabelNodeIds(renderGraph, searchMatches, nodeFocusActive ? selectedNodeId : null, routeFocusActive ? selectedRouteId : null);
    const richPacketLighting = !animationsDisabled && !batteryQuality && !narrowViewport && (highQuality || denseGraph || nodeFocusActive || routeFocusActive || liveFocusActive);

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: !optimizedForMobile,
        alpha: false,
        preserveDrawingBuffer: preserveDrawingBufferForTest(),
        powerPreference: lowPower ? "default" : "high-performance",
      });
    } catch (error) {
      onError(error instanceof Error ? error.message : "Could not initialize WebGL.");
      return;
    }

    const setRendererPixelRatio = (width = host.clientWidth) => {
      const basePixelRatioCap = batteryQuality
        ? 0.9
        : balancedQuality
          ? width < 640 || narrowViewport
            ? 1.05
            : 1.15
          : highQuality
            ? width < 640 || narrowViewport
              ? 1.2
              : 1.85
            : denseGraph && width >= 640
              ? 0.86
              : width < 640 || narrowViewport
                ? 1.1
                : 1.55;
      const pixelRatioCap = basePixelRatioCap * (renderTier.name === "balanced" ? 0.95 : 1);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, pixelRatioCap));
    };
    setRendererPixelRatio();
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = highQuality ? 1.08 : 0.98;
    renderer.setClearColor(bg, 1);
    renderer.domElement.className = "netgraph-three-canvas h-full w-full";
    renderer.domElement.setAttribute("aria-label", "3D netgraph topology");
    renderer.domElement.style.touchAction = "none";
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(cameraFov, 1, 0.1, 700 * cameraDistanceScale);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = orbitDamping;
    controls.enablePan = true;
    controls.screenSpacePanning = true;
    controls.autoRotate = !reducedMotion && orbitActiveRef.current;
    const baseAutoRotateSpeed = (nodeFocusActive ? 0.24 : routeFocusActive ? 0.18 : liveFocusActive ? 0.38 : narrowViewport ? 0.24 : 0.36) * orbitAutoRotateScale;
    controls.autoRotateSpeed = baseAutoRotateSpeed * orbitControlScale;
    controls.rotateSpeed = (narrowViewport ? 0.58 : 0.84) * orbitControlScale;
    controls.zoomSpeed = (narrowViewport ? 1.05 : 1.18) * (0.76 + orbitControlScale * 0.28);
    controls.panSpeed = (narrowViewport ? 0.62 : 0.82) * (0.72 + orbitControlScale * 0.3);
    controls.minPolarAngle = 0.08;
    controls.maxPolarAngle = Math.PI - 0.08;
    controls.touches.ONE = THREE.TOUCH.ROTATE;
    controls.touches.TWO = THREE.TOUCH.DOLLY_PAN;
    controls.mouseButtons.LEFT = THREE.MOUSE.ROTATE;
    controls.mouseButtons.MIDDLE = THREE.MOUSE.DOLLY;
    controls.mouseButtons.RIGHT = THREE.MOUSE.PAN;
    const cursorZoomControls = controls as OrbitControls & { zoomToCursor?: boolean; cursorStyle?: "auto" | "grab" };
    if ("zoomToCursor" in cursorZoomControls) cursorZoomControls.zoomToCursor = true;
    if ("cursorStyle" in cursorZoomControls) cursorZoomControls.cursorStyle = "grab";
    controls.minDistance = 10 / Math.max(0.8, cameraDistanceScale);
    controls.maxDistance = 240 * cameraDistanceScale;
    const flightControls = new PointerLockControls(camera, renderer.domElement);
    const flightKeys = createFlightKeys();

    const group = new THREE.Group();
    scene.add(group);
    const backdropVariant = chooseAmbientPacketVariant(nodeFocusActive, batteryQuality || reducedMotion);
    const ambientMapAnisotropy = renderer.capabilities.getMaxAnisotropy();
    const backdropMap = getCachedTexture(ambientTextureCache, backdropTextureForViewport(host.clientWidth, host.clientHeight, "spherical", nodeFocusActive), ambientMapAnisotropy);
    const starDriftMap = getCachedTexture(ambientTextureCache, ambientTextureFile("star_drift_layer", backdropVariant), ambientMapAnisotropy);
    const scanGridMap = getCachedTexture(ambientTextureCache, ambientTextureFile("scan_grid_overlay", backdropVariant), ambientMapAnisotropy);
    const dustLayerMap = getCachedTexture(ambientTextureCache, ambientTextureFile("dust_sheet_soft", backdropVariant), ambientMapAnisotropy);
    const { center, radius } = createNetgraphSceneStage({
      atmosphereDensity,
      backdropTexture: backdropMap,
      batteryQuality,
      bg,
      cameraDistanceScale,
      dustLayerTexture: dustLayerMap,
      graph: renderGraph,
      green,
      lightIntensityScale,
      muted,
      narrowViewport,
      primary,
      reduced: batteryQuality || reducedMotion,
      referenceGroup: group,
      richPacketLighting,
      scanGridTexture: scanGridMap,
      scene,
      starDensity,
      starDriftTexture: starDriftMap,
      visibleNodeIds,
    });
    let cameraTween: CameraTween | null = null;
    const cameraControls = { camera, controls };
    const obliqueDirection = createObliqueCameraDirection();
    const currentCameraDirection = () => resolveCurrentCameraDirection(cameraControls, obliqueDirection);
    const focusDirectionForNode = (node: NetgraphNode) => {
      return createFocusDirectionForNode({
        ...cameraControls,
        center,
        fallbackDirection: obliqueDirection,
        node,
        radius,
      });
    };
    const focusDirectionForPoint = (target: THREE.Vector3) => {
      return createFocusDirectionForPoint({
        ...cameraControls,
        center,
        fallbackDirection: obliqueDirection,
        radius,
        target,
      });
    };
    const overviewFrame = () => {
      return createOverviewCameraFrame({
        aspect: camera.aspect,
        cameraDistanceScale,
        center,
        narrowViewport,
        obliqueDirection,
        radius,
      });
    };
    const applyCameraFrame = (position: THREE.Vector3, target: THREE.Vector3) => {
      applyCameraFrameToControls(cameraControls, { position, target });
    };
    const setCameraTween = (toPosition: THREE.Vector3, toTarget: THREE.Vector3, durationMs = 520) => {
      cameraTween = createCameraTween(cameraControls, toPosition, toTarget, durationMs);
    };
    const focusPoint = (target: THREE.Vector3, distance: number, animate = true, direction = currentCameraDirection()) => {
      const next = createFocusPointFrame(controls, target, distance, direction);
      if (animate) setCameraTween(next.position, next.target);
      else applyCameraFrame(next.position, next.target);
    };
    const focusLayoutSpan = (nodeIds: Set<string>) => {
      return resolveFocusLayoutSpan(nodeIds, renderGraph.nodeById);
    };
    const frameCamera = (animate = false, guidedIntro = false) => {
      const next = overviewFrame();
      setOverviewCameraBounds(cameraControls, next, radius, cameraDistanceScale, narrowViewport, nodeFocusActive || routeFocusActive);
      if (guidedIntro && !nodeFocusActive && !routeFocusActive && !liveFocusActive) {
        const intro = createGuidedIntroCameraFrame({
          narrowViewport,
          obliqueDirection,
          overviewFrame: next,
          radius,
        });
        applyCameraFrame(intro.position, intro.target);
        setCameraTween(next.position, next.target, narrowViewport ? 1450 : 2100);
        return;
      }
      if (animate) setCameraTween(next.position, next.target, 640);
      else applyCameraFrame(next.position, next.target);
    };
    const focusNode = (node: NetgraphNode, animate = true) => {
      const renderedNode = renderGraph.nodeById.get(node.id) ?? node;
      const target = nodePosition(renderedNode);
      const neighborhood = selectedNodeFocus(renderGraph, node.id);
      let span = neighborhood?.span ?? nodeScale(node, nodeScaleFactor) * 8;
      if (nodeFocusActive) {
        const layoutSpan = focusLayoutSpan(selectedNodes);
        if (layoutSpan > 0) {
          span = Math.max(span, layoutSpan);
        }
      }
      focusPoint(
        target,
        Math.max(8, Math.min(controls.maxDistance, span * (narrowViewport ? 1.58 : 1.34) + 10)),
        animate,
        focusDirectionForNode(renderedNode),
      );
    };
    const focusRoute = (routeId: number, animate = true) => {
      const focus = selectedRouteFocus(renderGraph, routeId);
      if (!focus) return;
      focusPoint(
        focus.center,
        Math.max(8, Math.min(controls.maxDistance, focus.span * (narrowViewport ? 1.7 : 1.48) + 9)),
        animate,
        focusDirectionForPoint(focus.center),
      );
    };
    const flyRoute = (routeId: number | null | undefined) => {
      const waypoints = selectedRouteWaypoints(renderGraph, routeId);
      if (waypoints.length < 2) {
        if (routeId != null) focusRoute(routeId, true);
        return;
      }
      const index = Math.min(waypoints.length - 1, Math.max(0, Math.floor(waypoints.length * 0.62)));
      const target = waypoints[index]!.clone();
      const previous = waypoints[Math.max(0, index - 1)]!;
      const next = waypoints[Math.min(waypoints.length - 1, index + 1)]!;
      const tangent = next.clone().sub(previous);
      if (tangent.lengthSq() < 0.001) tangent.copy(focusDirectionForPoint(target));
      const side = new THREE.Vector3(-tangent.y, tangent.x, Math.max(radius * 0.14, Math.abs(tangent.z) + 8)).normalize();
      const span = Math.max(10, previous.distanceTo(next));
      focusPoint(target, Math.max(18, Math.min(radius * 0.58, span * 2.8 + 18)), true, side);
    };
    const zoomCamera = (factor: number) => {
      const next = createZoomCameraFrame(cameraControls, factor);
      applyCameraFrame(next.position, next.target);
    };
    const setOrbit = (active: boolean) => {
      const nextActive = active && !reducedMotion;
      orbitActiveRef.current = nextActive;
      controls.autoRotate = nextActive;
      setOrbitActive(nextActive);
    };
    const topView = () => {
      const focus = routeFocusActive && selectedRouteId != null
        ? selectedRouteFocus(renderGraph, selectedRouteId)
        : nodeFocusActive && selectedNodeId
          ? selectedNodeFocus(renderGraph, selectedNodeId)
          : null;
      const target = focus?.center ?? center;
      const span = focus?.span ?? radius;
      focusPoint(target, Math.max(8, Math.min(controls.maxDistance, span * (narrowViewport ? 1.55 : 1.28) + 8)), true, new THREE.Vector3(0, 0, 1));
    };
    frameCamera(false, renderTier.guidedIntro);
    if (nodeFocusActive && selectedNodeId) {
      const node = renderGraph.nodeById.get(selectedNodeId);
      if (node) focusNode(node, false);
    } else if (routeFocusActive && selectedRouteId != null) {
      focusRoute(selectedRouteId, false);
    }
    const {
      defaultEndpointPulseMap,
      edgeVisuals,
      endpointMeshes,
      focusHaloMeshes,
      glowMeshes,
      highResPackets,
      packetTextureVariant,
      pulseBeamMeshes,
      pulseLights,
      pulseMeshes,
      pulseTailMeshes,
      pulseTextureAnisotropy,
      roleMeshes,
      selectedSunGroup,
    } = createNetgraphObjectVisuals({
      animationsDisabled,
      balancedQuality,
      batteryQuality,
      denseGraph,
      directNodeEdges,
      directNodeNeighbors,
      edgeOpacityScale,
      focusHaloScale,
      glowDensity,
      glowIntensityScale,
      graph: renderGraph,
      green,
      group,
      highQuality,
      importantLabels,
      labelDensity,
      labelScale,
      liveFocusActive,
      lowPower,
      narrowViewport,
      nodeFocusActive,
      nodeScaleFactor,
      primary,
      pulseDensity,
      reducedMotion,
      renderTier,
      richPacketLighting,
      searchMatches,
      selectedEdges,
      selectedNodeId,
      selectedNodes,
      textureAnisotropy: ambientMapAnisotropy,
      visibleEdgeIds,
      visibleNodeIds,
    });

    const pulseTailAxis = new THREE.Vector3(0, 1, 0);
    const tailDirection = new THREE.Vector3();
    const tailMidpoint = new THREE.Vector3();
    const endpointPosition = new THREE.Vector3();
    const glowPosition = new THREE.Vector3();
    const projectionScreenMatrix = new THREE.Matrix4();
    const cameraFrustum = new THREE.Frustum();
    const visibilitySphere = new THREE.Sphere(new THREE.Vector3(), 1);
    const updateCameraFrustum = () => {
      camera.updateMatrixWorld();
      projectionScreenMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      cameraFrustum.setFromProjectionMatrix(projectionScreenMatrix);
    };
    const isVisiblePoint = (position: THREE.Vector3, margin = 3) => {
      visibilitySphere.center.copy(position);
      visibilitySphere.radius = margin;
      return cameraFrustum.intersectsSphere(visibilitySphere);
    };
    let disposed = false;
    let framedToContainer = false;
    let lastAspect = camera.aspect;
    let userInteracted = false;
    const targetFrameMs = denseGraph && !narrowViewport ? 33 : 0;
    let frameTiming = createNetgraphFrameTimingState();
    const markUserInteracted = () => {
      userInteracted = true;
    };
    const viewDirection = new THREE.Vector3();
    const viewRight = new THREE.Vector3();
    const viewUp = new THREE.Vector3(0, 1, 0);
    const syncOrbitTargetToCamera = () => {
      syncOrbitTargetToCameraFrame({
        ...cameraControls,
        radius,
        viewDirection,
      });
    };
    const flightCommandHandlers = createNetgraphFlightCommandHandlers({
      canvas: renderer.domElement,
      controls,
      flightControls,
      flightKeys,
      markUserInteracted,
      onCameraTweenCancel: () => {
        cameraTween = null;
      },
      setControlMode,
      setHovered,
      setOrbit,
      syncOrbitTargetToCamera,
    });

    commandsRef.current = {
      flyRoute: () => flyRoute(selectedRouteId),
      focusSelected: () => {
        if (selectedNodeId) {
          const node = renderGraph.nodeById.get(selectedNodeId);
          if (node) {
            focusNode(node);
            return;
          }
        }
        if (selectedRouteId != null) {
          focusRoute(selectedRouteId);
          return;
        }
        frameCamera(true);
      },
      reset: () => frameCamera(true),
      toggleOrbit: () => setOrbit(!controls.autoRotate),
      enterFlight: () => flightCommandHandlers.enterFlightMode(),
      exitFlight: () => flightCommandHandlers.exitFlightMode(),
      topView,
      zoomIn: () => zoomCamera(0.58),
      zoomOut: () => zoomCamera(1.44),
    };

    const resize = () => {
      const rect = host.getBoundingClientRect();
      const width = Math.floor(rect.width);
      const height = Math.floor(rect.height);
      if (width < 24 || height < 24) return;
      setRendererPixelRatio(width);
      renderer.setSize(width, height, false);
      const nextAspect = width / height;
      const aspectChanged = Math.abs(nextAspect - lastAspect) > 0.12;
      camera.aspect = nextAspect;
      lastAspect = nextAspect;
      if (!framedToContainer || (!userInteracted && aspectChanged)) {
        frameCamera(false, !framedToContainer && renderTier.guidedIntro);
        framedToContainer = true;
      } else {
        camera.updateProjectionMatrix();
      }
    };
    const ro = new ResizeObserver(resize);
    ro.observe(host);
    resize();

    const pointerHandlers = createNetgraphPointerHandlers({
      bg,
      camera,
      canvas: renderer.domElement,
      directNodeNeighbors,
      edgeOpacityScale,
      edgeVisuals,
      flightControls,
      flyRoute,
      focusDirectionForPoint,
      focusNode,
      focusPoint,
      frameCamera,
      graph: renderGraph,
      host,
      muted,
      nodeFocusActive,
      nodeScaleFactor,
      onSelectNode,
      onSelectRoute,
      pickableEdgeIds,
      pickableNodeIds,
      primary,
      radius,
      roleMeshes,
      searchMatches,
      secondHopNeighbors,
      selectedNodeId,
      selectedNodes,
      selectedRouteId,
      setHovered,
      showDataQuality,
    });

    const clampCameraDistance = () => {
      const maxDistance = Math.max(radius * 2.3, controls.maxDistance * 1.18);
      const offset = camera.position.clone().sub(center);
      if (offset.lengthSq() > maxDistance * maxDistance) {
        camera.position.copy(center).add(offset.normalize().multiplyScalar(maxDistance));
      }
    };

    const applyDesktopFlight = (deltaSeconds: number) => {
      applyDesktopFlightControls({
        camera,
        clampCameraDistance,
        deltaSeconds,
        flightControls,
        flightKeys,
        markUserInteracted,
        narrowViewport,
        radius,
      });
    };

    const applyTouchFlight = (deltaSeconds: number, onActive: () => void) => {
      return applyTouchFlightControls({
        camera,
        clampCameraDistance,
        deltaSeconds,
        markUserInteracted,
        onActive,
        radius,
        state: touchFlightRef.current,
        syncOrbitTargetToCamera,
        viewDirection,
        viewRight,
        viewUp,
      });
    };

    const unregisterCanvasEvents = registerNetgraphCanvasEvents({
      canvas: renderer.domElement,
      controls,
      documentTarget: document,
      flightControls,
      onCanvasClick: pointerHandlers.onCanvasClick,
      onControlsStart: markUserInteracted,
      onFlightLock: flightCommandHandlers.onFlightLock,
      onFlightUnlock: flightCommandHandlers.onFlightUnlock,
      onKeyDown: flightCommandHandlers.onKeyDown,
      onKeyUp: flightCommandHandlers.onKeyUp,
      onPointerCancel: pointerHandlers.onPointerCancel,
      onPointerDown: pointerHandlers.onPointerDown,
      onPointerLeave: pointerHandlers.onPointerLeave,
      onPointerMove: pointerHandlers.onPointerMove,
      onPointerUp: pointerHandlers.onPointerUp,
    });

    const renderFrame = (time: number) => {
      if (disposed) return;
      const frameState = advanceNetgraphCameraControlFrame({
        animationsDisabled,
        applyDesktopFlight,
        applyTouchFlight,
        cameraControls,
        cameraTween,
        flightControls,
        frameTiming,
        liveFocusActive,
        narrowViewport,
        nodeFocusActive,
        orbitAutoRotateScale,
        orbitControlScale,
        qualityMode,
        routeFocusActive,
        selectedSunGroup,
        targetFrameMs,
        time,
        updateCameraFrustum,
      });
      if (!frameState) return;
      cameraTween = frameState.cameraTween;
      frameTiming = frameState.frameTiming;
      renderNetgraphEffectFrame({
        animationsDisabled,
        batteryQuality,
        cameraQuaternion: camera.quaternion,
        defaultEndpointPulseMap,
        endpointMeshes,
        endpointPosition,
        focusHaloMeshes,
        glowIntensityScale,
        glowMeshes,
        glowPosition,
        glows: glowsRef.current,
        highResPackets,
        isVisiblePoint,
        narrowViewport,
        nodeFocusActive,
        nodeScaleFactor,
        now: Date.now(),
        packetTextureVariant,
        pulseBeamMeshes,
        pulseLights,
        pulseMeshes,
        pulseTailAxis,
        pulseTailMeshes,
        pulseTextureAnisotropy,
        pulses: pulsesRef.current,
        reducedMotion,
        renderGraph,
        renderTier,
        runtimeEffectScale: frameState.frameTiming.runtimeEffectScale,
        tailDirection,
        tailMidpoint,
        time,
        visibleEdgeIds,
        visibleNodeIds,
      });
      renderer.render(scene, camera);
    };
    const stopRenderLoop = startNetgraphRenderLoop({
      isDisposed: () => disposed,
      renderFrame,
      renderer,
      targetFrameMs,
    });

    return () => {
      disposed = true;
      commandsRef.current = null;
      stopRenderLoop();
      ro.disconnect();
      unregisterCanvasEvents();
      if (document.pointerLockElement === renderer.domElement) document.exitPointerLock();
      controls.dispose();
      scene.traverse((object) => {
        const mesh = object as THREE.Mesh | THREE.LineSegments | THREE.Sprite;
        mesh.geometry?.dispose?.();
        if (mesh.material) disposeMaterial(mesh.material);
      });
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [graph, onError, onSelectNode, onSelectRoute, qualityMode, reducedMotion, searchMatches, selectedNodeId, selectedRouteId, showDataQuality, touchFlightRef, viewMode, visualProfileProp]);

  return (
    <div ref={hostRef} className="netgraph-canvas-host relative h-full min-h-0 flex-1 overflow-hidden bg-bg-base" role="region" aria-label="Animated 3D netgraph topology">
      <NetgraphCanvasHud
        controlMode={controlMode}
        hovered={hovered}
        orbitActive={displayedOrbitActive}
        reducedMotion={reducedMotion}
        selectedRouteId={selectedRouteId}
        onEnterFlight={() => commandsRef.current?.enterFlight()}
        onExitFlight={() => commandsRef.current?.exitFlight()}
        onFocusSelected={() => commandsRef.current?.focusSelected()}
        onFlyRoute={() => commandsRef.current?.flyRoute()}
        onLookPadPointerDown={handleLookPadPointerDown}
        onLookPadPointerEnd={handleLookPadPointerEnd}
        onLookPadPointerMove={handleLookPadPointerMove}
        onMovePadPointerDown={handleMovePadPointerDown}
        onMovePadPointerEnd={handleMovePadPointerEnd}
        onMovePadPointerMove={handleMovePadPointerMove}
        onReset={() => commandsRef.current?.reset()}
        onToggleOrbit={() => commandsRef.current?.toggleOrbit()}
        onTopView={() => commandsRef.current?.topView()}
        onZoomIn={() => commandsRef.current?.zoomIn()}
        onZoomOut={() => commandsRef.current?.zoomOut()}
      />
    </div>
  );
}
