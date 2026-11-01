"""A small MCP server for trying whichtool: a bookshop with seven tools.

Some descriptions are vague on purpose. `search_books` says almost nothing, `check_stock` and
`find_stores` both sound like "can I get it near me", and `list_genres` never says it answers
"do you sell cookbooks?". Those are the cases a model is most likely to send elsewhere: Claude
Haiku 5.5 sends that one to `search_books`, which finds no "cookbooks" in a title and answers no.
Fixing the descriptions from the console is the point of the demo.

    uv run --group dev python demo/server.py            # http://127.0.0.1:8000/mcp
"""

import argparse

from mcp.server.mcpserver import MCPServer

mcp = MCPServer("bookshop", instructions="A bookshop's catalogue, stock, shops and orders.")

BOOKS = {
    "middlemarch": {"title": "Middlemarch", "author": "George Eliot", "pages": 880, "price": 9.99,
                    "genre": "classics", "stock": {"Leeds": 3, "Lyon": 0}},
    "dune": {"title": "Dune", "author": "Frank Herbert", "pages": 688, "price": 11.50,
             "genre": "science fiction", "stock": {"Leeds": 0, "Lyon": 2}},
    "piranesi": {"title": "Piranesi", "author": "Susanna Clarke", "pages": 272, "price": 10.00,
                 "genre": "fantasy", "stock": {"Leeds": 1, "Lyon": 4}},
    "the left hand of darkness": {"title": "The Left Hand of Darkness", "author": "Ursula K. Le Guin",
                                  "pages": 304, "price": 9.50, "genre": "science fiction",
                                  "stock": {"Leeds": 2, "Lyon": 1}},
    "the sourdough school": {"title": "The Sourdough School", "author": "Vanessa Kimbell", "pages": 256,
                             "price": 22.00, "genre": "food and drink", "stock": {"Leeds": 5, "Lyon": 0}},
}
STORES = [
    {"city": "Leeds", "address": "12 Briggate", "hours": "Mon–Sat 9–18, Sun 11–17"},
    {"city": "Lyon", "address": "4 rue Mercière", "hours": "Mon–Sat 10–19, closed Sunday"},
]
ORDERS = {"4411": "shipped on Monday, arriving Thursday", "4412": "waiting for Dune to come back in stock"}


def _book(title: str) -> dict | None:
    return BOOKS.get(title.strip().lower())


@mcp.tool(name="search_books", title="Search the catalogue", description="Search the catalogue.")
def search_books(query: str) -> list[dict]:
    words = query.lower().split()
    return [{"title": b["title"], "author": b["author"]} for b in BOOKS.values()
            if any(w in f"{b['title']} {b['author']} {b['genre']}".lower() for w in words)]


@mcp.tool(name="recommend_books", title="Recommend books",
          description="Suggest books a reader might like, from a title or a genre they enjoyed.")
def recommend_books(liked: str) -> list[str]:
    found = _book(liked)
    genre = found["genre"] if found else liked.lower()
    return [b["title"] for b in BOOKS.values() if b["genre"] == genre and b is not found]


@mcp.tool(name="get_book", title="Book details", description="Details of one book: author, pages, price and genre.")
def get_book(title: str) -> dict:
    found = _book(title)
    return {k: v for k, v in found.items() if k != "stock"} if found else {"error": f"no book called {title}"}


@mcp.tool(name="list_genres", title="Genres", description="The genres the shop shelves books under.")
def list_genres() -> list[str]:
    return sorted({b["genre"] for b in BOOKS.values()})


@mcp.tool(name="check_stock", title="Stock", description="Whether a book is available.")
def check_stock(title: str, city: str = "") -> dict:
    found = _book(title)
    if not found:
        return {"error": f"no book called {title}"}
    return {city: found["stock"].get(city, 0)} if city else found["stock"]


@mcp.tool(name="find_stores", title="Shops and hours", description="Bookshops near a city, with their opening hours.")
def find_stores(city: str = "") -> list[dict]:
    return [s for s in STORES if not city or s["city"].lower() == city.lower()]


@mcp.tool(name="track_order", title="Order status", description="Where an order is, by its number.")
def track_order(order: str) -> str:
    return ORDERS.get(order.strip().lstrip("#"), f"no order {order}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--port", type=int, default=8000)
    args = parser.parse_args()
    mcp.run("streamable-http", host="127.0.0.1", port=args.port)
