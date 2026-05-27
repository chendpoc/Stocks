"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { AgentConsoleMessage } from "@/lib/cockpit/adapter";
import { cockpitAdapter } from "@/lib/cockpit/adapter";
import { cockpitKeys } from "@/lib/cockpit/query-keys";
import { useCockpitUiStore } from "@/lib/cockpit/use-cockpit-ui-store";
import { StateBlock } from "@/components/cockpit/states/StateBlock";
import { ActivityTracePreview } from "@/components/cockpit/chat/ActivityTracePreview";
import { AgentConversationPanel } from "@/components/cockpit/chat/AgentConversationPanel";
import { ContextUsedPanel } from "@/components/cockpit/chat/ContextUsedPanel";
import { NodeInspectorPanel } from "@/components/cockpit/chat/NodeInspectorPanel";
import { PriorityPushStrip } from "@/components/cockpit/chat/PriorityPushStrip";
import { WorkstreamRail } from "@/components/cockpit/chat/WorkstreamRail";

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
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden">
      <div className="shrink-0">
        <PriorityPushStrip
          pushes={consoleData.priorityPushes}
          selectedMessageId={selectedAgentMessageId}
          onSelectPush={selectMessage}
        />
      </div>
      <div className="shrink-0">
        <WorkstreamRail
          workstreams={consoleData.workstreams}
          selectedWorkstreamId={effectiveWorkstreamId}
          onSelectWorkstream={selectWorkstream}
        />
      </div>
      <div className="grid min-h-0 flex-1 gap-3 overflow-hidden xl:grid-cols-[minmax(250px,0.82fr)_minmax(300px,1fr)_minmax(260px,0.88fr)] 2xl:grid-cols-[minmax(330px,0.92fr)_minmax(360px,1fr)_minmax(340px,0.9fr)]">
        <section className="min-h-0 overflow-hidden">
          <AgentConversationPanel
            workstream={selectedWorkstream}
            messages={consoleData.messages}
            nodes={consoleData.trace.nodes}
            selectedMessageId={selectedAgentMessageId}
            selectedNodeId={effectiveNodeId}
            activePrompt={activePrompt}
            onSelectMessage={selectMessage}
            onSelectNode={setSelectedActivityNodeId}
            onUsePrompt={usePrompt}
          />
        </section>
        <section className="min-h-0 overflow-hidden">
          <ActivityTracePreview
            trace={consoleData.trace}
            selectedNodeId={effectiveNodeId}
            onSelectNode={setSelectedActivityNodeId}
          />
        </section>
        <aside className="grid min-h-0 grid-rows-[minmax(0,1fr)_180px] gap-3 overflow-hidden 2xl:grid-rows-[minmax(0,1fr)_220px]">
          <NodeInspectorPanel selectedNode={selectedNode} workstream={selectedWorkstream} onAskPrompt={usePrompt} />
          <ContextUsedPanel contextUsed={consoleData.contextUsed} />
        </aside>
      </div>
    </div>
  );
}
