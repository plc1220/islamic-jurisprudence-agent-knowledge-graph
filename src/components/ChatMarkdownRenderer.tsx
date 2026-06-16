import React from "react";

interface ChatMarkdownRendererProps {
  content: string;
}

interface Block {
  type: "p" | "h1" | "h2" | "h3" | "ul" | "ol";
  items?: string[]; // For ul/ol list items
  text?: string;    // For p, h1, h2, h3
}

const LEGAL_RULINGS = new Set(["HARUS", "HARAM", "WAJIB", "SUNAT", "MAKRUH", "SAH", "BATAL"]);
const RULING_PATTERN = /\b(HARUS|HARAM|WAJIB|SUNAT|MAKRUH|SAH|BATAL)\b/gi;

function isOpeningGreeting(text: string, index: number) {
  if (index > 1) return false;
  return /^(assalamualaikum|alhamdulillah|segala puji|bismillah)/i.test(text.trim());
}

function rulingBadgeClass(label: string) {
  if (label === "HARAM" || label === "BATAL") {
    return "bg-rose-50 text-rose-700 ring-rose-200";
  }

  if (label === "WAJIB" || label === "SAH") {
    return "bg-[#E5F2EE] text-[#0F766E] ring-[#B8DED3]";
  }

  return "bg-[#F3EAD7] text-[#8A651F] ring-[#E0CE9E]";
}

function renderRulingBadge(label: string, key: string) {
  return (
    <span
      key={key}
      className={`mx-1 inline-flex translate-y-[-1px] items-center rounded-full px-2 py-0.5 text-[11px] font-extrabold ring-1 ${rulingBadgeClass(label)}`}
    >
      {label}
    </span>
  );
}

function renderPlainTextWithRulings(text: string, keyPrefix: string) {
  return text.split(RULING_PATTERN).map((part, index) => {
    const normalized = part.toUpperCase();
    if (LEGAL_RULINGS.has(normalized)) {
      return renderRulingBadge(normalized, `${keyPrefix}-ruling-${index}`);
    }
    return <span key={`${keyPrefix}-text-${index}`}>{part}</span>;
  });
}

// 1. Helper to parse text into structural blocks (paragraphs, headers, lists)
function parseBlocks(text: string): Block[] {
  const lines = text.split("\n");
  const blocks: Block[] = [];
  let currentList: Block | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      if (currentList) {
        blocks.push(currentList);
        currentList = null;
      }
      continue;
    }

    // Header 1 (# Header)
    if (trimmed.startsWith("# ")) {
      if (currentList) {
        blocks.push(currentList);
        currentList = null;
      }
      blocks.push({ type: "h1", text: trimmed.substring(2) });
      continue;
    }

    // Header 2 (## Header)
    if (trimmed.startsWith("## ")) {
      if (currentList) {
        blocks.push(currentList);
        currentList = null;
      }
      blocks.push({ type: "h2", text: trimmed.substring(3) });
      continue;
    }

    // Header 3 (### Header)
    if (trimmed.startsWith("### ")) {
      if (currentList) {
        blocks.push(currentList);
        currentList = null;
      }
      blocks.push({ type: "h3", text: trimmed.substring(4) });
      continue;
    }

    // Unordered List Item (* Item or - Item)
    const ulMatch = trimmed.match(/^[*+-]\s+(.*)/);
    if (ulMatch) {
      const itemText = ulMatch[1];
      if (currentList && currentList.type === "ul") {
        currentList.items!.push(itemText);
      } else {
        if (currentList) {
          blocks.push(currentList);
        }
        currentList = { type: "ul", items: [itemText] };
      }
      continue;
    }

    // Ordered List Item (1. Item)
    const olMatch = trimmed.match(/^(\d+)\.\s+(.*)/);
    if (olMatch) {
      const itemText = olMatch[2];
      if (currentList && currentList.type === "ol") {
        currentList.items!.push(itemText);
      } else {
        if (currentList) {
          blocks.push(currentList);
        }
        currentList = { type: "ol", items: [itemText] };
      }
      continue;
    }

    // Regular Paragraph
    if (currentList) {
      blocks.push(currentList);
      currentList = null;
    }

    // If consecutive non-empty lines, we can append to the last paragraph or start a new one
    if (blocks.length > 0 && blocks[blocks.length - 1].type === "p") {
      blocks[blocks.length - 1].text += "\n" + line;
    } else {
      blocks.push({ type: "p", text: line });
    }
  }

  if (currentList) {
    blocks.push(currentList);
  }

  return blocks;
}

// 2. Format LaTeX commands and math syntax into clean, styled Unicode symbols
function renderMathWithSupSub(mathStr: string): React.ReactNode {
  let result = mathStr
    .replace(/\^\\circ/g, "°")
    .replace(/\\circ/g, "°")
    .replace(/\\theta/g, "θ")
    .replace(/\\pi/g, "π")
    .replace(/\\times/g, "×")
    .replace(/\\cdot/g, "·")
    .replace(/\\div/g, "÷")
    .replace(/\\pm/g, "±")
    .replace(/\\le/g, "≤")
    .replace(/\\leq/g, "≤")
    .replace(/\\ge/g, "≥")
    .replace(/\\geq/g, "≥")
    .replace(/\\ne/g, "≠")
    .replace(/\\neq/g, "≠")
    .replace(/\\approx/g, "≈")
    .replace(/\\infty/g, "∞")
    .replace(/\\Delta/g, "Δ")
    .replace(/\\alpha/g, "α")
    .replace(/\\beta/g, "β")
    .replace(/\\gamma/g, "γ")
    .replace(/\\sqrt/g, "√")
    .replace(/\\sum/g, "∑")
    .replace(/\\int/g, "∫");

  // Regex to split by superscripts ^... or subscripts _...
  // Matches ^{...}, ^..., _{...}, _...
  const regex = /(\^\{[^\}]+\}|\^[^{}\s]+|_[^\s{}]+|_\{[^\}]+\})/g;
  const parts = result.split(regex);

  return parts.map((part, index) => {
    if (part.startsWith("^")) {
      const isBraced = part.startsWith("^{");
      const content = isBraced ? part.slice(2, -1) : part.slice(1);
      return <sup key={index} className="text-[10px] leading-none select-all">{content}</sup>;
    }
    if (part.startsWith("_")) {
      const isBraced = part.startsWith("_{");
      const content = isBraced ? part.slice(2, -1) : part.slice(1);
      return <sub key={index} className="text-[10px] leading-none select-all">{content}</sub>;
    }
    return part;
  });
}

