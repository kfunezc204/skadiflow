import { useLayoutEffect, useRef, useState } from "react";

type Props = {
  text: string;
  className?: string;
  dragRegion?: boolean;
};

/**
 * Renders text that marquee-scrolls when it overflows its container.
 * When content fits, text is displayed statically (no animation).
 */
export default function Marquee({ text, className = "", dragRegion }: Props) {
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLSpanElement>(null);
  const [offset, setOffset] = useState(0);

  useLayoutEffect(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) return;
    const ovf = inner.scrollWidth - outer.clientWidth;
    setOffset(ovf > 2 ? ovf : 0);
  }, [text]);

  // Scale duration to text overflow length: longer overflow = slower scroll for readability
  const duration = offset > 0 ? Math.max(4, offset / 40) : 0;

  return (
    <div
      ref={outerRef}
      className={`overflow-hidden min-w-0 ${className}`}
      {...(dragRegion ? { "data-tauri-drag-region": "" } : {})}
    >
      <span
        ref={innerRef}
        className="inline-block whitespace-nowrap"
        style={
          offset > 0
            ? ({
                animation: `marquee-scroll ${duration}s linear infinite`,
                "--marquee-offset": `-${offset}px`,
              } as React.CSSProperties)
            : undefined
        }
      >
        {text}
      </span>
    </div>
  );
}
