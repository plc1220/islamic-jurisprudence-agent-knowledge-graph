import React from "react";
import { ArrowRight, Network } from "lucide-react";
import { KnowledgeLink, KnowledgeNode } from "../types";

interface RelevantGraphSnippetProps {
  nodes: KnowledgeNode[];
  links: KnowledgeLink[];
}

const TYPE_COLORS: Record<string, string> = {
  Konsep: "#5A634A",
  Hukum: "#A48F68",
  Sumber: "#8B9474",
  Mazhab: "#6D685E",
  Institusi: "#2D2B26",
  Artikkel: "#C4B295",
  Entity: "#8A8478",
};

function getNodeId(value: string | KnowledgeNode) {
  return typeof value === "string" ? value : value.id;
}

function getNodeColor(type: string) {
  return TYPE_COLORS[type] || TYPE_COLORS.Entity;
}

function compactLabel(label: string, maxLength = 24) {
  if (label.length <= maxLength) return label;
  return `${label.slice(0, maxLength - 1).trim()}...`;
}

function lineClamp(text: string, maxLength = 96) {
  if (!text) return "Tiada huraian ringkas.";
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1).trim()}...`;
}

function buildPositions(nodes: KnowledgeNode[]) {
  const positions = new Map<string, { x: number; y: number }>();

  if (nodes.length === 1) {
    positions.set(nodes[0].id, { x: 260, y: 82 });
    return positions;
  }

  if (nodes.length === 2) {
    positions.set(nodes[0].id, { x: 150, y: 82 });
    positions.set(nodes[1].id, { x: 370, y: 82 });
    return positions;
  }

  positions.set(nodes[0].id, { x: 260, y: 82 });
  const orbitNodes = nodes.slice(1);
  orbitNodes.forEach((node, index) => {
    const angle = -Math.PI / 2 + (index * 2 * Math.PI) / orbitNodes.length;
    positions.set(node.id, {
      x: 260 + Math.cos(angle) * 178,
      y: 82 + Math.sin(angle) * 54,
    });
  });

  return positions;
}

export function RelevantGraphSnippet({ nodes, links }: RelevantGraphSnippetProps) {
  const arrowMarkerId = React.useId().replace(/:/g, "");
  const dedupedNodes = Array.from(new Map(nodes.map((node) => [node.id, node])).values()).slice(0, 8);
  const nodeIds = new Set(dedupedNodes.map((node) => node.id));
  const nodeById = new Map(dedupedNodes.map((node) => [node.id, node]));
  const visibleLinks = links
    .filter((link) => nodeIds.has(getNodeId(link.source)) && nodeIds.has(getNodeId(link.target)))
    .slice(0, 8);
  const positions = buildPositions(dedupedNodes);

  if (dedupedNodes.length === 0) return null;

  return (
    <div className="mt-3 rounded-xl border border-[#DAD4C7] bg-[#FDFBF7] p-3 shadow-inner">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wider text-[#5A634A]">
          <Network className="h-3.5 w-3.5" />
          Nod Relevan Dalam Jawapan
        </span>
        <span className="rounded-full bg-white px-2 py-0.5 text-[9px] font-semibold text-[#6D685E] ring-1 ring-[#E5E1D8]">
          {dedupedNodes.length} nod · {visibleLinks.length} hubungan
        </span>
      </div>

      <svg
        viewBox="0 0 520 150"
        role="img"
        aria-label="Visualisasi nod pengetahuan yang relevan"
        className="h-36 w-full rounded-lg bg-white ring-1 ring-[#E5E1D8]"
      >
        <defs>
          <marker id={arrowMarkerId} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M0,0 L8,4 L0,8 Z" fill="#B8A982" />
          </marker>
        </defs>

        {visibleLinks.map((link, index) => {
          const source = positions.get(getNodeId(link.source));
          const target = positions.get(getNodeId(link.target));
          if (!source || !target) return null;

          return (
            <line
              key={`${getNodeId(link.source)}-${link.relation}-${getNodeId(link.target)}-${index}`}
              x1={source.x}
              y1={source.y}
              x2={target.x}
              y2={target.y}
              stroke="#CFC5B3"
              strokeWidth="1.6"
              markerEnd={`url(#${arrowMarkerId})`}
            />
          );
        })}

        {dedupedNodes.map((node) => {
          const position = positions.get(node.id);
          if (!position) return null;

          return (
            <g key={node.id} transform={`translate(${position.x}, ${position.y})`}>
              <circle r="18" fill={getNodeColor(node.type)} stroke="#FDFBF7" strokeWidth="3" />
              <circle r="22" fill="none" stroke={getNodeColor(node.type)} strokeOpacity="0.18" strokeWidth="6" />
              <text
                y="34"
                textAnchor="middle"
                className="select-none fill-[#2D2B26] font-sans text-[10px] font-bold"
              >
                {compactLabel(node.label, 20)}
              </text>
              <text
                y="47"
                textAnchor="middle"
                className="select-none fill-[#8A8478] font-mono text-[8px] font-semibold uppercase"
              >
                {node.type === "Artikkel" ? "Artikel" : node.type}
              </text>
            </g>
          );
        })}
      </svg>

      {visibleLinks.length > 0 && (
        <div className="mt-2 space-y-1.5">
          {visibleLinks.slice(0, 4).map((link, index) => {
            const source = nodeById.get(getNodeId(link.source));
            const target = nodeById.get(getNodeId(link.target));
            if (!source || !target) return null;

            return (
              <div
                key={`${source.id}-${link.relation}-${target.id}-${index}`}
                className="flex flex-wrap items-center gap-1.5 rounded-lg bg-white px-2 py-1.5 text-[10px] text-[#5A564E] ring-1 ring-[#E5E1D8]"
              >
                <span className="font-semibold text-[#2D2B26]">{compactLabel(source.label, 22)}</span>
                <ArrowRight className="h-3 w-3 text-[#A48F68]" />
                <span className="rounded bg-[#F3EAD7] px-1.5 py-0.5 font-mono text-[8px] font-bold text-[#8A651F]">
                  {compactLabel(link.relation.replace(/_/g, " "), 24)}
                </span>
                <ArrowRight className="h-3 w-3 text-[#A48F68]" />
                <span className="font-semibold text-[#2D2B26]">{compactLabel(target.label, 22)}</span>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
        {dedupedNodes.slice(0, 4).map((node) => (
          <div key={node.id} className="rounded-lg bg-white p-2 ring-1 ring-[#E5E1D8]">
            <div className="mb-1 flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: getNodeColor(node.type) }} />
              <span className="truncate text-[10px] font-bold text-[#2D2B26]">{node.label}</span>
            </div>
            <p className="text-[10px] leading-relaxed text-[#6D685E]">{lineClamp(node.description)}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
