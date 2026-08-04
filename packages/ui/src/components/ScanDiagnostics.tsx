"use client";

import { AlertCircle, Clipboard, Info, TriangleAlert } from "lucide-react";
import { Button } from "@mantine/core";
import { useState } from "react";
import type { ScanDiagnostic } from "@shiplightai/quality-core";
import { diagnosticGuidanceFor } from "@shiplightai/quality-core/project-index";

interface ScanDiagnosticsProps {
  readonly diagnostics: readonly ScanDiagnostic[];
  readonly label?: string;
}

const severityLabels = {
  error: "Error",
  warning: "Warning",
  info: "Info"
} as const;

function iconForSeverity(severity: ScanDiagnostic["severity"]): React.ReactElement {
  if (severity === "error") {
    return <AlertCircle aria-hidden="true" size={18} />;
  }

  if (severity === "warning") {
    return <TriangleAlert aria-hidden="true" size={18} />;
  }

  return <Info aria-hidden="true" size={18} />;
}

export function ScanDiagnostics({
  diagnostics,
  label = "Scan diagnostics"
}: ScanDiagnosticsProps): React.ReactElement | null {
  const [copiedKey, setCopiedKey] = useState<string>();

  if (diagnostics.length === 0) {
    return null;
  }

  function copyPrompt(key: string, prompt: string): void {
    if (navigator.clipboard === undefined) {
      return;
    }

    void navigator.clipboard.writeText(prompt)
      .then(() => {
        setCopiedKey(key);
        window.setTimeout(() => setCopiedKey(undefined), 1500);
      })
      .catch(() => undefined);
  }

  return (
    <section className="diagnostics" aria-label={label}>
      {diagnostics.map((diagnostic) => {
        const key = `${diagnostic.code}:${diagnostic.affectedPath ?? diagnostic.message}`;
        const guidance = diagnosticGuidanceFor(diagnostic);

        return (
          <article
            className={`diagnostic diagnostic-${diagnostic.severity}`}
            key={key}
          >
            <div className="diagnostic-icon">{iconForSeverity(diagnostic.severity)}</div>
            <div>
              <div className="diagnostic-title">
                <span>{severityLabels[diagnostic.severity]}</span>
                <code>{diagnostic.code}</code>
              </div>
              <p>{diagnostic.message}</p>
              {diagnostic.affectedPath !== undefined ? (
                <p className="diagnostic-path">{diagnostic.affectedPath}</p>
              ) : null}
              <div className="diagnostic-guidance">
                <p><strong>What it means:</strong> {guidance.explanation}</p>
                <p><strong>Recommended action:</strong> {guidance.recommendedAction}</p>
                <Button
                  variant="default"
                  size="xs"
                  leftSection={<Clipboard aria-hidden size={16} />}
                  onClick={() => copyPrompt(key, guidance.agentPrompt)}
                >
                  {copiedKey === key ? "Copied" : "Copy coding-agent prompt"}
                </Button>
              </div>
            </div>
          </article>
        );
      })}
    </section>
  );
}
