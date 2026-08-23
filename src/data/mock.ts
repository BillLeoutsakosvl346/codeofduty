import type { Bounty, Client, Engineer, Feature, Mission } from "../types";

export const clients: Client[] = [
  { id: "brightsmile", name: "BrightSmile Ortho", arr: 52000, plan: "Enterprise", seats: 40, renewsInDays: 178, status: "active" },
  { id: "smileworks", name: "SmileWorks", arr: 30000, plan: "Growth", seats: 22, renewsInDays: 74, status: "active" },
  { id: "pearlpoint", name: "PearlPoint", arr: 22000, plan: "Growth", seats: 14, renewsInDays: 19, status: "past_due" },
  { id: "acme", name: "Acme Dental Group", arr: 14000, plan: "Team", seats: 9, renewsInDays: 41, status: "cancel_scheduled" },
  { id: "gleamco", name: "GleamCo", arr: 8000, plan: "Team", seats: 5, renewsInDays: 230, status: "active" },
];

export const features: Feature[] = [
  { id: "semantic-search", name: "Semantic Search", owners: ["priya", "devon"], weeklyUsers: 1240, usageShare: { brightsmile: 0.12, smileworks: 0.1, pearlpoint: 0.05, acme: 0.1, gleamco: 0.07875 }, conversionTouch: 0.41 },
  { id: "ai-summary", name: "AI Summary", owners: ["sam", "ling"], weeklyUsers: 710, usageShare: { brightsmile: 0.04, smileworks: 0.04, pearlpoint: 0.02, acme: 0.025, gleamco: 0.01875 }, conversionTouch: 0.23 },
  { id: "sharing", name: "Share Links", owners: ["marcus"], weeklyUsers: 380, usageShare: { brightsmile: 0.01, smileworks: 0.02, pearlpoint: 0.01, acme: 0.02, gleamco: 0.02625 }, conversionTouch: 0.1 },
];

export const bounties: Bounty[] = [
  { id: "b-305", title: "Search crashes when filters are empty", featureId: "semantic-search", summary: "TypeError: filter.value is undefined in SearchResults", hits: [{ clientId: "acme", count: 31, signal: "rage_click" }, { clientId: "pearlpoint", count: 6, signal: "exception" }], firstSeen: "Aug 19", status: "open", assists: [] },
  { id: "b-298", title: "Summary stalls on documents over 40 pages", featureId: "ai-summary", summary: "generation_started without generation_completed after 30 seconds", hits: [{ clientId: "pearlpoint", count: 9, signal: "replay" }], firstSeen: "Aug 16", status: "claimed", claimedBy: "sam", assists: ["ling"] },
  { id: "b-290", title: "Share dialog triggers repeated rage clicks", featureId: "sharing", summary: "share_clicked repeated before link_created", hits: [{ clientId: "smileworks", count: 7, signal: "rage_click" }], firstSeen: "Aug 11", status: "open", assists: [] },
  { id: "b-281", title: "Search indexing skipped uploaded PDFs", featureId: "semantic-search", summary: "document_uploaded without index_completed", hits: [{ clientId: "smileworks", count: 40, signal: "exception" }], firstSeen: "Aug 3", status: "killed", claimedBy: "priya", assists: ["devon"], killedOn: "Aug 5" },
  { id: "b-276", title: "Summary citations opened the wrong page", featureId: "ai-summary", summary: "citation_clicked page mismatch in replay set", hits: [{ clientId: "brightsmile", count: 22, signal: "replay" }], firstSeen: "Jul 28", status: "killed", claimedBy: "ling", assists: ["priya"], killedOn: "Aug 2" },
];

export const missions: Mission[] = [
  { id: "m-28", title: "Enterprise search filters", featureId: "semantic-search", source: "customer", requestedBy: "Acme + SmileWorks", points: 560, deadline: "4D 12H", status: "open" },
  { id: "m-24", title: "Export revenue impact to CSV", featureId: "ai-summary", source: "ceo", requestedBy: "CEO", points: 320, deadline: "2D 08H", status: "claimed", claimedBy: "ling" },
  { id: "m-19", title: "Create a share link in under ten seconds", featureId: "sharing", source: "customer", requestedBy: "BrightSmile Ortho", points: 420, deadline: "COMPLETE", status: "complete", claimedBy: "priya" },
];

export const engineers: Engineer[] = [
  { login: "priya", callsign: "PRIYA", seasonPoints: 1420, seasonKills: 11, seasonAssists: 6, missions: 8, streakDays: 9 },
  { login: "sam", callsign: "SAM", seasonPoints: 1180, seasonKills: 8, seasonAssists: 9, missions: 6, streakDays: 4 },
  { login: "ling", callsign: "LING", seasonPoints: 960, seasonKills: 7, seasonAssists: 4, missions: 5, streakDays: 12 },
  { login: "devon", callsign: "DEVON", seasonPoints: 540, seasonKills: 5, seasonAssists: 11, missions: 4, streakDays: 0 },
  { login: "marcus", callsign: "MARCUS", seasonPoints: 210, seasonKills: 3, seasonAssists: 2, missions: 2, streakDays: 0 },
];
