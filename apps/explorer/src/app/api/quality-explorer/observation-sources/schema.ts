import { z } from "zod";

const sourceSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  transport: z.enum(["github-actions", "local-folder"]),
  observationPath: z.string().min(1),
  github: z
    .object({
      repo: z.string().min(1),
      workflow: z.string().min(1),
      artifactNames: z.array(z.string().min(1)).min(1),
      branch: z.string().optional()
    })
    .optional(),
  localFolder: z.object({ path: z.string().min(1) }).optional(),
  // Preserved fields the form doesn't edit (round-tripped so editing doesn't drop them).
  sourceRefs: z
    .array(
      z.object({
        path: z.string().optional(),
        url: z.string().optional(),
        label: z.string().optional()
      })
    )
    .optional(),
  requiredEnv: z.array(z.string()).optional()
});

// projectPath may be empty in hosted mode (the box owns the checkout; source comes from the cookie).
export const saveObservationSourcesRequestSchema = z.object({
  projectPath: z.string(),
  observationSources: z.array(sourceSchema)
});

export type SaveObservationSourcesRequestBody = z.infer<typeof saveObservationSourcesRequestSchema>;
