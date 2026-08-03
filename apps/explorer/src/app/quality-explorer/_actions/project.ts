"use server";

export async function setQcProjectAction(_project: {
  readonly kind: "local";
  readonly path: string;
}): Promise<{ readonly error: string }> {
  return { error: "Quality Explorer fixes the project root when the server starts." };
}
