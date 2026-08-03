import { z } from "zod";

export const markdownArtifactRequestSchema = z.object({
  projectPath: z.string(),
  artifactPath: z.string().min(1)
});

export type MarkdownArtifactRequestBody = z.infer<typeof markdownArtifactRequestSchema>;

