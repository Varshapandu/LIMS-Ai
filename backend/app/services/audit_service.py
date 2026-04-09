"""Utility for writing audit log entries.

Provides a simple ``log_audit`` function that services can call after
any significant state mutation (approve, create, delete, etc.).
"""

from __future__ import annotations

from uuid import uuid4

from sqlalchemy.orm import Session

from app.models.models import AuditLog


def log_audit(
    db: Session,
    *,
    entity_type: str,
    entity_id: str,
    action: str,
    field_name: str | None = None,
    old_value: str | None = None,
    new_value: str | None = None,
    actor_id: str | None = None,
    actor_name: str | None = None,
) -> None:
    """Append an audit log entry.  Does NOT commit — the caller is
    expected to commit as part of its existing transaction."""
    db.add(
        AuditLog(
            id=str(uuid4()),
            entity_type=entity_type,
            entity_id=entity_id,
            action=action,
            field_name=field_name,
            old_value=old_value,
            new_value=new_value,
            actor_id=actor_id,
            actor_name=actor_name,
        )
    )
