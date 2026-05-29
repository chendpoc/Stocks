import type { ReactNode } from "react";
import { StateBlock } from "./StateBlock";

type QueryGateProps = {
  isLoading: boolean;
  isError: boolean;
  error?: Error | null;
  hasData: boolean;
  loadingTitle?: string;
  loadingDescription?: string;
  errorTitle?: string;
  errorDescription?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  children: ReactNode;
};

/**
 * Wraps the common useQuery loading → error → empty → render pattern.
 *
 * Usage:
 *   <QueryGate
 *     isLoading={query.isLoading}
 *     isError={query.isError}
 *     error={query.error}
 *     hasData={!!query.data}
 *     loadingTitle={t("...")}
 *     errorTitle={t("...")}
 *     emptyTitle={t("...")}
 *     emptyDescription={t("...")}
 *   >
 *     <YourContent data={query.data} />
 *   </QueryGate>
 */
export function QueryGate({
  isLoading,
  isError,
  error,
  hasData,
  loadingTitle = "Loading",
  loadingDescription = "Loading data...",
  errorTitle = "Failed to load",
  errorDescription = "An error occurred while loading data.",
  emptyTitle = "No data",
  emptyDescription = "No data available.",
  children,
}: QueryGateProps) {
  if (isLoading) {
    return <StateBlock state="loading" title={loadingTitle} description={loadingDescription} />;
  }

  if (isError) {
    const detail = error instanceof Error ? error.message : undefined;
    return (
      <StateBlock
        state="error"
        title={errorTitle}
        description={detail ?? errorDescription}
      />
    );
  }

  if (!hasData) {
    return <StateBlock title={emptyTitle} description={emptyDescription} />;
  }

  return <>{children}</>;
}
