import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";

// Every page's header asks which keys this machine has: a test about something else gets "one for Anthropic".
export const server = setupServer(http.get("/api/keys", () => HttpResponse.json({ anthropic: true, openai: false })));
