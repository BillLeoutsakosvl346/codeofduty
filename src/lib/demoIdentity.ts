const USER_STORAGE_KEY = "code-of-duty.demo-user-id";
const SESSION_STORAGE_KEY = "code-of-duty.demo-session-id";

function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

export function getDemoUserId(): string {
  const existing = window.localStorage.getItem(USER_STORAGE_KEY);
  if (existing) return existing;

  const userId = newId("demo_user");
  window.localStorage.setItem(USER_STORAGE_KEY, userId);
  return userId;
}

export function getDemoSessionId(): string {
  const existing = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
  if (existing) return existing;

  const sessionId = crypto.randomUUID();
  window.sessionStorage.setItem(SESSION_STORAGE_KEY, sessionId);
  return sessionId;
}

