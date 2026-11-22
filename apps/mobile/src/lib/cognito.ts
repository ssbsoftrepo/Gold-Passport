import { fetchWithTimeout } from "./api";

/**
 * Minimal Amazon Cognito phone number + PIN sign-in using the public Cognito Identity Provider JSON
 * API, so no SDK is needed. Used when the backend reports `mode: "cognito"`. No SMS is ever sent.
 *
 * Requires a user pool with the phone number as username, a password policy that accepts a 6-digit
 * PIN, new accounts confirmed automatically (pre sign-up trigger) and an app client without secret
 * that allows ALLOW_USER_PASSWORD_AUTH and ALLOW_REFRESH_TOKEN_AUTH (see infra/).
 */

export type CognitoConfig = { region: string; clientId: string };

type AuthenticationResult = { IdToken: string; AccessToken: string; ExpiresIn: number; RefreshToken?: string };

export type CognitoTokens = { idToken: string; accessToken: string; expiresIn: number; refreshToken: string | null };

/** The PIN was a temporary one from a PMD reset: a new PIN must be chosen with {@link cognitoNewPin}. */
export type NewPinRequired = { newPinRequired: true; session: string };

/**
 * Cognito errors carry the same `code`s as the backend's local mode, so the apps show the same
 * messages (`errors.<code>`) in both modes.
 */
export function cognitoErrorCode(type: string, message: string): string {
  switch (type) {
    case "NotAuthorizedException":
      if (/attempts exceeded/i.test(message)) return "TOO_MANY_ATTEMPTS";
      if (/temporary password has expired/i.test(message)) return "TEMPORARY_PIN_EXPIRED";
      return "INVALID_CREDENTIALS";
    case "UserNotFoundException":
      return "INVALID_CREDENTIALS";
    case "UsernameExistsException":
      return "PHONE_ALREADY_REGISTERED";
    case "InvalidPasswordException":
      return "PIN_NOT_ALLOWED";
    case "TooManyRequestsException":
    case "LimitExceededException":
      return "TOO_MANY_ATTEMPTS";
    case "InvalidParameterException":
      return /phone/i.test(message) ? "INVALID_PHONE" : "COGNITO_ERROR";
    default:
      return "COGNITO_ERROR";
  }
}

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
    const type = String(json.__type ?? "CognitoError").split("#").pop() ?? "CognitoError";
    const message = String(json.message ?? type);
    throw Object.assign(new Error(message), { cognitoType: type, code: cognitoErrorCode(type, message) });
  }
  return json as T;
}

function tokens(result: AuthenticationResult): CognitoTokens {
  return {
    idToken: result.IdToken,
    accessToken: result.AccessToken,
    expiresIn: result.ExpiresIn,
    refreshToken: result.RefreshToken ?? null,
  };
}

type InitiateAuthResponse = { AuthenticationResult?: AuthenticationResult; ChallengeName?: string; Session?: string };

/** Signs in with phone number + PIN. */
export async function cognitoSignIn(cfg: CognitoConfig, phone: string, pin: string): Promise<CognitoTokens | NewPinRequired> {
  const res = await cognito<InitiateAuthResponse>(cfg, "InitiateAuth", {
    AuthFlow: "USER_PASSWORD_AUTH",
    ClientId: cfg.clientId,
    AuthParameters: { USERNAME: phone, PASSWORD: pin },
  });
  if (res.ChallengeName === "NEW_PASSWORD_REQUIRED" && res.Session) {
    return { newPinRequired: true, session: res.Session };
  }
  if (!res.AuthenticationResult) {
    throw Object.assign(new Error(`Unexpected Cognito challenge ${res.ChallengeName}`), { code: "COGNITO_ERROR" });
  }
  return tokens(res.AuthenticationResult);
}

/** Creates the account (confirmed at once by the pool's pre sign-up trigger; no SMS) and signs in. */
export async function cognitoSignUp(cfg: CognitoConfig, phone: string, pin: string): Promise<CognitoTokens> {
  await cognito(cfg, "SignUp", {
    ClientId: cfg.clientId,
    Username: phone,
    Password: pin,
    UserAttributes: [{ Name: "phone_number", Value: phone }],
  });
  const result = await cognitoSignIn(cfg, phone, pin);
  if ("newPinRequired" in result) {
    throw Object.assign(new Error("New account asks for a new PIN"), { code: "COGNITO_ERROR" });
  }
  return result;
}

/** Replaces a temporary PIN from a PMD reset with the PIN the person chose, and signs in. */
export async function cognitoNewPin(cfg: CognitoConfig, phone: string, session: string, newPin: string): Promise<CognitoTokens> {
  const res = await cognito<{ AuthenticationResult: AuthenticationResult }>(cfg, "RespondToAuthChallenge", {
    ChallengeName: "NEW_PASSWORD_REQUIRED",
    ClientId: cfg.clientId,
    Session: session,
    ChallengeResponses: { USERNAME: phone, NEW_PASSWORD: newPin },
  });
  return tokens(res.AuthenticationResult);
}

/** Changes the PIN of a signed-in person after confirming the current one. */
export async function cognitoChangePin(cfg: CognitoConfig, phone: string, currentPin: string, newPin: string): Promise<void> {
  const signedIn = await cognitoSignIn(cfg, phone, currentPin);
  if ("newPinRequired" in signedIn) {
    throw Object.assign(new Error("Temporary PIN"), { code: "PIN_CHANGE_REQUIRED" });
  }
  await cognito(cfg, "ChangePassword", {
    AccessToken: signedIn.accessToken,
    PreviousPassword: currentPin,
    ProposedPassword: newPin,
  });
}

/**
 * New ID token from the refresh token, without asking for the PIN. GetTokensFromRefreshToken works
 * with and without refresh token rotation; with rotation it also returns a new refresh token, which
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
