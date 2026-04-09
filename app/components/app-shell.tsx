"use client";

"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReactNode, useEffect, useMemo, useRef, useState } from "react";

import {
  ApprovalsIcon,
  BellIcon,
  BillingIcon,
  CollectionIcon,
  DashboardIcon,
  LocationIcon,
  ReportsIcon,
  RangeIcon,
  ResultEntryIcon,
  SearchIcon,
  SettingsIcon,
} from "./icons";
import { ChatBot } from "./chatbot";
import { ErrorBoundary } from "./error-boundary";
import { loadNotifications, getUnreadCount, markAllNotificationsAsRead, Notification } from "../lib/notifications-storage";
import { clearSession, DEFAULT_AUTH_USER, loadStoredUser, saveStoredUser, type AuthUser } from "../lib/auth-storage";

type AppShellProps = {
  overline: string;
  title: string;
  action?: ReactNode;
  searchPlaceholder?: string;
  hidePageHeading?: boolean;
  children: ReactNode;
};

const navItems = [
  { href: "/dashboard", label: "Dashboard", Icon: DashboardIcon },
  { href: "/billing", label: "Billing", Icon: BillingIcon },
  { href: "/collection", label: "Collection", Icon: CollectionIcon },
  { href: "/results", label: "Result Entry", Icon: ResultEntryIcon },
  { href: "/approvals", label: "Approvals", Icon: ApprovalsIcon },
  { href: "/reference-ranges", label: "Range Admin", Icon: RangeIcon },
  { href: "/reports", label: "Reports", Icon: ReportsIcon },
];

const locations = ["Central Unit", "Molecular Bench", "Emergency Desk"];

