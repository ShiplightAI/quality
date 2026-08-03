import { z } from "zod";

export const fixPromptRequestSchema = z.object({
  expectationId: z.string().min(1),
  projectPath: z.string(),
  qualityMapPath: z.string().min(1)
});

export type FixPromptRequestBody = z.infer<typeof fixPromptRequestSchema>;
