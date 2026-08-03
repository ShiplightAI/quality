import { z } from "zod";

export const executeObservationSetRequestSchema = z.object({
  projectPath: z.string(),
  setId: z.string().min(1),
  viewId: z.string().min(1).optional(),
  selection: z.object({
    branch: z.string().min(1).optional(),
    commit: z.string().min(1).optional(),
    profiles: z.array(
      z.object({
        profileId: z.string().min(1),
        runId: z.number().int().positive().optional(),
        branch: z.string().min(1).optional(),
        commit: z.string().min(1).optional()
      })
    ).optional()
  }).optional()
});

export type ExecuteObservationSetRequestBody = z.infer<typeof executeObservationSetRequestSchema>;