export function AppShell({ overline, title, action, searchPlaceholder = "Search Portal...", hidePageHeading = false, children }: AppShellProps) {
  const pathname = usePathname();
  const [user, setUser] = useState<AuthUser>(DEFAULT_AUTH_USER);
  const [searchText, setSearchText] = useState("");
  const [showNotifications, setShowNotifications] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [settingsMessage, setSettingsMessage] = useState("");
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const parsed = loadStoredUser();
    if (!parsed) {
      return;
    }

    const normalized =
      parsed.name === "Dr. Alistair Thorne" || parsed.role === "CHIEF PATHOLOGIST"
        ? { ...DEFAULT_AUTH_USER, location: parsed.location || DEFAULT_AUTH_USER.location }
        : parsed;
    setUser(normalized);
    saveStoredUser(normalized);
  }, []);

  useEffect(() => {
    // Load initial notifications
    const loadedNotifications = loadNotifications();
    setNotifications(loadedNotifications);
    setUnreadCount(getUnreadCount());

    // Listen for real-time notification updates
    const handleNotificationAdded = (event: Event) => {
      const customEvent = event as CustomEvent;
      const newNotification = customEvent.detail as Notification;
      setNotifications((prev) => [newNotification, ...prev]);
      setUnreadCount((prev) => prev + 1);
    };

    window.addEventListener("notification-added", handleNotificationAdded);
    return () => window.removeEventListener("notification-added", handleNotificationAdded);
  }, []);

  useEffect(() => {
    // Also sync when storage changes (from other tabs)
    const handleStorageChange = () => {
      const loadedNotifications = loadNotifications();
      setNotifications(loadedNotifications);
      setUnreadCount(getUnreadCount());
    };

    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowNotifications(false);
        setShowSettings(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const initials = useMemo(() => {
    return user.name
      .split(" ")
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
  }, [user.name]);

  function formatNotificationTime(timestamp: string): string {
    const now = new Date();
    const notifTime = new Date(timestamp);
    const diffMs = now.getTime() - notifTime.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins} min ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? "s" : ""} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? "s" : ""} ago`;
    return notifTime.toLocaleDateString();
  }

  function getNotificationTypeClass(type: string): string {
    return `notif-${type}`;
  }

  function updateLocation(nextLocation: string) {
    const nextUser = { ...user, location: nextLocation };
    setUser(nextUser);
    saveStoredUser(nextUser);
  }

  function handleNotificationPanelOpen() {
    setShowNotifications(!showNotifications);
    if (!showNotifications && unreadCount > 0) {
      markAllNotificationsAsRead();
      setUnreadCount(0);
    }
  }

  return (
    <main className="dashboard-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <Image
            src="/d0f96db7-1.png"
            alt="TD ai"
            className="brand-logo"
            width={726}
            height={240}
            priority
          />
        </div>

        <div className="sidebar-nav-wrap">
          <ul className="nav-list">
            {navItems.map(({ href, label, Icon }) => {
              const active = pathname === href;
              return (
                <li key={label}>
                  <Link className={`nav-item${active ? " active" : ""}`} href={href}>
                    <span className="nav-icon-wrap"><Icon className="nav-icon-svg" /></span>
                    <span>{label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </aside>

      <section className="main-panel">
        <div className="topbar">
          <label className="search-box search-input-shell">
            <SearchIcon className="search-leading-icon" />
            <input
              className="search-input"
              placeholder={searchPlaceholder}
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
            />
          </label>

          <div className="topbar-right">
            <label className="location-picker">
              <LocationIcon className="location-icon" />
              <select className="location-select" value={user.location} onChange={(event) => updateLocation(event.target.value)}>
                {locations.map((location) => (
                  <option value={location} key={location}>{location}</option>
                ))}
              </select>
            </label>
            <div className="divider" />
            <div className="topbar-actions" ref={dropdownRef}>
              <div className="icon-button-wrapper">
                <button 
                  className="icon-button notif-button" 
                  type="button" 
                  aria-label="Notifications" 
                  onClick={handleNotificationPanelOpen}
                >
                  <BellIcon className="topbar-icon" />
                  {unreadCount > 0 && <span className="notif-badge">{unreadCount > 9 ? "9+" : unreadCount}</span>}
                </button>
                {showNotifications && (
                  <div className="dropdown-panel notifications-panel">
                    <div className="dropdown-title">Notifications ({notifications.length})</div>
                    {notifications.length === 0 ? (
                      <div className="notification-item empty">
                        <p>No notifications yet</p>
                      </div>
                    ) : (
                      notifications.map((notif) => (
                        <button
                          key={notif.id}
                          type="button"
                          className={`notification-item ${getNotificationTypeClass(notif.type)} ${notif.invoiceNumber ? 'clickable' : ''}`}
                          onClick={() => {
                            if (notif.invoiceNumber) {
                              window.dispatchEvent(
                                new CustomEvent('scroll-to-invoice', { detail: { invoiceNumber: notif.invoiceNumber } })
                              );
                            }
                          }}
                        >
                          <div className="notif-content">
                            <p className="notif-message">{notif.message}</p>
                          </div>
                          <span className="notif-time">{formatNotificationTime(notif.timestamp)}</span>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            <div className="icon-button-wrapper">
              <button className="icon-button" type="button" aria-label="Settings" onClick={() => setShowSettings(!showSettings)}>
                <SettingsIcon className="topbar-icon" />
              </button>
	              {showSettings && (
	                <div className="dropdown-panel settings-panel">
	                  <div className="dropdown-title">Settings</div>
	                  <button className="settings-item" type="button" onClick={() => { clearSession(); window.location.href = "/"; }}>
	                    <span>Logout</span>
	                  </button>
	                  <button className="settings-item is-disabled" type="button" onClick={() => setSettingsMessage("Profile settings will be enabled in a future release.")}>
	                    <span>Profile Settings</span>
	                  </button>
	                  <button className="settings-item is-disabled" type="button" onClick={() => setSettingsMessage("System settings are not available in this demo build yet.")}>
	                    <span>System Settings</span>
	                  </button>
	                  <button className="settings-item is-disabled" type="button" onClick={() => setSettingsMessage("Help and support actions will be connected in the next iteration.")}>
	                    <span>Help & Support</span>
	                  </button>
                    {settingsMessage ? <div className="settings-note">{settingsMessage}</div> : null}
	                </div>
	              )}              </div>            </div>
            <div className="profile-block">
              <div className="profile-meta">
                <div className="profile-name">{user.name}</div>
                <div className="profile-role">{user.role}</div>
              </div>
              <div className="avatar">{initials}</div>
            </div>
          </div>
        </div>

        <div className="dashboard-content">
          {hidePageHeading ? null : (
            <>
              <div className="overline">{overline}</div>
              <div className="page-heading-row">
                <h1 className="page-title">{title}</h1>
                {action}
              </div>
            </>
          )}
          <ErrorBoundary>
            {children}
          </ErrorBoundary>
        </div>
      </section>

      <ChatBot />
    </main>
  );
}




