/**
 * 인증 관련 기능 (로그인, 로그아웃, 세션)
 */

import * as cheerio from 'cheerio';
import type { LoginResult } from '@khinsider/shared';
import type { HttpContext } from './types.js';
import { makeRequest, makePost, resetHttpContext } from './http.js';
import { logger } from '../utils/index.js';

/**
 * 로그인
 */
export async function login(
  ctx: HttpContext,
  username: string,
  password: string
): Promise<LoginResult> {
  try {
    // Step 1: Get login page to get CSRF token
    const loginPageUrl = `${ctx.config.forumUrl}/index.php?login/`;
    const loginPage = await makeRequest(ctx, loginPageUrl);
    const $ = cheerio.load(loginPage.data);

    // Extract CSRF token
    const csrfToken = $('input[name="_xfToken"]').val();
    if (!csrfToken) {
      throw new Error('Could not find CSRF token');
    }

    // Step 2: Submit login form
    const loginData = new URLSearchParams({
      login: username,
      password: password,
      remember: '1',
      _xfToken: String(csrfToken),
      _xfRedirect: ctx.config.baseUrl
    });

    const response = await makePost(
      ctx,
      `${ctx.config.forumUrl}/index.php?login/login`,
      loginData.toString()
    );

    // Check if login was successful
    const $response = cheerio.load(response.data);
    const hasError = $response('.blockMessage--error').length > 0;
    const isLoggedIn = $response('a[href*="logout"]').length > 0 ||
                       response.data.includes('data-logged-in="true"');

    if (hasError) {
      const errorMsg = $response('.blockMessage--error').text().trim();
      throw new Error(errorMsg || 'Login failed');
    }

    ctx.state.isLoggedIn = isLoggedIn;
    return { success: isLoggedIn };

  } catch (error: unknown) {
    ctx.state.isLoggedIn = false;
    throw error;
  }
}

/**
 * 로그인 상태 확인
 */
export async function checkLoginStatus(ctx: HttpContext): Promise<boolean> {
  try {
    const response = await makeRequest(ctx, `${ctx.config.forumUrl}/`);
    const isLoggedIn = response.data.includes('data-logged-in="true"');
    ctx.state.isLoggedIn = isLoggedIn;
    return isLoggedIn;
  } catch (error) {
    logger.warn('Scraper', 'Failed to check login status', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    return false;
  }
}

/**
 * 로그아웃
 */
export function logout(ctx: HttpContext): void {
  resetHttpContext(ctx);
}
