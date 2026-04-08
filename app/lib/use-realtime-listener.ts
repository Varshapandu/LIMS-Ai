// Hook for subscribing to real-time dashboard updates

import { useEffect, useCallback, useState } from "react";
import { realtimeEvents, RealtimeEventType } from "./realtime-events";

/**
 * Hook to listen for real-time events and trigger callbacks
 * @param eventTypes - Array of event types to listen for
 * @param callback - Function to call when events occur
 */
export function useRealtimeListener(
  eventTypes: RealtimeEventType[] | "all",
  callback: (eventType: RealtimeEventType, data: Record<string, unknown>) => void
) {
  useEffect(() => {
    if (eventTypes === "all") {
      const unsubscribe = realtimeEvents.subscribe("all", (event) => {
        callback(event.type, event.data);
      });
      return unsubscribe;
    }

    const unsubscribers = eventTypes.map((eventType) =>
      realtimeEvents.subscribe(eventType, (event) => {
        callback(event.type, event.data);
      })
    );

    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [eventTypes, callback]);
}

/**
 * Hook to listen for specific event types and update state
 */
/**
 * Hook to listen for specific event types and update state
 */
export function useRealtimeState<T>(
  initialState: T,
  eventTypes: RealtimeEventType[] | "all",
  updateFn: (state: T, eventType: RealtimeEventType, data: Record<string, unknown>) => T
) {
  const [state, setState] = useState(initialState);

  useRealtimeListener(eventTypes, useCallback((eventType, data) => {
    setState((prev) => updateFn(prev, eventType, data));
  }, [updateFn]));

  return state;
}

export default useRealtimeListener;
