import { z } from "zod";

export const observationSetEditSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  profileIds: z.array(z.string().min(1)).min(1)
});

export const saveObservationSetsRequestSchema = z.object({
  // Empty in hosted mode (the box owns the checkout; the source comes from the cookie).
  projectPath: z.string(),
  observationSets: z.array(observationSetEditSchema)
});

export type SaveObservationSetsRequestBody = z.infer<typeof saveObservationSetsRequestSchema>;
