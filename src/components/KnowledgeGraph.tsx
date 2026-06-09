import React, { useEffect, useRef, useState } from "react";
import * as d3 from "d3";
import { KnowledgeNode, KnowledgeLink } from "../types";
import { Maximize2, Minimize2, ZoomIn, ZoomOut, RefreshCw } from "lucide-react";

interface KnowledgeGraphProps {
  nodes: KnowledgeNode[];
  links: KnowledgeLink[];
  onNodeSelect?: (node: KnowledgeNode) => void;
  selectedNodeId?: string | null;
}

export function KnowledgeGraph({
  nodes,
  links,
  onNodeSelect,
  selectedNodeId,
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

    // Create D3 forces
    const simulation = d3
      .forceSimulation(d3Nodes as any)
      .force(
        "link",
        d3
          .forceLink(d3Links)
          .id((d: any) => d.id)
          .distance(110)
      )
      .force("charge", d3.forceManyBody().strength(-240))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collision", d3.forceCollide().radius(40));

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
      .attr("dy", -5);

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

    // Draw circles representing entities
    node
      .append("circle")
      .attr("r", 15)
      .attr("fill", (d: any) => getNodeColor(d.type))
      .attr("stroke", (d: any) =>
        d.id === selectedNodeId ? "#2D2B26" : "#E5E1D8"
      )
      .attr("stroke-width", (d: any) => (d.id === selectedNodeId ? 3 : 1.5))
      .attr("filter", "drop-shadow(0px 2px 4px rgba(90,99,74,0.15))")
      .attr("class", "transition-all duration-200");

    // Dynamic inner indicators or glows for selected nodes
    node
      .filter((d: any) => d.id === selectedNodeId)
      .append("circle")
      .attr("r", 19)
      .attr("fill", "none")
      .attr("stroke", (d: any) => getNodeColor(d.type))
      .attr("stroke-width", 1.5)
      .attr("stroke-opacity", 0.8)
      .attr("stroke-dasharray", "3 3")
      .attr("class", "animate-[spin_20s_linear_infinite]");

    // Draw short readable human labels
    node
      .append("text")
      .text((d: any) => d.label)
      .attr("font-family", "var(--font-sans)")
      .attr("font-size", "10px")
      .attr("font-weight", (d: any) => (d.id === selectedNodeId ? "700" : "500"))
      .attr("fill", (d: any) => (d.id === selectedNodeId ? "#2D2B26" : "#4A4741"))
      .attr("dy", 30)
      .attr("text-anchor", "middle")
      .style("paint-order", "stroke")
      .style("stroke", "#FDFBF7")
      .style("stroke-width", "3px")
      .style("stroke-linecap", "round")
      .style("stroke-linejoin", "round");

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
        g.attr("transform", event.transform);
        setZoomLevel(event.transform.k);
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
      className={`relative rounded-xl border border-[#E5E1D8] bg-[#FDFBF7] overflow-hidden ${
        isFullscreen ? "fixed inset-0 z-50 h-screen w-screen" : "h-110 w-full"
      } transition-all duration-300 shadow-sm`}
    >
      {/* Background radial glow */}
      <div className="absolute inset-0 bg-radial-gradient from-[#5A634A]/5 via-transparent to-transparent pointer-events-none" />

      {/* Grid Pattern overlay */}
      <div className="absolute inset-0 islamic-grid pointer-events-none opacity-60" />

      {/* Legend & Controls overlay */}
      <div className="absolute top-3 left-3 z-10 flex flex-wrap gap-2 max-w-[85%] pointer-events-none">
        {["Konsep", "Hukum", "Sumber", "Mazhab", "Institusi", "Artikkel"].map((type) => (
          <span
            key={type}
            className="flex items-center gap-1.5 px-2 py-1 rounded bg-[#F1F0EC] border border-[#D4D0C6] text-[10px] text-[#3D3B36] font-medium whitespace-nowrap shadow-sm pointer-events-auto"
          >
            <span
              className="w-2.5 h-2.5 rounded-full inline-block"
              style={{ backgroundColor: getNodeColor(type) }}
            />
            {type}
          </span>
        ))}
      </div>

      {/* Control Buttons */}
      <div className="absolute top-3 right-3 z-10 flex flex-col gap-1.5 pointer-events-auto">
        <button
          onClick={() => handleZoom(1.2)}
          className="p-1.5 rounded-lg bg-[#F1F0EC] border border-[#D4D0C6] text-[#5A634A] hover:bg-[#EAE7DF] transition-all shadow-sm cursor-pointer"
          title="Zoom Masuk"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        <button
          onClick={() => handleZoom(0.8)}
          className="p-1.5 rounded-lg bg-[#F1F0EC] border border-[#D4D0C6] text-[#5A634A] hover:bg-[#EAE7DF] transition-all shadow-sm cursor-pointer"
          title="Zoom Keluar"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <button
          onClick={() => handleZoom(1)}
          className="p-1.5 rounded-lg bg-[#F1F0EC] border border-[#D4D0C6] text-[#5A634A] hover:bg-[#EAE7DF] transition-all shadow-sm cursor-pointer"
          title="Reset Paparan"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
        <button
          onClick={() => setIsFullscreen(!isFullscreen)}
          className="p-1.5 rounded-lg bg-[#F1F0EC] border border-[#D4D0C6] text-[#5A634A] hover:bg-[#EAE7DF] transition-all shadow-sm mt-2 cursor-pointer"
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

      {/* Visual coordinates metadata on canvas edge (Literal, human style) */}
      <div className="absolute bottom-2 left-3 text-[9px] font-mono text-[#8A8478] pointer-events-none select-none">
        GRAF SEBARAN FIQH • ELEMEN NOD: {nodes.length} • HUBUNGAN: {links.length} • ZOOM: {Math.round(zoomLevel * 100)}%
      </div>
    </div>
  );
}
