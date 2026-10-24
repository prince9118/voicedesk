import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api, ApiError, type Ticket } from "../api/client";
import { Tooltip } from "radix-ui";
import { FILTERS, FilterTabs, NewTicketDialog, type TicketFilter, TicketList } from "./Tickets";

const make = (overrides: Partial<Ticket>): Ticket => ({
  id: "id-" + (overrides.number ?? 1),
  number: 1,
  subject: "Subject",
  description: "Description",
  status: "open",
  priority: "medium",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
});

// Tooltips (used for the relative time) need their provider, as in the app.
const withProvider = (ui: React.ReactElement) => <Tooltip.Provider>{ui}</Tooltip.Provider>;

describe("TicketList", () => {
  it("shows each ticket's number, subject and a readable status", () => {
    render(
      withProvider(
        <TicketList
          loading={false}
          filtered={false}
          tickets={[
            make({ number: 1042, subject: "Refund not received", status: "in_progress" }),
            make({ number: 1031, subject: "Change plan", status: "resolved" }),
          ]}
        />,
      ),
    );

    expect(screen.getByText("#1042")).toBeInTheDocument();
    expect(screen.getByText("Refund not received")).toBeInTheDocument();
    expect(screen.getByText("In progress")).toBeInTheDocument(); // not the raw "in_progress"
    expect(screen.getByText("Resolved")).toBeInTheDocument();
  });

  it("labels priority for screen readers, not just by icon", () => {
    render(withProvider(<TicketList loading={false} filtered={false} tickets={[make({ priority: "urgent" })]} />));
    expect(screen.getByRole("img", { name: "Urgent priority" })).toBeInTheDocument();
  });

  it("shows a loading state while tickets load", () => {
    const { container } = render(<TicketList loading filtered={false} tickets={[]} />);
    expect(container.querySelector("[aria-busy]")).toBeInTheDocument();
  });

  it("invites the user to create a ticket when there are none", () => {
    render(<TicketList loading={false} filtered={false} tickets={[]} />);
    expect(screen.getByText("No tickets yet")).toBeInTheDocument();
  });

  it("says so when a filter hides everything, and suggests another filter", () => {
    render(<TicketList loading={false} filtered tickets={[]} />);
    expect(screen.getByText("No tickets in this view")).toBeInTheDocument();
    expect(screen.getByText("Try another filter.")).toBeInTheDocument();
  });
});

describe("FilterTabs", () => {
  const counts = { all: 5, open: 1, in_progress: 2, resolved: 1, closed: 1 };

  function Harness({ onChange }: { onChange?: (f: TicketFilter) => void }) {
    const [value, setValue] = useState<TicketFilter>("all");
    return (
      <FilterTabs
        value={value}
        counts={counts}
        onChange={(f) => {
          setValue(f);
          onChange?.(f);
        }}
      >
        <p>showing {value}</p>
      </FilterTabs>
    );
  }

  it("offers every status with its count", () => {
    render(<Harness />);

    for (const filter of FILTERS) {
      const tab = screen.getByRole("tab", { name: new RegExp(filter.label) });
      expect(tab).toHaveTextContent(String(counts[filter.value]));
    }
  });

  it("switches the filter when a tab is chosen", async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);

    await userEvent.click(screen.getByRole("tab", { name: /In progress/ }));

    expect(onChange).toHaveBeenCalledWith("in_progress");
    expect(screen.getByText("showing in_progress")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /In progress/ })).toHaveAttribute("aria-selected", "true");
  });

  it("supports arrow-key navigation between tabs", async () => {
    render(<Harness />);

    screen.getByRole("tab", { name: /All/ }).focus();
    await userEvent.keyboard("{ArrowRight}");

    expect(screen.getByRole("tab", { name: /Open/ })).toHaveFocus();
  });
});

describe("NewTicketDialog", () => {
  function Harness({ onCreated }: { onCreated: (t: Ticket) => void }) {
    const [open, setOpen] = useState(true);
    return <NewTicketDialog open={open} onOpenChange={setOpen} onCreated={onCreated} />;
  }

  beforeEach(() => {
    vi.spyOn(api, "createTicket").mockResolvedValue(make({ number: 7, subject: "Refund not received" }));
  });

  it("creates the ticket, reports it, and closes", async () => {
    const onCreated = vi.fn();
    render(<Harness onCreated={onCreated} />);

    await userEvent.type(screen.getByLabelText("Subject"), "Refund not received");
    await userEvent.type(screen.getByLabelText("Description"), "Two weeks and still nothing.");
    await userEvent.click(screen.getByRole("button", { name: "Create ticket" }));

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(expect.objectContaining({ number: 7 })));
    expect(api.createTicket).toHaveBeenCalledWith("Refund not received", "Two weeks and still nothing.");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("keeps the form open and shows the error when creating fails", async () => {
    vi.spyOn(api, "createTicket").mockRejectedValue(new ApiError(503, "SERVICE_UNAVAILABLE", "Service temporarily unavailable, try again shortly"));
    const onCreated = vi.fn();
    render(<Harness onCreated={onCreated} />);

    await userEvent.type(screen.getByLabelText("Subject"), "Refund not received");
    await userEvent.type(screen.getByLabelText("Description"), "Details");
    await userEvent.click(screen.getByRole("button", { name: "Create ticket" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/temporarily unavailable/i);
    expect(onCreated).not.toHaveBeenCalled();
    expect(within(screen.getByRole("dialog")).getByLabelText("Subject")).toHaveValue("Refund not received"); // nothing lost
  });

  it("can be cancelled", async () => {
    render(<Harness onCreated={() => {}} />);

    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(api.createTicket).not.toHaveBeenCalled();
  });
});
