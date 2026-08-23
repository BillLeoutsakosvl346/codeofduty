import type { Bounty, Client, Engineer, Feature, Mission } from "../types";

export const clients: Client[] = [
  { id: "canyon-crest", name: "Canyon Crest Stables", arr: 52000, plan: "Network", seats: 40, renewsInDays: 178, status: "active" },
  { id: "saddle-sage", name: "Saddle & Sage Training", arr: 30000, plan: "Stable", seats: 22, renewsInDays: 74, status: "active" },
  { id: "juniper-ridge", name: "Juniper Ridge Equestrian", arr: 22000, plan: "Stable", seats: 14, renewsInDays: 19, status: "past_due" },
  { id: "high-mesa", name: "High Mesa Horse Rescue", arr: 14000, plan: "Trainer", seats: 9, renewsInDays: 41, status: "cancel_scheduled" },
  { id: "westwind", name: "Westwind Sporthorses", arr: 8000, plan: "Trainer", seats: 5, renewsInDays: 230, status: "active" },
];

export const features: Feature[] = [
  { id: "search", name: "Horse Discovery", owners: ["aanishs", "bill", "claude"], weeklyUsers: 1240, usageShare: { "canyon-crest": 0.12, "saddle-sage": 0.1, "juniper-ridge": 0.05, "high-mesa": 0.1, westwind: 0.07875 }, conversionTouch: 0.41 },
  { id: "summary", name: "AI Compatibility", owners: ["bill", "claude"], weeklyUsers: 710, usageShare: { "canyon-crest": 0.04, "saddle-sage": 0.04, "juniper-ridge": 0.02, "high-mesa": 0.025, westwind: 0.01875 }, conversionTouch: 0.23 },
  { id: "sharing", name: "Stable Sharing", owners: ["aanishs"], weeklyUsers: 380, usageShare: { "canyon-crest": 0.01, "saddle-sage": 0.02, "juniper-ridge": 0.01, "high-mesa": 0.02, westwind: 0.02625 }, conversionTouch: 0.1 },
];

export const bounties: Bounty[] = [
  { id: "b-305", title: "Discovery deck freezes when every filter is cleared", featureId: "search", summary: "TypeError: preference.value is undefined in HorseDiscoveryDeck", hits: [{ clientId: "high-mesa", count: 31, signal: "rage_click" }, { clientId: "juniper-ridge", count: 6, signal: "exception" }], firstSeen: "Aug 19", status: "open", assists: [] },
  { id: "b-298", title: "Compatibility insight stalls on long care histories", featureId: "summary", summary: "compatibility_started without compatibility_completed after 30 seconds", hits: [{ clientId: "juniper-ridge", count: 9, signal: "replay" }], firstSeen: "Aug 16", status: "claimed", claimedBy: "bill", assists: ["claude"] },
  { id: "b-290", title: "Stable profile share button triggers repeated rage clicks", featureId: "sharing", summary: "profile_share_clicked repeated before stable_link_created", hits: [{ clientId: "saddle-sage", count: 7, signal: "rage_click" }], firstSeen: "Aug 11", status: "open", assists: [] },
  { id: "b-281", title: "Discovery hides horses missing a discipline tag", featureId: "search", summary: "horse_profile_loaded without discovery_card_rendered", hits: [{ clientId: "saddle-sage", count: 40, signal: "exception" }], firstSeen: "Aug 3", status: "killed", claimedBy: "aanishs", assists: ["bill"], killedOn: "Aug 5" },
  { id: "b-276", title: "Compatibility insight shows stale temperament data", featureId: "summary", summary: "compatibility_opened with profile_version mismatch in replay set", hits: [{ clientId: "canyon-crest", count: 22, signal: "replay" }], firstSeen: "Jul 28", status: "killed", claimedBy: "claude", assists: ["aanishs"], killedOn: "Aug 2" },
];

export const missions: Mission[] = [
  { id: "m-28", title: "Filter horses by temperament and rider level", featureId: "search", source: "customer", requestedBy: "High Mesa + Saddle & Sage", points: 560, deadline: "4D 12H", status: "open" },
  { id: "m-24", title: "Explain compatibility in plain language", featureId: "summary", source: "ceo", requestedBy: "CEO", points: 320, deadline: "2D 08H", status: "claimed", claimedBy: "claude" },
  { id: "m-19", title: "Share a horse profile with a trainer in under ten seconds", featureId: "sharing", source: "customer", requestedBy: "Canyon Crest Stables", points: 420, deadline: "COMPLETE", status: "complete", claimedBy: "aanishs" },
];

export const engineers: Engineer[] = [
  { login: "aanishs", callsign: "AANISH", seasonPoints: 1420, seasonKills: 11, seasonAssists: 6, missions: 8, streakDays: 9 },
  { login: "bill", callsign: "BILL", seasonPoints: 1180, seasonKills: 8, seasonAssists: 9, missions: 6, streakDays: 4 },
  { login: "claude", callsign: "CLAUDE", seasonPoints: 960, seasonKills: 7, seasonAssists: 4, missions: 5, streakDays: 12 },
];
