"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import type {
  KnowledgeCandidate,
  KnowledgeExtractPreviewResult,
  KnowledgeMemoryItem,
  KnowledgeMemoryItemUpdate,
  KnowledgeSearchResult,
} from "@/lib/cockpit/adapter";
import type { KnowledgeMemoryItemInput } from "@/lib/cockpit/adapter";
import { cockpitAdapter } from "@/lib/cockpit/adapter";
import { ApiError } from "@/lib/cockpit/real-readonly-adapter";
import { useCockpitUiStore } from "@/lib/cockpit/use-cockpit-ui-store";
import { StateBlock } from "@/components/cockpit/states/StateBlock";

type TabId = "memory" | "candidates" | "extract";

const memoryKeys = {
  items: (status?: string) => ["cockpit", "memory-items", status ?? "all"] as const,
  candidates: (status?: string) => ["cockpit", "candidates", status ?? "all"] as const,
  search: (query: string) => ["cockpit", "knowledge-search", query] as const,
};

function formatDate(value: string) {
  try {
    return new Date(value).toLocaleString("zh-CN");
  } catch {
    return value;
  }
}

function chipList(values: string[]) {
  if (values.length === 0) return "—";
  return values.join(", ");
}

function parseCommaList(value: string): string[] {
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

function formatCommaList(values: string[]): string {
  return values.join(", ");
}

function buildMemoryItemInput(
  preview: KnowledgeExtractPreviewResult,
  confirm?: boolean,
): KnowledgeMemoryItemInput {
  return {
    memory_type: preview.memory_type,
    title: preview.title,
    summary: preview.summary,
    rule_text: preview.rule_text,
    applicability: preview.applicability ?? undefined,
    invalidation: preview.invalidation ?? undefined,
    symbols_json: preview.symbols,
    tags_json: preview.tags,
    confidence: preview.confidence,
    confirm,
  };
}

function isConfirmRequiredError(error: unknown): error is ApiError {
  if (!(error instanceof ApiError) || error.status !== 409) {
    return false;
  }
  const detail = error.detail;
  return Boolean(detail && typeof detail === "object" && (detail as { confirm_required?: boolean }).confirm_required);
}

export function MemorySettings() {
  const [tab, setTab] = useState<TabId>("memory");
  const [selectedMemoryId, setSelectedMemoryId] = useState<string | null>(null);
  const [selectedCandidateIds, setSelectedCandidateIds] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchSubmitted, setSearchSubmitted] = useState("");
  const [extractText, setExtractText] = useState("");
  const [extractPreview, setExtractPreview] = useState<KnowledgeExtractPreviewResult | null>(null);
  const [saveConfirmMessage, setSaveConfirmMessage] = useState<string | null>(null);
  const [mergeCandidateId, setMergeCandidateId] = useState<string | null>(null);
  const [mergeTargetMemoryId, setMergeTargetMemoryId] = useState<string | null>(null);
  const [editingMemoryId, setEditingMemoryId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const dataSource = useCockpitUiStore((state) => state.dataSource);
  const queryClient = useQueryClient();

  const memoryQuery = useQuery({
    queryKey: memoryKeys.items("active"),
    queryFn: () => cockpitAdapter.listMemoryItems({ status: "active", limit: 50 }),
    enabled: tab === "memory" || tab === "candidates",
  });

  const candidatesQuery = useQuery({
    queryKey: memoryKeys.candidates("candidate"),
    queryFn: () => cockpitAdapter.listCandidates({ status: "candidate", limit: 50 }),
    enabled: tab === "candidates",
  });

  const searchQueryResult = useQuery({
    queryKey: memoryKeys.search(searchSubmitted),
    queryFn: () => cockpitAdapter.searchKnowledge(searchSubmitted, { limit: 20 }),
    enabled: tab === "extract" && searchSubmitted.length > 0,
  });

  const invalidateMemory = () => {
    void queryClient.invalidateQueries({ queryKey: ["cockpit", "memory-items"] });
    void queryClient.invalidateQueries({ queryKey: ["cockpit", "candidates"] });
  };

  const deprecateMutation = useMutation({
    mutationFn: (id: string) => cockpitAdapter.deprecateMemoryItem(id),
    onSuccess: () => {
      setSelectedMemoryId(null);
      invalidateMemory();
    },
    onError: (error: Error) => setActionError(error.message),
  });

  const activateMutation = useMutation({
    mutationFn: (id: string) => cockpitAdapter.activateCandidate(id),
    onSuccess: () => {
      setSelectedCandidateIds([]);
      invalidateMemory();
    },
    onError: (error: Error) => setActionError(error.message),
  });

  const rejectMutation = useMutation({
    mutationFn: (id: string) => cockpitAdapter.rejectCandidate(id),
    onSuccess: () => {
      setSelectedCandidateIds([]);
      invalidateMemory();
    },
    onError: (error: Error) => setActionError(error.message),
  });

  const batchMutation = useMutation({
    mutationFn: ({ ids, action }: { ids: string[]; action: "activate" | "reject" }) =>
      cockpitAdapter.batchCandidates(ids, action),
    onSuccess: () => {
      setSelectedCandidateIds([]);
      invalidateMemory();
    },
    onError: (error: Error) => setActionError(error.message),
  });

  const extractMutation = useMutation({
    mutationFn: (text: string) => cockpitAdapter.extractPreview(text),
    onSuccess: (preview) => {
      setExtractPreview(preview);
      setSaveConfirmMessage(null);
      setActionError(null);
    },
    onError: (error: Error) => setActionError(error.message),
  });

  const saveMutation = useMutation({
    mutationFn: ({ preview, confirm }: { preview: KnowledgeExtractPreviewResult; confirm?: boolean }) =>
      cockpitAdapter.createMemoryItem(buildMemoryItemInput(preview, confirm)),
    onSuccess: () => {
      setExtractPreview(null);
      setExtractText("");
      setSaveConfirmMessage(null);
      setActionError(null);
      invalidateMemory();
    },
    onError: (error: unknown) => {
      if (isConfirmRequiredError(error)) {
        setSaveConfirmMessage(error.message);
        setActionError(null);
        return;
      }
      setSaveConfirmMessage(null);
      setActionError(error instanceof Error ? error.message : "保存失败");
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: KnowledgeMemoryItemUpdate }) =>
      cockpitAdapter.updateMemoryItem(id, updates),
    onSuccess: (updated) => {
      setSelectedMemoryId(updated.id);
      setEditingMemoryId(null);
      setActionError(null);
      invalidateMemory();
    },
    onError: (error: Error) => setActionError(error.message),
  });

  const mergeMutation = useMutation({
    mutationFn: ({ candidateId, targetMemoryItemId }: { candidateId: string; targetMemoryItemId: string }) =>
      cockpitAdapter.mergeCandidate(candidateId, targetMemoryItemId),
    onSuccess: () => {
      setMergeCandidateId(null);
      setMergeTargetMemoryId(null);
      setSelectedCandidateIds([]);
      setActionError(null);
      invalidateMemory();
    },
    onError: (error: Error) => setActionError(error.message),
  });

  const memoryItems = memoryQuery.data ?? [];
  const candidates = candidatesQuery.data ?? [];
  const searchResults = searchQueryResult.data ?? [];
  const selectedMemory = selectedMemoryId
    ? (memoryItems.find((item) => item.id === selectedMemoryId) ?? null)
    : null;

  function toggleCandidate(id: string) {
    setSelectedCandidateIds((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-wider text-muted">Knowledge Memory</p>
          <h1 className="mt-1 text-lg font-semibold">记忆与候选管理</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
            管理 active memory、candidate 审核，以及从文本抽离记忆。请先在设置页切换数据源为 Real。
          </p>
        </div>
        <Link
          href="/cockpit/settings"
          className="rounded-md border border-border px-3 py-2 text-sm text-muted hover:bg-surface-secondary"
        >
          返回设置
        </Link>
      </div>

      <div className="flex flex-wrap gap-2">
        {(
          [
            ["memory", "Active Memory"],
            ["candidates", "Candidates"],
            ["extract", "Search / Extract"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => {
              setTab(id);
              setActionError(null);
            }}
            className={
              tab === id
                ? "rounded-md border border-accent bg-surface-secondary px-3 py-2 text-sm font-medium"
                : "rounded-md border border-border px-3 py-2 text-sm text-muted hover:bg-surface-secondary/70"
            }
          >
            {label}
          </button>
        ))}
      </div>

      {dataSource === "mock" ? (
        <div className="rounded-md border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-warning">
          当前数据源为 Mock，知识 API 返回空数据或占位内容。请在设置页切换为 Real 并确保后端已启动。
        </div>
      ) : null}

      {actionError ? (
        <div className="rounded-md border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
          {actionError}
        </div>
      ) : null}

      {tab === "memory" ? (
        <MemoryTab
          loading={memoryQuery.isLoading}
          error={memoryQuery.isError}
          items={memoryItems}
          selected={selectedMemory ?? null}
          onSelect={setSelectedMemoryId}
          onDeprecate={(id) => deprecateMutation.mutate(id)}
          deprecating={deprecateMutation.isPending}
          onUpdate={(id, updates) => updateMutation.mutate({ id, updates })}
          updating={updateMutation.isPending}
          editingMemoryId={editingMemoryId}
          onStartEdit={setEditingMemoryId}
          onCancelEdit={() => setEditingMemoryId(null)}
        />
      ) : null}

      {tab === "candidates" ? (
        <CandidatesTab
          loading={candidatesQuery.isLoading}
          error={candidatesQuery.isError}
          items={candidates}
          memoryItems={memoryItems}
          selectedIds={selectedCandidateIds}
          onToggle={toggleCandidate}
          onActivate={(id) => activateMutation.mutate(id)}
          onReject={(id) => rejectMutation.mutate(id)}
          onBatch={(action) => batchMutation.mutate({ ids: selectedCandidateIds, action })}
          mergeCandidateId={mergeCandidateId}
          mergeTargetMemoryId={mergeTargetMemoryId}
          onStartMerge={(candidateId) => {
            setMergeCandidateId(candidateId);
            setMergeTargetMemoryId(null);
            setActionError(null);
          }}
          onMergeTargetChange={setMergeTargetMemoryId}
          onCancelMerge={() => {
            setMergeCandidateId(null);
            setMergeTargetMemoryId(null);
          }}
          onConfirmMerge={() => {
            if (mergeCandidateId && mergeTargetMemoryId) {
              mergeMutation.mutate({
                candidateId: mergeCandidateId,
                targetMemoryItemId: mergeTargetMemoryId,
              });
            }
          }}
          merging={mergeMutation.isPending}
          busy={
            activateMutation.isPending ||
            rejectMutation.isPending ||
            batchMutation.isPending ||
            mergeMutation.isPending
          }
        />
      ) : null}

      {tab === "extract" ? (
        <ExtractTab
          searchQuery={searchQuery}
          onSearchQueryChange={setSearchQuery}
          onSearchSubmit={() => setSearchSubmitted(searchQuery.trim())}
          searchLoading={searchQueryResult.isLoading}
          searchResults={searchResults}
          extractText={extractText}
          onExtractTextChange={setExtractText}
          onExtract={() => extractMutation.mutate(extractText)}
          extractLoading={extractMutation.isPending}
          preview={extractPreview}
          saveConfirmMessage={saveConfirmMessage}
          onSave={() => extractPreview && saveMutation.mutate({ preview: extractPreview })}
          onSaveConfirm={() =>
            extractPreview && saveMutation.mutate({ preview: extractPreview, confirm: true })
          }
          onDismissSaveConfirm={() => setSaveConfirmMessage(null)}
          saveLoading={saveMutation.isPending}
        />
      ) : null}
    </div>
  );
}

function MemoryTab({
  loading,
  error,
  items,
  selected,
  onSelect,
  onDeprecate,
  deprecating,
  onUpdate,
  updating,
  editingMemoryId,
  onStartEdit,
  onCancelEdit,
}: {
  loading: boolean;
  error: boolean;
  items: KnowledgeMemoryItem[];
  selected: KnowledgeMemoryItem | null;
  onSelect: (id: string) => void;
  onDeprecate: (id: string) => void;
  deprecating: boolean;
  onUpdate: (id: string, updates: KnowledgeMemoryItemUpdate) => void;
  updating: boolean;
  editingMemoryId: string | null;
  onStartEdit: (id: string | null) => void;
  onCancelEdit: () => void;
}) {
  if (loading) {
    return <StateBlock state="loading" title="加载记忆项" description="正在从 knowledge API 拉取 active memory…" />;
  }
  if (error) {
    return (
      <StateBlock
        state="error"
        title="加载失败"
        description="无法读取 memory items。请确认后端已启动且数据源为 Real。"
      />
    );
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
      <section className="rounded-md border border-border bg-surface/80">
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold">Active Memory ({items.length})</h2>
        </div>
        {items.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted">暂无 active memory。</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="border-b border-border text-left text-xs text-muted">
                <tr>
                  <th className="px-4 py-2">Title</th>
                  <th className="px-4 py-2">Type</th>
                  <th className="px-4 py-2">Symbols</th>
                  <th className="px-4 py-2">Confidence</th>
                  <th className="px-4 py-2">Created</th>
                  <th className="px-4 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-b border-border/60 hover:bg-background/40">
                    <td className="px-4 py-3">
                      <button type="button" className="text-left font-medium hover:underline" onClick={() => {
                        onSelect(item.id);
                        onStartEdit(null);
                      }}>
                        {item.title}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-muted">{item.memory_type}</td>
                    <td className="px-4 py-3 text-muted">{chipList(item.symbols_json)}</td>
                    <td className="px-4 py-3 tabular-nums">{item.confidence.toFixed(2)}</td>
                    <td className="px-4 py-3 text-muted">{formatDate(item.created_at)}</td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        disabled={deprecating}
                        onClick={() => onDeprecate(item.id)}
                        className="rounded border border-border px-2 py-1 text-xs text-danger hover:bg-danger/10 disabled:opacity-50"
                      >
                        Deprecate
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-md border border-border bg-surface/80 p-4">
        {selected ? (
          <MemoryDetailPanel
            item={selected}
            editing={editingMemoryId === selected.id}
            onDeprecate={() => onDeprecate(selected.id)}
            deprecating={deprecating}
            onEdit={() => onStartEdit(selected.id)}
            onCancelEdit={onCancelEdit}
            onUpdate={(updates) => onUpdate(selected.id, updates)}
            updating={updating}
          />
        ) : (
          <p className="text-sm text-muted">选择一条 memory 查看详情。</p>
        )}
      </section>
    </div>
  );
}

function MemoryDetailPanel({
  item,
  editing,
  onDeprecate,
  deprecating,
  onEdit,
  onCancelEdit,
  onUpdate,
  updating,
}: {
  item: KnowledgeMemoryItem;
  editing: boolean;
  onDeprecate: () => void;
  deprecating: boolean;
  onEdit: () => void;
  onCancelEdit: () => void;
  onUpdate: (updates: KnowledgeMemoryItemUpdate) => void;
  updating: boolean;
}) {
  return editing ? (
    <MemoryEditForm
      key={item.id}
      item={item}
      updating={updating}
      onCancel={onCancelEdit}
      onSave={onUpdate}
    />
  ) : (
    <MemoryDetail
      item={item}
      onEdit={onEdit}
      onDeprecate={onDeprecate}
      deprecating={deprecating}
    />
  );
}

function MemoryEditForm({
  item,
  updating,
  onCancel,
  onSave,
}: {
  item: KnowledgeMemoryItem;
  updating: boolean;
  onCancel: () => void;
  onSave: (updates: KnowledgeMemoryItemUpdate) => void;
}) {
  const [title, setTitle] = useState(item.title);
  const [summary, setSummary] = useState(item.summary ?? "");
  const [ruleText, setRuleText] = useState(item.rule_text ?? "");
  const [applicability, setApplicability] = useState(item.applicability ?? "");
  const [invalidation, setInvalidation] = useState(item.invalidation ?? "");
  const [symbols, setSymbols] = useState(formatCommaList(item.symbols_json));
  const [tags, setTags] = useState(formatCommaList(item.tags_json));
  const [confidence, setConfidence] = useState(String(item.confidence));

  return (
    <div className="space-y-3 text-sm">
      <p className="text-[11px] uppercase tracking-wider text-muted">编辑 Memory</p>
      <label className="block space-y-1">
        <span className="text-xs text-muted">Title</span>
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
        />
      </label>
      <label className="block space-y-1">
        <span className="text-xs text-muted">Summary</span>
        <textarea
          value={summary}
          onChange={(event) => setSummary(event.target.value)}
          rows={3}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm leading-6"
        />
      </label>
      <label className="block space-y-1">
        <span className="text-xs text-muted">Rule</span>
        <textarea
          value={ruleText}
          onChange={(event) => setRuleText(event.target.value)}
          rows={3}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm leading-6"
        />
      </label>
      <label className="block space-y-1">
        <span className="text-xs text-muted">Applicability</span>
        <input
          value={applicability}
          onChange={(event) => setApplicability(event.target.value)}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
        />
      </label>
      <label className="block space-y-1">
        <span className="text-xs text-muted">Invalidation</span>
        <input
          value={invalidation}
          onChange={(event) => setInvalidation(event.target.value)}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
        />
      </label>
      <label className="block space-y-1">
        <span className="text-xs text-muted">Symbols（逗号分隔）</span>
        <input
          value={symbols}
          onChange={(event) => setSymbols(event.target.value)}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
        />
      </label>
      <label className="block space-y-1">
        <span className="text-xs text-muted">Tags（逗号分隔）</span>
        <input
          value={tags}
          onChange={(event) => setTags(event.target.value)}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
        />
      </label>
      <label className="block space-y-1">
        <span className="text-xs text-muted">Confidence</span>
        <input
          type="number"
          min={0}
          max={1}
          step={0.01}
          value={confidence}
          onChange={(event) => setConfidence(event.target.value)}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm tabular-nums"
        />
      </label>
      <div className="flex flex-wrap gap-2 pt-1">
        <button
          type="button"
          disabled={updating || title.trim().length === 0}
          onClick={() => {
            const parsedConfidence = Number.parseFloat(confidence);
            onSave({
              title: title.trim(),
              summary: summary.trim() || undefined,
              rule_text: ruleText.trim() || undefined,
              applicability: applicability.trim() || undefined,
              invalidation: invalidation.trim() || undefined,
              symbols_json: parseCommaList(symbols),
              tags_json: parseCommaList(tags),
              ...(Number.isFinite(parsedConfidence) ? { confidence: parsedConfidence } : {}),
            });
          }}
          className="rounded-md border border-accent bg-surface-secondary px-3 py-2 text-sm font-medium disabled:opacity-50"
        >
          {updating ? "Saving…" : "保存"}
        </button>
        <button
          type="button"
          disabled={updating}
          onClick={onCancel}
          className="rounded-md border border-border px-3 py-2 text-sm text-muted hover:bg-surface-secondary disabled:opacity-50"
        >
          取消
        </button>
      </div>
    </div>
  );
}

function MemoryDetail({
  item,
  onEdit,
  onDeprecate,
  deprecating,
}: {
  item: KnowledgeMemoryItem;
  onEdit: () => void;
  onDeprecate: () => void;
  deprecating: boolean;
}) {
  return (
    <div className="space-y-3 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="text-[11px] uppercase tracking-wider text-muted">{item.memory_type}</p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onEdit}
            className="rounded border border-border px-2 py-1 text-xs hover:bg-surface-secondary"
          >
            Edit
          </button>
          <button
            type="button"
            disabled={deprecating}
            onClick={onDeprecate}
            className="rounded border border-border px-2 py-1 text-xs text-danger hover:bg-danger/10 disabled:opacity-50"
          >
            Deprecate
          </button>
        </div>
      </div>
      <h3 className="text-base font-semibold">{item.title}</h3>
      {item.summary ? <p className="leading-6 text-muted">{item.summary}</p> : null}
      {item.rule_text ? (
        <div className="rounded border border-border bg-background/60 p-3">
          <p className="text-xs text-muted">Rule</p>
          <p className="mt-1 leading-6">{item.rule_text}</p>
        </div>
      ) : null}
      <div className="grid gap-2 text-xs text-muted">
        {item.applicability ? <p>Applicability: {item.applicability}</p> : null}
        {item.invalidation ? <p>Invalidation: {item.invalidation}</p> : null}
        <p>Symbols: {chipList(item.symbols_json)}</p>
        <p>Tags: {chipList(item.tags_json)}</p>
        <p>Status: {item.status}</p>
        <p>Updated: {formatDate(item.updated_at)}</p>
      </div>
    </div>
  );
}

function CandidatesTab({
  loading,
  error,
  items,
  memoryItems,
  selectedIds,
  onToggle,
  onActivate,
  onReject,
  onBatch,
  mergeCandidateId,
  mergeTargetMemoryId,
  onStartMerge,
  onMergeTargetChange,
  onCancelMerge,
  onConfirmMerge,
  merging,
  busy,
}: {
  loading: boolean;
  error: boolean;
  items: KnowledgeCandidate[];
  memoryItems: KnowledgeMemoryItem[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  onActivate: (id: string) => void;
  onReject: (id: string) => void;
  onBatch: (action: "activate" | "reject") => void;
  mergeCandidateId: string | null;
  mergeTargetMemoryId: string | null;
  onStartMerge: (candidateId: string) => void;
  onMergeTargetChange: (memoryId: string | null) => void;
  onCancelMerge: () => void;
  onConfirmMerge: () => void;
  merging: boolean;
  busy: boolean;
}) {
  const mergeCandidate = mergeCandidateId
    ? (items.find((item) => item.id === mergeCandidateId) ?? null)
    : null;

  if (loading) {
    return <StateBlock state="loading" title="加载候选项" description="正在从 knowledge API 拉取 candidates…" />;
  }
  if (error) {
    return <StateBlock state="error" title="加载失败" description="无法读取 candidates。" />;
  }

  return (
    <section className="rounded-md border border-border bg-surface/80">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold">Candidates ({items.length})</h2>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={busy || selectedIds.length === 0}
            onClick={() => onBatch("activate")}
            className="rounded border border-border px-2 py-1 text-xs hover:bg-surface-secondary disabled:opacity-50"
          >
            Batch Activate
          </button>
          <button
            type="button"
            disabled={busy || selectedIds.length === 0}
            onClick={() => onBatch("reject")}
            className="rounded border border-border px-2 py-1 text-xs text-danger hover:bg-danger/10 disabled:opacity-50"
          >
            Batch Reject
          </button>
        </div>
      </div>
      {items.length === 0 ? (
        <p className="px-4 py-6 text-sm text-muted">暂无 candidate。</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="border-b border-border text-left text-xs text-muted">
              <tr>
                <th className="px-4 py-2">Select</th>
                <th className="px-4 py-2">Title</th>
                <th className="px-4 py-2">Type</th>
                <th className="px-4 py-2">Symbols</th>
                <th className="px-4 py-2">Flags</th>
                <th className="px-4 py-2">Created</th>
                <th className="px-4 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-b border-border/60 hover:bg-background/40">
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(item.id)}
                      onChange={() => onToggle(item.id)}
                    />
                  </td>
                  <td className="px-4 py-3 font-medium">{item.title}</td>
                  <td className="px-4 py-3 text-muted">{item.candidate_type}</td>
                  <td className="px-4 py-3 text-muted">{chipList(item.symbols_json)}</td>
                  <td className="px-4 py-3 text-muted">{chipList(item.review_flags_json)}</td>
                  <td className="px-4 py-3 text-muted">{formatDate(item.created_at)}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => onActivate(item.id)}
                        className="rounded border border-border px-2 py-1 text-xs hover:bg-surface-secondary disabled:opacity-50"
                      >
                        Activate
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => onStartMerge(item.id)}
                        className="rounded border border-border px-2 py-1 text-xs hover:bg-surface-secondary disabled:opacity-50"
                      >
                        Merge
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => onReject(item.id)}
                        className="rounded border border-border px-2 py-1 text-xs text-danger hover:bg-danger/10 disabled:opacity-50"
                      >
                        Reject
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {mergeCandidate ? (
        <div className="border-t border-border bg-background/40 px-4 py-4">
          <p className="text-sm font-medium">合并候选到现有 Memory</p>
          <p className="mt-1 text-sm text-muted">
            候选：<span className="text-foreground">{mergeCandidate.title}</span>
          </p>
          {memoryItems.length === 0 ? (
            <p className="mt-3 text-sm text-muted">暂无 active memory 可作为合并目标。</p>
          ) : (
            <label className="mt-3 block space-y-1 text-sm">
              <span className="text-xs text-muted">目标 Memory</span>
              <select
                value={mergeTargetMemoryId ?? ""}
                onChange={(event) => onMergeTargetChange(event.target.value || null)}
                className="w-full max-w-xl rounded-md border border-border bg-background px-3 py-2 text-sm"
              >
                <option value="">选择一条 active memory…</option>
                {memoryItems.map((memory) => (
                  <option key={memory.id} value={memory.id}>
                    {memory.title} ({chipList(memory.symbols_json)})
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={merging || !mergeTargetMemoryId}
              onClick={onConfirmMerge}
              className="rounded-md border border-accent bg-surface-secondary px-3 py-2 text-sm font-medium disabled:opacity-50"
            >
              {merging ? "Merging…" : "确认合并"}
            </button>
            <button
              type="button"
              disabled={merging}
              onClick={onCancelMerge}
              className="rounded-md border border-border px-3 py-2 text-sm text-muted hover:bg-surface-secondary disabled:opacity-50"
            >
              取消
            </button>
          </div>
          <p className="mt-2 text-xs text-muted">
            合并将把候选的 evidence refs 追加到目标 memory，并将候选标记为 merged。
          </p>
        </div>
      ) : null}
    </section>
  );
}

function ExtractTab({
  searchQuery,
  onSearchQueryChange,
  onSearchSubmit,
  searchLoading,
  searchResults,
  extractText,
  onExtractTextChange,
  onExtract,
  extractLoading,
  preview,
  saveConfirmMessage,
  onSave,
  onSaveConfirm,
  onDismissSaveConfirm,
  saveLoading,
}: {
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  onSearchSubmit: () => void;
  searchLoading: boolean;
  searchResults: KnowledgeSearchResult[];
  extractText: string;
  onExtractTextChange: (value: string) => void;
  onExtract: () => void;
  extractLoading: boolean;
  preview: KnowledgeExtractPreviewResult | null;
  saveConfirmMessage: string | null;
  onSave: () => void;
  onSaveConfirm: () => void;
  onDismissSaveConfirm: () => void;
  saveLoading: boolean;
}) {
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <section className="rounded-md border border-border bg-surface/80 p-4">
        <h2 className="text-sm font-semibold">语料搜索</h2>
        <div className="mt-3 flex gap-2">
          <input
            value={searchQuery}
            onChange={(event) => onSearchQueryChange(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && onSearchSubmit()}
            placeholder="搜索 document_sections，如 TSLA 回调"
            className="min-w-0 flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={onSearchSubmit}
            className="rounded-md border border-border px-3 py-2 text-sm hover:bg-surface-secondary"
          >
            Search
          </button>
        </div>
        <div className="mt-4 space-y-3">
          {searchLoading ? <p className="text-sm text-muted">搜索中…</p> : null}
          {searchResults.map((result) => (
            <article key={result.section_id} className="rounded border border-border bg-background/60 p-3 text-sm">
              <p className="font-medium">{result.heading_path}</p>
              <p className="mt-2 leading-6 text-muted">{result.snippet}</p>
              <p className="mt-2 text-xs text-muted">
                {result.source_path} · {chipList(result.symbols)}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section className="rounded-md border border-border bg-surface/80 p-4">
        <h2 className="text-sm font-semibold">文本抽离</h2>
        <textarea
          value={extractText}
          onChange={(event) => onExtractTextChange(event.target.value)}
          rows={8}
          placeholder="粘贴待抽离文本…"
          className="mt-3 w-full rounded-md border border-border bg-background px-3 py-2 text-sm leading-6"
        />
        <button
          type="button"
          disabled={extractLoading || extractText.trim().length === 0}
          onClick={onExtract}
          className="mt-3 rounded-md border border-border px-3 py-2 text-sm hover:bg-surface-secondary disabled:opacity-50"
        >
          {extractLoading ? "Extracting…" : "Extract Preview"}
        </button>

        {preview ? (
          <div className="mt-4 space-y-3 rounded border border-border bg-background/60 p-4 text-sm">
            <p className="text-[11px] uppercase tracking-wider text-muted">{preview.memory_type}</p>
            <h3 className="text-base font-semibold">{preview.title}</h3>
            <p className="leading-6 text-muted">{preview.summary}</p>
            {preview.rule_text ? (
              <div>
                <p className="text-xs text-muted">Rule</p>
                <p className="mt-1 leading-6">{preview.rule_text}</p>
              </div>
            ) : null}
            <p className="text-xs text-muted">Symbols: {chipList(preview.symbols)}</p>
            <p className="text-xs text-muted">Tags: {chipList(preview.tags)}</p>
            {preview.applicability ? (
              <p className="text-xs text-muted">Applicability: {preview.applicability}</p>
            ) : null}
            {preview.invalidation ? (
              <p className="text-xs text-muted">Invalidation: {preview.invalidation}</p>
            ) : null}
            <p className="text-xs text-muted">Confidence: {preview.confidence.toFixed(2)}</p>
            {saveConfirmMessage ? (
              <div className="rounded border border-warning/40 bg-warning/10 p-3 text-sm">
                <p className="text-warning">{saveConfirmMessage}</p>
                <p className="mt-2 text-xs text-muted">检测到与现有记忆冲突，确认后将以 confirm 重试保存。</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={saveLoading}
                    onClick={onSaveConfirm}
                    className="rounded-md border border-accent bg-surface-secondary px-3 py-2 text-sm font-medium disabled:opacity-50"
                  >
                    {saveLoading ? "Saving…" : "确认仍要保存"}
                  </button>
                  <button
                    type="button"
                    disabled={saveLoading}
                    onClick={onDismissSaveConfirm}
                    className="rounded-md border border-border px-3 py-2 text-sm text-muted hover:bg-surface-secondary disabled:opacity-50"
                  >
                    取消
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                disabled={saveLoading}
                onClick={onSave}
                className="rounded-md border border-accent bg-surface-secondary px-3 py-2 text-sm font-medium disabled:opacity-50"
              >
                {saveLoading ? "Saving…" : "Confirm & Save"}
              </button>
            )}
          </div>
        ) : null}
      </section>
    </div>
  );
}
