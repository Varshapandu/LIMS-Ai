import { safeParseJson } from "./storage-json";

// Notification types
export interface Notification {
  id: string;
  type: "warning" | "success" | "error" | "info";
  message: string;
  timestamp: string;
  read: boolean;
  actionUrl?: string;
  invoiceNumber?: string;
}

export interface NotificationStorage {
  notifications: Notification[];
  lastUpdated: string;
}

const NOTIFICATIONS_KEY = "ai-lims-notifications";

/**
 * Load all notifications from localStorage
 */
export function loadNotifications(): Notification[] {
  try {
    if (typeof window === "undefined") return [];
    const stored = localStorage.getItem(NOTIFICATIONS_KEY);
    if (!stored) return [];
    const data = safeParseJson<NotificationStorage | null>(stored, null);
    if (!data) {
      localStorage.removeItem(NOTIFICATIONS_KEY);
      return [];
    }
    return data.notifications || [];
  } catch (error) {
    console.error("Error loading notifications:", error);
    return [];
  }
}

/**
 * Add a new notification to storage
 */
export function addNotification(
  message: string,
  type: "warning" | "success" | "error" | "info" = "info",
  actionUrl?: string,
  invoiceNumber?: string
): Notification {
  const notification: Notification = {
    id: `notif-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    type,
    message,
    timestamp: new Date().toISOString(),
    read: false,
    actionUrl,
    invoiceNumber,
  };

  try {
    if (typeof window === "undefined") return notification;
    const notifications = loadNotifications();
    notifications.unshift(notification); // Add to beginning for latest first
    const storage: NotificationStorage = {
      notifications: notifications.slice(0, 50), // Keep last 50 notifications
      lastUpdated: new Date().toISOString(),
    };
    localStorage.setItem(NOTIFICATIONS_KEY, JSON.stringify(storage));

    // Trigger storage event for real-time updates across tabs
    window.dispatchEvent(
      new CustomEvent("notification-added", { detail: notification })
    );
  } catch (error) {
    console.error("Error saving notification:", error);
  }

  return notification;
}

/**
 * Mark a notification as read
 */
export function markNotificationAsRead(notificationId: string): void {
  try {
    if (typeof window === "undefined") return;
    const notifications = loadNotifications();
    const notification = notifications.find((n) => n.id === notificationId);
    if (notification) {
      notification.read = true;
      const storage: NotificationStorage = {
        notifications,
        lastUpdated: new Date().toISOString(),
      };
      localStorage.setItem(NOTIFICATIONS_KEY, JSON.stringify(storage));
    }
  } catch (error) {
    console.error("Error marking notification as read:", error);
  }
}

/**
 * Mark all notifications as read
 */
export function markAllNotificationsAsRead(): void {
  try {
    if (typeof window === "undefined") return;
    const notifications = loadNotifications();
    notifications.forEach((n) => (n.read = true));
    const storage: NotificationStorage = {
      notifications,
      lastUpdated: new Date().toISOString(),
    };
    localStorage.setItem(NOTIFICATIONS_KEY, JSON.stringify(storage));
  } catch (error) {
    console.error("Error marking all notifications as read:", error);
  }
}

/**
 * Clear all notifications
 */
export function clearAllNotifications(): void {
  try {
    if (typeof window === "undefined") return;
    localStorage.removeItem(NOTIFICATIONS_KEY);
  } catch (error) {
    console.error("Error clearing notifications:", error);
  }
}

/**
 * Get count of unread notifications
 */
export function getUnreadCount(): number {
  const notifications = loadNotifications();
  return notifications.filter((n) => !n.read).length;
}
