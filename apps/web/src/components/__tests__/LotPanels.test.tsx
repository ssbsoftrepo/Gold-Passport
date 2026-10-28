import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Schemas } from "@/lib/api";
import { I18nProvider, translate } from "@/lib/i18n";
import { json, requestsTo, route } from "@/test/server";
import { LabResultPanel, SettlementPanel } from "../LotPanels";

/** The screens open in Spanish; look texts up by key so copy edits don't break the tests. */
const t = (key: string, params?: Record<string, string>) => translate("es", key, params);

function lot(status: Schemas["LotStatus"]): Schemas["Lot"] {
  return {
    id: "l1",
    code: "LOT-0001",
    status,
    minerUserId: "m1",
    minerName: "Rosa Quispe",
    mineSiteName: "Mina Esperanza",
    description: null,
    transporterUserId: "t1",
    collectorUserId: "c1",
    custodianUserId: "c1",
    custodianRole: "COLLECTOR",
    currentTransportId: null,
    declaredWeightGrams: 150,
    declaredPurityPct: 92.5,
    minerLabName: null,
    minerLabReportFileId: null,
    verifiedWeightGrams: null,
    verifiedPurityPct: null,
    evidence: [],
    createdAt: "2026-10-20T10:00:00Z",
    completedAt: "2026-10-20T11:00:00Z",
    updatedAt: "2026-10-21T10:00:00Z",
  };
}

const labResult: Schemas["LabResult"] = {
  id: "r1",
  lotId: "l1",
  lotCode: "LOT-0001",
  collectorUserId: "c1",
  labName: "Laboratorio Andino",
  measuredPurityPct: 92.1,
  measuredWeightGrams: 149.8,
  declaredPurityPct: 92.5,
  declaredWeightGrams: 150,
  purityDeltaPct: -0.4,
  weightDeltaPct: -0.13,
  status: "APPROVED",
  reportFileId: "f1",
  finalPurityPct: 92.1,
  finalWeightGrams: 149.8,
  resolutionNotes: null,
  resolvedAt: null,
  recordedAt: "2026-10-22T09:00:00Z",
};

function settlement(status: Schemas["SettlementStatus"], extra: Partial<Schemas["Settlement"]> = {}): Schemas["Settlement"] {
  return {
    id: "s1",
    lotId: "l1",
    lotCode: "LOT-0001",
    minerUserId: "m1",
    collectorUserId: "c1",
    status,
    amount: 12500.5,
    currency: "PEN",
    adminNotes: null,
    paymentReference: null,
    paymentMethod: null,
    paidAt: null,
    proposals: [
      {
        id: "p1",
        amount: 12500.5,
        currency: "PEN",
        pricePerGram: null,
        notes: null,
        proposedAt: "2026-10-23T09:00:00Z",
        response: null,
        responseReason: null,
        respondedAt: null,
      },
    ],
    createdAt: "2026-10-23T09:00:00Z",
    updatedAt: "2026-10-23T09:00:00Z",
    ...extra,
  };
}

const notFound = () => json(404, { code: "NOT_FOUND", title: "Not found" });

/**
 * Submits the form holding `button`. jsdom still reports a required file input as empty after
 * user.upload, so its form validation would block a click; the browser's checks are not under test.
 */
function submitWith(button: HTMLElement) {
  expect(button).toBeEnabled();
  fireEvent.submit(button.closest("form")!);
}

function renderPanel(panel: React.ReactElement) {
  return render(<I18nProvider>{panel}</I18nProvider>);
}

describe("LabResultPanel", () => {
  it("lets the collector record the lab check of a delivered lot", async () => {
    let saved = false;
    route("GET /api/v1/lots/l1/lab-result", () => (saved ? json(200, labResult) : notFound()));
    route("POST /api/v1/lots/l1/lab-result", () => {
      saved = true;
      return json(201, labResult);
    });
    const onChanged = vi.fn();
    const user = userEvent.setup();
    renderPanel(<LabResultPanel lot={lot("DELIVERED")} mode="collector" onChanged={onChanged} />);

    const record = await screen.findByRole("button", { name: t("lab.record") });
    expect(record).toBeDisabled(); // no report attached yet

    await user.type(screen.getByLabelText(t("lab.labName")), "Laboratorio Andino");
    await user.type(screen.getByLabelText(t("lab.purity")), "92,1");
    await user.type(screen.getByLabelText(t("lab.weight")), "149,8");
    await user.upload(screen.getByLabelText(t("lab.report")), new File(["%PDF"], "report.pdf", { type: "application/pdf" }));
    submitWith(record);

    await screen.findByText("Laboratorio Andino");
    const form = await requestsTo("POST /api/v1/lots/l1/lab-result")[0].formData();
    expect(Object.fromEntries([...form.entries()].filter(([k]) => k !== "file"))).toEqual({
      labName: "Laboratorio Andino",
      purityPct: "92.1", // Peruvian decimal comma accepted
      weightGrams: "149.8",
    });
    expect(form.has("file")).toBe(true); // jsdom's File loses its name on the way into the fake server
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it("shows why the server refused and keeps the form", async () => {
    route("GET /api/v1/lots/l1/lab-result", notFound);
    route("POST /api/v1/lots/l1/lab-result", () => json(400, { code: "FILE_TYPE_NOT_ALLOWED", title: "Bad file" }));
    const onChanged = vi.fn();
    const user = userEvent.setup();
    renderPanel(<LabResultPanel lot={lot("DELIVERED")} mode="collector" onChanged={onChanged} />);

    await user.type(await screen.findByLabelText(t("lab.labName")), "Lab");
    await user.type(screen.getByLabelText(t("lab.purity")), "90");
    await user.type(screen.getByLabelText(t("lab.weight")), "100");
    await user.upload(screen.getByLabelText(t("lab.report")), new File(["x"], "r.png", { type: "image/png" }));
    submitWith(screen.getByRole("button", { name: t("lab.record") }));

    expect(await screen.findByRole("alert")).toHaveTextContent(t("errors.FILE_TYPE_NOT_ALLOWED"));
    expect(screen.getByLabelText(t("lab.labName"))).toHaveValue("Lab");
    expect(onChanged).not.toHaveBeenCalled();
  });

  it("shows the recorded result with the differences to the miner's declaration", async () => {
    route("GET /api/v1/lots/l1/lab-result", labResult);
    renderPanel(<LabResultPanel lot={lot("LAB_APPROVED")} mode="view" onChanged={() => undefined} />);

    expect(await screen.findByText("Laboratorio Andino")).toBeInTheDocument();
    expect(screen.getByText("-0.4 pts, -0.13 %")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: t("lab.record") })).not.toBeInTheDocument();
  });

  it("offers no form to anyone but the collector, nor before delivery", async () => {
    route("GET /api/v1/lots/l1/lab-result", notFound);
    const { unmount } = renderPanel(<LabResultPanel lot={lot("DELIVERED")} mode="view" onChanged={() => undefined} />);
    expect(await screen.findByText(t("common.none"))).toBeInTheDocument();
    unmount();

    renderPanel(<LabResultPanel lot={lot("IN_TRANSIT")} mode="collector" onChanged={() => undefined} />);
    expect(await screen.findByText(t("common.none"))).toBeInTheDocument();
    expect(screen.queryByLabelText(t("lab.labName"))).not.toBeInTheDocument();
  });
});