// 3. Recursively parse inline markdown styles (bold, italic, inline/block math)
function parseTextSegment(text: string): React.ReactNode {
  if (!text) return "";

  // Splitting by: Block Math ($$...$$), Inline Math ($...$), Bold (**...**), Italic (*...*), or Italic (_..._)
  const regex = /(\$\$[\s\S]+?\$\$|\$[^\$]+?\$|\*\*[^\*]+?\*\*|\*(?!\*)[^\*]+?\*|\_[^_]+?\_)/g;
  const parts = text.split(regex);

  return parts.map((part, index) => {
    if (!part) return null;

    // Block Math
    if (part.startsWith("$$") && part.endsWith("$$")) {
      const mathContent = part.slice(2, -2);
      return (
        <div 
          key={index} 
          className="my-3 p-3.5 bg-[#5A634A]/5 rounded-xl text-center font-mono italic text-xs text-[#5A634A] overflow-x-auto border border-[#5A634A]/10 shadow-inner flex items-center justify-center gap-1"
        >
          {renderMathWithSupSub(mathContent)}
        </div>
      );
    }

    // Inline Math
    if (part.startsWith("$") && part.endsWith("$")) {
      const mathContent = part.slice(1, -1);
      return (
        <code 
          key={index} 
          className="font-mono italic font-semibold text-[#5A634A] bg-[#5A634A]/5 px-1.5 py-0.5 rounded mx-0.5 border border-[#5A634A]/10 whitespace-nowrap inline-flex items-center"
        >
          {renderMathWithSupSub(mathContent)}
        </code>
      );
    }

    // Bold (**bold**)
    if (part.startsWith("**") && part.endsWith("**")) {
      const boldContent = part.slice(2, -2);
      const normalizedBold = boldContent.trim().toUpperCase();
      if (LEGAL_RULINGS.has(normalizedBold)) {
        return renderRulingBadge(normalizedBold, `strong-ruling-${index}`);
      }

      return (
        <strong key={index} className="font-bold text-[#2D2B26] selection:bg-[#0F766E]/25">
          {parseTextSegment(boldContent)}
        </strong>
      );
    }

    // Italic (*italic* or _italic_)
    if ((part.startsWith("*") && part.endsWith("*")) || (part.startsWith("_") && part.endsWith("_"))) {
      const italicContent = part.slice(1, -1);
      return (
        <em key={index} className="italic text-[#5A564E]">
          {parseTextSegment(italicContent)}
        </em>
      );
    }

    // Plain text
    return (
      <React.Fragment key={index}>
        {renderPlainTextWithRulings(part, `plain-${index}`)}
      </React.Fragment>
    );
  });
}

// 4. Main Component to parse and render chat output beautifully
export const ChatMarkdownRenderer: React.FC<ChatMarkdownRendererProps> = ({ content }) => {
  const blocks = parseBlocks(content);

  return (
    <div className="space-y-3.5 leading-6 text-[#4F4A43] font-sans">
      {blocks.map((block, bIdx) => {
        switch (block.type) {
          case "h1":
            return (
              <h1 
                key={bIdx} 
                className="font-serif font-bold text-lg text-[#2D2B26] mt-4 mb-2 pb-1 border-b border-[#E5E1D8] leading-snug"
              >
                {parseTextSegment(block.text || "")}
              </h1>
            );
          case "h2":
            return (
              <h2 
                key={bIdx} 
                className="font-serif font-semibold text-base text-[#2D2B26] mt-3.5 mb-2 leading-snug"
              >
                {parseTextSegment(block.text || "")}
              </h2>
            );
          case "h3":
            return (
              <h3 
                key={bIdx} 
                className="font-serif font-semibold text-xs uppercase text-[#0F766E] mt-3 mb-1.5 leading-none"
              >
                {parseTextSegment(block.text || "")}
              </h3>
            );
          case "ul":
            return (
              <ul key={bIdx} className="list-disc pl-5 space-y-2 my-2 text-[13px]">
                {block.items!.map((item, iIdx) => (
                  <li key={iIdx} className="leading-relaxed">
                    {parseTextSegment(item)}
                  </li>
                ))}
              </ul>
            );
          case "ol":
            return (
              <ol key={bIdx} className="list-decimal pl-5 space-y-2 my-2 text-[13px]">
                {block.items!.map((item, iIdx) => (
                  <li key={iIdx} className="leading-relaxed">
                    {parseTextSegment(item)}
                  </li>
                ))}
              </ol>
            );
          case "p":
          default:
            return (
              <p
                key={bIdx}
                className={
                  isOpeningGreeting(block.text || "", bIdx)
                    ? "text-[12px] leading-6 text-[#7A7368]"
                    : "text-[13px] leading-6 text-[#4F4A43]"
                }
              >
                {parseTextSegment(block.text || "")}
              </p>
            );
        }
      })}
    </div>
  );
};
