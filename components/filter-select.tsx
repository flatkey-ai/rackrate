"use client";

import { useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";

type SelectOption = { value: string; label: string; description?: string };

export function FilterSelect({ label, value, options: suppliedOptions, onChange }: {
  label: string;
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
}) {
  const options = suppliedOptions.some((option) => option.value === value) ? suppliedOptions : [...suppliedOptions, { value, label: `Selected: ${value}`, description: "No current matching option" }];
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const search = useRef({ text: "", time: 0 });
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [placement, setPlacement] = useState({ side: "bottom", height: 320 });
  const selected = Math.max(0, options.findIndex((option) => option.value === value));

  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false);
    };
    const resize = () => setOpen(false);
    document.addEventListener("pointerdown", dismiss);
    window.addEventListener("resize", resize);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      window.removeEventListener("resize", resize);
    };
  }, [open]);

  useEffect(() => {
    if (open) menu.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  function show(index = selected) {
    const bounds = trigger.current?.getBoundingClientRect();
    if (bounds) {
      const below = window.innerHeight - bounds.bottom - 16;
      const above = bounds.top - 90;
      const side = below < 240 && above > below ? "top" : "bottom";
      setPlacement({ side, height: Math.max(100, Math.min(320, side === "top" ? above : below)) });
    }
    search.current = { text: "", time: 0 };
    setActive(index);
    setOpen(true);
  }

  function choose(index: number) {
    if (options[index].value !== value) onChange(options[index].value);
    setOpen(false);
    trigger.current?.focus({ preventScroll: true });
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "Tab") { setOpen(false); return; }
    if (event.key === "Escape") {
      if (open) { event.preventDefault(); event.stopPropagation(); setOpen(false); }
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (open) choose(active); else show();
      return;
    }
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      const next = event.key === "Home" ? 0 : event.key === "End" ? options.length - 1
        : Math.max(0, Math.min(options.length - 1, (open ? active : selected) + (event.key === "ArrowDown" ? 1 : -1)));
      if (open) setActive(next); else show(next);
      return;
    }
    if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      const now = Date.now();
      const text = now - search.current.time < 700 ? search.current.text + event.key.toLowerCase() : event.key.toLowerCase();
      const term = new Set(text).size === 1 ? text[0] : text;
      const start = open ? active : selected;
      const match = options.findIndex((_, offset) => options[(start + 1 + offset) % options.length].label.toLowerCase().startsWith(term));
      if (match !== -1) {
        const index = (start + 1 + match) % options.length;
        if (open) setActive(index); else show(index);
      }
      search.current = { text, time: now };
    }
  }

  return (
    <div ref={root} className={`filter-select${open ? " is-open" : ""}`} style={{ "--select-menu-height": `${placement.height}px` } as CSSProperties}
      onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
      <span className="filter-label" id={`${id}-label`}>{label}</span>
      <button ref={trigger} type="button" className="filter-select-trigger" role="combobox" aria-haspopup="listbox"
        aria-expanded={open} aria-controls={open ? `${id}-menu` : undefined} aria-labelledby={`${id}-label ${id}-value`}
        aria-activedescendant={open ? `${id}-option-${active}` : undefined}
        onClick={() => { if (open) setOpen(false); else show(); }} onKeyDown={handleKeyDown}>
        <span id={`${id}-value`}>{options[selected].label}</span>
        <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5 7.5 5 5 5-5" /></svg>
      </button>
      {open && (
        <div ref={menu} id={`${id}-menu`} role="listbox" aria-labelledby={`${id}-label`} className="filter-select-menu" data-side={placement.side}>
          {options.map((option, index) => (
            <div key={option.value} id={`${id}-option-${index}`} role="option" aria-selected={option.value === value}
              data-active={index === active} className="filter-select-option"
              onPointerMove={(event) => { if (event.pointerType === "mouse") setActive(index); }}
              onMouseDown={(event) => event.preventDefault()} onClick={() => choose(index)}>
              <span><span className="filter-option-title">{option.label}</span>{option.description && <small>{option.description}</small>}</span>
              <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m4.5 10 3.5 3.5 7.5-7.5" /></svg>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
