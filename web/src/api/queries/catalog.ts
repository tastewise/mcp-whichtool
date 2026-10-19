import { useQuery } from "@tanstack/react-query";
import { registerToolTitles } from "@/lib/tool-label";
import { keys } from "../keys";
import { getCatalog } from "../endpoints/catalog";

// Reading the catalogue also registers the server's tool titles, for every label on the page.
const readCatalog = async () => {
  const catalog = await getCatalog();
  registerToolTitles(catalog.tools);
  return catalog;
};

export function useCatalog(enabled: boolean) {
  return useQuery({ queryKey: keys.catalog, queryFn: readCatalog, enabled });
}
