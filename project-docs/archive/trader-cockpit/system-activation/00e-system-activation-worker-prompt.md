# System Activation Worker Prompt

Target model: Cursor Composer 2.5
Source plan: [00e-system-activation-plan.md](./00e-system-activation-plan.md)
Generated: 2026-05-29

---

Activate the trader-agent system: import real corpus, connect Cockpit to all knowledge APIs,
build the settings/memory page, and validate end-to-end.

## Repository root

D:\workspace\01-products\stock-community-summary

## Phase A: Import 2026-05 summaries (34 files)

### Step 1: Scan artifacts

```powershell
.venv/Scripts/python.exe -c "from app.core.config import Settings; from app.modules.artifact_catalog import build_artifact_catalog; from app.db.migrations import bootstrap_database; s = Settings(); bootstrap_database(s); r = build_artifact_catalog(s); print(f'discovered={r.discovered} updated={r.updated} excluded={r.excluded} failed={r.failed}')"
```

Expected: discovered >= 34 (34 summaries + any other new files in docs/)

### Step 2: Incremental rebuild

```powershell
.venv/Scripts/python.exe -c "from app.core.config import Settings; from app.modules.rebuild import incremental_rebuild; from app.db.migrations import bootstrap_database; s = Settings(); bootstrap_database(s); r = incremental_rebuild(s); print(f'catalog_discovered={r.catalog.discovered} sections_indexed={r.sections.indexed_sections} evidence_total={r.evidence.total_memory_items}')"
```

### Step 3: Verify search

```powershell
.venv/Scripts/python.exe -c "from app.core.config import Settings; from app.modules.corpus_search import search_corpus; s = Settings(); results = search_corpus(s, query='TSLA', limit=5); [print(r.heading_path) for r in results]"
```

Expected: non-empty heading_path list from 2026-05 summaries.

---

## Phase B: Connect Cockpit to all 16 knowledge endpoints

### File: `apps/trader-cockpit/lib/cockpit/real-readonly-adapter.ts`

Add the following methods to the `realReadonlyAdapter` object. Keep all existing `/api/agent/*` methods unchanged.

### Type definitions (add at top of file, after existing Backend types)

```typescript
type BackendSearchResult = {
  evidence_id: string;
  section_id: string;
  source_path: string;
  source_type: string;
  heading_path: string;
  snippet: string;
  source_date: string | null;
  start_line: number | null;
  end_line: number | null;
  symbols: string[];
  timestamp: string | null;
  confidence: number;
};

type BackendCandidate = {
  id: string;
  candidate_type: string;
  title: string;
  summary: string | null;
  normalized_rule: string | null;
  symbols_json: string[];
  tags_json: string[];
  confidence: number;
  candidate_status: string;
  review_flags_json: string[];
  created_by: string;
  created_at: string;
  evidence_refs_json: Record<string, unknown>[];
};

type BackendMemoryItem = {
  id: string;
  memory_type: string;
  title: string;
  summary: string | null;
  rule_text: string | null;
  symbols_json: string[];
  tags_json: string[];
  confidence: number;
  status: string;
  evidence_refs_json: Record<string, unknown>[];
  created_at: string;
  updated_at: string;
};

type BackendExtractPreviewResult = {
  memory_type: string;
  title: string;
  summary: string;
  rule_text: string;
  applicability: string | null;
  invalidation: string | null;
  symbols: string[];
  tags: string[];
  confidence: number;
};

type BackendContextMemory = {
  memory_id: string;
  memory_type: string;
  title: string;
  summary: string;
  rule_text: string;
  symbols: string[];
  confidence: number;
  relevance_score: number;
  rank: number;
  source_date: string | null;
  heading_path: string | null;
  evidence_count: number;
};
```

### New adapter methods (add to realReadonlyAdapter object)

