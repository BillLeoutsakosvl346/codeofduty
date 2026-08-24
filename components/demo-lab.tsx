'use client';

import { useEffect, useMemo, useState } from 'react';
import posthog from 'posthog-js';
import { ArrowRight, Check, Copy, CreditCard, FileText, Search, Share2, Sparkles, Zap } from 'lucide-react';
import { FEATURE_ACTIONS, type FeatureId } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';

const corpus = [
  { title: 'Search ranking architecture', path: 'docs/search/ranking.md', body: 'Semantic retrieval combines vector similarity, repository context, recency, and ownership signals to rank engineering knowledge.' },
  { title: 'Stripe subscription lifecycle', path: 'docs/billing/subscriptions.md', body: 'Subscription webhooks are idempotent. Active monthly recurring revenue is annualized and recalculated after updates or cancellation.' },
  { title: 'Team sharing runbook', path: 'docs/sharing/runbook.md', body: 'Share links preserve compact engineering context so teammates can reproduce the same search or summary result.' },
  { title: 'ARR attribution model', path: 'docs/analytics/attribution.md', body: 'PostHog usage redistributes existing Stripe ARR across features. Greptile ownership then allocates feature ARR to engineers.' },
];

function browserIdentity() {
  let userId = window.localStorage.getItem('codeofduty_demo_user');
  if (!userId) {
    userId = `demo_user_${crypto.randomUUID()}`;
    window.localStorage.setItem('codeofduty_demo_user', userId);
  }
  let sessionId = window.sessionStorage.getItem('codeofduty_session');
  if (!sessionId) {
    sessionId = crypto.randomUUID();
    window.sessionStorage.setItem('codeofduty_session', sessionId);
  }
  return { userId, sessionId };
}

