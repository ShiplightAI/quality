"use client";

import { Select } from "@mantine/core";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export interface ReleaseRepositoryOption {
  readonly id: string;
  readonly name: string;
}

export function RepositoryFilter({
  repos,
  value,
}: {
  readonly repos: readonly ReleaseRepositoryOption[];
  readonly value: string | null;
}): React.ReactElement {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  return (
    <Select
      aria-label="Filter releases by repository"
      placeholder="Repository"
      data={repos.map((repo) => ({ value: repo.id, label: repo.name }))}
      value={value}
      onChange={(repoId) => {
        const next = new URLSearchParams(searchParams.toString());
        if (repoId) next.set("repo", repoId);
        else next.delete("repo");
        next.delete("cursor");
        const query = next.toString();
        router.replace(query ? `${pathname}?${query}` : pathname);
      }}
      searchable
      clearable
      nothingFoundMessage="No repositories found"
      w={{ base: "100%", sm: 280 }}
    />
  );
}
