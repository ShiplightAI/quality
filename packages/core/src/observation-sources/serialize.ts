import { stringify } from "yaml";
import type { ObservationSourceProfile } from "./types";

export function serializeObservationSources(profiles: readonly ObservationSourceProfile[]): string {
  return stringify({
    profiles: profiles.map((profile) => {
      const requiredEnv = profile.requiredEnv.filter((name) => name !== "GITHUB_TOKEN");
      const sourceRefs = profile.sourceRefs
        .map((ref) => ({
          ...(ref.path === undefined ? {} : { path: ref.path }),
          ...(ref.url === undefined ? {} : { url: ref.url }),
          ...(ref.label === undefined ? {} : { label: ref.label })
        }))
        .filter((ref) => Object.keys(ref).length > 0);

      return {
        id: profile.id,
        name: profile.name,
        ...(profile.description === undefined || profile.description.length === 0
          ? {}
          : { description: profile.description }),
        transport: profile.transport,
        ...(profile.observationPath === undefined ? {} : { observation_path: profile.observationPath }),
        ...(requiredEnv.length > 0 ? { auth: { required_env: requiredEnv } } : {}),
        ...(sourceRefs.length > 0 ? { source_refs: sourceRefs } : {}),
        ...(profile.github === undefined
          ? {}
          : {
              github: {
                repo: profile.github.repo,
                workflow: profile.github.workflow,
                artifact_names: [...profile.github.artifactNames],
                ...(profile.github.branch === undefined ? {} : { branch: profile.github.branch })
              }
            }),
        ...(profile.localFolder === undefined ? {} : { local_folder: { path: profile.localFolder.path } }),
        ...(profile.host === undefined
          ? {}
          : {
              host: {
                provider: profile.host.provider,
                ...(Object.keys(profile.host.options).length === 0
                  ? {}
                  : { options: { ...profile.host.options } })
              }
            })
      };
    })
  });
}
