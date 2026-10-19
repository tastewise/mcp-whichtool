import { fireEvent, waitFor } from "@testing-library/react";
import { expect } from "vitest";

// The Select is a Radix Popover: open it from its trigger, read or click its options, as a user would.
export async function openSelect(id: string): Promise<HTMLElement> {
  fireEvent.click(document.getElementById(id)!);
  return waitFor(() => document.getElementById(`${id}-list`)!);
}

export async function optionsOf(id: string): Promise<string[]> {
  const list = await openSelect(id);
  const texts = [...list.querySelectorAll('[role="option"]')].map((option) => {
    const hint = option.querySelector(".select-hint")?.textContent;
    const label = option.querySelector(".select-option-label")!.textContent!;
    return hint ? `${label} (${hint})` : label;
  });
  fireEvent.click(document.getElementById(id)!);
  await waitFor(() => expect(document.getElementById(`${id}-list`)).toBeNull());
  return texts;
}

export async function pickOption(id: string, value: string): Promise<void> {
  const list = await openSelect(id);
  fireEvent.click(list.querySelector(`[data-value="${CSS.escape(value)}"]`)!);
  await waitFor(() => expect(document.getElementById(`${id}-list`)).toBeNull());
}

export const selectValue = (id: string) => document.getElementById(id)!.getAttribute("data-value");
