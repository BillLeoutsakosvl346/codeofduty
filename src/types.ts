export type SubStatus = "active" | "past_due" | "cancel_scheduled";

export interface Client {
  id: string;
  name: string;
  arr: number;
  plan: string;
  seats: number;
  renewsInDays: number;
  status: SubStatus;
}

export interface Feature {
  id: string;
  name: string;
  owners: string[];
  weeklyUsers: number;
  usageShare: Record<string, number>;
  conversionTouch: number;
}

export type Signal = "exception" | "rage_click" | "replay";
export interface Hit { clientId: string; count: number; signal: Signal }
export type BountyStatus = "open" | "claimed" | "killed";
export interface Bounty {
  id: string;
  title: string;
  featureId: string;
  summary: string;
  hits: Hit[];
  firstSeen: string;
  status: BountyStatus;
  claimedBy?: string;
  assists: string[];
  killedOn?: string;
}

export interface Mission {
  id: string;
  title: string;
  featureId: string;
  source: "customer" | "ceo";
  requestedBy: string;
  points: number;
  deadline: string;
  status: "open" | "claimed" | "complete";
  claimedBy?: string;
}

export interface Engineer {
  login: string;
  callsign: string;
  seasonPoints: number;
  seasonKills: number;
  seasonAssists: number;
  missions: number;
  streakDays: number;
}

export const ASSIST_SHARE = 0.25;
export const SESSION_DATE = "today";
export const NEW_ARR_THIS_QUARTER = 38000;

export function featureRevenue(f: Feature, clients: Client[]): number {
  return clients.reduce((sum, c) => sum + c.arr * (f.usageShare[c.id] ?? 0), 0);
}
export function featureConversionValue(f: Feature): number { return NEW_ARR_THIS_QUARTER * f.conversionTouch; }
export function featureValue(f: Feature, clients: Client[]): number { return featureRevenue(f, clients) + featureConversionValue(f); }
export function urgency(c: Client): number {
  if (c.status === "cancel_scheduled" || c.status === "past_due") return 2;
  if (c.renewsInDays <= 30) return 1.5;
  return 1;
}
export function bountyUrgency(b: Bounty, clients: Client[]): number { return Math.max(1, ...b.hits.map((h) => urgency(clients.find((c) => c.id === h.clientId)!))); }
export function hitArr(b: Bounty, clients: Client[]): number { return b.hits.reduce((sum, h) => sum + (clients.find((c) => c.id === h.clientId)?.arr ?? 0), 0); }
export function bountyPoints(b: Bounty, features: Feature[], clients: Client[]): number {
  const f = features.find((x) => x.id === b.featureId);
  if (!f) return 0;
  return Math.round((featureValue(f, clients) / 100) * bountyUrgency(b, clients) + hitArr(b, clients) / 1000);
}
export const assistPoints = (points: number) => Math.round(points * ASSIST_SHARE);

export interface LiveStats { login: string; callsign: string; points: number; kills: number; assists: number; missions: number; streakDays: number }
export function liveStats(e: Engineer, bounties: Bounty[], features: Feature[], clients: Client[]): LiveStats {
  const session = bounties.filter((b) => b.status === "killed" && b.killedOn === SESSION_DATE);
  let points = e.seasonPoints;
  let kills = e.seasonKills;
  let assists = e.seasonAssists;
  for (const bounty of session) {
    const pointsAvailable = bountyPoints(bounty, features, clients);
    if (bounty.claimedBy === e.login) { points += pointsAvailable; kills += 1; }
    if (bounty.assists.includes(e.login)) { points += assistPoints(pointsAvailable); assists += 1; }
  }
  return { login: e.login, callsign: e.callsign, points, kills, assists, missions: e.missions, streakDays: e.streakDays };
}
