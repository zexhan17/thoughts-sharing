import type { ReactNode } from "react";

function renderInline(text: string): ReactNode[] {
  const tokens = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/);
  return tokens.map((token, i) => {
    if (token.startsWith("**") && token.endsWith("**"))
      return <strong key={i} className="font-semibold">{token.slice(2, -2)}</strong>;
    if (token.startsWith("*") && token.endsWith("*"))
      return <em key={i}>{token.slice(1, -1)}</em>;
    if (token.startsWith("`") && token.endsWith("`"))
      return <code key={i} className="bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded text-[0.8em] font-mono">{token.slice(1, -1)}</code>;
    return token;
  });
}

export function MarkdownText({ content, onToggleCheckbox }: { content: string; onToggleCheckbox?: (lineIndex: number) => void }) {
  const lines = content.split("\n");
  const elements: ReactNode[] = [];
  let listBuffer: ReactNode[] = [];

  function flushList() {
    if (listBuffer.length === 0) return;
    elements.push(
      <ul key={`ul-${elements.length}`} className="space-y-0.5 my-0.5">
        {listBuffer}
      </ul>
    );
    listBuffer = [];
  }

  lines.forEach((line, i) => {
    const checklist = line.match(/^- \[([ xX])\] (.*)/);
    const bullet = !checklist && line.match(/^[-*] (.+)/);
    const numbered = line.match(/^(\d+)\. (.+)/);
    const quote = line.match(/^> (.+)/);

    if (checklist) {
      flushList();
      const checked = checklist[1].toLowerCase() === "x";
      elements.push(
        <div key={i} className="flex gap-2 items-start py-px">
          <button
            type="button"
            onClick={onToggleCheckbox ? (e) => { e.stopPropagation(); onToggleCheckbox(i); } : undefined}
            className={`mt-0.5 shrink-0 w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${
              onToggleCheckbox ? "cursor-pointer" : "cursor-default"
            } ${checked
              ? "bg-violet-500 border-violet-500"
              : "border-gray-300 dark:border-gray-600 hover:border-violet-400 dark:hover:border-violet-500"
            }`}
          >
            {checked && (
              <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
            )}
          </button>
          <span className={checked ? "line-through text-gray-400 dark:text-gray-500" : ""}>
            {renderInline(checklist[2])}
          </span>
        </div>
      );
    } else if (bullet) {
      listBuffer.push(
        <li key={i} className="flex gap-1.5 items-start">
          <span className="mt-1.5 w-1 h-1 rounded-full bg-current shrink-0 opacity-60" />
          <span>{renderInline(bullet[1])}</span>
        </li>
      );
    } else if (numbered) {
      listBuffer.push(
        <li key={i} className="flex gap-1.5 items-start">
          <span className="shrink-0 opacity-60 text-xs mt-0.5">{numbered[1]}.</span>
          <span>{renderInline(numbered[2])}</span>
        </li>
      );
    } else if (quote) {
      flushList();
      elements.push(
        <p key={i} className="border-l-2 border-gray-300 dark:border-gray-600 pl-2 text-gray-500 dark:text-gray-400 italic">
          {renderInline(quote[1])}
        </p>
      );
    } else if (line === "") {
      flushList();
      if (i > 0 && lines[i - 1] !== "") elements.push(<div key={i} className="h-1.5" />);
    } else {
      flushList();
      elements.push(<span key={i} className="block">{renderInline(line)}</span>);
    }
  });

  flushList();
  return <>{elements}</>;
}
