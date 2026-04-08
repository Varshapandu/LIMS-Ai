"use client";

import { safeParseJson } from "./storage-json";

export const AUTH_FLAG_KEY = "ai-lims-auth";
export const AUTH_TOKEN_KEY = "ai-lims-token";
export const AUTH_USER_KEY = "ai-lims-user";

export type AuthUser = {
  name: string;
  role: string;
  location: string;
};

export const DEFAULT_AUTH_USER: AuthUser = {
  name: "Lab Admin",
  role: "ADMIN",
  location: "Central Unit",
};

function isBrowser() {
  return typeof window !== "undefined";
}

export function isAuthenticated() {
  return isBrowser() && window.localStorage.getItem(AUTH_FLAG_KEY) === "true";
}

export function loadStoredUser() {
  if (!isBrowser()) {
    return null;
  }

  const parsed = safeParseJson<AuthUser | null>(window.localStorage.getItem(AUTH_USER_KEY), null);
  if (!parsed?.name || !parsed?.role) {
    return null;
  }

  return {
    ...DEFAULT_AUTH_USER,
    ...parsed,
    location: parsed.location || DEFAULT_AUTH_USER.location,
  };
}

export function saveSession(user: AuthUser, token = "demo-local-token") {
  if (!isBrowser()) {
    return;
  }

  window.localStorage.setItem(AUTH_FLAG_KEY, "true");
  window.localStorage.setItem(AUTH_TOKEN_KEY, token);
  window.localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
}

export function clearSession() {
  if (!isBrowser()) {
    return;
  }

  window.localStorage.removeItem(AUTH_TOKEN_KEY);
  window.localStorage.removeItem(AUTH_USER_KEY);
  window.localStorage.setItem(AUTH_FLAG_KEY, "false");
}

export function saveStoredUser(user: AuthUser) {
  if (!isBrowser()) {
    return;
  }

  window.localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
}
