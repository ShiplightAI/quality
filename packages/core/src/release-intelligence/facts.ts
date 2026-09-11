import type { BehaviorOrigin, BehaviorPriority, RuntimeStatus, SourceReference } from "./types";

export interface CompiledFeature {
  readonly key: string;
  readonly name: string;
  readonly description: string;
  readonly priority: BehaviorPriority;
  readonly status: "confirmed" | "proposed";
  readonly sourceRefs: readonly SourceReference[];
  readonly diagnostics: readonly Record<string, unknown>[];
  readonly behaviors: readonly CompiledBehavior[];
}
export interface CompiledBehavior {
  readonly key: string;
  readonly title: string;
  readonly description?: string;
  readonly priority: BehaviorPriority;
  readonly origin: BehaviorOrigin;
  readonly reviewStatus: "confirmed" | "proposed";
  readonly sourceRefs: readonly SourceReference[];
  readonly requiredProof: readonly string[];
  readonly evidenceDeclarations: readonly {
    readonly key: string;
    readonly kind: string;
    readonly sourceName: string;
    readonly path?: string;
    readonly url?: string;
    readonly command?: string;
  }[];
}

export interface RuntimeFactEvidence {
  readonly key: string;
  readonly evidenceKey: string;
  readonly behaviorKey: string;
  readonly kind: string;
  readonly sourceName: string;
  readonly runtimeStatus: RuntimeStatus;
  readonly identityStatus: "matched" | "mismatched" | "unverifiable";
  readonly collectionStatus: "available" | "expired" | "missing" | "parse_error";
  readonly providerRef?: string;
  readonly fileRef?: { readonly path: string };
  readonly testFile?: string;
  readonly testCase?: string;
  readonly proves: readonly string[];
  readonly reason: string;
}

export interface RepositoryFacts {
  readonly features: readonly CompiledFeature[];
  readonly runtimeEvidence: readonly RuntimeFactEvidence[];
  readonly diagnostics: readonly Record<string, unknown>[];
  readonly integrityDiagnostics: readonly Record<string, unknown>[];
  readonly factIntegrity: "complete" | "incomplete";
  readonly factSet: Record<string, unknown>;
}

/**
 * Provider-neutral workflow evidence. A hosting application resolves and
 * authorizes the workflow before passing this immutable snapshot to the engine.
 */
export interface ReleaseWorkflowEvidence {
  readonly runId: string;
  readonly conclusion: string | null;
  readonly jobs: readonly {
    readonly id: number;
    readonly name: string;
    readonly status: string;
    readonly conclusion: string | null;
    readonly url: string;
  }[];
  readonly artifacts: readonly {
    readonly id: number;
    readonly name: string;
    readonly sizeInBytes: number;
    readonly expired: boolean;
  }[];
}
