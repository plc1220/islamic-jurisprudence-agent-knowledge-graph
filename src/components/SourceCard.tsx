import React from "react";
import { SourceWebsite } from "../types";
import { BookOpen, AlertCircle, Link2, HelpCircle } from "lucide-react";

interface SourceCardProps {
  key?: React.Key;
  source: SourceWebsite;
  onSelect?: () => void;
  isActive?: boolean;
}

export function SourceCard({ source, onSelect, isActive }: SourceCardProps) {
  // Map category to styles
  const getCategoryStyles = (category: string) => {
    switch (category) {
      case "website - internal":
        return {
          bg: "bg-[#EAE7DF] border-[#D4D0C6] text-[#5A634A]",
          dot: "bg-[#5A634A]"
        };
      case "articles - internal":
        return {
          bg: "bg-[#F1F0EC] border-[#D4D0C6] text-[#A48F68]",
          dot: "bg-[#A48F68]"
        };
      default:
        return {
          bg: "bg-[#F9F7F2] border-[#E5E1D8] text-[#8A8478]",
          dot: "bg-[#8A8478]"
        };
    }
  };

  const styles = getCategoryStyles(source.category);

  return (
    <div
      onClick={onSelect}
      className={`group relative p-4 rounded-xl border bg-white text-left transition-all duration-300 cursor-pointer ${
        isActive
          ? "border-[#5A634A] bg-[#F9F7F2] shadow-sm"
          : "border-[#E5E1D8] hover:border-[#5A634A] hover:bg-[#F9F7F2]/40"
      }`}
    >
      {/* Category indicator pill */}
      <div className="flex items-center justify-between gap-2 mb-2.5">
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] uppercase tracking-wider font-semibold font-mono ${styles.bg}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${styles.dot}`} />
          {source.category}
        </span>
        <span className="text-[10px] font-mono font-semibold text-[#8A8478] group-hover:text-[#5A634A]">
          RUJUKAN • #{source.id}
        </span>
      </div>

      {/* Source Title */}
      <h4 className="font-serif font-semibold text-[#2D2B26] group-hover:text-[#5A634A] transition-colors text-base flex items-center gap-1.5">
        <BookOpen className="w-4 h-4 text-[#5A634A] shrink-0" />
        {source.title}
      </h4>

      {/* Description */}
      <p className="text-xs text-[#5A564E] mt-2 line-clamp-2 leading-relaxed">
        {source.description}
      </p>

      {/* Role / Importance */}
      <div className="mt-3.5 pt-3 border-t border-[#E5E1D8] text-[11px] text-[#8A8478] leading-relaxed flex gap-1.5 items-start">
        <AlertCircle className="w-3.5 h-3.5 text-[#5A634A] shrink-0 mt-0.5" />
        <div>
          <strong className="text-[#3D3B36]">Peranan dalam Syariah:</strong> {source.role}
        </div>
      </div>

      {/* URL button */}
      <div className="mt-3 flex justify-end">
        <a
          href={source.url}
          target="_blank"
          referrerPolicy="no-referrer"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-[11px] text-[#5A634A] font-semibold hover:text-[#2D2B26] pointer-events-auto"
          onClick={(e) => e.stopPropagation()} // Let links trigger natively without selecting card
        >
          <Link2 className="w-3 h-3" />
          Buka Laman Rasmi
        </a>
      </div>
    </div>
  );
}
