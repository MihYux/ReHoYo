"use client";
/* eslint-disable react-hooks/refs, react-hooks/immutability -- the d3 force engine intentionally mutates node coordinates and drag constraints. */

import dynamic from "next/dynamic";
import { forceCollide } from "d3-force";
import { useEffect, useMemo, useRef, useState } from "react";
import type ForceGraph2DComponent from "react-force-graph-2d";
import type { ForceGraphMethods, NodeObject } from "react-force-graph-2d";
import type { RegionConfig, RegionGraphEdge, RegionGraphNode, RegionResearchBatch, ResearchCitation } from "@/lib/contracts";
import { placeGraphLabel, type GraphLabelPlacement, type GraphLabelRect } from "@/lib/graph-label-layout";
import { buildRegionGraph } from "@/lib/region-graph";
import styles from "./region-intelligence-viewport.module.css";

const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), { ssr: false }) as typeof ForceGraph2DComponent;

type Props = {
  regions: RegionConfig[];
  citations: ResearchCitation[];
  batch: RegionResearchBatch | null;
  compact?: boolean;
  pictureInPicture?: boolean;
  expanded?: boolean;
  fullscreen?: boolean;
  activeRegionId?: string;
  onSelectRegion?: (regionId: string) => void;
  onSelectEvidence?: (citationId: string, regionId: string) => void;
};

type ForceNode = RegionGraphNode & { x?: number; y?: number; vx?: number; vy?: number; fx?: number; fy?: number };
type ForceLink = Omit<RegionGraphEdge, "source" | "target"> & {
  source: string | ForceNode;
  target: string | ForceNode;
  active: boolean;
};

const ACTIVE_PHASES = new Set(["searching", "processing", "synthesizing", "saving", "retry_wait"]);
function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return reduced;
}

function nodeRadius(node: ForceNode) {
  void node;
  return 5.2;
}

function nodeColors(node: ForceNode) {
  if (node.kind === "core") return { fill: "#168fa1", stroke: "#0d7080" };
  if (node.kind === "region") return { fill: "#48bdca", stroke: node.status === "failed" ? "#bd7671" : "#198e9e" };
  if (node.kind === "dimension") return { fill: "#8dd7de", stroke: "#58b6c0" };
  return { fill: "#d5eff2", stroke: "#9bcfd5" };
}

function fitNetwork(api: ForceGraphMethods<ForceNode, ForceLink> | undefined, compact: boolean, fullscreen = false) {
  if (!api) return;
  api.zoomToFit(fullscreen ? 180 : 360, compact ? 30 : fullscreen ? 110 : 72);
}

function showNodeLabel(node: ForceNode, selectedRegionId: string) {
  return node.kind === "core" || node.kind === "region" || (node.kind === "dimension" && node.regionId === selectedRegionId);
}

function labelStyle(node: ForceNode, globalScale: number) {
  const screenSize = node.kind === "region" ? 10.2 : node.kind === "core" ? 9.2 : 8.2;
  const fontSize = screenSize / globalScale;
  const weight = node.kind === "region" ? 650 : node.kind === "core" ? 520 : 560;
  return {
    fontSize,
    font: `${weight} ${fontSize}px var(--font-ui), sans-serif`,
    color: node.kind === "core" ? "#60717d" : "#102433",
  };
}

function preferredLabelDirection(node: ForceNode, regionsById: Map<string, ForceNode>) {
  if (node.kind === "core") return { x: 0, y: 1 };
  if (node.kind === "region") return { x: -(node.x || 0), y: -(node.y || 0) };
  const region = regionsById.get(node.regionId);
  return {
    x: (node.x || 0) - (region?.x || 0),
    y: (node.y || 0) - (region?.y || 0),
  };
}

function nodeObstacle(node: ForceNode, selectedNodeId: string, globalScale: number): GraphLabelRect {
  const radius = nodeRadius(node) + (node.id === selectedNodeId ? 4 : 1.5) + 2 / globalScale;
  const x = node.x || 0;
  const y = node.y || 0;
  return { left: x - radius, right: x + radius, top: y - radius, bottom: y + radius };
}

