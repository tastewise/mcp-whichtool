import { memo, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Popover } from "radix-ui";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";
import Tip from "./Tip";

export const selectVariants = cva("connector select-trigger", {
  variants: { kind: { plain: "" } },
  defaultVariants: { kind: "plain" },
});

export interface SelectOption { value: string; label: string; hint?: string; group?: string; disabled?: boolean }

export type SelectProps = VariantProps<typeof selectVariants> & {
  id?: string;
  value: string;
  options: SelectOption[];
  onValueChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  "aria-label"?: string;
  disabled?: boolean;
  // The tooltip: on a disabled select, what would enable it.
  title?: string;
  className?: string;
};

type Section = { group: string | undefined; items: SelectOption[] };

// Groups keep the order their first option comes in; the search reads label, hint, value and group.
function sectionsOf(options: SelectOption[], query: string): Section[] {
  const needle = query.trim().toLowerCase();
  const sections: Section[] = [];
  for (const option of options) {
    const haystack = [option.label, option.hint, option.value, option.group].filter(Boolean).join(" ").toLowerCase();
    if (needle && !haystack.includes(needle)) continue;
    const last = sections.at(-1);
    if (last && last.group === option.group) last.items.push(option);
    else sections.push({ group: option.group, items: [option] });
  }
  return sections;
}

// Radix Popover with a search box and a listbox; portalled into the open <dialog>, whose top layer hides the body.
function Select({ kind, id, value, options, onValueChange, placeholder = "Choose…", searchPlaceholder = "Search", disabled, title, className, ...aria }: SelectProps) {
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [container, setContainer] = useState<HTMLElement | null>(null);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(-1);
  const sections = useMemo(() => sectionsOf(options, query), [options, query]);
  const flat = useMemo(() => sections.flatMap((s) => s.items), [sections]);
  const current = options.find((o) => o.value === value);
  const listId = `${id ?? "select"}-list`;

  const onOpenChange = (next: boolean) => {
    if (next) {
      setContainer(trigger.current?.closest("dialog") ?? null);
      setQuery("");
      setActive(Math.max(0, options.findIndex((o) => o.value === value)));
    }
    setOpen(next);
  };
  const choose = (option: SelectOption | undefined) => {
    if (!option || option.disabled) return;
    setOpen(false);
    if (option.value !== value) onValueChange(option.value);
  };
  const move = (delta: number) => {
    if (!flat.some((o) => !o.disabled)) return;
    let next = active;
    do next = (next + delta + flat.length) % flat.length; while (flat[next]!.disabled);
    setActive(next);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") { event.preventDefault(); move(1); }
    else if (event.key === "ArrowUp") { event.preventDefault(); move(-1); }
    else if (event.key === "Enter") { event.preventDefault(); choose(flat[active]); }
  };

  let index = -1;
  return (
    <Popover.Root open={open} onOpenChange={onOpenChange} modal={false}>
      <Tip content={title}><Popover.Trigger asChild disabled={disabled}>
        <button ref={trigger} type="button" id={id} className={cn(selectVariants({ kind }), className)} role="combobox"
          aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? listId : undefined} data-value={value} {...aria}>
          <span className={current ? "select-value" : "select-value select-placeholder"}>{current?.label ?? placeholder}</span>
          {current?.hint ? <span className="select-hint">{current.hint}</span> : null}
          <svg className="select-chevron" width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 6l4 4 4-4" /></svg>
        </button>
      </Popover.Trigger></Tip>
      <Popover.Portal container={container}>
        <Popover.Content className="select-menu" align="start" sideOffset={4} collisionPadding={8}
          onCloseAutoFocus={(event) => { event.preventDefault(); trigger.current?.focus(); }}>
          <input className="select-search" type="search" value={query} placeholder={searchPlaceholder} aria-label={searchPlaceholder}
            role="searchbox" aria-controls={listId} autoComplete="off" spellCheck={false}
            aria-activedescendant={active >= 0 && flat[active] ? `${listId}-${active}` : undefined}
            onChange={(event) => { setQuery(event.target.value); setActive(0); }} onKeyDown={onKeyDown} />
          <div className="select-list" id={listId} role="listbox" aria-label={aria["aria-label"]}>
            {flat.length ? sections.map((section, s) => (
              <div key={section.group ?? `_${s}`} role="group" aria-label={section.group}>
                {section.group ? <div className="select-group" aria-hidden="true">{section.group}</div> : null}
                {section.items.map((option) => {
                  const at = ++index;
                  return (
                    <div key={option.value} id={`${listId}-${at}`} role="option" aria-selected={option.value === value} aria-disabled={option.disabled || undefined}
                      className={cn("select-option", at === active && "active")} data-value={option.value}
                      ref={(node) => { if (node && at === active) node.scrollIntoView?.({ block: "nearest" }); }}
                      onMouseMove={() => { if (!option.disabled && at !== active) setActive(at); }}
                      onMouseDown={(event) => event.preventDefault()} onClick={() => choose(option)}>
                      <span className="select-option-label">{option.label}</span>
                      {option.hint ? <span className="select-hint">{option.hint}</span> : null}
                      {option.value === value ? <svg className="select-check" width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 8.5l3.2 3L13 5" /></svg> : null}
                    </div>
                  );
                })}
              </div>
            )) : <div className="select-empty">No match</div>}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

export default memo(Select);
