import * as Sentry from "@sentry/react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import PageError from "../error";
import { I18nProvider } from "@/lib/i18n";

vi.mock("@sentry/react", () => ({ captureException: vi.fn() }));

it("reports a page that crashed and lets the user try again", async () => {
  const error = new TypeError("Cannot read properties of undefined");
  const reset = vi.fn();

  render(
    <I18nProvider>
      <PageError error={error} reset={reset} />
    </I18nProvider>,
  );

  expect(Sentry.captureException).toHaveBeenCalledWith(error);
  expect(screen.getByRole("alert")).toHaveTextContent(/went wrong|salió mal/);
  await userEvent.click(screen.getByRole("button"));
  expect(reset).toHaveBeenCalled();
});
