import { z } from "zod";

export const executeObservationSourceRequestSchema = z.object({
  projectPath: z.string(),
  profileId: z.string().min(1),
  selection: z.object({
    runId: z.number().int().positive().optional(),
    branch: z.string().min(1).optional(),
    commit: z.string().min(1).optional()
  }).optional()
});

export type ExecuteObservationSourceRequestBody = z.infer<typeof executeObservationSourceRequestSchema>;
