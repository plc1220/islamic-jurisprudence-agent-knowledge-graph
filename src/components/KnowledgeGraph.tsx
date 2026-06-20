import React, { useEffect, useMemo, useRef, useState } from "react";
import * as d3 from "d3";
import { KnowledgeNode, KnowledgeLink } from "../types";
import { Maximize2, Minimize2, ZoomIn, ZoomOut, RefreshCw, RotateCcw } from "lucide-react";

interface KnowledgeGraphProps {
  nodes: KnowledgeNode[];
  links: KnowledgeLink[];
  onNodeSelect?: (node: KnowledgeNode) => void;
  selectedNodeId?: string | null;
  onResetGraph?: () => void;
}

type GraphNodeDatum = KnowledgeNode & d3.SimulationNodeDatum;
type GraphLinkDatum = {
  source: string | GraphNodeDatum;
  target: string | GraphNodeDatum;
  relation: string;
};
type LayoutPoint = { x: number; y: number };
type CachedLayout = {
  positions: Record<string, LayoutPoint>;
  transform?: { x: number; y: number; k: number };
};

const MAJOR_NODE_TYPES = new Set(["Konsep", "Sumber", "Mazhab", "Institusi"]);
const layoutCache = new Map<string, CachedLayout>();
const MAX_CACHED_LAYOUTS = 8;

function getNodeColor(type: string) {
  switch (type) {
    case "Konsep":
      return "#5A634A";
    case "Hukum":
      return "#A48F68";
    case "Sumber":
      return "#8B9474";
    case "Mazhab":
      return "#6D685E";
    case "Institusi":
      return "#2D2B26";
    case "Artikkel":
      return "#C4B295";
    default:
      return "#8A8478";
  }
}

function getLinkNodeId(value: string | GraphNodeDatum | KnowledgeNode) {
  return typeof value === "string" ? value : value.id;
}

function buildGraphSignature(nodes: KnowledgeNode[], links: KnowledgeLink[]) {
  const nodePart = nodes
    .map((node) => `${node.id}:${node.type}`)
    .sort()
    .join("|");
  const linkPart = links
    .map((link) => {
      const source = typeof link.source === "object" ? link.source.id : link.source;
      const target = typeof link.target === "object" ? link.target.id : link.target;
      return `${source}:${link.relation}:${target}`;
    })
    .sort()
    .join("|");
  return `${nodePart}::${linkPart}`;
}

function rememberLayout(signature: string, layout: CachedLayout) {
  if (!layoutCache.has(signature) && layoutCache.size >= MAX_CACHED_LAYOUTS) {
    const oldestKey = layoutCache.keys().next().value;
    if (oldestKey) layoutCache.delete(oldestKey);
  }
  layoutCache.set(signature, layout);
}

function isFinitePoint(point?: LayoutPoint) {
  return Boolean(point && Number.isFinite(point.x) && Number.isFinite(point.y));
}

