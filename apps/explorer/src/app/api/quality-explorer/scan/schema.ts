import { z } from "zod";

export const scanRequestSchema = z.object({
  projectPath: z.string(),
  mode: z.enum(["scan", "refresh"]).default("scan")
});

export type ScanRequestBody = z.infer<typeof scanRequestSchema>;

export const problemDetailsSchema = z.object({
  type: z.string(),
  title: z.string(),
  status: z.number(),
  detail: z.string(),
  instance: z.string(),
  target: z.object({
    inputPath: z.string(),
    resolvedPath: z.string(),
    displayName: z.string(),
    validationStatus: z.enum(["valid", "invalid"])
  }),
  diagnostics: z.array(
    z.object({
      severity: z.enum(["error", "warning", "info"]),
      code: z.string(),
      message: z.string(),
      affectedPath: z.string().optional(),
      details: z.string().optional()
    })
  )
});
