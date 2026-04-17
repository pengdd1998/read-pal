/**
 * Google OAuth2 Routes
 *
 * Dependency-free Google OAuth2 flow using native fetch.
 * No passport.js needed.
 *
 * Flow: Redirect → Google auth → callback → exchange code → JWT
 *
 * Required env vars:
 *   GOOGLE_CLIENT_ID
 *   GOOGLE_CLIENT_SECRET
 *   GOOGLE_REDIRECT_URI  (e.g. http://localhost:3001/api/auth/google/callback)
 *   FRONTEND_URL          (e.g. http://localhost:3000)
 */

import { Router } from 'express';
import { User } from '../models';
import { generateToken } from '../utils/auth';
import { rateLimiter } from '../middleware/rateLimiter';

const router: Router = Router();

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo';

function getConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${process.env.API_URL || 'http://localhost:3001'}/api/auth/google/callback`;
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

  if (!clientId || !clientSecret) {
    return null;
  }

  return { clientId, clientSecret, redirectUri, frontendUrl };
}

/**
 * GET /api/auth/google
 * Initiate Google OAuth2 flow — redirects user to Google consent screen.
 */
router.get('/', rateLimiter({ windowMs: 60000, max: 20 }), (req, res) => {
  const config = getConfig();
  if (!config) {
    return res.status(500).json({
      success: false,
      error: { code: 'OAUTH_NOT_CONFIGURED', message: 'Google OAuth is not configured' },
    });
  }

  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    access_type: 'offline',
    prompt: 'consent',
  });

  // Store a state parameter to prevent CSRF
  const state = crypto.randomUUID();
  res.cookie('oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600_000, // 10 minutes
  });

  res.redirect(`${GOOGLE_AUTH_URL}?${params.toString()}&state=${state}`);
});

/**
 * GET /api/auth/google/callback
 * Google OAuth2 callback — exchanges code for tokens, creates/finds user, issues JWT.
 */
router.get('/callback', rateLimiter({ windowMs: 60000, max: 20 }), async (req, res) => {
  const config = getConfig();
  if (!config) {
    return redirectWithError(res, 'OAuth not configured');
  }

  const { code, state } = req.query;
  const savedState = req.cookies?.oauth_state;

  // Clear state cookie
  res.clearCookie('oauth_state', { httpOnly: true, sameSite: 'lax' });

  // Validate state to prevent CSRF
  if (!state || state !== savedState) {
    return redirectWithError(res, 'Invalid OAuth state', config.frontendUrl);
  }

  if (!code || typeof code !== 'string') {
    return redirectWithError(res, 'No authorization code received', config.frontendUrl);
  }

  try {
    // Exchange code for tokens
    const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: config.clientId,
        client_secret: config.clientSecret,
        redirect_uri: config.redirectUri,
        grant_type: 'authorization_code',
      }).toString(),
    });

    if (!tokenResponse.ok) {
      const errorBody = await tokenResponse.text();
      console.error('[google-auth] Token exchange failed:', errorBody);
      return redirectWithError(res, 'Token exchange failed', config.frontendUrl);
    }

    const tokens = await tokenResponse.json() as { access_token: string; id_token?: string };
    const accessToken = tokens.access_token;

    if (!accessToken) {
      return redirectWithError(res, 'No access token received', config.frontendUrl);
    }

    // Get user info from Google
    const userResponse = await fetch(GOOGLE_USERINFO_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!userResponse.ok) {
      console.error('[google-auth] UserInfo fetch failed:', await userResponse.text());
      return redirectWithError(res, 'Failed to get user info', config.frontendUrl);
    }

    const googleUser = await userResponse.json() as {
      id: string;
      email: string;
      verified_email: boolean;
      name: string;
      given_name?: string;
      picture?: string;
    };

    if (!googleUser.email) {
      return redirectWithError(res, 'Google account has no email', config.frontendUrl);
    }

    // Find or create user
    let user = await User.findOne({ where: { googleId: googleUser.id } });

    if (!user) {
      // Check if user exists with this email (link accounts)
      user = await User.findOne({ where: { email: googleUser.email } });

      if (user) {
        // Link Google account to existing user
        user.googleId = googleUser.id;
        if (googleUser.picture && !user.avatar) {
          user.avatar = googleUser.picture;
        }
        await user.save();
      } else {
        // Create new user
        user = await User.create({
          email: googleUser.email,
          name: googleUser.name || googleUser.given_name || googleUser.email.split('@')[0],
          avatar: googleUser.picture || undefined,
          googleId: googleUser.id,
          settings: {
            theme: 'system',
            fontSize: 16,
            fontFamily: 'Inter',
            readingGoal: 2,
            dailyReadingMinutes: 30,
            notificationsEnabled: true,
          },
        });
      }
    } else {
      // Update avatar if changed
      if (googleUser.picture && user.avatar !== googleUser.picture) {
        user.avatar = googleUser.picture;
        await user.save();
      }
    }

    // Generate JWT
    const token = generateToken(user.id);

    // Redirect to frontend with token
    const redirectUrl = new URL('/auth/callback', config.frontendUrl);
    redirectUrl.searchParams.set('token', token);
    redirectUrl.searchParams.set('user', JSON.stringify({
      id: user.id,
      email: user.email,
      name: user.name,
      avatar: user.avatar,
      settings: user.settings,
    }));

    res.redirect(redirectUrl.toString());
  } catch (error) {
    console.error('[google-auth] Callback error:', error);
    redirectWithError(res, 'Authentication failed', config.frontendUrl);
  }
});

/**
 * GET /api/auth/google/status
 * Check if Google OAuth is configured.
 */
router.get('/status', (_req, res) => {
  const config = getConfig();
  res.json({
    success: true,
    data: { configured: !!config },
  });
});

function redirectWithError(res: { redirect: (url: string) => void }, message: string, frontendUrl?: string): void {
  const url = new URL('/auth', frontendUrl || process.env.FRONTEND_URL || 'http://localhost:3000');
  url.searchParams.set('error', message);
  url.searchParams.set('mode', 'login');
  res.redirect(url.toString());
}

export default router;
