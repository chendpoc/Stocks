"use client";

import { Card, Chip } from "@heroui/react";
import { useTranslation } from "react-i18next";
import { nodeStatusChipClass } from "./activity-graph-styles";

const legendStatuses = ["completed", "running", "warning", "failed", "pending"] as const;

export function AgentActivityGraphLegend() {
  const { t } = useTranslation();

  return (
    <Card.Footer className="flex flex-wrap items-center gap-2 border-t border-border p-0 pt-2">
      <Chip size="sm" className="border border-border bg-transparent font-medium text-foreground">
        {t("chat.graphLegendTitle")}
      </Chip>
      {legendStatuses.map((status) => (
        <Chip key={status} size="sm" className={`border bg-transparent ${nodeStatusChipClass(status)}`}>
          {t(`chat.nodeStatus.${status}`)}
        </Chip>
      ))}
    </Card.Footer>
  );
}
