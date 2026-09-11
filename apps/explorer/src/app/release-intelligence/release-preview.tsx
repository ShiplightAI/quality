import { Box } from "@mantine/core";
import { ReleaseDetail } from "@shiplightai/quality-ui/release-intelligence";
import type { ReleasePreviewModel } from "@/lib/release-intelligence/action-run";
import classes from "./release-preview.module.css";

export function ReleasePreview({
  model,
}: {
  readonly model: ReleasePreviewModel;
}): React.ReactElement {
  return (
    <Box className={classes.workspace}>
      <ReleaseDetail detail={model} />
    </Box>
  );
}