function encodeShare(value: string) {
  const bytes = new TextEncoder().encode(value.slice(0, 900));
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

function decodeShare(value: string) {
  const normalized = value.replaceAll('-', '+').replaceAll('_', '/');
  const bytes = Uint8Array.from(atob(normalized), (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function DemoLab() {
  const [identity, setIdentity] = useState<{ userId: string; sessionId: string } | null>(null);
  const [query, setQuery] = useState('How is recurring revenue attributed?');
  const [summaryInput, setSummaryInput] = useState('Code of Duty connects subscription revenue to product usage and code ownership. Stripe establishes the total ARR. PostHog usage distributes that ARR across features. Greptile contribution scores then allocate each feature to the engineers who built it. When usage changes, revenue shifts without another payment.');
  const [searchResults, setSearchResults] = useState<typeof corpus>([]);
  const [summary, setSummary] = useState('');
  const [shareLink, setShareLink] = useState('');
  const [busy, setBusy] = useState<FeatureId | 'checkout' | null>(null);
  const [message, setMessage] = useState('Ready. Use a feature to move existing ARR.');

  useEffect(() => {
    const ids = browserIdentity();
    posthog.identify(ids.userId);
    const shared = new URL(window.location.href).searchParams.get('shared');
    queueMicrotask(() => {
      setIdentity(ids);
      if (shared) {
        try { setSummaryInput(decodeShare(shared)); setMessage('Shared engineering context loaded.'); } catch { setMessage('The shared context link is invalid.'); }
      }
    });
  }, []);

  const wordCount = useMemo(() => summaryInput.trim().split(/\s+/).filter(Boolean).length, [summaryInput]);

  async function record(featureId: FeatureId) {
    if (!identity) throw new Error('Demo identity is still initializing.');
    const usageEventId = crypto.randomUUID();
    const properties = {
      usage_event_id: usageEventId,
      feature_id: featureId,
      action: FEATURE_ACTIONS[featureId],
      user_id: identity.userId,
      session_id: identity.sessionId,
      $insert_id: usageEventId,
    };
    posthog.capture('feature_used', properties);
    const response = await fetch('/api/usage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ usageEventId, featureId, action: FEATURE_ACTIONS[featureId], userId: identity.userId, sessionId: identity.sessionId }) });
    const result = await response.json() as { error?: { message?: string }; url?: string };
    if (!response.ok) throw new Error(result.error?.message ?? 'Usage could not be recorded.');
    return result;
  }

  async function runSearch() {
    if (!query.trim()) return setMessage('Enter a search query first.');
    setBusy('search');
    try {
      const terms = query.toLowerCase().split(/\W+/).filter((term) => term.length > 2);
      const ranked = corpus.map((item) => ({ item, score: terms.reduce((score, term) => score + (`${item.title} ${item.body}`.toLowerCase().includes(term) ? 1 : 0), 0) })).filter((item) => item.score > 0).sort((a, b) => b.score - a.score).map((item) => item.item);
      const results = ranked.length ? ranked : corpus.slice(0, 2);
      await record('search');
      setSearchResults(results);
      setMessage('Search completed. Existing ARR was recalculated from the new usage mix.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Search failed.'); } finally { setBusy(null); }
  }

  async function runSummary() {
    if (wordCount < 8) return setMessage('Add at least eight words to summarize.');
    setBusy('summary');
    try {
      const sentences = summaryInput.match(/[^.!?]+(?:[.!?]+|$)/g) ?? [summaryInput];
      const generated = sentences.slice(0, 2).join(' ').trim();
      await record('summary');
      setSummary(generated);
      setMessage('Summary generated. No payment occurred; active ARR was redistributed.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Summary failed.'); } finally { setBusy(null); }
  }

  async function createShare() {
    const payload = summary || summaryInput;
    if (!payload.trim()) return setMessage('Create or enter content before sharing.');
    setBusy('sharing');
    try {
      const link = `${window.location.origin}/demo?shared=${encodeShare(payload)}`;
      await record('sharing');
      setShareLink(link);
      await navigator.clipboard?.writeText(link);
      setMessage('Share link generated and copied. Team Sharing usage is now in the ARR mix.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Share link failed.'); } finally { setBusy(null); }
  }

  async function checkout() {
    if (!identity) return;
    setBusy('checkout');
    try {
      const response = await fetch('/api/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: identity.userId }) });
      const result = await response.json() as { error?: { message?: string }; url?: string };
      if (!response.ok) throw new Error(result.error?.message ?? 'Checkout could not start.');
      if (!result.url) throw new Error('Stripe did not return a checkout URL.');
      window.location.assign(result.url);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Checkout failed.'); setBusy(null); }
  }

  return <>
    <section className="mb-8 grid gap-6 border-b border-white/10 pb-8 lg:grid-cols-[1fr_auto] lg:items-end"><div><p className="eyebrow text-[#51d9ff]">Product sandbox</p><h1 className="mt-2 text-5xl font-black uppercase tracking-[-0.05em] sm:text-6xl">Use features.<br/><span className="text-white/28">Shift the board.</span></h1><p className="mt-4 max-w-2xl text-sm leading-relaxed text-white/42">Each successful action is captured in PostHog, mirrored in Neon, and immediately runs the same ARR attribution engine.</p></div><Button size="lg" onClick={checkout} disabled={!identity || busy === 'checkout'}><CreditCard size={16}/>{busy === 'checkout' ? 'Opening Stripe…' : 'Subscribe · $100/mo'}</Button></section>

    <div className="mb-6 grid grid-cols-4 border border-white/10 bg-white/[0.018]">{[['01','FEATURE USED'],['02','POSTHOG'],['03','ARR SHIFTS'],['04','BOARD MOVES']].map(([step,label],index) => <div key={step} className="relative border-r border-white/10 p-3 last:border-0 sm:p-4"><p className="font-mono text-[8px] text-[#b8ff38]">{step}</p><p className="mt-1 text-[8px] font-black uppercase tracking-[0.12em] text-white/45 sm:text-[10px]">{label}</p>{index < 3 && <ArrowRight size={12} className="absolute -right-1.5 top-1/2 z-10 -translate-y-1/2 bg-[#070908] text-white/25" />}</div>)}</div>

    <div role="status" className="mb-6 flex items-start gap-3 border border-[#b8ff38]/20 bg-[#b8ff38]/5 px-4 py-3 text-sm text-[#d9ff96]"><Zap size={15} className="mt-0.5 shrink-0"/><div><p>{message}</p><p className="mt-1 font-mono text-[8px] text-white/28">{identity?.userId ?? 'Initializing demo identity…'}</p></div></div>

    <div className="grid gap-6 xl:grid-cols-3">
      <Card><CardHeader><div className="flex items-center justify-between"><div><p className="eyebrow text-[#b8ff38]">Feature 01</p><h2 className="panel-title">Semantic Search</h2></div><Search className="text-[#b8ff38]" size={19}/></div></CardHeader><CardContent><label className="field-label" htmlFor="search-query">Engineering query</label><div className="flex gap-2"><input id="search-query" value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') runSearch(); }} className="field-input"/><Button aria-label="Run search" onClick={runSearch} disabled={busy === 'search'}>{busy === 'search' ? 'Running…' : 'Search'}</Button></div><div className="mt-5 space-y-3">{searchResults.map((result) => <div key={result.path} className="border border-white/[0.08] bg-white/[0.018] p-3"><div className="flex items-center gap-2"><FileText size={13} className="text-[#b8ff38]"/><p className="text-sm font-bold">{result.title}</p></div><p className="mt-1 font-mono text-[8px] text-white/25">{result.path}</p><p className="mt-2 text-xs leading-relaxed text-white/38">{result.body}</p></div>)}{searchResults.length === 0 && <p className="py-8 text-center text-xs text-white/25">Run a search to create a usage event.</p>}</div></CardContent></Card>
      <Card><CardHeader><div className="flex items-center justify-between"><div><p className="eyebrow text-[#51d9ff]">Feature 02</p><h2 className="panel-title">AI Summary</h2></div><Sparkles className="text-[#51d9ff]" size={19}/></div></CardHeader><CardContent><div className="flex items-center justify-between"><label className="field-label" htmlFor="summary-input">Engineering context</label><span className="font-mono text-[8px] text-white/25">{wordCount} words</span></div><textarea id="summary-input" value={summaryInput} onChange={(event) => setSummaryInput(event.target.value)} className="field-input min-h-40 resize-y py-3"/><Button className="mt-3 w-full" variant="outline" onClick={runSummary} disabled={busy === 'summary'}><Sparkles size={14}/>{busy === 'summary' ? 'Generating…' : 'Generate summary'}</Button>{summary && <div className="mt-4 border-l-2 border-[#51d9ff] bg-[#51d9ff]/5 p-4"><p className="eyebrow text-[#51d9ff]">Generated brief</p><p className="mt-2 text-sm leading-relaxed text-white/62">{summary}</p></div>}</CardContent></Card>
      <Card><CardHeader><div className="flex items-center justify-between"><div><p className="eyebrow text-[#ffb547]">Feature 03</p><h2 className="panel-title">Team Sharing</h2></div><Share2 className="text-[#ffb547]" size={19}/></div></CardHeader><CardContent><div className="grid min-h-44 place-items-center border border-dashed border-white/12 bg-white/[0.015] p-6 text-center"><div><div className="mx-auto grid h-12 w-12 place-items-center rounded-full border border-[#ffb547]/25 bg-[#ffb547]/5 text-[#ffb547]"><Share2 size={20}/></div><h3 className="mt-4 font-black uppercase">Share current context</h3><p className="mt-2 text-xs leading-relaxed text-white/34">Generate a compact URL that restores this summary for a teammate.</p></div></div><Button className="mt-4 w-full" variant="outline" onClick={createShare} disabled={busy === 'sharing'}><Copy size={14}/>{busy === 'sharing' ? 'Generating…' : 'Generate share link'}</Button>{shareLink && <div className="mt-4 flex items-start gap-2 border border-[#ffb547]/20 bg-[#ffb547]/5 p-3 text-xs text-[#ffd38a]"><Check size={14} className="mt-0.5 shrink-0"/><span className="break-all">{shareLink}</span></div>}<div className="mt-6 border border-white/[0.08] p-4"><p className="eyebrow">Revenue rule</p><p className="mt-2 text-xs leading-relaxed text-white/36">This event changes feature weights only. Total active ARR remains exactly conserved.</p></div></CardContent></Card>
    </div>
  </>;
}
