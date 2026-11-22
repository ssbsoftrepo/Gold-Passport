import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { I18nProvider, translate } from "@/lib/i18n";
import type { Schemas } from "@/lib/api";
import Onboarding from "../onboarding";

type Application = Schemas["OnboardingApplication"];

const mockUpdateOnboarding = jest.fn();
let mockOnboarding: Application;

jest.mock("expo-router", () => ({ router: { push: jest.fn(), replace: jest.fn() } }));
jest.mock("@/lib/capture", () => ({ DOCUMENT_PHOTO_MAX_EDGE: 2048, takePhoto: jest.fn() }));
jest.mock("@/lib/api", () => ({
  ...jest.requireActual("@/lib/api"),
  api: { GET: jest.fn(), PUT: jest.fn(), POST: jest.fn() },
  call: async (request: Promise<{ data: unknown }>) => (await request).data,
  uploadMultipart: jest.fn(),
}));
jest.mock("@/lib/session", () => ({
  useSession: () => ({
    user: { role: "MINER" },
    onboarding: mockOnboarding,
    refresh: jest.fn(),
    signOut: jest.fn(),
    updateOnboarding: mockUpdateOnboarding,
  }),
}));

const mockApi = (jest.requireMock("@/lib/api") as { api: Record<"GET" | "PUT" | "POST", jest.Mock> }).api;
const t = (key: string) => translate("en", key);
const ok = (data: unknown) => Promise.resolve({ data, response: { ok: true } });

function application(overrides: Partial<Application> = {}): Application {
  return {
    id: "app-1", userId: "user-1", role: "MINER", status: "DRAFT", phone: "+51987650011",
    fullName: null, documentType: null, documentNumber: null, email: null, driverLicenseNumber: null,
    vehiclePlate: null, companyName: null, ruc: null, companyAddress: null, legalRepresentative: null,
    documents: [], kycStatus: "NOT_RUN", kycDetails: null, reviewNotes: null, missingRequirements: [],
    submittedAt: null, reviewedAt: null, createdAt: "2026-11-22T10:00:00Z", updatedAt: "2026-11-22T10:00:00Z",
    ...overrides,
  } as Application;
}

const saved = application({
  fullName: "Rosa Ejemplo Quispe", documentType: "DNI", documentNumber: "45879632", email: "rosa@correo.pe",
  documents: [
    { id: "d1", kind: "ID_DOCUMENT", fileId: "f1", fileName: "id.jpg", contentType: "image/jpeg", sha256: "x", uploadedAt: "2026-11-22T10:05:00Z" },
    { id: "d2", kind: "SELFIE", fileId: "f2", fileName: "me.jpg", contentType: "image/jpeg", sha256: "y", uploadedAt: "2026-11-22T10:06:00Z" },
  ] as Application["documents"],
  updatedAt: "2026-11-22T10:06:00Z",
});

const show = () => render(<I18nProvider><Onboarding /></I18nProvider>);

beforeEach(() => jest.clearAllMocks());

it("shows the server's newer copy when it arrives after opening from the copy saved on the phone", async () => {
  // Reopened app: the copy on the phone is from before the details were saved.
  mockOnboarding = application();
  const view = await show();
  expect(screen.queryByDisplayValue("Rosa Ejemplo Quispe")).toBeNull();

  mockOnboarding = saved; // the server's answer arrives
  await view.rerender(<I18nProvider><Onboarding /></I18nProvider>);
  expect(await screen.findByDisplayValue("Rosa Ejemplo Quispe")).toBeTruthy();
  expect(screen.getByDisplayValue("45879632")).toBeTruthy();
});

it("submits without sending the details again when the person changed nothing", async () => {
  mockOnboarding = saved;
  mockApi.POST.mockReturnValue(ok({ ...saved, status: "SUBMITTED" }));
  await show();
  await fireEvent.press(screen.getByText(t("onb.submit")));
  await waitFor(() => expect(mockApi.POST).toHaveBeenCalledWith("/api/v1/onboarding/me/submit"));
  expect(mockApi.PUT).not.toHaveBeenCalled();
  expect(mockUpdateOnboarding).toHaveBeenCalledWith(expect.objectContaining({ status: "SUBMITTED" }));
});

it("saves what the person typed before submitting", async () => {
  mockOnboarding = saved;
  mockApi.PUT.mockImplementation((_path: string, { body }: { body: object }) => ok({ ...saved, ...body }));
  mockApi.POST.mockReturnValue(ok({ ...saved, status: "SUBMITTED" }));
  await show();
  await fireEvent.changeText(screen.getByDisplayValue("rosa@correo.pe"), "rosa.nueva@correo.pe");
  await fireEvent.press(screen.getByText(t("onb.submit")));
  await waitFor(() => expect(mockApi.POST).toHaveBeenCalled());
  expect(mockApi.PUT).toHaveBeenCalledWith("/api/v1/onboarding/me", {
    body: expect.objectContaining({ fullName: "Rosa Ejemplo Quispe", email: "rosa.nueva@correo.pe" }),
  });
  expect(mockApi.PUT.mock.invocationCallOrder[0]).toBeLessThan(mockApi.POST.mock.invocationCallOrder[0]);
});

it("keeps every change for the next start-up", async () => {
  mockOnboarding = application();
  mockApi.PUT.mockImplementation((_path: string, { body }: { body: object }) => ok({ ...mockOnboarding, ...body }));
  await show();
  await fireEvent.changeText(screen.getAllByDisplayValue("")[0], "Rosa Ejemplo Quispe");
  await fireEvent.press(screen.getByText(t("common.save")));
  await waitFor(() => expect(mockUpdateOnboarding).toHaveBeenCalledWith(expect.objectContaining({ fullName: "Rosa Ejemplo Quispe" })));
});
