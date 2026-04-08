// Real-time event system for dashboard updates

export type RealtimeEventType = 
  | "bill-created"
  | "bill-updated"
  | "payment-recorded"
  | "patient-created"
  | "patient-updated"
  | "test-created"
  | "test-completed"
  | "result-recorded"
  | "result-approved"
  | "specimen-processed"
  | "specimen-rejected";

export interface RealtimeEvent {
  type: RealtimeEventType;
  timestamp: string;
  data: Record<string, unknown>;
}

class RealtimeEventEmitter {
  private eventTarget = new EventTarget();
  private listeners: Map<RealtimeEventType | "all", Set<(event: RealtimeEvent) => void>> = new Map();

  subscribe(eventType: RealtimeEventType | "all", callback: (event: RealtimeEvent) => void): () => void {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set());
    }
    this.listeners.get(eventType)!.add(callback);

    // Return unsubscribe function
    return () => {
      this.listeners.get(eventType)?.delete(callback);
    };
  }

  emit(event: RealtimeEvent) {
    // Emit to specific event type listeners
    this.listeners.get(event.type)?.forEach(callback => callback(event));
    
    // Emit to "all" listeners
    this.listeners.get("all")?.forEach(callback => callback(event));

    // Also dispatch as custom event for cross-tab communication
    window.dispatchEvent(
      new CustomEvent("realtime-event", { detail: event })
    );
  }

  dispatchEvent(eventType: RealtimeEventType, data: Record<string, unknown>) {
    const event: RealtimeEvent = {
      type: eventType,
      timestamp: new Date().toISOString(),
      data,
    };
    this.emit(event);
  }
}

// Global singleton instance
export const realtimeEvents = new RealtimeEventEmitter();

// Helper functions for common events
export const emitBillEvent = (action: "created" | "updated", billData: Record<string, unknown>) => {
  realtimeEvents.dispatchEvent(`bill-${action}` as RealtimeEventType, billData);
};

export const emitPaymentEvent = (invoiceNumber: string, amount: number) => {
  realtimeEvents.dispatchEvent("payment-recorded", { invoiceNumber, amount });
};

export const emitPatientEvent = (action: "created" | "updated", patientData: Record<string, unknown>) => {
  realtimeEvents.dispatchEvent(`patient-${action}` as RealtimeEventType, patientData);
};

export const emitTestEvent = (action: "created" | "completed", testData: Record<string, unknown>) => {
  realtimeEvents.dispatchEvent(`test-${action}` as RealtimeEventType, testData);
};

export const emitResultEvent = (action: "recorded" | "approved", resultData: Record<string, unknown>) => {
  realtimeEvents.dispatchEvent(`result-${action}` as RealtimeEventType, resultData);
};
