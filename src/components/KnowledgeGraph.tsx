import React, { useEffect, useRef, useState } from "react";
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

const MAJOR_NODE_TYPES = new Set(["Konsep", "Sumber", "Mazhab", "Institusi"]);

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
  const zoomBehaviorRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);

  // Maintain container size using a ResizeObserver to prevent canvas stretch & support fluid resize
  useEffect(() => {
    if (!containerRef.current) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (let entry of entries) {
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

  // Map node type to specific theme colors with high contrast Natural Tones compatibility
  const getNodeColor = (type: string) => {
    switch (type) {
      case "Konsep":
        return "#5A634A"; // Sage green
      case "Hukum":
        return "#A48F68"; // Warm Gold
      case "Sumber":
        return "#8B9474"; // Soft Olive
      case "Mazhab":
        return "#6D685E"; // Muted Mud
      case "Institusi":
        return "#2D2B26"; // Dark Wood
      case "Artikkel":
        return "#C4B295"; // Soft Clay
      default:
        return "#8A8478"; // Warm Gray
    };
  };

  useEffect(() => {
    if (!svgRef.current || !nodes.length) return;

    const { width, height } = dimensions;
    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove(); // Clean container for rebuilds

    // Create a container group for zooming
    const g = svg.append("g").attr("class", "graph-content");

    // Setup arrowheads to represent directed ontological dependencies
    svg
      .append("defs")
      .append("marker")
      .attr("id", "arrowhead")
      .attr("viewBox", "0 -5 10 10")
      .attr("refX", 22) // Place at the boundary of a 15px radius node
      .attr("refY", 0)
      .attr("markerWidth", 6)
      .attr("markerHeight", 6)
      .attr("orient", "auto")
      .append("path")
      .attr("d", "M0,-5L10,0L0,5")
      .attr("fill", "rgba(90, 99, 74, 0.4)");

    // Convert raw nodes/links to mutable d3 models safely (avoiding reference mutations)
    const d3Nodes = nodes.map((n) => ({ ...n }));
    const d3Links = links.map((l) => {
      const sourceId = typeof l.source === "object" ? l.source.id : l.source;
      const targetId = typeof l.target === "object" ? l.target.id : l.target;
      return {
        source: sourceId,
        target: targetId,
        relation: l.relation,
      };
    });

    const degreeMap = new Map<string, number>();
    d3Nodes.forEach((node) => degreeMap.set(node.id, 0));
    d3Links.forEach((link) => {
      degreeMap.set(String(link.source), (degreeMap.get(String(link.source)) || 0) + 1);
      degreeMap.set(String(link.target), (degreeMap.get(String(link.target)) || 0) + 1);
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
      const selectedBoost = node.id === selectedNodeId ? 2 : 0;
      return Math.min(24, base + degree * 1.35 + selectedBoost);
    };

    const getLabelOpacity = (node: KnowledgeNode, zoom: number) => {
      const degree = degreeMap.get(node.id) || 0;
      const isRootNode =
        node.id === "syariah" ||
        node.id === "feqah" ||
        node.id === "hukum" ||
        node.id === "mazhab_syafii";

      if (node.id === selectedNodeId || isRootNode) return 1;
      if (priorityLabelIds.has(node.id)) return 1;
      if (zoom >= 1.75) return 1;
      if (zoom >= 1.35 && (degree >= 2 || MAJOR_NODE_TYPES.has(node.type))) return 0.9;
      return 0;
    };

    let currentZoom = 0.9;

    // Create D3 forces
    const simulation = d3
      .forceSimulation(d3Nodes as any)
      .force(
        "link",
        d3
          .forceLink(d3Links)
          .id((d: any) => d.id)
          .distance(130)
      )
      .force("charge", d3.forceManyBody().strength(-320))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collision", d3.forceCollide().radius((d: any) => getNodeRadius(d) + 34));

    // Render links
    const link = g
      .append("g")
      .attr("class", "links")
      .selectAll("line")
      .data(d3Links)
      .enter()
      .append("line")
      .attr("stroke", "rgba(90, 99, 74, 0.15)")
      .attr("stroke-width", 2)
      .attr("marker-end", "url(#arrowhead)");

    // Render link relationship text labels
    const linkText = g
      .append("g")
      .attr("class", "link-labels")
      .selectAll("text")
      .data(d3Links)
      .enter()
      .append("text")
      .text((d: any) => d.relation)
      .attr("font-family", "monospace")
      .attr("font-size", "8px")
      .attr("font-weight", "500")
      .attr("fill", "#8A8478")
      .attr("text-anchor", "middle")
      .attr("dy", -5)
      .attr("opacity", 0);

    // Render nodes
    const node = g
      .append("g")
      .attr("class", "nodes")
      .selectAll("g")
      .data(d3Nodes)
      .enter()
      .append("g")
      .attr("class", "node-group")
      .attr("cursor", "pointer")
      .on("mouseenter", function (_event, d: any) {
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
      .on("mouseleave", function (_event, d: any) {
        d3.select(this)
          .select<SVGCircleElement>("circle.entity-node")
          .attr("stroke", d.id === selectedNodeId ? "#0F766E" : "#E5E1D8")
          .attr("stroke-width", d.id === selectedNodeId ? 3 : 1.5);
        applySemanticZoom(currentZoom);
      })
      .on("click", (event, d: any) => {
        if (onNodeSelect) {
          const originalNode = nodes.find((n) => n.id === d.id);
          if (originalNode) onNodeSelect(originalNode);
        }
      })
      .call(
        d3
          .drag()
          .on("start", dragstarted)
          .on("drag", dragged)
          .on("end", dragended) as any
      );

    node
      .append("title")
      .text((d: any) => `${d.label} · ${d.type}`);

    // Draw circles representing entities
    node
      .append("circle")
      .attr("class", "entity-node")
      .attr("r", (d: any) => getNodeRadius(d))
      .attr("fill", (d: any) => getNodeColor(d.type))
      .attr("stroke", (d: any) =>
        d.id === selectedNodeId ? "#0F766E" : "#E5E1D8"
      )
      .attr("stroke-width", (d: any) => (d.id === selectedNodeId ? 3 : 1.5))
      .attr("filter", "drop-shadow(0px 2px 4px rgba(90,99,74,0.15))")
      .attr("class", "entity-node transition-all duration-200");

    // Dynamic inner indicators or glows for selected nodes
    node
      .filter((d: any) => d.id === selectedNodeId)
      .append("circle")
      .attr("r", (d: any) => getNodeRadius(d) + 5)
      .attr("fill", "none")
      .attr("stroke", "#0F766E")
      .attr("stroke-width", 1.5)
      .attr("stroke-opacity", 0.8)
      .attr("stroke-dasharray", "3 3")
      .attr("class", "animate-[spin_20s_linear_infinite]");

    // Draw short readable human labels
    const nodeLabels = node
      .append("text")
      .text((d: any) => d.label)
      .attr("class", "node-label")
      .attr("font-family", "var(--font-sans)")
      .attr("font-size", "10px")
      .attr("font-weight", (d: any) => (d.id === selectedNodeId ? "700" : "500"))
      .attr("fill", (d: any) => (d.id === selectedNodeId ? "#2D2B26" : "#4A4741"))
      .attr("dy", (d: any) => getNodeRadius(d) + 16)
      .attr("text-anchor", "middle")
      .attr("opacity", (d: any) => getLabelOpacity(d, currentZoom))
      .style("pointer-events", "none")
      .style("paint-order", "stroke")
      .style("stroke", "#FDFBF7")
      .style("stroke-width", "3px")
      .style("stroke-linecap", "round")
      .style("stroke-linejoin", "round");

    function applySemanticZoom(zoom: number) {
      nodeLabels
        .attr("opacity", (d: any) => getLabelOpacity(d, zoom))
        .attr("font-size", zoom >= 1.35 ? "10.5px" : "9.5px")
        .attr("font-weight", (d: any) =>
          d.id === selectedNodeId || MAJOR_NODE_TYPES.has(d.type) ? "700" : "500"
        )
        .attr("fill", (d: any) => (d.id === selectedNodeId ? "#2D2B26" : "#4A4741"));

      linkText.attr("opacity", zoom >= 1.55 ? 0.65 : 0);
    }

    // Add drag-and-drop animation mechanics
    function dragstarted(event: any, d: any) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      d.fx = d.x;
      d.fy = d.y;
    }

    function dragged(event: any, d: any) {
      d.fx = event.x;
      d.fy = event.y;
    }

    function dragended(event: any, d: any) {
      if (!event.active) simulation.alphaTarget(0);
      d.fx = null;
      d.fy = null;
    }

    // Tick layout updates to match spatial constraints
    simulation.on("tick", () => {
      link
        .attr("x1", (d: any) => d.source.x)
        .attr("y1", (d: any) => d.source.y)
        .attr("x2", (d: any) => d.target.x)
        .attr("y2", (d: any) => d.target.y);

      linkText
        .attr("x", (d: any) => (d.source.x + d.target.x) / 2)
        .attr("y", (d: any) => (d.source.y + d.target.y) / 2);

      node.attr("transform", (d: any) => `translate(${d.x},${d.y})`);
    });

    // Configure zoom capabilities
    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.3, 3])
      .on("zoom", (event) => {
        currentZoom = event.transform.k;
        g.attr("transform", event.transform);
        applySemanticZoom(currentZoom);
        setZoomLevel(currentZoom);
      });

    svg.call(zoom);
    zoomBehaviorRef.current = zoom;

    // Zoom slightly outwards initially for comfortable distribution
    svg.call(zoom.transform, d3.zoomIdentity.translate(0, 0).scale(0.9));

    return () => {
      simulation.stop();
    };
  }, [nodes, links, dimensions, selectedNodeId]);

  // Command panel actions
  const handleZoom = (factor: number) => {
    if (!svgRef.current || !zoomBehaviorRef.current) return;
    const svg = d3.select(svgRef.current);
    if (factor === 1) {
      // Reset zoom & center
      svg.transition().duration(500).call(zoomBehaviorRef.current.transform, d3.zoomIdentity.scale(0.95));
    } else {
      svg.transition().duration(300).call(zoomBehaviorRef.current.scaleBy, factor);
    }
  };

  return (
    <div
      ref={containerRef}
      className={`relative rounded-2xl border border-[#E5E1D8] bg-[#FDFBF7] overflow-hidden ${
        isFullscreen ? "fixed inset-0 z-50 h-screen w-screen" : "h-[520px] w-full"
      } transition-all duration-300 shadow-inner`}
    >
      {/* Background radial glow */}
      <div className="absolute inset-0 bg-radial-gradient from-[#5A634A]/5 via-transparent to-transparent pointer-events-none" />

      {/* Grid Pattern overlay */}
      <div className="absolute inset-0 islamic-grid pointer-events-none opacity-40" />

      {/* Legend & Controls overlay */}
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

      {/* Control Buttons */}
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
          title="Reset Paparan"
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

      {/* SVG Canvas */}
      <svg
        ref={svgRef}
        width={dimensions.width}
        height={dimensions.height}
        className="block w-full h-full cursor-grab active:cursor-grabbing"
      />

      <div className="absolute bottom-4 left-4 text-[9px] font-mono tracking-wider text-[#6D685E] pointer-events-none select-none bg-white/90 backdrop-blur-md px-3 py-1.5 rounded-full border border-[#E5E1D8] shadow-sm flex items-center gap-2">
        <span className="w-1.5 h-1.5 rounded-full bg-[#5A634A] inline-block animate-pulse" />
        <span className="font-bold">NOD ENTITI: {nodes.length}</span>
        <span className="text-[#D4D0C6]">|</span>
        <span className="font-bold">HUBUNGAN: {links.length}</span>
        <span className="text-[#D4D0C6]">|</span>
        <span className="font-bold">ZOOM: {Math.round(zoomLevel * 100)}%</span>
      </div>
    </div>
  );
}
