"""Real-time event system for server-sent events and WebSocket support"""

from __future__ import annotations

import json
from collections.abc import Callable
from datetime import UTC, datetime
from enum import Enum

from pydantic import BaseModel


class RealtimeEventType(str, Enum):
    """Types of real-time events"""
    BILL_CREATED = "bill-created"
    BILL_UPDATED = "bill-updated"
    PAYMENT_RECORDED = "payment-recorded"
    PATIENT_CREATED = "patient-created"
    PATIENT_UPDATED = "patient-updated"
    TEST_CREATED = "test-created"
    TEST_COMPLETED = "test-completed"
    RESULT_RECORDED = "result-recorded"
    RESULT_APPROVED = "result-approved"
    SPECIMEN_PROCESSED = "specimen-processed"
    SPECIMEN_REJECTED = "specimen-rejected"


class RealtimeEvent(BaseModel):
    """Real-time event model"""
    type: RealtimeEventType
    timestamp: datetime
    data: dict


class RealtimeEventManager:
    """Manages real-time events and subscribers"""
    
    def __init__(self):
        self.subscribers: dict[RealtimeEventType | str, set[Callable]] = {}
        self.event_history: list[RealtimeEvent] = []
        self.max_history = 100

    def subscribe(self, event_type: RealtimeEventType | str, callback: Callable) -> Callable:
        """Subscribe to events"""
        if event_type not in self.subscribers:
            self.subscribers[event_type] = set()
        self.subscribers[event_type].add(callback)
        
        # Return unsubscribe function
        def unsubscribe():
            self.subscribers[event_type].discard(callback)
        
        return unsubscribe

    def emit(self, event: RealtimeEvent):
        """Emit event to all subscribers"""
        # Store in history
        self.event_history.append(event)
        if len(self.event_history) > self.max_history:
            self.event_history.pop(0)
        
        # Notify specific event type subscribers
        if event.type in self.subscribers:
            for callback in self.subscribers[event.type]:
                try:
                    callback(event)
                except Exception as e:
                    print(f"Error in event subscriber: {e}")
        
        # Notify "all" subscribers
        if "all" in self.subscribers:
            for callback in self.subscribers["all"]:
                try:
                    callback(event)
                except Exception as e:
                    print(f"Error in event subscriber: {e}")

    def emit_event(self, event_type: RealtimeEventType, data: dict):
        """Create and emit an event"""
        event = RealtimeEvent(
            type=event_type,
            timestamp=datetime.now(UTC),
            data=data
        )
        self.emit(event)

    def to_sse_format(self, event: RealtimeEvent) -> str:
        """Convert event to Server-Sent Events format"""
        return f"data: {json.dumps(event.dict(default=str))}\n\n"


# Global singleton instance
realtime_manager = RealtimeEventManager()


# Helper functions
def emit_bill_event(action: str, bill_data: dict):
    """Emit bill event"""
    if action == "created":
        realtime_manager.emit_event(RealtimeEventType.BILL_CREATED, bill_data)
    elif action == "updated":
        realtime_manager.emit_event(RealtimeEventType.BILL_UPDATED, bill_data)


def emit_payment_event(invoice_number: str, amount: float):
    """Emit payment event"""
    realtime_manager.emit_event(
        RealtimeEventType.PAYMENT_RECORDED,
        {"invoice_number": invoice_number, "amount": amount}
    )


def emit_patient_event(action: str, patient_data: dict):
    """Emit patient event"""
    if action == "created":
        realtime_manager.emit_event(RealtimeEventType.PATIENT_CREATED, patient_data)
    elif action == "updated":
        realtime_manager.emit_event(RealtimeEventType.PATIENT_UPDATED, patient_data)


def emit_test_event(action: str, test_data: dict):
    """Emit test event"""
    if action == "created":
        realtime_manager.emit_event(RealtimeEventType.TEST_CREATED, test_data)
    elif action == "completed":
        realtime_manager.emit_event(RealtimeEventType.TEST_COMPLETED, test_data)


def emit_result_event(action: str, result_data: dict):
    """Emit result event"""
    if action == "recorded":
        realtime_manager.emit_event(RealtimeEventType.RESULT_RECORDED, result_data)
    elif action == "approved":
        realtime_manager.emit_event(RealtimeEventType.RESULT_APPROVED, result_data)


def emit_specimen_event(action: str, specimen_data: dict):
    """Emit specimen event"""
    if action == "processed":
        realtime_manager.emit_event(RealtimeEventType.SPECIMEN_PROCESSED, specimen_data)
    elif action == "rejected":
        realtime_manager.emit_event(RealtimeEventType.SPECIMEN_REJECTED, specimen_data)

