from __future__ import annotations

import smtplib
from dataclasses import dataclass
from email.message import EmailMessage
from html import escape

from app.core.config import settings


@dataclass(slots=True)
class MailDeliveryResult:
    sent: bool
    delivered_to: str | None = None
    error: str | None = None


class MailService:
    @staticmethod
    def send_report_email(
        *,
        to_email: str | None,
        patient_name: str,
        visit_number: str,
        report_number: str,
        approved_at_label: str,
        doctor_note: str | None,
        analytes: list[dict[str, str]],
        pdf_bytes: bytes | None = None,
        pdf_filename: str | None = None,
    ) -> MailDeliveryResult:
        if not to_email:
            return MailDeliveryResult(sent=False, error="Patient email is not available.")

        if not settings.smtp_host or not settings.smtp_from_email:
            return MailDeliveryResult(
                sent=False,
                delivered_to=to_email,
                error="SMTP is not configured. Set SMTP_HOST and SMTP_FROM_EMAIL to enable report emails.",
            )

        message = EmailMessage()
        message["Subject"] = f"Your lab report is ready - {report_number}"
        message["From"] = (
            f"{settings.smtp_from_name} <{settings.smtp_from_email}>"
            if settings.smtp_from_name
            else settings.smtp_from_email
        )
        message["To"] = to_email

        text_lines = [
            f"Dear {patient_name},",
            "",
            "Your laboratory report is now available.",
            f"Visit Number: {visit_number}",
            f"Report Number: {report_number}",
            f"Approved At: {approved_at_label}",
            "",
            "Result Summary:",
        ]
        for analyte in analytes:
            text_lines.append(
                f"- {analyte['test_name']}: {analyte['result_value']} | Ref: {analyte['reference_range']}"
            )
        if doctor_note:
            text_lines.extend(["", "Doctor Note:", doctor_note])
        if pdf_filename:
            text_lines.extend(["", f"Attached Report: {pdf_filename}"])
        text_lines.extend(["", "Thank you,", settings.smtp_from_name or "AI LIMS"])
        message.set_content("\n".join(text_lines))

        rows = "".join(
            f"<tr><td>{escape(item['test_name'])}</td><td>{escape(item['result_value'])}</td><td>{escape(item['reference_range'])}</td></tr>"
            for item in analytes
        )
        doctor_note_html = (
            f"<p><strong>Doctor Note:</strong> {escape(doctor_note)}</p>" if doctor_note else ""
        )
        message.add_alternative(
            f"""
            <html>
              <body style="font-family: Arial, sans-serif; color: #0f172a;">
                <p>Dear {escape(patient_name)},</p>
                <p>Your laboratory report is now available.</p>
                <p>
                  <strong>Visit Number:</strong> {escape(visit_number)}<br />
                  <strong>Report Number:</strong> {escape(report_number)}<br />
                  <strong>Approved At:</strong> {escape(approved_at_label)}
                </p>
                <table style="border-collapse: collapse; width: 100%; margin-top: 12px;">
                  <thead>
                    <tr>
                      <th style="border: 1px solid #cbd5e1; padding: 8px; text-align: left;">Test</th>
                      <th style="border: 1px solid #cbd5e1; padding: 8px; text-align: left;">Result</th>
                      <th style="border: 1px solid #cbd5e1; padding: 8px; text-align: left;">Reference Range</th>
                    </tr>
                  </thead>
                  <tbody>{rows}</tbody>
                </table>
                {doctor_note_html}
                <p style="margin-top: 16px;">Thank you,<br />{escape(settings.smtp_from_name or 'AI LIMS')}</p>
              </body>
            </html>
            """,
            subtype="html",
        )
        if pdf_bytes and pdf_filename:
            message.add_attachment(
                pdf_bytes,
                maintype="application",
                subtype="pdf",
                filename=pdf_filename,
            )

        try:
            if settings.smtp_use_ssl:
                with smtplib.SMTP_SSL(settings.smtp_host, settings.smtp_port, timeout=20) as smtp:
                    MailService._deliver(smtp, message)
            else:
                with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=20) as smtp:
                    if settings.smtp_use_tls:
                        smtp.starttls()
                    MailService._deliver(smtp, message)
        except Exception as exc:
            return MailDeliveryResult(sent=False, delivered_to=to_email, error=str(exc))

        return MailDeliveryResult(sent=True, delivered_to=to_email)

    @staticmethod
    def _deliver(smtp: smtplib.SMTP, message: EmailMessage) -> None:
        if settings.smtp_username and settings.smtp_password:
            smtp.login(settings.smtp_username, settings.smtp_password)
        smtp.send_message(message)
