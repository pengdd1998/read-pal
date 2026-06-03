"""Tests for email_service — password reset emails, SMTP, and console fallback."""

from __future__ import annotations

import smtplib
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.email_service import _build_reset_html, send_password_reset_email


# ---------------------------------------------------------------------------
# _build_reset_html
# ---------------------------------------------------------------------------


class TestBuildResetHtml:
    def test_contains_reset_url(self):
        url = 'https://example.com/reset?token=abc123'
        html = _build_reset_html(url)
        assert url in html

    def test_contains_button(self):
        html = _build_reset_html('https://example.com/reset')
        assert 'Reset password' in html

    def test_contains_expiry_notice(self):
        html = _build_reset_html('https://example.com/reset')
        assert '1 hour' in html

    def test_is_valid_html(self):
        html = _build_reset_html('https://example.com/reset')
        assert '<html>' in html
        assert '</html>' in html


# ---------------------------------------------------------------------------
# send_password_reset_email — console fallback (no SMTP)
# ---------------------------------------------------------------------------


class TestSendPasswordResetEmailNoSmtp:
    @pytest.mark.asyncio
    async def test_console_fallback_when_no_smtp_host(self):
        mock_settings = MagicMock()
        mock_settings.smtp_host = None
        mock_settings.frontend_url = 'https://readpal.app'

        with patch('app.services.email_service.get_settings', return_value=mock_settings):
            # Should not raise
            await send_password_reset_email('user@example.com', 'token123')

    @pytest.mark.asyncio
    async def test_console_fallback_logs_url(self):
        mock_settings = MagicMock()
        mock_settings.smtp_host = None
        mock_settings.frontend_url = 'https://readpal.app'

        with (
            patch('app.services.email_service.get_settings', return_value=mock_settings),
            patch('app.services.email_service.logger') as mock_logger,
        ):
            await send_password_reset_email('user@example.com', 'tok')

            mock_logger.info.assert_called_once()
            # logger.info('msg %s ... %s', email, reset_url)
            call_args = mock_logger.info.call_args
            all_args = call_args[0]
            # Email is first positional after format string
            assert 'user@example.com' in all_args
            # Token appears in the reset URL arg
            assert any('tok' in str(a) for a in all_args)


# ---------------------------------------------------------------------------
# send_password_reset_email — SMTP delivery
# ---------------------------------------------------------------------------


class TestSendPasswordResetEmailSmtp:
    @pytest.mark.asyncio
    async def test_sends_via_smtp_with_starttls(self):
        mock_settings = MagicMock()
        mock_settings.smtp_host = 'smtp.example.com'
        mock_settings.smtp_port = 587
        mock_settings.smtp_user = 'user'
        mock_settings.smtp_password = 'pass'
        mock_settings.smtp_from = 'noreply@readpal.app'
        mock_settings.frontend_url = 'https://readpal.app'

        mock_smtp = MagicMock()
        mock_smtp.__enter__ = MagicMock(return_value=mock_smtp)
        mock_smtp.__exit__ = MagicMock(return_value=False)

        with (
            patch('app.services.email_service.get_settings', return_value=mock_settings),
            patch('app.services.email_service.smtplib.SMTP', return_value=mock_smtp),
        ):
            await send_password_reset_email('user@example.com', 'token456')

            mock_smtp.ehlo.assert_called()
            mock_smtp.starttls.assert_called_once()
            mock_smtp.login.assert_called_once_with('user', 'pass')
            mock_smtp.sendmail.assert_called_once()

    @pytest.mark.asyncio
    async def test_sends_via_smtp_ssl_on_port_465(self):
        mock_settings = MagicMock()
        mock_settings.smtp_host = 'smtp.example.com'
        mock_settings.smtp_port = 465
        mock_settings.smtp_user = 'user'
        mock_settings.smtp_password = 'pass'
        mock_settings.smtp_from = 'noreply@readpal.app'
        mock_settings.frontend_url = 'https://readpal.app'

        mock_smtp = MagicMock()
        mock_smtp.__enter__ = MagicMock(return_value=mock_smtp)
        mock_smtp.__exit__ = MagicMock(return_value=False)

        with (
            patch('app.services.email_service.get_settings', return_value=mock_settings),
            patch('app.services.email_service.smtplib.SMTP_SSL', return_value=mock_smtp),
        ):
            await send_password_reset_email('user@example.com', 'token789')

            # Should NOT call starttls for port 465
            mock_smtp.starttls.assert_not_called()
            mock_smtp.sendmail.assert_called_once()

    @pytest.mark.asyncio
    async def test_uses_smtp_user_as_fallback_from(self):
        mock_settings = MagicMock()
        mock_settings.smtp_host = 'smtp.example.com'
        mock_settings.smtp_port = 587
        mock_settings.smtp_user = 'me@smtp.com'
        mock_settings.smtp_password = 'pass'
        mock_settings.smtp_from = None  # No explicit from
        mock_settings.frontend_url = 'https://readpal.app'

        mock_smtp = MagicMock()
        mock_smtp.__enter__ = MagicMock(return_value=mock_smtp)
        mock_smtp.__exit__ = MagicMock(return_value=False)

        with (
            patch('app.services.email_service.get_settings', return_value=mock_settings),
            patch('app.services.email_service.smtplib.SMTP', return_value=mock_smtp),
        ):
            await send_password_reset_email('user@example.com', 'tok')

            sendmail_call = mock_smtp.sendmail.call_args
            from_addr = sendmail_call[0][0]
            assert from_addr == 'me@smtp.com'

    @pytest.mark.asyncio
    async def test_skips_login_when_no_credentials(self):
        mock_settings = MagicMock()
        mock_settings.smtp_host = 'smtp.example.com'
        mock_settings.smtp_port = 587
        mock_settings.smtp_user = None
        mock_settings.smtp_password = None
        mock_settings.smtp_from = 'noreply@readpal.app'
        mock_settings.frontend_url = 'https://readpal.app'

        mock_smtp = MagicMock()
        mock_smtp.__enter__ = MagicMock(return_value=mock_smtp)
        mock_smtp.__exit__ = MagicMock(return_value=False)

        with (
            patch('app.services.email_service.get_settings', return_value=mock_settings),
            patch('app.services.email_service.smtplib.SMTP', return_value=mock_smtp),
        ):
            await send_password_reset_email('user@example.com', 'tok')

            mock_smtp.login.assert_not_called()
            mock_smtp.sendmail.assert_called_once()


