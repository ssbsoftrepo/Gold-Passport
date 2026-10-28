import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
import { resetServer } from "./server";

afterEach(() => {
  cleanup();
  resetServer();
  window.localStorage.clear();
});
