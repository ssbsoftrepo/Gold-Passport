import { describe, expect, it } from "vitest";
import { json, requestsTo, route } from "@/test/server";
import { cognitoChangePin, cognitoErrorCode, cognitoNewPin, cognitoSignIn, cognitoSignUp } from "../cognito";

const cfg = { region: "us-east-1", clientId: "client" };
const result = { AuthenticationResult: { IdToken: "id", AccessToken: "access", ExpiresIn: 3600 } };

/** Cognito answers every operation at POST /; the X-Amz-Target header names it. */
function cognito(answers: Record<string, () => Response>) {
  route("POST /", (request: Request) => {
    const target = (request.headers.get("X-Amz-Target") ?? "").split(".").pop() ?? "";
    return answers[target]?.() ?? json(400, { __type: "UnexpectedCall", message: target });
  });
}

const targets = () => requestsTo("POST /").map((r) => r.headers.get("X-Amz-Target")?.split(".").pop());

describe("Cognito errors", () => {
  it.each([
    ["NotAuthorizedException", "Incorrect username or password.", "INVALID_CREDENTIALS"],
    ["NotAuthorizedException", "Password attempts exceeded", "TOO_MANY_ATTEMPTS"],
    ["NotAuthorizedException", "Temporary password has expired and must be reset by an administrator.", "TEMPORARY_PIN_EXPIRED"],
    ["UserNotFoundException", "User does not exist.", "INVALID_CREDENTIALS"],
    ["UsernameExistsException", "User already exists", "PHONE_ALREADY_REGISTERED"],
    ["InvalidPasswordException", "Password did not conform with policy", "PIN_NOT_ALLOWED"],
    ["InvalidParameterException", "Invalid phone number format.", "INVALID_PHONE"],
    ["SomethingElse", "?", "COGNITO_ERROR"],
  ])("maps %s (%s) to %s", (type, message, code) => {
    expect(cognitoErrorCode(type, message)).toBe(code);
  });
});

describe("Cognito sign-in", () => {
  it("signs in with phone number and PIN", async () => {
    cognito({ InitiateAuth: () => json(200, result) });
    await expect(cognitoSignIn(cfg, "+51900000002", "135790")).resolves.toEqual({ idToken: "id", accessToken: "access", expiresIn: 3600 });
    const body = await requestsTo("POST /")[0].json();
    expect(body).toMatchObject({ AuthFlow: "USER_PASSWORD_AUTH", AuthParameters: { USERNAME: "+51900000002", PASSWORD: "135790" } });
  });

  it("asks for a new PIN after a PMD reset", async () => {
    cognito({ InitiateAuth: () => json(200, { ChallengeName: "NEW_PASSWORD_REQUIRED", Session: "s1" }) });
    await expect(cognitoSignIn(cfg, "+51900000002", "902741")).resolves.toEqual({ newPinRequired: true, session: "s1" });

    cognito({ RespondToAuthChallenge: () => json(200, result) });
    await expect(cognitoNewPin(cfg, "+51900000002", "s1", "135790")).resolves.toMatchObject({ idToken: "id" });
  });

  it("gives a wrong PIN the same code as local mode", async () => {
    cognito({ InitiateAuth: () => json(400, { __type: "NotAuthorizedException", message: "Incorrect username or password." }) });
    await expect(cognitoSignIn(cfg, "+51900000002", "000001")).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });
  });

  it("creates an account without SMS and signs in", async () => {
    cognito({ SignUp: () => json(200, { UserConfirmed: true }), InitiateAuth: () => json(200, result) });
    await expect(cognitoSignUp(cfg, "+51900000005", "135790")).resolves.toMatchObject({ idToken: "id" });
    expect(targets()).toEqual(["SignUp", "InitiateAuth"]);
  });

  it("changes the PIN after confirming the current one", async () => {
    cognito({ InitiateAuth: () => json(200, result), ChangePassword: () => json(200, {}) });
    await cognitoChangePin(cfg, "+51900000002", "135790", "246813");
    expect(targets()).toEqual(["InitiateAuth", "ChangePassword"]);
    const change = await requestsTo("POST /")[1].json();
    expect(change).toEqual({ AccessToken: "access", PreviousPassword: "135790", ProposedPassword: "246813" });
  });
});
