/**
 * Minimal Amazon Cognito passwordless (SMS OTP) sign-in using the public Cognito Identity
 * Provider JSON API, so no SDK is needed. Used when the backend reports `mode: "cognito"`.
 *
 * Requires a user pool with choice-based sign-in (USER_AUTH) and SMS_OTP enabled, and an app
 * client without secret that allows ALLOW_USER_AUTH. New users are signed up first (Cognito
 * then sends a confirmation code). Verify against your pool configuration before go-live.
 */

type CognitoConfig = { region: string; clientId: string };

async function cognito<T>(cfg: CognitoConfig, target: string, body: unknown): Promise<T> {
  const response = await fetch(`https://cognito-idp.${cfg.region}.amazonaws.com/`, {
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

/** Completes sign-in (or sign-up confirmation followed by sign-in). Returns the ID token. */
export async function completeCognitoLogin(
  cfg: CognitoConfig,
  phone: string,
  challenge: CognitoChallenge,
  code: string,
): Promise<{ idToken: string; expiresIn: number } | { needsNewCode: true }> {
  if (challenge.kind === "signUp") {
    await cognito(cfg, "ConfirmSignUp", { ClientId: cfg.clientId, Username: phone, ConfirmationCode: code });
    // The account exists now; a sign-in code has to be requested.
    return { needsNewCode: true };
  }
  const res = await cognito<{ AuthenticationResult: { IdToken: string; ExpiresIn: number } }>(
    cfg,
    "RespondToAuthChallenge",
    {
      ChallengeName: "SMS_OTP",
      ClientId: cfg.clientId,
      Session: challenge.session,
      ChallengeResponses: { USERNAME: phone, SMS_OTP_CODE: code },
    },
  );
  return { idToken: res.AuthenticationResult.IdToken, expiresIn: res.AuthenticationResult.ExpiresIn };
}
