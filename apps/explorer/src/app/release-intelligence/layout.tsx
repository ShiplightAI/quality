import type { ReactNode } from "react";
import {
  ReleaseUiHostProvider,
  type ReleaseUiHost,
} from "@shiplightai/quality-ui/release-intelligence";
import "@shiplightai/quality-ui/release-intelligence.css";

const host: ReleaseUiHost = {
  routeBase: "/release-intelligence",
  apiBase: "/api/release-intelligence",
};

export default function ReleaseIntelligenceLayout({
  children,
}: {
  readonly children: ReactNode;
}): React.ReactElement {
  return <ReleaseUiHostProvider host={host}>{children}</ReleaseUiHostProvider>;
}
