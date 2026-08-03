import { z } from "zod";

export const savedViewSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  featureIds: z.array(z.string().min(1))
});

export const saveViewsRequestSchema = z.object({
  projectPath: z.string(),
  views: z.array(savedViewSchema)
});

export const saveViewsResponseSchema = z.object({
  path: z.string(),
  views: z.array(savedViewSchema)
});

export type SaveViewsRequestBody = z.infer<typeof saveViewsRequestSchema>;
