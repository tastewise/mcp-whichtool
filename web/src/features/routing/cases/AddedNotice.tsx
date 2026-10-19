import { memo } from "react";
import { ICON, IconButton } from "@/components/_ui";
import { useRoutingStore } from "@/stores/routing.store";

// The foot of the Add test drawer after an add: the drawer stays open for the next test.
function AddedNotice() {
  const added = useRoutingStore((s) => s.addedTests);
  const clearAdded = useRoutingStore((s) => s.clearAdded);
  if (!added) return null;
  return (
    <div id="case-added" role="status">
      <strong>{`✓ ${added} test${added > 1 ? "s" : ""} added to the library.`}</strong>
      <span>Saved in the cases file.</span>
      <IconButton id="case-added-close" icon={ICON.close} join={false} aria-label="Dismiss" title="Dismiss" onClick={clearAdded} />
    </div>
  );
}

export default memo(AddedNotice);
