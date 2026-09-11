import { Alert, Code, Container, Stack, Text, Title } from "@mantine/core";
import { loadReleasePreview } from "@/lib/release-intelligence/action-run";
import { ReleasePreview } from "./release-preview";

export const dynamic = "force-dynamic";

export default async function ReleaseIntelligencePage(): Promise<React.ReactElement> {
  try {
    const model = await loadReleasePreview();
    return <ReleasePreview model={model} />;
  } catch (error) {
    return (
      <Container size="lg" py="xl">
        <Stack gap="md">
          <Title order={1}>Release Intelligence</Title>
          <Alert color="red" title="Release preview could not start">
            {error instanceof Error ? error.message : String(error)}
          </Alert>
          <Text size="sm" c="dimmed">
            Start Explorer with <Code>GITHUB_TOKEN</Code>, <Code>QUALITY_PROJECT_ROOT</Code>, and
            either <Code>RELEASE_ACTION_RUN</Code> or <Code>RELEASE_ACTION_RUN_ID</Code>.
          </Text>
        </Stack>
      </Container>
    );
  }
}
