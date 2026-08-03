import type {
  ObservationSourceProfile,
  ObservationSourceProfileEnvStatus,
  RequiredEnvStatus
} from "./types";

function envStatus(name: string, env: NodeJS.ProcessEnv): RequiredEnvStatus {
  const value = env[name];
  return {
    name,
    present: typeof value === "string" && value.length > 0
  };
}

export function evaluateObservationSourceProfileEnv(
  profile: ObservationSourceProfile,
  env: NodeJS.ProcessEnv = process.env
): ObservationSourceProfileEnvStatus {
  const requiredEnv = profile.requiredEnv.map((name) => envStatus(name, env));

  return {
    profileId: profile.id,
    allPresent: requiredEnv.every((entry) => entry.present),
    requiredEnv
  };
}

export function evaluateObservationSourceProfilesEnv(
  profiles: readonly ObservationSourceProfile[],
  env: NodeJS.ProcessEnv = process.env
): readonly ObservationSourceProfileEnvStatus[] {
  return profiles.map((profile) => evaluateObservationSourceProfileEnv(profile, env));
}
