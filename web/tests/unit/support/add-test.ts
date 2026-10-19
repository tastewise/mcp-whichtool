import { fireEvent, screen, waitFor } from "@testing-library/react";
import { expect } from "vitest";
import { pickOption } from "./select";

// From the library to the page that adds tests, then a test by hand for `tool`, in the drawer.
export async function openAddTest(tool: string) {
  fireEvent.click(await screen.findByRole("button", { name: /Add tests|Back to the proposals/ }));
  fireEvent.click(await screen.findByRole("button", { name: "Add a test" }));
  await waitFor(() => expect(document.getElementById("case-dialog")!.hasAttribute("open")).toBe(true));
  await pickOption("case-tool", tool);
}
