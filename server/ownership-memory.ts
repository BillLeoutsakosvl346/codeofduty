import type { OwnershipEvent } from "../shared/ownership-contracts.js";

export type ClaudeMemResult =
  | { status: "queued" }
  | { status: "unavailable"; reason: string };

function safeMemoryObservation(event: OwnershipEvent) {
  return {
    schema_version: event.schema_version,
    event_id: event.event_id,
    repository: event.repository,
    pull_request_number: event.pull_request_number,
    merge_sha: event.merge_sha,
    merged_at: event.merged_at,
    approved_by: event.approved_by,
    features: event.manifest.features,
    impact: event.manifest.impact,
    contributors: event.manifest.contributors.map((contributor) => ({
      contributor_id: contributor.contributor_id,
      share_bps: contributor.share_bps,
      roles: contributor.roles,
    })),
    greptile_status: event.greptile.status,
  };
}

async function workerFailureReason(response: Response) {
  const responseBody = await response.text().catch(() => "");
  const detail = responseBody.trim() ? `: ${responseBody.trim().slice(0, 300)}` : "";
  return `worker returned HTTP ${response.status}${detail}`;
}

export async function rememberOwnershipEvent(
  event: OwnershipEvent,
  options: {
    workerPort?: number;
    fetchImpl?: typeof fetch;
    cwd?: string;
  } = {},
): Promise<ClaudeMemResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const workerPort = options.workerPort ?? Number(process.env.CLAUDE_MEM_WORKER_PORT || 37777);
  const workerUrl = `http://127.0.0.1:${workerPort}`;
  const contentSessionId = `codeofduty-ownership-${event.merge_sha}`;
  try {
    const initResponse = await fetchImpl(`${workerUrl}/api/sessions/init`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contentSessionId,
        project: "codeofduty/ownership",
        prompt:
          "Record the normalized, human-approved ownership merge event that follows as historical project context.",
        platformSource: "codex",
      }),
      signal: AbortSignal.timeout(2_000),
    });
    if (!initResponse.ok) {
      return { status: "unavailable", reason: await workerFailureReason(initResponse) };
    }

    const response = await fetchImpl(
      `${workerUrl}/api/sessions/observations`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contentSessionId,
          platformSource: "codex",
          tool_name: "CodeOfDutyOwnershipMerge",
          tool_input: safeMemoryObservation(event),
          tool_response: {
            status: "validated-and-recorded",
            note: "The pusher identity was not used to calculate ownership.",
          },
          cwd: options.cwd ?? process.cwd(),
        }),
        signal: AbortSignal.timeout(2_000),
      },
    );
    if (!response.ok) {
      return { status: "unavailable", reason: await workerFailureReason(response) };
    }
    return { status: "queued" };
  } catch (error) {
    return {
      status: "unavailable",
      reason: error instanceof Error ? error.message : "claude-mem worker unavailable",
    };
  }
}
