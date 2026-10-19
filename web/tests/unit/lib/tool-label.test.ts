import { describe, expect, it } from "vitest";
import { registerToolTitles, toolTitle } from "@/lib/tool-label";

describe("toolTitle", () => {
  it("uses the title the server declares", () => {
    registerToolTitles([{ name: "search_books", title: "Search the catalogue" }, { name: "get_book", title: "get_book" }]);
    expect(toolTitle("search_books")).toBe("Search the catalogue");
    expect(toolTitle("get_book")).toBe("Get book");
  });
  it("humanises an unknown name", () => expect(toolTitle("my_new_tool")).toBe("My new tool"));
  it("is empty for nothing", () => expect(toolTitle("")).toBe(""));
});
