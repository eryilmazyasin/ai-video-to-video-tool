"use client";

import { useEffect, useRef, useState } from "react";

import type { CustomSelectProps } from "@/components/CustomSelect/CustomSelect.types";

export default function CustomSelect<Value extends string>({
  id,
  name,
  value,
  options,
  onValueChange,
  disabled = false,
}: CustomSelectProps<Value>) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const selectedIndex = Math.max(0, options.findIndex((option) => option.value === value));
  const selectedOption = options[selectedIndex];
  const listboxId = `${id}-listbox`;

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [isOpen]);

  function openListbox() {
    setActiveIndex(selectedIndex);
    setIsOpen(true);
  }

  function selectOption(optionIndex: number) {
    const option = options[optionIndex];

    if (!option) {
      return;
    }

    onValueChange(option.value);
    setIsOpen(false);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    // Keep the main keyboard controls familiar for native select users.
    if (event.key === "Escape") {
      setIsOpen(false);
      return;
    }

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();

      if (!isOpen) {
        openListbox();
        return;
      }

      const direction = event.key === "ArrowDown" ? 1 : -1;
      setActiveIndex((currentIndex) =>
        (currentIndex + direction + options.length) % options.length,
      );
      return;
    }

    if ((event.key === "Enter" || event.key === " ") && isOpen) {
      event.preventDefault();
      selectOption(activeIndex);
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <input type="hidden" name={name} value={value} />
      <button
        id={id}
        type="button"
        role="combobox"
        aria-controls={listboxId}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        disabled={disabled}
        onClick={() => (isOpen ? setIsOpen(false) : openListbox())}
        onKeyDown={handleKeyDown}
        className={`flex w-full items-center justify-between gap-3 rounded-xl border bg-white px-3.5 py-3 text-left text-sm text-slate-800 shadow-sm outline-none transition focus:border-violet-400 focus:ring-3 focus:ring-violet-100 disabled:cursor-not-allowed disabled:bg-slate-100 ${isOpen ? "border-violet-300 ring-3 ring-violet-100" : "border-slate-200 hover:border-slate-300"}`}
      >
        <span className="truncate">{selectedOption?.label ?? value}</span>
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" className={`size-4 shrink-0 text-slate-400 transition-transform ${isOpen ? "rotate-180" : ""}`} aria-hidden="true">
          <path d="m6 8 4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {isOpen && (
        <ul
          id={listboxId}
          role="listbox"
          aria-labelledby={id}
          className="absolute z-30 mt-2 max-h-60 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-[0_18px_36px_rgb(0_0_0_/_42%)]"
        >
          {options.map((option, optionIndex) => {
            const isSelected = option.value === value;
            const isActive = optionIndex === activeIndex;

            return (
              <li key={option.value} role="none">
                <button
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onMouseEnter={() => setActiveIndex(optionIndex)}
                  onClick={() => selectOption(optionIndex)}
                  className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition ${isSelected ? "bg-violet-50 font-medium text-violet-800" : isActive ? "bg-slate-50 text-slate-900" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"}`}
                >
                  <span className="truncate">{option.label}</span>
                  {isSelected && (
                    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" className="size-4 shrink-0 text-violet-600" aria-hidden="true">
                      <path d="m5.5 10 3 3 6-6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
