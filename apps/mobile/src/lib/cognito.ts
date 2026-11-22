import { fetchWithTimeout } from "./api";

/**
 * Minimal Amazon Cognito passwordless (SMS OTP) sign-in using the public Cognito Identity
 * Provider JSON API, so no SDK is needed. Used when the backend reports `mode: "cognito"`.
 *
 * Requires a user pool with choice-based sign-in (USER_AUTH) and SMS_OTP enabled, and an app
 * client without secret that allows ALLOW_USER_AUTH and ALLOW_REFRESH_TOKEN_AUTH. New users are
 * signed up first (Cognito then sends a confirmation code). Verify against your pool configuration
 * before go-live.
 */

export type CognitoConfig = { region: string; clientId: string };

type AuthenticationResult = { IdToken: string; ExpiresIn: number; RefreshToken?: string };

async function cognito<T>(cfg: CognitoConfig, target: string, body: unknown): Promise<T> {
  const response = await fetchWithTimeout(`https://cognito-idp.${cfg.region}.amazonaws.com/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-amz-json-1.1",
      "X-Amz-Target": `AWSCognitoIdentityProviderService.${target}`,
    },
    body: JSON.stringify(body),
  });
  const json = await response.json();
  if (!response.ok) {
    const type = String(json.__type ?? "CognitoError").split("#").pop();
    throw Object.assign(new Error(json.message ?? type), { cognitoType: type });
  }
  return json as T;
}

export type CognitoChallenge =
  | { kind: "signIn"; session: string }
  | { kind: "signUp" };

/** Starts sign-in; signs the user up when the phone is not registered yet. */
export async function startCognitoLogin(cfg: CognitoConfig, phone: string): Promise<CognitoChallenge> {
  try {
    const res = await cognito<{ Session: string }>(cfg, "InitiateAuth", {
      AuthFlow: "USER_AUTH",
      ClientId: cfg.clientId,
      AuthParameters: { USERNAME: phone, PREFERRED_CHALLENGE: "SMS_OTP" },
    });
    return { kind: "signIn", session: res.Session };
  } catch (e) {
    if ((e as { cognitoType?: string }).cognitoType === "UserNotFoundException") {
      await cognito(cfg, "SignUp", {
        ClientId: cfg.clientId,
        Username: phone,
        UserAttributes: [{ Name: "phone_number", Value: phone }],
      });
      return { kind: "signUp" };
    }
    throw e;
  }
}

/** Completes sign-in (or sign-up confirmation followed by sign-in). Returns the ID and refresh tokens. */
export async function completeCognitoLogin(
  cfg: CognitoConfig,
  phone: string,
  challenge: CognitoChallenge,
  code: string,
): Promise<{ idToken: string; expiresIn: number; refreshToken: string | null } | { needsNewCode: true }> {
  if (challenge.kind === "signUp") {
    await cognito(cfg, "ConfirmSignUp", { ClientId: cfg.clientId, Username: phone, ConfirmationCode: code });
    // The account exists now; a sign-in code has to be requested.
    return { needsNewCode: true };
  }
  const res = await cognito<{ AuthenticationResult: AuthenticationResult }>(
    cfg,
    "RespondToAuthChallenge",
    {
      ChallengeName: "SMS_OTP",
      ClientId: cfg.clientId,
      Session: challenge.session,
      ChallengeResponses: { USERNAME: phone, SMS_OTP_CODE: code },
    },
  );
  const result = res.AuthenticationResult;
  return { idToken: result.IdToken, expiresIn: result.ExpiresIn, refreshToken: result.RefreshToken ?? null };
}

/**
 * New ID token from the refresh token, without an SMS code. GetTokensFromRefreshToken works with
 * and without refresh token rotation; with rotation it also returns a new refresh token, which
 * replaces the old one.
 */
export async function refreshCognitoTokens(
  cfg: CognitoConfig,
  refreshToken: string,
): Promise<{ idToken: string; refreshToken: string | null }> {
  const res = await cognito<{ AuthenticationResult: AuthenticationResult }>(cfg, "GetTokensFromRefreshToken", {
    ClientId: cfg.clientId,
    RefreshToken: refreshToken,
  });
  const result = res.AuthenticationResult;
  return { idToken: result.IdToken, refreshToken: result.RefreshToken ?? null };
}

/** The refresh token was expired or revoked (or the user disabled): only signing in again helps. */
export function isRefreshRejected(e: unknown): boolean {
  const type = (e as { cognitoType?: string } | null)?.cognitoType;
  return type === "NotAuthorizedException" || type === "UserNotFoundException";
}

/** Invalidates the refresh token (sign-out), so a copy taken from the phone stops working. */
export async function revokeCognitoToken(cfg: CognitoConfig, refreshToken: string): Promise<void> {
  await cognito(cfg, "RevokeToken", { ClientId: cfg.clientId, Token: refreshToken });
}
