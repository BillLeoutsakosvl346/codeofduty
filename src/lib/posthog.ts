import posthog from "posthog-js";

import type { FeatureId } from "../../shared/contracts";

type FeatureEvent = {
  usageEventId: string;
  featureId: FeatureId;
  action: string;
  userId: string;
  sessionId: string;
};

const key = import.meta.env.VITE_POSTHOG_KEY?.trim();
const host = import.meta.env.VITE_POSTHOG_HOST?.trim() || "https://us.i.posthog.com";
const identityKey = "code-of-duty.posthog-identity";
let initialized = false;

export function isPostHogConfigured(): boolean {
  return Boolean(key);
}

function initialize(): boolean {
  if (!key) return false;
  if (!initialized) {
    posthog.init(key, {
      api_host: host,
      capture_pageview: false,
      capture_pageleave: false,
      persistence: "localStorage+cookie",
    });
    initialized = true;
  }
  return true;
}

export function identifyDemoUser(userId: string): boolean {
  if (!initialize()) return false;
  if (window.localStorage.getItem(identityKey) !== userId) {
    posthog.identify(userId);
    window.localStorage.setItem(identityKey, userId);
  }
  return true;
}

export function captureFeatureUsed(event: FeatureEvent): boolean {
  if (!initialize()) return false;
  posthog.capture("feature_used", {
    usage_event_id: event.usageEventId,
    feature_id: event.featureId,
    action: event.action,
    user_id: event.userId,
    session_id: event.sessionId,
  });
  return true;
}
