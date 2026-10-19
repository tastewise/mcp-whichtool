import { fireEvent, screen, waitFor } from "@testing-library/react";

// What an element's tooltip says when the pointer rests on it; the tip is closed again after.
export async function tipOf(el: Element): Promise<string> {
  // A disabled control lets the pointer through to the span that carries its tip.
  const target = el.closest(".tip-anchor") ?? el;
  fireEvent.pointerMove(target);
  const text = (await screen.findByRole("tooltip")).textContent ?? "";
  fireEvent.keyDown(document, { key: "Escape" });
  // The pointer leaves too: the next rest on the same element opens it again.
  fireEvent.pointerLeave(target);
  await waitFor(() => { if (screen.queryByRole("tooltip")) throw new Error("tip still open"); });
  return text;
}