describe("SettlementPanel", () => {
  it("waits for the lab check before any payment can be proposed", async () => {
    route("GET /api/v1/lots/l1/settlement", notFound);
    renderPanel(<SettlementPanel lot={lot("DELIVERED")} mode="collector" onChanged={() => undefined} />);

    expect(await screen.findByText(t("settle.needsLab"))).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: t("settle.propose") })).not.toBeInTheDocument();
  });

  it("lets the collector propose a payment once the lab approved the lot", async () => {
    route("GET /api/v1/lots/l1/settlement", notFound);
    route("POST /api/v1/lots/l1/settlement/proposals", () => json(201, settlement("PROPOSED", { currency: "USD" })));
    const user = userEvent.setup();
    renderPanel(<SettlementPanel lot={lot("LAB_APPROVED")} mode="collector" onChanged={() => undefined} />);

    await user.type(await screen.findByLabelText(t("settle.amount")), "12500,50");
    await user.selectOptions(screen.getByLabelText(t("settle.currency")), "USD");
    await user.click(screen.getByRole("button", { name: t("settle.propose") }));

    expect(await screen.findByText(t("settle.waitingMiner"))).toBeInTheDocument();
    expect(await requestsTo("POST /api/v1/lots/l1/settlement/proposals")[0].json()).toEqual({
      amount: 12500.5,
      currency: "USD",
      pricePerGram: null,
      notes: null,
    });
    // The miner may dispute it, so the collector can propose again.
    expect(screen.getByRole("button", { name: t("settle.repropose") })).toBeInTheDocument();
    expect(screen.getByLabelText(t("settle.amount"))).toHaveValue("");
  });

  it("lets the collector record the payment once both sides agreed", async () => {
    route("GET /api/v1/lots/l1/settlement", settlement("AGREED"));
    route("POST /api/v1/lots/l1/settlement/mark-paid", () =>
      json(200, settlement("PAID", { paymentReference: "OP-7781", paymentMethod: "CASH", paidAt: "2026-10-24T15:00:00Z" })),
    );
    const onChanged = vi.fn();
    const user = userEvent.setup();
    renderPanel(<SettlementPanel lot={lot("LAB_APPROVED")} mode="collector" onChanged={onChanged} />);

    expect(await screen.findByText(t("settle.agreed"))).toBeInTheDocument();
    await user.type(screen.getByLabelText(t("settle.paymentReference")), "OP-7781");
    await user.selectOptions(screen.getByLabelText(t("settle.paymentMethod")), "CASH");
    await user.click(screen.getByRole("button", { name: t("settle.markPaid") }));

    expect(await screen.findByText(/OP-7781/)).toBeInTheDocument();
    expect(await requestsTo("POST /api/v1/lots/l1/settlement/mark-paid")[0].json()).toEqual({
      paymentReference: "OP-7781",
      paymentMethod: "CASH",
      notes: null,
    });
    expect(onChanged).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: t("settle.markPaid") })).not.toBeInTheDocument();
  });

  it("only shows the agreement to PMD staff: payment is the collector's to record", async () => {
    route("GET /api/v1/lots/l1/settlement", settlement("AGREED"));
    renderPanel(<SettlementPanel lot={lot("LAB_APPROVED")} mode="view" onChanged={() => undefined} />);

    expect(await screen.findByText(t("settle.agreed"))).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: t("settle.markPaid") })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: t("settle.propose") })).not.toBeInTheDocument();
  });

  it("offers a retry when the settlement cannot be loaded", async () => {
    let fail = true;
    route("GET /api/v1/lots/l1/settlement", () => (fail ? json(503, {}) : json(200, settlement("PROPOSED"))));
    const user = userEvent.setup();
    renderPanel(<SettlementPanel lot={lot("LAB_APPROVED")} mode="collector" onChanged={() => undefined} />);

    await screen.findByRole("alert");
    fail = false;
    await user.click(screen.getByRole("button", { name: t("common.retry") }));
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    expect(screen.getByText(t("settle.waitingMiner"))).toBeInTheDocument();
  });
});
