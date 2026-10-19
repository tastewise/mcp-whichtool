import { memo, useEffect, useState, type SubmitEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router";
import { Button, Drawer, Field, ICON, IconButton, Input, Muted, SecHead } from "@/components/_ui";
import { PROVIDERS, setApiKeys, useApiKeys, type ApiKeys, type Provider } from "@/lib/api-keys";
import { useKeysPanel } from "./keys-panel.store";
import { useMachineKeys } from "./use-keys";

const LABEL: Record<Provider, { name: string; placeholder: string; prefix: string }> = {
  anthropic: { name: "Anthropic API key", placeholder: "sk-ant-…", prefix: "sk-ant-" },
  openai: { name: "OpenAI API key", placeholder: "sk-…", prefix: "sk-" },
};

// What a key looks like: the provider's prefix, then letters, digits, - and _, under 500 characters.
// Kept otherwise, it would fail every request after. Empty is fine: no key, or the machine's.
const SHAPE = /^[A-Za-z0-9_-]+$/;
function badKey(provider: Provider, typed: string | undefined): string {
  const key = typed?.trim() ?? "";
  const { name, prefix } = LABEL[provider];
  if (!key) return "";
  if (!key.startsWith(prefix)) return `An ${name} starts with ${prefix}.`;
  if (!SHAPE.test(key)) return `An ${name} has only letters, digits, - and _: no spaces.`;
  if (key.length > 500) return `An ${name} is under 500 characters.`;
  return "";
}

// The header's "API keys": the button says whether a test can run, the panel takes the keys.
function KeysPanel() {
  const keys = useApiKeys();
  const machine = useMachineKeys();
  const open = useKeysPanel((s) => s.open);
  const setOpen = useKeysPanel((s) => s.setOpen);
  useEffect(() => () => setOpen(false), [setOpen]);
  const ready = PROVIDERS.some((provider) => keys[provider] || machine.data?.[provider]);
  return (
    <>
      <Button variant="small" id="keys-open" data-ready={ready ? "yes" : "no"} onClick={() => setOpen(true)}
        title={ready ? "The keys the tests run with" : "Add an API key: a test asks a model, and the model needs one"}>
        <span className="keys-dot" aria-hidden="true" />{ready ? "API keys" : "Add an API key"}
      </Button>
      <Drawer id="keys-panel" labelledBy="keys-title" open={open} onClose={() => setOpen(false)}>
        {open ? <KeysForm keys={keys} machine={machine.data} onDone={() => setOpen(false)} /> : null}
      </Drawer>
    </>
  );
}

function KeysForm({ keys, machine, onDone }: { keys: ApiKeys; machine?: Record<Provider, boolean>; onDone: () => void }) {
  const client = useQueryClient();
  const [draft, setDraft] = useState<ApiKeys>(keys);
  const save = (next: ApiKeys) => {
    setApiKeys(next);
    // What a run would take, and whether it can, is read again with the keys it now has.
    void client.invalidateQueries({ queryKey: ["routing"] });
    onDone();
  };
  // Said once Save is pressed, under the key at fault; typing in it again clears it.
  const [invalid, setInvalid] = useState<Partial<Record<Provider, string>>>({});
  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const found = Object.fromEntries(PROVIDERS.map((provider) => [provider, badKey(provider, draft[provider])]).filter(([, why]) => why));
    setInvalid(found);
    if (!Object.keys(found).length) save(draft);
  };
  return (
    <form id="keys-form" onSubmit={submit}>
      <SecHead titleId="keys-title" right={<IconButton icon={ICON.close} join={false} aria-label="Close" title="Close" type="button" onClick={onDone} />}>API keys</SecHead>
      <Muted as="p" kind="desc" id="keys-privacy">
        Kept in this browser only, and never sent to us: a test sends them from your machine to Anthropic or OpenAI, nowhere else.{" "}
        <Link to="/docs/your-keys-and-your-tools" onClick={onDone}>How your keys and tools are handled</Link>
      </Muted>
      {PROVIDERS.map((provider) => (
        <Field key={provider} label={LABEL[provider].name}>
          <Input id={`key-${provider}`} type="password" autoComplete="off" spellCheck={false} placeholder={LABEL[provider].placeholder}
            aria-invalid={invalid[provider] ? true : undefined} aria-describedby={invalid[provider] ? `key-${provider}-invalid` : undefined}
            value={draft[provider] ?? ""} onChange={(event) => {
              setDraft({ ...draft, [provider]: event.target.value });
              if (invalid[provider]) setInvalid({ ...invalid, [provider]: "" });
            }} />
          {invalid[provider] ? <span className="err keys-invalid" id={`key-${provider}-invalid`} role="alert">{invalid[provider]}</span> : null}
          {machine?.[provider] && !draft[provider] ? <Muted kind="dim">This machine has one: leave empty to use it.</Muted> : null}
        </Field>
      ))}
      <div className="keys-actions">
        <Button type="submit" tone="primary" id="keys-save">Save</Button>
        {Object.keys(keys).length ? <Button type="button" variant="small" tone="danger" id="keys-forget" onClick={() => save({})}>Forget the keys</Button> : null}
      </div>
    </form>
  );
}

export default memo(KeysPanel);
