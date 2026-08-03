"use client";

import { CircleHelp } from "lucide-react";

interface HelpTooltipProps {
  readonly text: string;
  readonly label?: string;
}

export function HelpTooltip({ label, text }: HelpTooltipProps): React.ReactElement {
  return (
    <span
      aria-label={label ?? text}
      className="help-tooltip"
      data-tooltip={text}
      tabIndex={0}
    >
      <CircleHelp aria-hidden="true" size={14} />
    </span>
  );
}