function endpointStatus(endpoint: string | RegionGraphNode, nodes: Map<string, RegionGraphNode>) {
  return typeof endpoint === "string" ? nodes.get(endpoint)?.status : endpoint.status;
}

export default function RegionIntelligenceViewport({ regions, citations, batch, compact = false, pictureInPicture = false, expanded = false, fullscreen = false, activeRegionId = "", onSelectRegion, onSelectEvidence }: Props) {
  const graph = useMemo(() => buildRegionGraph(regions, citations, batch), [regions, citations, batch]);
  const reduced = useReducedMotion();
  const fitCompact = compact || (pictureInPicture && !expanded);
  const wrapRef = useRef<HTMLDivElement>(null);
  const graphRef = useRef<ForceGraphMethods<ForceNode, ForceLink> | undefined>(undefined);
  const positionsRef = useRef<Record<string, { x: number; y: number; vx?: number; vy?: number }>>({});
  const labelPlacementsRef = useRef<Map<string, GraphLabelPlacement>>(new Map());
  const configuredDataRef = useRef<unknown>(null);
  const [size, setSize] = useState({ width: 1100, height: pictureInPicture ? (expanded ? 500 : 300) : compact ? 260 : 570 });
  const [selectedId, setSelectedId] = useState(activeRegionId || regions[0]?.id || "");
  const [selectedNodeId, setSelectedNodeId] = useState(`region:${activeRegionId || regions[0]?.id || ""}`);
  useEffect(() => {
    if (activeRegionId) {
      setSelectedId(activeRegionId);
      setSelectedNodeId((current) => current.startsWith("evidence:") || current.startsWith("dimension:") ? current : `region:${activeRegionId}`);
    }
  }, [activeRegionId]);
  useEffect(() => {
    const element = wrapRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setSize({ width: Math.max(320, Math.floor(entry.contentRect.width)), height: Math.max(220, Math.floor(entry.contentRect.height)) }));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(
      () => fitNetwork(graphRef.current, fitCompact, fullscreen),
      fullscreen ? 40 : fitCompact ? 240 : 420,
    );
    return () => window.clearTimeout(timer);
  }, [fitCompact, fullscreen, size.height, size.width, graph]);

  const forceData = useMemo(() => {
    const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
    const nodes: ForceNode[] = graph.nodes.map((node) => {
      const previous = positionsRef.current[node.id];
      const initial = { x: node.position[0] * 34, y: node.position[1] * 34 };
      return {
        ...node,
        x: previous?.x ?? initial.x,
        y: previous?.y ?? initial.y,
        vx: previous?.vx,
        vy: previous?.vy,
        ...(node.kind === "core" ? { fx: 0, fy: 0 } : {}),
      };
    });
    const links: ForceLink[] = graph.edges.map((edge) => ({
      ...edge,
      active: ACTIVE_PHASES.has(endpointStatus(edge.source, nodesById) || "") || ACTIVE_PHASES.has(endpointStatus(edge.target, nodesById) || ""),
    }));
    return { nodes, links };
  }, [graph]);

  const selected = regions.find((region) => region.id === selectedId);
  const selectedItem = batch?.items.find((item) => item.regionId === selectedId);
  const selectedSources = citations.filter((source) => source.regionId === selectedId);
  const selectedPlayerVoices = selectedSources.filter((source) => source.dimension === "player").length;
  const selectedGraphNode = forceData.nodes.find((node) => node.id === selectedNodeId);
  const selectedCitation = selectedGraphNode?.citationId ? citations.find((source) => source.id === selectedGraphNode.citationId) : undefined;
  const confidence = selected?.analysis
    ? [selected.analysis.playerSignals, selected.analysis.marketEnvironment, selected.analysis.sentimentAndCompetition, selected.analysis.culturalMoments]
      .flat().reduce((count, claim) => ({ ...count, [claim.confidence]: count[claim.confidence] + 1 }), { high: 0, medium: 0, low: 0 })
    : { high: 0, medium: 0, low: 0 };
  const progressText = batch
    ? `${batch.qualityPassed} / ${batch.total} 个区域质量通过，${batch.evidenceGap} 个待补充，${batch.processing} 个处理中`
    : "等待开始全区域研究";

  const selectNode = (node: ForceNode, revealEvidence = false) => {
    setSelectedNodeId(node.id);
    if (node.regionId) {
      setSelectedId(node.regionId);
      onSelectRegion?.(node.regionId);
    }
    if (revealEvidence && node.kind === "evidence" && node.citationId) {
      onSelectEvidence?.(node.citationId, node.regionId);
    }
  };

  const configurePhysics = () => {
    const api = graphRef.current;
    if (!api || configuredDataRef.current === forceData) return;
    configuredDataRef.current = forceData;
    const charge = api.d3Force("charge");
    charge?.strength?.((node: ForceNode) => node.kind === "core" ? -82 : node.kind === "region" ? -38 : node.kind === "dimension" ? -10 : -1.8);
    charge?.distanceMax?.(240);
    const link = api.d3Force("link");
    link?.distance?.((item: ForceLink) => item.kind === "core" ? 38 : item.kind === "similarity" ? 48 : item.kind === "dimension" ? 16 : 12.5);
    link?.strength?.((item: ForceLink) => item.kind === "core" ? 0.9 : item.kind === "similarity" ? 0.1 : item.kind === "dimension" ? 0.96 : 1);
    api.d3Force("collision", forceCollide<ForceNode>().radius((node) => nodeRadius(node) + 1).strength(0.96).iterations(3) as never);
    api.d3ReheatSimulation();
  };

  const prepareLabelLayout = (context: CanvasRenderingContext2D, globalScale: number) => {
    const visibleLabels = forceData.nodes
      .filter((node) => showNodeLabel(node, selectedId))
      .sort((left, right) => {
        const priority = { core: 0, region: 1, dimension: 2, evidence: 3 } as const;
        return priority[left.kind] - priority[right.kind] || left.id.localeCompare(right.id);
      });
    const regionsById = new Map(forceData.nodes.filter((node) => node.kind === "region").map((node) => [node.regionId, node]));
    const obstacleNodes = forceData.nodes.filter((node) => node.kind === "core" || node.kind === "region" || (node.kind === "dimension" && node.regionId === selectedId));
    const occupied: GraphLabelRect[] = [];
    const placements = new Map<string, GraphLabelPlacement>();

    for (const node of visibleLabels) {
      const style = labelStyle(node, globalScale);
      context.save();
      context.font = style.font;
      const width = context.measureText(node.label).width;
      context.restore();
      const placement = placeGraphLabel({
        nodeX: node.x || 0,
        nodeY: node.y || 0,
        nodeRadius: nodeRadius(node),
        width,
        height: style.fontSize * 1.22,
        gap: 4.5 / globalScale,
        padding: 1.8 / globalScale,
        preferredDirection: preferredLabelDirection(node, regionsById),
        occupied,
        obstacles: obstacleNodes
          .filter((candidate) => candidate.id !== node.id)
          .map((candidate) => nodeObstacle(candidate, selectedNodeId, globalScale)),
      });
      placements.set(node.id, placement);
      occupied.push(placement.rect);
    }
    labelPlacementsRef.current = placements;
  };

  const drawLabels = (context: CanvasRenderingContext2D, globalScale: number) => {
    const visibleLabels = forceData.nodes
      .filter((node) => showNodeLabel(node, selectedId))
      .sort((left, right) => {
        const priority = { core: 0, region: 1, dimension: 2, evidence: 3 } as const;
        return priority[left.kind] - priority[right.kind] || left.id.localeCompare(right.id);
      });

    for (const node of visibleLabels) {
      const placement = labelPlacementsRef.current.get(node.id);
      if (!placement) continue;
      const x = node.x || 0;
      const y = node.y || 0;
      const radius = nodeRadius(node);
      const style = labelStyle(node, globalScale);
      context.save();
      if (placement.detached) {
        const endX = Math.max(placement.rect.left, Math.min(x, placement.rect.right));
        const endY = Math.max(placement.rect.top, Math.min(y, placement.rect.bottom));
        const deltaX = endX - x;
        const deltaY = endY - y;
        const distance = Math.max(0.001, Math.hypot(deltaX, deltaY));
        context.beginPath();
        context.moveTo(x + deltaX / distance * (radius + 1), y + deltaY / distance * (radius + 1));
        context.lineTo(endX, endY);
        context.strokeStyle = "#9bcfd5";
        context.globalAlpha = 0.62;
        context.lineWidth = 0.7 / globalScale;
        context.stroke();
        context.globalAlpha = 1;
      }
      context.font = style.font;
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillStyle = style.color;
      context.fillText(node.label, placement.x, placement.y);
      context.restore();
    }
  };

  const drawNode = (rawNode: NodeObject<ForceNode>, context: CanvasRenderingContext2D, globalScale: number) => {
    const node = rawNode as ForceNode;
    const x = node.x || 0;
    const y = node.y || 0;
    const radius = nodeRadius(node);
    const colors = nodeColors(node);
    const selectedNode = node.id === selectedNodeId;
    context.save();
    if (ACTIVE_PHASES.has(node.status) && !reduced) {
      const pulse = radius + 4 + (Math.sin(Date.now() / 280) + 1) * 1.5;
      context.beginPath(); context.arc(x, y, pulse, 0, Math.PI * 2); context.strokeStyle = "#27b7ca"; context.globalAlpha = 0.48; context.lineWidth = 1 / globalScale; context.stroke(); context.globalAlpha = 1;
    }
    if (selectedNode) {
      context.beginPath(); context.arc(x, y, radius + 4, 0, Math.PI * 2); context.strokeStyle = "#102433"; context.lineWidth = 1.7 / globalScale; context.stroke();
    }
    context.beginPath(); context.arc(x, y, radius, 0, Math.PI * 2); context.fillStyle = colors.fill; context.fill(); context.strokeStyle = colors.stroke; context.lineWidth = (node.kind === "region" ? 1.5 : 1) / globalScale; context.stroke();
    context.restore();
  };

  const paintPointerArea = (rawNode: NodeObject<ForceNode>, color: string, context: CanvasRenderingContext2D) => {
    const node = rawNode as ForceNode;
    context.fillStyle = color;
    context.beginPath();
    context.arc(node.x || 0, node.y || 0, nodeRadius(node) + 4, 0, Math.PI * 2);
    context.fill();
  };

  return <section className={`${styles.viewport} ${compact ? styles.compact : ""} ${pictureInPicture ? styles.pip : ""} ${expanded ? styles.pipExpanded : ""} ${fullscreen ? styles.fullscreen : ""}`} aria-label="区域情报节点图">
    <div className={styles.instrumentBar}>
      <div><span className="mono">REGIONAL INTELLIGENCE GRAPH</span><strong>{batch?.status === "completed" ? "全球差异网络已锁定" : batch ? "正在建立区域信号连接" : "区域情报节点图"}</strong></div>
      <div className={styles.progressReadout}><span className="mono">QUALITY PASSED</span><strong>{batch?.qualityPassed || regions.filter((region) => region.status === "quality_passed").length}<small> / {batch?.total || regions.length}</small></strong></div>
    </div>
    <div
      ref={wrapRef}
      className={styles.graphWrap}
      role="application"
      aria-label="可缩放并拖拽单个节点的区域证据网络"
      data-renderer="canvas-force"
      data-pan-enabled="false"
      data-node-drag-enabled="true"
      data-node-count={forceData.nodes.length}
      data-evidence-count={forceData.nodes.filter((node) => node.kind === "evidence").length}
    >
      <ForceGraph2D<ForceNode, ForceLink>
        ref={graphRef}
        width={size.width}
        height={size.height}
        graphData={forceData}
        backgroundColor="#f5f8fa"
        nodeId="id"
        nodeLabel={(node) => `${node.kind === "evidence" ? "来源" : node.kind === "dimension" ? "研究维度" : node.kind === "region" ? "区域" : "基线"} · ${node.label}`}
        nodeCanvasObject={drawNode}
        nodeCanvasObjectMode={() => "replace"}
        nodePointerAreaPaint={paintPointerArea}
        onRenderFramePre={prepareLabelLayout}
        onRenderFramePost={drawLabels}
        linkColor={(link) => link.kind === "core" ? "#76cbd5" : link.kind === "dimension" ? "#9ccbd2" : link.kind === "similarity" ? "#60717d" : "#b7c7cf"}
        linkWidth={(link) => link.active ? 1.25 : link.kind === "core" ? 0.9 : link.kind === "similarity" ? 0.45 : 0.58}
        linkLineDash={(link) => link.kind === "similarity" ? [2, 7] : null}
        linkCurvature={(link) => link.kind === "similarity" ? 0.1 : 0}
        linkDirectionalParticles={(link) => !reduced && link.active && link.kind === "core" ? 2 : 0}
        linkDirectionalParticleWidth={2.4}
        linkDirectionalParticleColor="#27b7ca"
        linkDirectionalParticleSpeed={0.008}
        d3AlphaDecay={0.025}
        d3VelocityDecay={0.34}
        cooldownTime={30_000}
        autoPauseRedraw={reduced}
        minZoom={0.35}
        maxZoom={5}
        enableNodeDrag
        enablePanInteraction={false}
        enableZoomInteraction
        showPointerCursor
        onNodeClick={(node) => selectNode(node as ForceNode, true)}
        onNodeDrag={(node) => selectNode(node as ForceNode)}
        onNodeDragEnd={(rawNode) => {
          const node = rawNode as ForceNode;
          if (node.kind === "core") { node.fx = 0; node.fy = 0; return; }
          node.fx = node.x; node.fy = node.y;
          window.setTimeout(() => { node.fx = undefined; node.fy = undefined; graphRef.current?.d3ReheatSimulation(); }, 180);
        }}
        onEngineTick={() => {
          configurePhysics();
          for (const node of forceData.nodes) if (node.x !== undefined && node.y !== undefined) positionsRef.current[node.id] = { x: node.x, y: node.y, vx: node.vx, vy: node.vy };
        }}
        onEngineStop={() => fitNetwork(graphRef.current, fitCompact, fullscreen)}
      />
      <div className={styles.graphTools} aria-label="节点图视图控制">
        <button type="button" onClick={() => graphRef.current?.zoom((graphRef.current.zoom() || 1) * 1.2, 180)} aria-label="放大节点图">＋</button>
        <button type="button" onClick={() => graphRef.current?.zoom((graphRef.current.zoom() || 1) * 0.84, 180)} aria-label="缩小节点图">－</button>
        <button type="button" onClick={() => { for (const node of forceData.nodes) if (node.kind !== "core") { node.fx = undefined; node.fy = undefined; } graphRef.current?.d3ReheatSimulation(); fitNetwork(graphRef.current, fitCompact, fullscreen); }}>重新整理</button>
      </div>
      <div className={styles.graphLegend}><span>拖拽节点施加物理作用</span><span>拖拽空白移动</span><span>滚轮缩放</span><span>{forceData.nodes.length} 节点</span><span>{forceData.links.length} 连线</span><span>{citations.length} 条完整来源</span></div>
    </div>
    <div className={styles.detailBar}>
      <div className={styles.liveStatus} aria-live="polite"><span className="mono">LIVE STATUS</span><strong>{progressText}</strong><small>当前并发 {batch?.activeConcurrency || 0}</small></div>
      <div className={styles.nodeDetail}>
        <span className="mono">SELECTED NODE</span>
        <strong>{selectedGraphNode?.label || selected?.name || "版本事实基线"}</strong>
        <div><span>{selectedGraphNode?.kind || "region"}</span><span>{selectedItem?.phase || selected?.status || "ready"}</span><span>{selectedSources.length} 来源</span><span>玩家声音 {selectedPlayerVoices} · {selectedSources.length ? Math.round(selectedPlayerVoices / selectedSources.length * 100) : 0}%</span><span>H {confidence.high} · M {confidence.medium} · L {confidence.low}</span></div>
        {selectedCitation ? <a href={selectedCitation.url} target="_blank" rel="noreferrer">打开来源 · {selectedCitation.publisher || selectedCitation.id}</a> : null}
        {selectedItem?.error ? <p>{selectedItem.error}</p> : null}
      </div>
    </div>
  </section>;
}