```typescript
// ── Knowledge Search ──

async searchKnowledge(query: string, options?: { symbol?: string; sourceType?: string; limit?: number }) {
  const params = new URLSearchParams({ q: query });
  if (options?.symbol) params.set("symbol", options.symbol);
  if (options?.sourceType) params.set("source_type", options.sourceType);
  if (options?.limit) params.set("limit", String(options.limit));
  const data = await fetchJson<{ results: BackendSearchResult[] }>(`/api/knowledge/search?${params}`);
  return data.results;
},

// ── Candidates ──

async listCandidates(options?: { status?: string; candidateType?: string; symbol?: string; limit?: number; offset?: number }) {
  const params = new URLSearchParams();
  if (options?.status) params.set("status", options.status);
  if (options?.candidateType) params.set("candidate_type", options.candidateType);
  if (options?.symbol) params.set("symbol", options.symbol);
  if (options?.limit) params.set("limit", String(options.limit ?? 20));
  if (options?.offset) params.set("offset", String(options.offset ?? 0));
  const data = await fetchJson<{ results: BackendCandidate[] }>(`/api/knowledge/candidates?${params}`);
  return data.results;
},

async getCandidate(id: string) {
  return fetchJson<BackendCandidate>(`/api/knowledge/candidates/${id}`);
},

async createCandidatesFromSections(sectionIds: string[]) {
  return fetchJson<{ created: string[]; flagged: string[] }>("/api/knowledge/candidates", {
    method: "POST",
    body: JSON.stringify({ section_ids: sectionIds, extraction_mode: "rule_based" }),
  });
},

async activateCandidate(id: string) {
  return fetchJson<{ memory_item_id: string }>(`/api/knowledge/candidates/${id}/activate`, { method: "POST" });
},

async rejectCandidate(id: string) {
  return fetchJson<{ candidate_id: string; candidate_status: string }>(`/api/knowledge/candidates/${id}/reject`, { method: "POST" });
},

async mergeCandidate(id: string, targetMemoryItemId: string) {
  return fetchJson<{ candidate_id: string; memory_item_id: string }>(`/api/knowledge/candidates/${id}/merge`, {
    method: "POST",
    body: JSON.stringify({ target_memory_item_id: targetMemoryItemId }),
  });
},

async batchCandidates(ids: string[], action: "activate" | "reject") {
  return fetchJson<{ activated: string[]; rejected: string[]; skipped: string[] }>("/api/knowledge/candidates/batch", {
    method: "POST",
    body: JSON.stringify({ candidate_ids: ids, action }),
  });
},

// ── Memory Items ──

async extractPreview(text: string, contextNote?: string) {
  return fetchJson<BackendExtractPreviewResult>("/api/knowledge/extract-preview", {
    method: "POST",
    body: JSON.stringify({ text, context_note: contextNote ?? null }),
  });
},

async createMemoryItem(item: {
  memory_type: string; title: string; summary?: string; rule_text?: string;
  symbols_json?: string[]; tags_json?: string[]; confidence?: number;
  evidence_refs_json?: Record<string, unknown>[];
}) {
  return fetchJson<BackendMemoryItem>("/api/knowledge/memory-items", {
    method: "POST",
    body: JSON.stringify(item),
  });
},

async listMemoryItems(options?: { status?: string; memoryType?: string; symbol?: string; limit?: number; offset?: number }) {
  const params = new URLSearchParams();
  if (options?.status) params.set("status", options.status);
  if (options?.memoryType) params.set("memory_type", options.memoryType);
  if (options?.symbol) params.set("symbol", options.symbol);
  if (options?.limit) params.set("limit", String(options.limit ?? 20));
  if (options?.offset) params.set("offset", String(options.offset ?? 0));
  const data = await fetchJson<{ results: BackendMemoryItem[] }>(`/api/knowledge/memory-items?${params}`);
  return data.results;
},

async getMemoryItem(id: string) {
  return fetchJson<BackendMemoryItem>(`/api/knowledge/memory-items/${id}`);
},

async updateMemoryItem(id: string, updates: Record<string, unknown>) {
  return fetchJson<BackendMemoryItem>(`/api/knowledge/memory-items/${id}`, {
    method: "PATCH",
    body: JSON.stringify(updates),
  });
},

async deprecateMemoryItem(id: string) {
  return fetchJson<{ memory_item_id: string; status: string }>(`/api/knowledge/memory-items/${id}/deprecate`, { method: "POST" });
},

// ── Context ──

async selectContext(taskType: string, options?: { symbols?: string[]; tags?: string[]; marketScope?: string }) {
  return fetchJson<{ memories: BackendContextMemory[]; total_chars: number }>("/api/knowledge/select-context", {
    method: "POST",
    body: JSON.stringify({
      task_type: taskType,
      symbols: options?.symbols ?? null,
      tags: options?.tags ?? null,
      market_scope: options?.marketScope ?? null,
    }),
  });
},

// ── Admin ──

async backup() {
  return fetchJson<{ sqlite_path: string; jsonl_path: string | null; timestamp: string }>("/api/knowledge/backup", { method: "POST" });
},

async incrementalRebuild() {
  return fetchJson<Record<string, unknown>>("/api/knowledge/incremental-rebuild", { method: "POST" });
},

async evidenceHealth() {
  return fetchJson<Record<string, unknown>>("/api/knowledge/evidence-health");
},
```

### Update the CockpitDataAdapter type

In `lib/cockpit/adapter.ts`, add the new method signatures to the `CockpitDataAdapter` interface:

