import { createBrowserRouter } from "react-router";
import DocsPage from "@/pages/DocsPage";
import RoutingPage from "@/pages/RoutingPage";
import ScanPage from "@/pages/ScanPage";

export const router = createBrowserRouter([
  { path: "/", element: <ScanPage /> },
  { path: "/routing", element: <RoutingPage /> },
  { path: "/docs", element: <DocsPage /> },
  { path: "/docs/:slug", element: <DocsPage /> },
]);
