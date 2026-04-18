"""Email service for transactional emails (password reset, etc.).

Uses Python's built-in ``smtplib`` and ``email.mime`` — no external
dependencies.  When SMTP is not configured (dev / beta), emails are
logged to console instead of being sent.
"""

import logging
import smtplib
from email.mime.text import MIMEText

from app.config import get_settings

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


async def send_password_reset_email(email: str, token: str) -> None:
    """Send a password-reset email or log to console if SMTP is not configured.

    Errors are caught and logged so the caller never raises — keeping the
    existing silent-error pattern in the forgot-password handler.
    """
    settings = get_settings()
    reset_url = f'{settings.frontend_url}/reset-password?token={token}'

    # --- No SMTP configured: console fallback ---
    if not settings.smtp_host:
        logger.info(
            'Password reset for %s (no SMTP configured). Reset URL: %s',
            email,
            reset_url,
        )
        return

    # --- SMTP delivery ---
    try:
        from_ = settings.smtp_from or settings.smtp_user or 'noreply@readpal.app'
        subject = 'Reset your read-pal password'

        msg = MIMEText(_build_reset_html(reset_url), 'html')
        msg['Subject'] = subject
        msg['From'] = from_
        msg['To'] = email

        if settings.smtp_port == 465:
            smtp_cls = smtplib.SMTP_SSL
        else:
            smtp_cls = smtplib.SMTP

        with smtp_cls(settings.smtp_host, settings.smtp_port, timeout=10) as server:
            if settings.smtp_port != 465:
                server.ehlo()
                server.starttls()
                server.ehlo()
            if settings.smtp_user and settings.smtp_password:
                server.login(settings.smtp_user, settings.smtp_password)
            server.sendmail(from_, [email], msg.as_string())

        logger.info('Password reset email sent to %s', email)

    except Exception:
        logger.warning(
            'Failed to send password reset email to %s',
            email,
            exc_info=True,
        )
