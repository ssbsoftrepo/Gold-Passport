import { checkNewPin, isValidPin } from "../pin";
import { cognitoErrorCode } from "../cognito";

it.each(["135790", "482915", "102938", "000001"])("accepts %s", (pin) => expect(isValidPin(pin)).toBe(true));

it.each(["123456", "987654", "012345", "000000", "999999", "12345", "1234567", "12a456", ""])("refuses %s", (pin) =>
  expect(isValidPin(pin)).toBe(false));

it("asks for the same PIN twice", () => {
  expect(checkNewPin("482915", "482915")).toBeNull();
  expect(checkNewPin("482915", "482916")).toEqual({ code: "PIN_MISMATCH" });
  expect(checkNewPin("123456", "123456")).toEqual({ code: "PIN_NOT_ALLOWED" });
});

it("gives Cognito errors the same codes as the backend", () => {
  expect(cognitoErrorCode("NotAuthorizedException", "Incorrect username or password.")).toBe("INVALID_CREDENTIALS");
  expect(cognitoErrorCode("NotAuthorizedException", "Password attempts exceeded")).toBe("TOO_MANY_ATTEMPTS");
  expect(cognitoErrorCode("NotAuthorizedException", "Temporary password has expired and must be reset by an administrator."))
    .toBe("TEMPORARY_PIN_EXPIRED");
  expect(cognitoErrorCode("UsernameExistsException", "User already exists")).toBe("PHONE_ALREADY_REGISTERED");
  expect(cognitoErrorCode("InvalidPasswordException", "Password does not conform to policy")).toBe("PIN_NOT_ALLOWED");
  expect(cognitoErrorCode("SomethingNew", "?")).toBe("COGNITO_ERROR");
});
