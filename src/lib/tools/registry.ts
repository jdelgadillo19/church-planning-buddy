export type ToolStatus = "active" | "coming_soon";

export type ToolDefinition = {
  id: string;
  name: string;
  description: string;
  href: string;
  status: ToolStatus;
};

/** Central registry for CPB tool hub — add future tools here. */
export const TOOLS: ToolDefinition[] = [
  {
    id: "grg",
    name: "Get Ready Guide",
    description:
      "Build and sign off a weekly Get Ready Guide from a Planning Center plan and org scan sources.",
    href: "/grg",
    status: "active",
  },
  {
    id: "slide-deck",
    name: "Slide Deck Generator",
    description:
      "Assemble a ProPresenter playlist from Planning Center, preview, and publish a handoff package to Drive.",
    href: "/slide-deck",
    status: "active",
  },
  {
    id: "messaging",
    name: "Team Messaging",
    description:
      "Sheet-backed reminders: headless draft to you, forward to the group; optional desktop post.",
    href: "/messaging",
    status: "active",
  },
  {
    id: "tasks",
    name: "Task Manager",
    description: "Track ministry ops tasks across teams and service weeks.",
    href: "/tasks",
    status: "coming_soon",
  },
  {
    id: "export",
    name: "Export Hub",
    description: "Dedicated exports for guides, decks, and handoff artifacts.",
    href: "/export",
    status: "coming_soon",
  },
];

export function getTool(id: string): ToolDefinition | undefined {
  return TOOLS.find((t) => t.id === id);
}
