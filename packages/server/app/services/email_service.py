"""Email service for transactional emails (password reset, etc.).

Uses Python's built-in ``smtplib`` and ``email.mime`` — no external
dependencies.  When SMTP is not configured (dev / beta), emails are
logged to console instead of being sent.
"""

import logging
import http.client
import smtplib
import urllib.request
from email.mime.text import MIMEText

from app.config import get_settings
from app.utils.limits import SMTP_TIMEOUT_SECONDS

logger = logging.getLogger('read-pal.email')


def _build_reset_html(reset_url: str) -> str:
    """Return a minimal HTML body for the password-reset email."""
    return f"""\
<html>
<body style="font-family:Arial,sans-serif;color:#333;max-width:600px;margin:0 auto;padding:20px;">
  <h2 style="color:#1a1a1a;">Reset your password</h2>
  <p>We received a request to reset your read-pal password.</p>
  <p>
    <a href="{reset_url}"
       style="display:inline-block;padding:12px 24px;background:#4f46e5;color:#fff;
              text-decoration:none;border-radius:6px;font-weight:600;">
      Reset password
    </a>
  </p>
  <p style="color:#666;font-size:14px;">
    If the button above doesn't work, copy and paste this link into your browser:<br>
    <a href="{reset_url}">{reset_url}</a>
  </p>
  <hr style="border:none;border-top:1px solid #eee;margin:24px 0;">
  <p style="color:#999;font-size:12px;">
    If you didn't request a password reset, you can safely ignore this email.
    This link expires in 1 hour.
  </p>
</body>
</html>"""


def _send_via_smtp(
    settings: object,
    from_addr: str,
    to_addr: str,
    subject: str,
    html_body: str,
) -> None:
    """Deliver *html_body* to *to_addr* via SMTP using *settings*."""
    msg = MIMEText(html_body, 'html')
    msg['Subject'] = subject
    msg['From'] = from_addr
    msg['To'] = to_addr

    smtp_cls = smtplib.SMTP_SSL if settings.smtp_port == 465 else smtplib.SMTP
    with smtp_cls(settings.smtp_host, settings.smtp_port, timeout=SMTP_TIMEOUT_SECONDS) as server:
        if settings.smtp_port != 465:
            server.ehlo()
            server.starttls()
            server.ehlo()
        if settings.smtp_user and settings.smtp_password:
            server.login(settings.smtp_user, settings.smtp_password)
        server.sendmail(from_addr, [to_addr], msg.as_string())


def _send_via_resend(settings, from_addr: str, to_addr: str, subject: str, html: str) -> None:
    """Deliver via the Resend HTTP API (monitoring plan C1).

    Stdlib-only by module convention (urllib, not an HTTP client dep).
    A non-2xx response raises URLError/HTTPError into the caller's
    existing catch-and-log — the reset flow never raises to the user.
    """
    import json as _json

    payload = _json.dumps({
        'from': from_addr,
        'to': [to_addr],
        'subject': subject,
        'html': html,
    }).encode()
    req = urllib.request.Request(
        'https://api.resend.com/emails',
        data=payload,
        headers={
            'Authorization': f'Bearer {settings.resend_api_key}',
            'Content-Type': 'application/json',
        },
        method='POST',
    )
    with urllib.request.urlopen(req, timeout=SMTP_TIMEOUT_SECONDS) as resp:
        if resp.status >= 300:
            raise OSError(f'Resend returned {resp.status}')


async def send_password_reset_email(email: str, token: str) -> None:
    """Send a password-reset email — Resend API → SMTP → console fallback.

    Errors are caught and logged so the caller never raises — keeping the
    existing silent-error pattern in the forgot-password handler.
    """
    settings = get_settings()
    reset_url = f'{settings.frontend_url}/reset-password?token={token}'

    if not (settings.resend_api_key or settings.smtp_host):
        logger.info(
            'Password reset for %s (no mail transport configured). Reset URL: %s',
            email,
            reset_url,
        )
        return

    try:
        from_ = (
            settings.resend_from
            or settings.smtp_from
            or settings.smtp_user
            or 'noreply@readpal.app'
        )
        # risk-review 09-21: both transports are synchronous (smtplib /
        # urllib) and would block the event loop up to SMTP_TIMEOUT_SECONDS
        # (10s) per send — offload to a worker thread.
        import asyncio as _asyncio

        await _asyncio.to_thread(
            _send_via_resend if settings.resend_api_key else _send_via_smtp,
            settings, from_, email,
            'Reset your read-pal password', _build_reset_html(reset_url),
        )
        logger.info('Password reset email sent to %s', email)
    except (
        smtplib.SMTPException, TimeoutError, ConnectionError, OSError,
        http.client.HTTPException,  # risk-review 09-21: BadStatusLine/
        # IncompleteRead escape urllib's URLError(OSError) wrapping and
        # surfaced as a 500 — on the "email exists" branch only, a rare
        # account-enumeration oracle.
        ValueError,  # malformed payload serialization
    ):
        logger.warning(
            'Mail delivery failed for password reset email to %s — '
            'user will not receive the reset link',
            email,
            exc_info=True,
        )
