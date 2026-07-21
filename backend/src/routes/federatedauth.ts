import type { Request, Response } from 'express';
import { Router } from 'express';
import { z } from 'zod';
import { authLimiter } from '../middleware/rate-limit.js';
import { validate } from '../utils/validate.js';
import { UnauthorizedError } from '../utils/errors.js';
import { FEDERATED_AUTH_COOKIE, FEDERATED_AUTH_INTENT } from '../constants/federatedauth.js';
import {
  federatedAuthCallbackSchema,
  federatedAuthRegistrationSchema,
  federatedAuthStartSchema,
  federatedAuthVerificationSchema,
} from '../schemas/federatedauth.js';
import * as federatedAuthService from '../services/federatedauth.service.js';
import * as registrationEmailVerificationService from '../services/registration-email-verification.service.js';
import * as turnstileConfigService from '../services/turnstile-config.service.js';
import * as setupService from '../services/setup.service.js';
import { parseCookies, setRefreshCookie } from '../utils/auth-cookies.js';
import {
  clearFederatedAuthFlowCookie,
  clearFederatedAuthRegistrationCookie,
  setFederatedAuthFlowCookie,
  setFederatedAuthRegistrationCookie,
} from '../utils/federatedauth-cookies.js';

const router = Router();
const slugParamsSchema = z.object({ slug: z.string().min(1) });

function registrationToken(req: Request): string {
  const token = parseCookies(req.headers.cookie)[FEDERATED_AUTH_COOKIE.REGISTRATION];
  if (!token) throw new UnauthorizedError('缺少外部登录注册会话');
  return token;
}

function requestUrl(req: Request): URL {
  const host = req.get('x-forwarded-host')?.split(',')[0]?.trim() ?? req.get('host') ?? 'localhost';
  const protocol = req.get('x-forwarded-proto')?.split(',')[0]?.trim() ?? req.protocol;
  return new URL(req.originalUrl, `${protocol}://${host}`);
}

router.post('/:slug/start', authLimiter, async (req: Request, res: Response) => {
  const { slug } = validate(slugParamsSchema, req.params);
  const data = validate(federatedAuthStartSchema, req.body);
  const result = await federatedAuthService.startFederatedAuth({
    slug,
    intent: FEDERATED_AUTH_INTENT.LOGIN,
    returnTo: data.returnTo,
  });
  setFederatedAuthFlowCookie(res, result.browser);
  res.json({ authorizationUrl: result.authorizationUrl });
});

router.get('/:slug/callback', authLimiter, async (req: Request, res: Response) => {
  const { slug } = validate(slugParamsSchema, req.params);
  const query = validate(federatedAuthCallbackSchema, req.query);
  const browser = parseCookies(req.headers.cookie)[FEDERATED_AUTH_COOKIE.FLOW];
  try {
    if (!query.state || !browser) throw new UnauthorizedError('外部登录回调状态无效');
    const result = await federatedAuthService.finishFederatedAuth({
      slug,
      state: query.state,
      browser,
      currentUrl: requestUrl(req),
    });
    clearFederatedAuthFlowCookie(res);
    if (result.kind === 'login') setRefreshCookie(res, result.tokens.refreshToken);
    if (result.kind === 'registration') {
      setFederatedAuthRegistrationCookie(res, result.token);
    }
    res.redirect(303, result.location);
  } catch {
    clearFederatedAuthFlowCookie(res);
    const config = await setupService.getSiteConfig();
    const fallback = config.siteUrl
      ? new URL('/login', config.siteUrl)
      : new URL('/login', requestUrl(req));
    fallback.searchParams.set('federatedauth', 'failed');
    res.redirect(303, fallback.href);
  }
});

router.get('/registration/session', authLimiter, async (req: Request, res: Response) => {
  res.json(await federatedAuthService.getFederatedAuthRegistration(registrationToken(req)));
});

router.post('/registration/verification-code', authLimiter, async (req: Request, res: Response) => {
  const token = registrationToken(req);
  const data = validate(federatedAuthVerificationSchema, req.body);
  await federatedAuthService.assertFederatedAuthRegistration(token);
  await turnstileConfigService.verifyTurnstileToken(data.turnstileToken, req.ip);
  res.json(
    await registrationEmailVerificationService.requestRegistrationEmailVerification(data.email),
  );
});

router.post('/registration/complete', authLimiter, async (req: Request, res: Response) => {
  const token = registrationToken(req);
  const data = validate(federatedAuthRegistrationSchema, req.body);
  await turnstileConfigService.verifyTurnstileToken(data.turnstileToken, req.ip);
  const result = await federatedAuthService.completeFederatedAuthRegistration({ token, ...data });
  clearFederatedAuthRegistrationCookie(res);
  setRefreshCookie(res, result.refreshToken);
  res.status(201).json(result);
});

export default router;
