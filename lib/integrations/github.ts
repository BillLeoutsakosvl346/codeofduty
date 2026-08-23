import { Octokit } from '@octokit/rest';
import { getDb } from '@/db';
import { engineers, integrationSyncs, pullRequests } from '@/db/schema';

function githubClient() {
  const auth = process.env.GITHUB_TOKEN;
  if (!auth) throw new Error('GITHUB_TOKEN is not configured.');
  return new Octokit({ auth });
}

export async function syncMergedPullRequests() {
  const owner = process.env.GITHUB_OWNER;
  const repo = process.env.GITHUB_REPO;
  if (!owner || !repo) throw new Error('GITHUB_OWNER and GITHUB_REPO are required.');
  const db = getDb();
  const now = new Date();
  try {
    const response = await githubClient().pulls.list({ owner, repo, state: 'closed', sort: 'updated', direction: 'desc', per_page: 100 });
    const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
    const merged = response.data.filter((pr) => pr.merged_at && new Date(pr.merged_at).getTime() >= cutoff);
    for (const pr of merged) {
      const login = pr.user?.login ?? 'unknown';
      const engineerId = `eng_${login.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`;
      await db.insert(engineers).values({
        id: engineerId,
        name: login,
        githubLogin: login,
        avatarUrl: pr.user?.avatar_url ?? null,
        role: 'Software Engineer',
        source: 'github',
      }).onConflictDoUpdate({ target: engineers.githubLogin, set: { avatarUrl: pr.user?.avatar_url ?? null, updatedAt: now } });
      await db.insert(pullRequests).values({
        id: `github_${owner}_${repo}_${pr.number}`,
        repository: `${owner}/${repo}`,
        number: pr.number,
        title: pr.title,
        authorLogin: login,
        engineerId,
        url: pr.html_url,
        mergedAt: new Date(pr.merged_at!),
        source: 'github',
      }).onConflictDoUpdate({
        target: [pullRequests.repository, pullRequests.number],
        set: { title: pr.title, authorLogin: login, engineerId, url: pr.html_url, mergedAt: new Date(pr.merged_at!), updatedAt: now },
      });
    }
    await db.insert(integrationSyncs).values({ provider: 'github', status: 'verified', message: `Synced ${merged.length} merged PRs.`, details: { count: merged.length }, lastAttemptAt: now, lastSuccessAt: now })
      .onConflictDoUpdate({ target: integrationSyncs.provider, set: { status: 'verified', message: `Synced ${merged.length} merged PRs.`, details: { count: merged.length }, lastAttemptAt: now, lastSuccessAt: now } });
    return { synced: merged.length, repository: `${owner}/${repo}` };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'GitHub sync failed.';
    await db.insert(integrationSyncs).values({ provider: 'github', status: 'error', message, lastAttemptAt: now })
      .onConflictDoUpdate({ target: integrationSyncs.provider, set: { status: 'error', message, lastAttemptAt: now } });
    throw error;
  }
}

export async function getPullRequestFiles(number: number) {
  const owner = process.env.GITHUB_OWNER!;
  const repo = process.env.GITHUB_REPO!;
  const response = await githubClient().pulls.listFiles({ owner, repo, pull_number: number, per_page: 100 });
  return response.data.map((file) => ({ filename: file.filename, status: file.status, additions: file.additions, deletions: file.deletions, patch: file.patch?.slice(0, 3_000) ?? '' }));
}
