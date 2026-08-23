import { randomUUID } from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '@/db';
import { featureContributions, integrationSyncs, pullRequests } from '@/db/schema';
import { FEATURE_IDS } from '@/lib/constants';
import { recalculateAllActiveCustomers } from '@/lib/arr';
import { getPullRequestFiles } from '@/lib/integrations/github';

const responseSchema = z.array(z.object({
  featureId: z.enum(FEATURE_IDS),
  score: z.number().int().min(0).max(100),
  reason: z.string().min(3).max(500),
}));

const featureDescriptions = {
  search: 'Semantic Search: finds code and engineering knowledge by meaning.',
  summary: 'AI Summary: turns engineering context into concise summaries.',
  sharing: 'Team Sharing: generates links for teammates to share product context.',
};

function headers() {
  const apiKey = process.env.GREPTILE_API_KEY;
  const githubToken = process.env.GITHUB_TOKEN;
  if (!apiKey || !githubToken) throw new Error('Greptile and GitHub credentials are required.');
  return { Authorization: `Bearer ${apiKey}`, 'X-GitHub-Token': githubToken, 'Content-Type': 'application/json' };
}

async function ensureRepositoryReady() {
  const owner = process.env.GITHUB_OWNER!;
  const repo = process.env.GITHUB_REPO!;
  const branch = 'main';
  const repositoryId = encodeURIComponent(`github:${branch}:${owner}/${repo}`);
  const status = await fetch(`https://api.greptile.com/v2/repositories/${repositoryId}`, { headers: headers() });
  if (status.ok) return { ready: true, branch };
  if (status.status !== 404) throw new Error(`Greptile repository status failed (${status.status}).`);
  const indexed = await fetch('https://api.greptile.com/v2/repositories', {
    method: 'POST', headers: headers(), body: JSON.stringify({ remote: 'github', repository: `${owner}/${repo}`, branch }),
  });
  if (!indexed.ok) throw new Error(`Greptile indexing request failed (${indexed.status}).`);
  return { ready: false, branch };
}

function parseGreptileJson(message: string) {
  const start = message.indexOf('[');
  const end = message.lastIndexOf(']');
  if (start < 0 || end <= start) throw new Error('Greptile did not return a JSON contribution array.');
  return responseSchema.parse(JSON.parse(message.slice(start, end + 1))).filter((item) => item.score > 0);
}

export async function analyzePullRequests(options?: { prNumbers?: number[]; force?: boolean }) {
  const db = getDb();
  const now = new Date();
  try {
    const repoStatus = await ensureRepositoryReady();
    if (!repoStatus.ready) {
      await db.insert(integrationSyncs).values({ provider: 'greptile', status: 'pending', message: 'Repository indexing requested.', lastAttemptAt: now })
        .onConflictDoUpdate({ target: integrationSyncs.provider, set: { status: 'pending', message: 'Repository indexing requested.', lastAttemptAt: now } });
      return { analyzed: 0, pendingIndex: true };
    }
    let candidates = options?.prNumbers?.length
      ? await db.select().from(pullRequests).where(inArray(pullRequests.number, options.prNumbers))
      : await db.select().from(pullRequests);
    candidates = candidates.filter((pr) => pr.source === 'github').slice(0, 20);
    if (!options?.force) {
      const existing = await db.select({ pullRequestId: featureContributions.pullRequestId }).from(featureContributions).where(eq(featureContributions.source, 'greptile'));
      const analyzed = new Set(existing.map((row) => row.pullRequestId));
      candidates = candidates.filter((pr) => !analyzed.has(pr.id));
    }
    candidates = candidates.slice(0, 5);
    let analyzedCount = 0;
    for (const pr of candidates) {
      const files = await getPullRequestFiles(pr.number);
      const prompt = `Score the semantic contribution of merged PR #${pr.number} (${pr.title}) to these exact product features:\n${JSON.stringify(featureDescriptions)}\nChanged files and patches:\n${JSON.stringify(files)}\nReturn ONLY a JSON array of objects with featureId, integer score 0-100, and concise reason. Include only materially affected features. Score semantic importance, not lines changed.`;
      const response = await fetch('https://api.greptile.com/v2/query', {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({
          messages: [{ role: 'user', content: prompt }],
          repositories: [{ remote: 'github', repository: pr.repository, branch: repoStatus.branch }],
          stream: false,
          genius: false,
        }),
      });
      if (!response.ok) throw new Error(`Greptile query failed for PR #${pr.number} (${response.status}).`);
      const body = await response.json() as { message?: string };
      const contributions = parseGreptileJson(body.message ?? '');
      await db.delete(featureContributions).where(and(eq(featureContributions.pullRequestId, pr.id), eq(featureContributions.source, 'greptile')));
      if (contributions.length) {
        await db.insert(featureContributions).values(contributions.map((item) => ({
          id: `greptile_${pr.id}_${item.featureId}_${randomUUID().slice(0, 8)}`,
          pullRequestId: pr.id,
          featureId: item.featureId,
          score: item.score,
          reason: item.reason,
          source: 'greptile',
          analyzedAt: new Date(),
        }))).onConflictDoNothing();
      }
      analyzedCount += 1;
    }
    if (analyzedCount) await recalculateAllActiveCustomers();
    await db.insert(integrationSyncs).values({ provider: 'greptile', status: 'verified', message: `Analyzed ${analyzedCount} PRs.`, details: { count: analyzedCount }, lastAttemptAt: now, lastSuccessAt: now })
      .onConflictDoUpdate({ target: integrationSyncs.provider, set: { status: 'verified', message: `Analyzed ${analyzedCount} PRs.`, details: { count: analyzedCount }, lastAttemptAt: now, lastSuccessAt: now } });
    return { analyzed: analyzedCount, pendingIndex: false };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Greptile analysis failed.';
    await db.insert(integrationSyncs).values({ provider: 'greptile', status: 'error', message, lastAttemptAt: now })
      .onConflictDoUpdate({ target: integrationSyncs.provider, set: { status: 'error', message, lastAttemptAt: now } });
    throw error;
  }
}
