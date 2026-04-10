"""Razorpay payment gateway integration service.

Handles order creation and payment signature verification using the
Razorpay Python SDK in test mode.
"""

from __future__ import annotations

import hashlib
import hmac
import logging
from decimal import Decimal

import razorpay

from app.core.config import settings

logger = logging.getLogger(__name__)

# Lazily initialised Razorpay client — None when keys are not configured.
_client: razorpay.Client | None = None


def _get_client() -> razorpay.Client:
    """Return a singleton Razorpay client, creating it on first call."""
    global _client  # noqa: PLW0603
    if _client is None:
        if not settings.razorpay_key_id or not settings.razorpay_key_secret:
            raise RuntimeError(
                "Razorpay is not configured. "
                "Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in your .env file."
            )
        _client = razorpay.Client(auth=(settings.razorpay_key_id, settings.razorpay_key_secret))
    return _client


class RazorpayService:
    """Thin wrapper around the Razorpay SDK for the LIMS billing flow."""

    @staticmethod
    def create_order(
        amount: Decimal,
        invoice_number: str,
        currency: str = "INR",
    ) -> dict:
        """Create a Razorpay order.

        Args:
            amount: Payment amount in **rupees** (will be converted to paise).
            invoice_number: LIMS invoice number used as receipt reference.
            currency: ISO currency code (default ``INR``).

        Returns:
            The full Razorpay order dict including ``id``, ``amount``,
            ``currency``, ``receipt``, and ``status``.
        """
        client = _get_client()
        amount_paise = int(amount * 100)

        order_data = {
            "amount": amount_paise,
            "currency": currency,
            "receipt": invoice_number,
            "payment_capture": 1,  # auto-capture on successful payment
        }

        logger.info("Creating Razorpay order for %s — %s paise", invoice_number, amount_paise)
        order = client.order.create(data=order_data)
        logger.info("Razorpay order created: %s", order.get("id"))
        return order

    @staticmethod
    def verify_payment_signature(
        razorpay_order_id: str,
        razorpay_payment_id: str,
        razorpay_signature: str,
    ) -> bool:
        """Verify the payment signature returned by Razorpay Checkout.

        Uses HMAC-SHA256 with the key secret to validate authenticity.
        Returns ``True`` when the signature is valid.
        """
        try:
            message = f"{razorpay_order_id}|{razorpay_payment_id}"
            expected_signature = hmac.new(
                settings.razorpay_key_secret.encode("utf-8"),
                message.encode("utf-8"),
                hashlib.sha256,
            ).hexdigest()
            return hmac.compare_digest(expected_signature, razorpay_signature)
        except Exception:
            logger.exception("Razorpay signature verification failed")
            return False

    @staticmethod
    def is_configured() -> bool:
        """Return True when Razorpay credentials are present in settings."""
        return bool(settings.razorpay_key_id and settings.razorpay_key_secret)