export function KnowledgeGraph({
  nodes,
  links,
  onNodeSelect,
  selectedNodeId,
  onResetGraph,
}: KnowledgeGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [dimensions, setDimensions] = useState({ width: 600, height: 400 });
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);
  const graphSignature = useMemo(() => buildGraphSignature(nodes, links), [nodes, links]);

  const zoomBehaviorRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const selectedNodeIdRef = useRef<string | null>(selectedNodeId ?? null);
  const currentZoomRef = useRef(0.9);
  const onNodeSelectRef = useRef(onNodeSelect);
  const nodesByIdRef = useRef<Map<string, GraphNodeDatum>>(new Map());
  const fitToGraphRef = useRef<(duration?: number) => void>(() => undefined);
  const focusNodeRef = useRef<(nodeId: string, duration?: number) => void>(() => undefined);
  const applyVisualStateRef = useRef<() => void>(() => undefined);
  const lastFocusedNodeIdRef = useRef<string | null>(null);
  const markerIdRef = useRef(`arrowhead-${Math.random().toString(36).slice(2)}`);

  useEffect(() => {
    onNodeSelectRef.current = onNodeSelect;
  }, [onNodeSelect]);

  useEffect(() => {
    if (!containerRef.current) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setDimensions({
          width: Math.max(width, 300),
          height: Math.max(height, 400),
        });
      }
    });

    resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, []);

  useEffect(() => {
    if (!svgRef.current || !nodes.length) return;

    const { width, height } = dimensions;
    const svg = d3.select(svgRef.current);
    const cachedLayout = layoutCache.get(graphSignature);
    const cachedPositions = cachedLayout?.positions || {};

    svg.selectAll("*").remove();

    const g = svg.append("g").attr("class", "graph-content");

    svg
      .append("defs")
      .append("marker")
      .attr("id", markerIdRef.current)
      .attr("viewBox", "0 -5 10 10")
      .attr("refX", 22)
      .attr("refY", 0)
      .attr("markerWidth", 6)
      .attr("markerHeight", 6)
      .attr("orient", "auto")
      .append("path")
      .attr("d", "M0,-5L10,0L0,5")
      .attr("fill", "rgba(90, 99, 74, 0.45)");

    const d3Nodes: GraphNodeDatum[] = nodes.map((node) => {
      const cachedPoint = cachedPositions[node.id];
      return {
        ...node,
        x: cachedPoint?.x,
        y: cachedPoint?.y,
      };
    });
    const d3Links: GraphLinkDatum[] = links.map((link) => ({
      source: typeof link.source === "object" ? link.source.id : link.source,
      target: typeof link.target === "object" ? link.target.id : link.target,
      relation: link.relation,
    }));

    const degreeMap = new Map<string, number>();
    d3Nodes.forEach((node) => degreeMap.set(node.id, 0));
    d3Links.forEach((link) => {
      const source = getLinkNodeId(link.source);
      const target = getLinkNodeId(link.target);
      degreeMap.set(source, (degreeMap.get(source) || 0) + 1);
      degreeMap.set(target, (degreeMap.get(target) || 0) + 1);
    });

    const priorityLabelCount = nodes.length > 80 ? 12 : 8;
    const priorityLabelIds = new Set(
      [...degreeMap.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, priorityLabelCount)
        .map(([id]) => id)
    );

    const getNodeRadius = (node: KnowledgeNode) => {
      const degree = degreeMap.get(node.id) || 0;
      const base = MAJOR_NODE_TYPES.has(node.type) ? 14 : 11;
      const selectedBoost = node.id === selectedNodeIdRef.current ? 2 : 0;
      return Math.min(24, base + degree * 1.35 + selectedBoost);
    };

    const getLabelOpacity = (node: KnowledgeNode, zoom: number) => {
      const degree = degreeMap.get(node.id) || 0;
      const isRootNode =
        node.id === "syariah" ||
        node.id === "feqah" ||
        node.id === "hukum" ||
        node.id === "mazhab_syafii";

      if (node.id === selectedNodeIdRef.current || isRootNode) return 1;
      if (priorityLabelIds.has(node.id)) return 1;
      if (zoom >= 1.75) return 1;
      if (zoom >= 1.35 && (degree >= 2 || MAJOR_NODE_TYPES.has(node.type))) return 0.9;
      return 0;
    };

    const simulation = d3
      .forceSimulation(d3Nodes)
      .force(
        "link",
        d3
          .forceLink<GraphNodeDatum, GraphLinkDatum>(d3Links)
          .id((d) => d.id)
          .distance((link) => {
            const sourceDegree = degreeMap.get(getLinkNodeId(link.source)) || 1;
            const targetDegree = degreeMap.get(getLinkNodeId(link.target)) || 1;
            return Math.max(90, 150 - Math.min(sourceDegree + targetDegree, 36) * 2);
          })
      )
      .force("charge", d3.forceManyBody<GraphNodeDatum>().strength(-360))
      .force("x", d3.forceX<GraphNodeDatum>(width / 2).strength(0.055))
      .force("y", d3.forceY<GraphNodeDatum>(height / 2).strength(0.055))
      .force("collision", d3.forceCollide<GraphNodeDatum>().radius((d) => getNodeRadius(d) + 34))
      .stop();

    const hasCompleteCachedLayout = d3Nodes.every((node) => isFinitePoint(cachedPositions[node.id]));
    if (!hasCompleteCachedLayout) {
      simulation.tick(Math.min(460, 120 + d3Nodes.length * 2));
    }

    nodesByIdRef.current = new Map(d3Nodes.map((node) => [node.id, node]));

    const persistPositions = () => {
      const positions = Object.fromEntries(
        d3Nodes.map((node) => [
          node.id,
          {
            x: Number(node.x || 0),
            y: Number(node.y || 0),
          },
        ])
      );
      rememberLayout(graphSignature, {
        positions,
        transform: layoutCache.get(graphSignature)?.transform,
      });
    };
    persistPositions();

    const link = g
      .append("g")
      .attr("class", "links")
      .selectAll<SVGLineElement, GraphLinkDatum>("line")
      .data(d3Links)
      .enter()
      .append("line")
      .attr("stroke", "rgba(90, 99, 74, 0.18)")
      .attr("stroke-width", 1.8)
      .attr("stroke-linecap", "round")
      .attr("marker-end", `url(#${markerIdRef.current})`);

    const linkText = g
      .append("g")
      .attr("class", "link-labels")
      .selectAll<SVGTextElement, GraphLinkDatum>("text")
      .data(d3Links)
      .enter()
      .append("text")
      .text((d) => d.relation)
      .attr("font-family", "monospace")
      .attr("font-size", "8px")
      .attr("font-weight", "500")
      .attr("fill", "#8A8478")
      .attr("text-anchor", "middle")
      .attr("dy", -5)
      .attr("opacity", 0)
      .style("pointer-events", "none");

    const node = g
      .append("g")
      .attr("class", "nodes")
      .selectAll<SVGGElement, GraphNodeDatum>("g")
      .data(d3Nodes)
      .enter()
      .append("g")
      .attr("class", "node-group")
      .attr("cursor", "pointer")
      .on("mouseenter", function (_event, d) {
        d3.select(this).raise();
        d3.select(this)
          .select<SVGCircleElement>("circle.entity-node")
          .attr("stroke", "#0F766E")
          .attr("stroke-width", 3);
        d3.select(this)
          .select<SVGTextElement>("text.node-label")
          .attr("opacity", 1)
          .attr("font-weight", 750)
          .attr("fill", "#2D2B26");
      })
      .on("mouseleave", () => {
        applyVisualStateRef.current();
      })
      .on("click", (_event, d) => {
        selectedNodeIdRef.current = d.id;
        lastFocusedNodeIdRef.current = d.id;
        applyVisualStateRef.current();
        focusNodeRef.current(d.id, 560);
        onNodeSelectRef.current?.(d);
      })
      .call(
        d3
          .drag<SVGGElement, GraphNodeDatum>()
          .on("start", (_event, d) => {
            d.fx = d.x;
            d.fy = d.y;
          })
          .on("drag", (event, d) => {
            d.x = event.x;
            d.y = event.y;
            d.fx = event.x;
            d.fy = event.y;
            updatePositions();
            persistPositions();
          })
          .on("end", (_event, d) => {
            d.fx = null;
            d.fy = null;
            persistPositions();
          })
      );

    node.append("title").text((d) => `${d.label} · ${d.type}`);

    const selectedRing = node
      .append("circle")
      .attr("class", "selected-ring")
      .attr("fill", "none")
      .attr("stroke", "#0F766E")
      .attr("stroke-width", 1.7)
      .attr("stroke-dasharray", "3 3")
      .attr("stroke-opacity", 0)
      .style("pointer-events", "none");

    const entityCircle = node
      .append("circle")
      .attr("class", "entity-node")
      .attr("fill", (d) => getNodeColor(d.type))
      .attr("filter", "drop-shadow(0px 2px 4px rgba(90,99,74,0.15))");

    const nodeLabels = node
      .append("text")
      .text((d) => d.label)
      .attr("class", "node-label")
      .attr("font-family", "var(--font-sans)")
      .attr("text-anchor", "middle")
      .style("pointer-events", "none")
      .style("paint-order", "stroke")
      .style("stroke", "#FDFBF7")
      .style("stroke-width", "3px")
      .style("stroke-linecap", "round")
      .style("stroke-linejoin", "round");

    const updatePositions = () => {
      link
        .attr("x1", (d) => (d.source as GraphNodeDatum).x || 0)
        .attr("y1", (d) => (d.source as GraphNodeDatum).y || 0)
        .attr("x2", (d) => (d.target as GraphNodeDatum).x || 0)
        .attr("y2", (d) => (d.target as GraphNodeDatum).y || 0);

      linkText
        .attr("x", (d) => (((d.source as GraphNodeDatum).x || 0) + ((d.target as GraphNodeDatum).x || 0)) / 2)
        .attr("y", (d) => (((d.source as GraphNodeDatum).y || 0) + ((d.target as GraphNodeDatum).y || 0)) / 2);

      node.attr("transform", (d) => `translate(${d.x || 0},${d.y || 0})`);
    };

    const getConnectedIds = (nodeId: string | null) => {
      const connected = new Set<string>();
      if (!nodeId) return connected;
      connected.add(nodeId);
      d3Links.forEach((linkDatum) => {
        const sourceId = getLinkNodeId(linkDatum.source);
        const targetId = getLinkNodeId(linkDatum.target);
        if (sourceId === nodeId) connected.add(targetId);
        if (targetId === nodeId) connected.add(sourceId);
      });
      return connected;
    };

    const applyVisualState = () => {
      const selectedId = selectedNodeIdRef.current;
      const connected = getConnectedIds(selectedId);
      const zoom = currentZoomRef.current;

      link
        .attr("stroke", (d) => {
          if (!selectedId) return "rgba(90, 99, 74, 0.18)";
          const sourceId = getLinkNodeId(d.source);
          const targetId = getLinkNodeId(d.target);
          return sourceId === selectedId || targetId === selectedId
            ? "rgba(15, 118, 110, 0.52)"
            : "rgba(90, 99, 74, 0.08)";
        })
        .attr("stroke-width", (d) => {
          if (!selectedId) return 1.8;
          const sourceId = getLinkNodeId(d.source);
          const targetId = getLinkNodeId(d.target);
          return sourceId === selectedId || targetId === selectedId ? 2.4 : 1.2;
        });

      entityCircle
        .attr("r", (d) => getNodeRadius(d))
        .attr("stroke", (d) => (d.id === selectedId ? "#0F766E" : connected.has(d.id) ? "#A7D8CF" : "#E5E1D8"))
        .attr("stroke-width", (d) => (d.id === selectedId ? 3 : connected.has(d.id) ? 2 : 1.5))
        .attr("opacity", (d) => (!selectedId || connected.has(d.id) ? 1 : 0.72));

      selectedRing
        .attr("r", (d) => getNodeRadius(d) + 6)
        .attr("stroke-opacity", (d) => (d.id === selectedId ? 0.82 : 0));

      nodeLabels
        .attr("dy", (d) => getNodeRadius(d) + 16)
        .attr("opacity", (d) => {
          if (selectedId && connected.has(d.id)) return 1;
          return getLabelOpacity(d, zoom);
        })
        .attr("font-size", zoom >= 1.35 ? "10.5px" : "9.5px")
        .attr("font-weight", (d) => (d.id === selectedId || connected.has(d.id) || MAJOR_NODE_TYPES.has(d.type) ? "700" : "500"))
        .attr("fill", (d) => (d.id === selectedId ? "#2D2B26" : "#4A4741"));

      linkText.attr("opacity", (d) => {
        if (zoom >= 1.55) return 0.65;
        if (!selectedId) return 0;
        const sourceId = getLinkNodeId(d.source);
        const targetId = getLinkNodeId(d.target);
        return sourceId === selectedId || targetId === selectedId ? 0.72 : 0;
      });
    };

    const computeFitTransform = () => {
      const finiteNodes = d3Nodes.filter((node) => Number.isFinite(node.x) && Number.isFinite(node.y));
      if (!finiteNodes.length) return d3.zoomIdentity.scale(0.9);

      const xExtent = d3.extent(finiteNodes, (node) => node.x || 0) as [number, number];
      const yExtent = d3.extent(finiteNodes, (node) => node.y || 0) as [number, number];
      const graphWidth = Math.max(1, xExtent[1] - xExtent[0]);
      const graphHeight = Math.max(1, yExtent[1] - yExtent[0]);
      const padding = 72;
      const scale = Math.max(
        0.28,
        Math.min(1.08, Math.min((width - padding * 2) / graphWidth, (height - padding * 2) / graphHeight))
      );
      const centerX = (xExtent[0] + xExtent[1]) / 2;
      const centerY = (yExtent[0] + yExtent[1]) / 2;

      return d3.zoomIdentity.translate(width / 2 - centerX * scale, height / 2 - centerY * scale).scale(scale);
    };

    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.28, 3.2])
      .on("zoom", (event) => {
        currentZoomRef.current = event.transform.k;
        g.attr("transform", event.transform);
        applyVisualState();
        setZoomLevel(event.transform.k);

        const stored = layoutCache.get(graphSignature);
        if (stored) {
          stored.transform = {
            x: event.transform.x,
            y: event.transform.y,
            k: event.transform.k,
          };
        }
      });

    const fitToGraph = (duration = 0) => {
      if (!svgRef.current || !zoomBehaviorRef.current) return;
      const transform = computeFitTransform();
      const selection = d3.select(svgRef.current);
      if (duration > 0) {
        selection.transition().duration(duration).ease(d3.easeCubicOut).call(zoomBehaviorRef.current.transform, transform);
      } else {
        selection.call(zoomBehaviorRef.current.transform, transform);
      }
    };

    const focusNode = (nodeId: string, duration = 560) => {
      const targetNode = nodesByIdRef.current.get(nodeId);
      if (!targetNode || !svgRef.current || !zoomBehaviorRef.current) return;

      const currentScale = currentZoomRef.current || 1;
      const scale = Math.max(1.35, Math.min(2.15, currentScale < 1.1 ? 1.45 : currentScale));
      const transform = d3.zoomIdentity
        .translate(width / 2 - (targetNode.x || 0) * scale, height / 2 - (targetNode.y || 0) * scale)
        .scale(scale);

      d3.select(svgRef.current)
        .transition()
        .duration(duration)
        .ease(d3.easeCubicOut)
        .call(zoomBehaviorRef.current.transform, transform);
    };

    zoomBehaviorRef.current = zoom;
    fitToGraphRef.current = fitToGraph;
    focusNodeRef.current = focusNode;
    applyVisualStateRef.current = applyVisualState;

    svg.call(zoom);
    updatePositions();

    if (cachedLayout?.transform) {
      svg.call(
        zoom.transform,
        d3.zoomIdentity
          .translate(cachedLayout.transform.x, cachedLayout.transform.y)
          .scale(cachedLayout.transform.k)
      );
    } else {
      fitToGraph(0);
    }

    applyVisualState();
    lastFocusedNodeIdRef.current = selectedNodeIdRef.current;

    return () => {
      simulation.stop();
      svg.on(".zoom", null);
    };
  }, [nodes, links, dimensions, graphSignature]);

  useEffect(() => {
    selectedNodeIdRef.current = selectedNodeId ?? null;
    applyVisualStateRef.current();

    if (!selectedNodeId || selectedNodeId === lastFocusedNodeIdRef.current) return;
    lastFocusedNodeIdRef.current = selectedNodeId;
    focusNodeRef.current(selectedNodeId, 560);
  }, [selectedNodeId]);

  const handleZoom = (factor: number) => {
    if (!svgRef.current || !zoomBehaviorRef.current) return;
    const svg = d3.select(svgRef.current);
    if (factor === 1) {
      fitToGraphRef.current(520);
      return;
    }
    svg.transition().duration(280).ease(d3.easeCubicOut).call(zoomBehaviorRef.current.scaleBy, factor);
  };

  return (
    <div
      ref={containerRef}
      className={`relative rounded-2xl border border-[#E5E1D8] bg-[#FDFBF7] overflow-hidden ${
        isFullscreen ? "fixed inset-0 z-50 h-screen w-screen" : "h-[520px] w-full"
      } transition-all duration-300 shadow-inner`}
    >
      <div className="absolute inset-0 bg-radial-gradient from-[#5A634A]/5 via-transparent to-transparent pointer-events-none" />

      <div className="absolute inset-0 islamic-grid pointer-events-none opacity-40" />

      <div className="absolute top-4 left-4 z-10 flex flex-wrap gap-2 max-w-[85%] pointer-events-none">
        {["Konsep", "Hukum", "Sumber", "Mazhab", "Institusi", "Artikkel"].map((type) => (
          <span
            key={type}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/90 backdrop-blur-md border border-[#E5E1D8] text-[10px] text-[#3D3B36] font-bold whitespace-nowrap shadow-sm pointer-events-auto transition-transform hover:scale-105"
          >
            <span
              className="w-2.5 h-2.5 rounded-full inline-block shrink-0"
              style={{ backgroundColor: getNodeColor(type) }}
            />
            {type === "Artikkel" ? "Artikel" : type}
          </span>
        ))}
      </div>

      <div className="absolute top-4 right-4 z-10 flex items-center gap-1 rounded-full bg-white/90 p-1 shadow-sm ring-1 ring-[#E5E1D8] backdrop-blur-md pointer-events-auto">
        {onResetGraph && (
          <button
            onClick={onResetGraph}
            className="p-2 rounded-full text-[#0F766E] hover:bg-[#E5F2EE] active:scale-95 transition-transform cursor-pointer"
            title="Reset Graf"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        )}
        <button
          onClick={() => handleZoom(1.2)}
          className="p-2 rounded-full text-[#5A634A] hover:bg-[#EAE7DF] active:scale-95 transition-transform cursor-pointer"
          title="Zoom Masuk"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        <button
          onClick={() => handleZoom(0.8)}
          className="p-2 rounded-full text-[#5A634A] hover:bg-[#EAE7DF] active:scale-95 transition-transform cursor-pointer"
          title="Zoom Keluar"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <button
          onClick={() => handleZoom(1)}
          className="p-2 rounded-full text-[#5A634A] hover:bg-[#EAE7DF] active:scale-95 transition-transform cursor-pointer"
          title="Muatkan Semua Nod"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
        <button
          onClick={() => setIsFullscreen(!isFullscreen)}
          className="p-2 rounded-full text-[#5A634A] hover:bg-[#EAE7DF] active:scale-95 transition-transform cursor-pointer"
          title={isFullscreen ? "Keluar Skrin Penuh" : "Skrin Penuh"}
        >
          {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
        </button>
      </div>

      <svg
        ref={svgRef}
        width={dimensions.width}
        height={dimensions.height}
        className="block w-full h-full cursor-grab active:cursor-grabbing"
      />

      <div className="absolute bottom-4 left-4 text-[9px] font-mono tracking-wider text-[#6D685E] pointer-events-none select-none bg-white/90 backdrop-blur-md px-3 py-1.5 rounded-full border border-[#E5E1D8] shadow-sm flex items-center gap-2">
        <span className="w-1.5 h-1.5 rounded-full bg-[#5A634A] inline-block" />
        <span className="font-bold">NOD ENTITI: {nodes.length}</span>
        <span className="text-[#D4D0C6]">|</span>
        <span className="font-bold">HUBUNGAN: {links.length}</span>
        <span className="text-[#D4D0C6]">|</span>
        <span className="font-bold">ZOOM: {Math.round(zoomLevel * 100)}%</span>
      </div>
    </div>
  );
}
