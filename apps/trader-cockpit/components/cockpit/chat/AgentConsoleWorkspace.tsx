"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { AgentConsoleMessage } from "@/lib/cockpit/adapter";
import { cockpitAdapter } from "@/lib/cockpit/adapter";
import { cockpitKeys } from "@/lib/cockpit/query-keys";
import { useCockpitUiStore } from "@/lib/cockpit/use-cockpit-ui-store";
import { StateBlock } from "@/components/cockpit/states/StateBlock";
import { ActivityChainPanel } from "@/components/cockpit/chat/ActivityChainPanel";
import { AgentConversationPanel } from "@/components/cockpit/chat/AgentConversationPanel";
import { NodeInspectorPanel } from "@/components/cockpit/chat/NodeInspectorPanel";
import { PriorityPushStrip } from "@/components/cockpit/chat/PriorityPushStrip";

export function AgentConsoleWorkspace() {
  const { t } = useTranslation();
  const selectedAgentWorkstreamId = useCockpitUiStore((state) => state.selectedAgentWorkstreamId);
  const selectedActivityNodeId = useCockpitUiStore((state) => state.selectedActivityNodeId);
  const selectedAgentMessageId = useCockpitUiStore((state) => state.selectedAgentMessageId);
  const setSelectedAgentWorkstreamId = useCockpitUiStore((state) => state.setSelectedAgentWorkstreamId);
  const setSelectedActivityNodeId = useCockpitUiStore((state) => state.setSelectedActivityNodeId);
  const setSelectedAgentMessageId = useCockpitUiStore((state) => state.setSelectedAgentMessageId);
  const [activePrompt, setActivePrompt] = useState(t("chat.defaultQuestion"));
  const agentConsoleFilters = useMemo(
    () => ({ workstreamId: selectedAgentWorkstreamId ?? undefined }),
    [selectedAgentWorkstreamId],
  );

  const consoleQuery = useQuery({
    queryKey: cockpitKeys.agentConsole(agentConsoleFilters),
    queryFn: () => cockpitAdapter.getAgentConsole(agentConsoleFilters),
  });

  if (consoleQuery.isLoading) {
    return <StateBlock title={t("chat.loadingConsoleTitle")} description={t("chat.loadingConsoleDescription")} />;
  }

  if (consoleQuery.isError) {
    return (
      <StateBlock
        state="error"
        title={t("chat.consoleErrorTitle")}
        description={consoleQuery.error instanceof Error ? consoleQuery.error.message : t("common.error")}
      />
    );
  }

  if (!consoleQuery.data) {
    return <StateBlock title={t("chat.emptyConsoleTitle")} description={t("chat.emptyConsoleDescription")} />;
  }

  const consoleData = consoleQuery.data;
  const effectiveWorkstreamId = selectedAgentWorkstreamId ?? consoleData.selectedWorkstreamId;
  const effectiveNodeId = selectedActivityNodeId ?? consoleData.trace.selectedNodeId ?? null;
  const selectedWorkstream =
    consoleData.workstreams.find((workstream) => workstream.id === effectiveWorkstreamId) ?? consoleData.workstreams[0] ?? null;
  const selectedNode = consoleData.trace.nodes.find((node) => node.id === effectiveNodeId) ?? null;

  function selectMessage(message: AgentConsoleMessage) {
    setSelectedAgentWorkstreamId(message.workstreamId);
    setSelectedAgentMessageId(message.id);
    const firstNodeId = message.relatedNodeIds[0];
    if (firstNodeId) {
      setSelectedActivityNodeId(firstNodeId);
    }
  }

  function selectWorkstream(workstreamId: string) {
    setSelectedAgentWorkstreamId(workstreamId);
    setSelectedActivityNodeId(null);
    setSelectedAgentMessageId(null);
  }

  function usePrompt(prompt: string) {
    setActivePrompt(prompt);
  }

  return (
    <div className="flex min-h-[760px] flex-col gap-3 xl:min-h-[calc(100dvh-2rem)]">
      <div className="shrink-0">
        <PriorityPushStrip
          pushes={consoleData.priorityPushes}
          selectedMessageId={selectedAgentMessageId}
          onSelectPush={selectMessage}
        />
      </div>
      <div className="grid min-h-0 flex-1 gap-3 xl:grid-cols-[34%_30%_36%]">
        <section className="min-h-0 overflow-hidden">
          <AgentConversationPanel
            workstreams={consoleData.workstreams}
            workstream={selectedWorkstream}
            selectedWorkstreamId={effectiveWorkstreamId}
            messages={consoleData.messages}
            nodes={consoleData.trace.nodes}
            selectedMessageId={selectedAgentMessageId}
            selectedNodeId={effectiveNodeId}
            activePrompt={activePrompt}
            onSelectWorkstream={selectWorkstream}
            onSelectMessage={selectMessage}
            onSelectNode={setSelectedActivityNodeId}
            onUsePrompt={usePrompt}
          />
        </section>
        <section className="min-h-0 overflow-hidden">
          <ActivityChainPanel
            nodes={consoleData.trace.nodes}
            selectedNodeId={effectiveNodeId}
            onSelectNode={setSelectedActivityNodeId}
          />
        </section>
        <aside className="min-h-0 overflow-hidden">
          <NodeInspectorPanel
            selectedNode={selectedNode}
            workstream={selectedWorkstream}
            contextUsed={consoleData.contextUsed}
            onAskPrompt={usePrompt}
          />
        </aside>
      </div>
    </div>
  );
}