# ---------------------------------------------------------------------------
# send_password_reset_email — error handling
# ---------------------------------------------------------------------------


class TestSendPasswordResetEmailErrors:
    @pytest.mark.asyncio
    async def test_smtp_failure_is_caught(self):
        mock_settings = MagicMock()
        mock_settings.smtp_host = 'smtp.example.com'
        mock_settings.smtp_port = 587
        mock_settings.smtp_user = 'user'
        mock_settings.smtp_password = 'pass'
        mock_settings.smtp_from = 'noreply@readpal.app'
        mock_settings.frontend_url = 'https://readpal.app'

        mock_smtp = MagicMock()
        mock_smtp.__enter__ = MagicMock(return_value=mock_smtp)
        mock_smtp.__exit__ = MagicMock(return_value=False)
        mock_smtp.sendmail.side_effect = smtplib.SMTPException('Connection refused')

        with (
            patch('app.services.email_service.get_settings', return_value=mock_settings),
            patch('app.services.email_service.smtplib.SMTP', return_value=mock_smtp),
            patch('app.services.email_service.logger') as mock_logger,
        ):
            # Should NOT raise
            await send_password_reset_email('user@example.com', 'tok')

            mock_logger.error.assert_called_once()

    @pytest.mark.asyncio
    async def test_timeout_error_is_caught(self):
        mock_settings = MagicMock()
        mock_settings.smtp_host = 'smtp.example.com'
        mock_settings.smtp_port = 587
        mock_settings.smtp_user = 'user'
        mock_settings.smtp_password = 'pass'
        mock_settings.smtp_from = 'noreply@readpal.app'
        mock_settings.frontend_url = 'https://readpal.app'

        with (
            patch('app.services.email_service.get_settings', return_value=mock_settings),
            patch(
                'app.services.email_service.smtplib.SMTP',
                side_effect=TimeoutError('Connection timed out'),
            ),
            patch('app.services.email_service.logger') as mock_logger,
        ):
            await send_password_reset_email('user@example.com', 'tok')

            mock_logger.error.assert_called_once()

    @pytest.mark.asyncio
    async def test_constructs_correct_reset_url(self):
        mock_settings = MagicMock()
        mock_settings.smtp_host = None
        mock_settings.frontend_url = 'https://myapp.com'

        with (
            patch('app.services.email_service.get_settings', return_value=mock_settings),
            patch('app.services.email_service.logger') as mock_logger,
        ):
            await send_password_reset_email('u@e.com', 'mytoken')

            log_args = mock_logger.info.call_args
            # The reset URL should be in the log message
            assert 'mytoken' in str(log_args)
