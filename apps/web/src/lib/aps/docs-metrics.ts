import { getTwoLeggedToken, isApsConfigured } from "./auth";
import {
  fetchDocsMetricsFromApi,
  type DocsContentApiMetrics,
  type DocsPlatform,
  type FetchDocsMetricsOptions,
} from "./data-management";

export type { DocsContentApiMetrics, DocsPlatform, FetchDocsMetricsOptions };

export interface ProjectDocsMetricsRequest {
  accountId: string;
  projectId: string;
  platform: DocsPlatform;
  includeAllVersions?: boolean;
}

export async function fetchProjectDocsMetrics(
  request: ProjectDocsMetricsRequest,
): Promise<DocsContentApiMetrics> {
  const token = await getTwoLeggedToken();
  return fetchDocsMetricsFromApi(token, {
    accountId: request.accountId,
    projectId: request.projectId,
    platform: request.platform,
    includeAllVersions: request.includeAllVersions ?? false,
  });
}

export function canFetchDocsMetricsFromApi(): boolean {
  return isApsConfigured();
}
