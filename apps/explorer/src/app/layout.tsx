import "@mantine/core/styles.css";
import { ColorSchemeScript, MantineProvider } from "@mantine/core";
import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Quality Explorer",
  description: "Local, evidence-backed software quality maps.",
};

export default function RootLayout({ children }: { readonly children: ReactNode }): React.ReactElement {
  return (
    // ColorSchemeScript sets data-mantine-color-scheme on <html> before React hydrates, so the
    // attribute is always absent server-side. suppressHydrationWarning applies one level deep,
    // to this element's own attributes only.
    <html lang="en" suppressHydrationWarning>
      <head>
        <ColorSchemeScript defaultColorScheme="auto" />
      </head>
      <body>
        <MantineProvider defaultColorScheme="auto">{children}</MantineProvider>
      </body>
    </html>
  );
}
