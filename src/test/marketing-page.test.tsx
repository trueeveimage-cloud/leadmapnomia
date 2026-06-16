import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import MarketingPage from "@/pages/MarketingPage";

const submitMarketingLead = vi.fn();

vi.mock("@/lib/marketingSubmissions", async () => {
  const actual = await vi.importActual<typeof import("@/lib/marketingSubmissions")>("@/lib/marketingSubmissions");
  return {
    ...actual,
    submitMarketingLead: (...args: unknown[]) => submitMarketingLead(...args),
  };
});

function renderMarketing(path = "/", mode: "home" | "niche" = "home") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/" element={<MarketingPage />} />
        <Route path="/:city/:niche" element={<MarketingPage mode={mode} />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("MarketingPage", () => {
  beforeEach(() => {
    submitMarketingLead.mockReset();
    submitMarketingLead.mockResolvedValue({ id: "lead-1" });
  });

  it("shows the homepage conversion CTA and message", () => {
    renderMarketing();

    expect(screen.getByText("Missade samtal blir tappade jobb. Leadmap svarar direkt.")).toBeInTheDocument();
    expect(screen.getByTestId("hero-primary-cta")).toHaveTextContent("Hör hur Leadmap svarar");
    expect(screen.getAllByText("Få gratis audit").length).toBeGreaterThan(0);
  });

  it("opens the booking dialog from the main nav", () => {
    renderMarketing();

    fireEvent.click(screen.getByTestId("booking-open"));

    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByRole("heading", { name: "Boka 10 min demo" })).toBeInTheDocument();
  });

  it("submits the two-step audit form", async () => {
    renderMarketing();

    const form = screen.getByTestId("audit-form");
    const stepOneInputs = within(form).getAllByRole("textbox");
    fireEvent.change(stepOneInputs[0], { target: { value: "Johan VVS AB" } });
    fireEvent.change(stepOneInputs[1], { target: { value: "VVS" } });
    fireEvent.change(stepOneInputs[2], { target: { value: "Göteborg" } });
    fireEvent.change(stepOneInputs[3], { target: { value: "0701234567" } });
    fireEvent.click(within(form).getByRole("button", { name: "Nästa" }));

    const stepTwoInputs = within(form).getAllByRole("textbox");
    fireEvent.change(stepTwoInputs[0], { target: { value: "https://example.se" } });
    fireEvent.change(stepTwoInputs[1], { target: { value: "5" } });
    fireEvent.click(within(form).getByRole("button", { name: "Få gratis audit" }));

    await waitFor(() => expect(submitMarketingLead).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("Tack - vi kollar på ert företag och skickar en kort demo/förslag.")).toBeInTheDocument();
  });

  it("renders a city/niche SEO page with CTA", () => {
    renderMarketing("/goteborg/vvs", "niche");

    expect(screen.getByRole("heading", { name: "AI-telefonist för VVS i Goteborg" })).toBeInTheDocument();
    expect(screen.getAllByText("Få gratis audit").length).toBeGreaterThan(0);
    expect(screen.getByText("1 akutjobb kan betala pilotmånaden.")).toBeInTheDocument();
  });

  it("opens booking from the pricing CTA", () => {
    renderMarketing();

    fireEvent.click(screen.getAllByTestId("pricing-cta")[1]);

    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByRole("heading", { name: "Boka 10 min demo" })).toBeInTheDocument();
  });
});