```typescript
searchKnowledge(query: string, options?: { symbol?: string; sourceType?: string; limit?: number }): Promise<BackendSearchResult[]>;
listCandidates(options?: { status?: string; candidateType?: string; symbol?: string; limit?: number; offset?: number }): Promise<BackendCandidate[]>;
getCandidate(id: string): Promise<BackendCandidate>;
createCandidatesFromSections(sectionIds: string[]): Promise<{ created: string[]; flagged: string[] }>;
activateCandidate(id: string): Promise<{ memory_item_id: string }>;
rejectCandidate(id: string): Promise<{ candidate_id: string; candidate_status: string }>;
mergeCandidate(id: string, targetMemoryItemId: string): Promise<{ candidate_id: string; memory_item_id: string }>;
batchCandidates(ids: string[], action: "activate" | "reject"): Promise<{ activated: string[]; rejected: string[]; skipped: string[] }>;
extractPreview(text: string, contextNote?: string): Promise<BackendExtractPreviewResult>;
createMemoryItem(item: { ... }): Promise<BackendMemoryItem>;
listMemoryItems(options?: { ... }): Promise<BackendMemoryItem[]>;
getMemoryItem(id: string): Promise<BackendMemoryItem>;
updateMemoryItem(id: string, updates: Record<string, unknown>): Promise<BackendMemoryItem>;
deprecateMemoryItem(id: string): Promise<{ memory_item_id: string; status: string }>;
selectContext(taskType: string, options?: { symbols?: string[]; tags?: string[]; marketScope?: string }): Promise<{ memories: BackendContextMemory[]; total_chars: number }>;
backup(): Promise<{ sqlite_path: string; jsonl_path: string | null; timestamp: string }>;
incrementalRebuild(): Promise<Record<string, unknown>>;
evidenceHealth(): Promise<Record<string, unknown>>;
```

### Ensure knowledge API proxy in next.config.ts

Check `apps/trader-cockpit/next.config.ts`. It already proxies `/api/agent/:path*`. Add:

```typescript
{
  source: "/api/knowledge/:path*",
  destination: `${agentApiProxyTarget}/api/knowledge/:path*`,
}
```

If the destination is the same `agentApiProxyTarget`, just add the source line.

---

## Phase C: Build `/cockpit/settings/memory` page

### File: `apps/trader-cockpit/app/cockpit/settings/memory/page.tsx`

A new page component that provides:

```tsx
"use client";
// Tabs: "Active Memory" | "Candidates" | "Extract"
// Uses realReadonlyAdapter methods

// Tab 1: Active Memory
//   - listMemoryItems({ status: "active" })
//   - Table: title, memory_type, symbols, confidence, created_at
//   - Actions: view detail, deprecate

// Tab 2: Candidates
//   - listCandidates({ status: "candidate" })
//   - Table: title, candidate_type, symbols, review_flags, created_at
//   - Actions: activate, reject, batch select + batch activate/reject

// Tab 3: Extract
//   - Textarea for input text
//   - "Extract Preview" button → extractPreview(text)
//   - Display preview card: memory_type, title, summary, symbols, tags
//   - "Confirm & Save" button → createMemoryItem(preview)
```

Style: consistent with existing Cockpit pages (see `LiveDashboard.tsx` for patterns). Use the `CockpitShell` layout.

### Component: `apps/trader-cockpit/components/cockpit/settings/MemorySettings.tsx`

Extract the main content into a reusable component.

---

## Phase D: End-to-end validation

Run the following and confirm each step succeeds:

```powershell
# 1. Data imported
.venv/Scripts/python.exe -c "from app.core.config import Settings; from app.db.session import create_sqlite_engine; from app.db.models import source_artifacts; from sqlalchemy import select, func; s = Settings(); e = create_sqlite_engine(s); conn = e.connect(); count = conn.execute(select(func.count()).select_from(source_artifacts)).scalar(); print(f'source_artifacts count: {count}'); conn.close()"

# 2. Sections created
.venv/Scripts/python.exe -c "from app.core.config import Settings; from app.db.session import create_sqlite_engine; from app.db.models import document_sections; from sqlalchemy import select, func; s = Settings(); e = create_sqlite_engine(s); conn = e.connect(); count = conn.execute(select(func.count()).select_from(document_sections)).scalar(); print(f'document_sections count: {count}'); conn.close()"

# 3. Search works
.venv/Scripts/python.exe -c "from app.core.config import Settings; from app.modules.corpus_search import search_corpus; s = Settings(); [print(r.heading_path) for r in search_corpus(s, query='TSLA', limit=3)]"

# 4. M0-M6 regression
.venv/Scripts/python.exe -m pytest apps/trader-agent/backend/tests/test_artifact_catalog.py apps/trader-agent/backend/tests/test_markdown_section_indexer.py apps/trader-agent/backend/tests/test_corpus_search.py apps/trader-agent/backend/tests/test_evidence_ref.py apps/trader-agent/backend/tests/test_candidate_api.py apps/trader-agent/backend/tests/test_memory_api.py apps/trader-agent/backend/tests/test_context_selector.py apps/trader-agent/backend/tests/test_rebuild.py -v --tb=short
```

---

## Important

- Phase A: run commands, verify output
- Phase B-C: implement in Cockpit frontend
- Phase D: validation
- Do NOT modify any backend code
- Do NOT commit

## Final response

- Each phase: completed or not, with output
- Changed files
- Any errors and their resolution
