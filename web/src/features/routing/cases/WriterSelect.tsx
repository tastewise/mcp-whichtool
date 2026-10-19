import { memo } from "react";
import { Muted } from "@/components/_ui";
import { useKeysPanel } from "@/features/keys/keys-panel.store";
import { useMachineKeys } from "@/features/keys/use-keys";
import { useApiKeys, type Provider } from "@/lib/api-keys";
import { useRoutingStore } from "@/stores/routing.store";
import ModelSelect from "../run/ModelSelect";

// As models.provider_of on the server: "claude-" is Anthropic, anything else OpenAI.
const providerOf = (model: string): Provider => (model.startsWith("claude-") ? "anthropic" : "openai");
const NAME: Record<Provider, string> = { anthropic: "Anthropic", openai: "OpenAI" };

// The model that writes tests: the one picked, else a model the user holds a key for, Claude first.
export function useWriter(): { model: string; keyed: boolean } {
  const picked = useRoutingStore((s) => s.writer);
  const keys = useApiKeys();
  const machine = useMachineKeys().data;
  const has = (provider: Provider) => Boolean(keys[provider] || machine?.[provider]);
  const model = picked || (has("anthropic") || !has("openai") ? "claude-opus-5-5" : "gpt-6-sol");
  return { model, keyed: has(providerOf(model)) };
}

// "Written by [model]", then what is missing when its provider has no key. The link keeps its place
// when hidden, and the select a fixed width: a key added, or another model picked, moves nothing.
function WriterSelect({ id }: { id: string }) {
  const { model, keyed } = useWriter();
  const setWriter = useRoutingStore((s) => s.setWriter);
  const openKeys = useKeysPanel((s) => s.setOpen);
  return (
    <div className="writer-select">
      <Muted kind="dim">Written by</Muted>
      <ModelSelect id={id} value={model} onChange={setWriter} />
      <button type="button" className="linklike writer-key" data-keyed={keyed ? "yes" : undefined}
        aria-hidden={keyed || undefined} tabIndex={keyed ? -1 : undefined}
        onClick={() => openKeys(true)}>{`Add an ${NAME[providerOf(model)]} key`}</button>
    </div>
  );
}

export default memo(WriterSelect);
