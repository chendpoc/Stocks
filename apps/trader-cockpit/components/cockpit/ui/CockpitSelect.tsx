"use client";

import { ListBox, Select } from "@heroui/react";
import { Check, ChevronDown } from "lucide-react";
import type { Key } from "react";

export type CockpitSelectOption<T extends string> = {
  value: T;
  label: string;
};

type CockpitSelectProps<T extends string> = {
  value: T;
  options: CockpitSelectOption<T>[];
  ariaLabel: string;
  onChange: (value: T) => void;
  className?: string;
  isDisabled?: boolean;
};

export function CockpitSelect<T extends string>({
  value,
  options,
  ariaLabel,
  onChange,
  className,
  isDisabled,
}: CockpitSelectProps<T>) {
  function handleSelectionChange(key: Key | null) {
    if (key === null) return;
    onChange(String(key) as T);
  }

  return (
    <Select
      aria-label={ariaLabel}
      className={className}
      fullWidth
      isDisabled={isDisabled}
      selectedKey={value}
      onSelectionChange={handleSelectionChange}
    >
      <Select.Trigger className="h-10 min-w-0 rounded-md border border-border bg-background/70 px-3 text-xs text-foreground disabled:cursor-not-allowed disabled:opacity-50">
        <Select.Value className="min-w-0 flex-1 truncate text-left" />
        <Select.Indicator>
          <ChevronDown className="h-3.5 w-3.5 text-muted" />
        </Select.Indicator>
      </Select.Trigger>
      <Select.Popover className="z-[80] min-w-[var(--trigger-width)] rounded-md border border-border bg-surface p-1 shadow-xl shadow-black/20">
        <ListBox aria-label={ariaLabel} className="max-h-72 overflow-y-auto">
          {options.map((option) => (
            <ListBox.Item
              key={option.value}
              id={option.value}
              textValue={option.label}
              className="flex cursor-pointer items-center justify-between gap-3 rounded px-2 py-2 text-xs text-foreground outline-none hover:bg-surface-secondary data-[focused]:bg-surface-secondary data-[selected]:bg-accent/10 data-[selected]:text-accent"
            >
              <span className="min-w-0 truncate">{option.label}</span>
              <ListBox.ItemIndicator>
                <Check className="h-3.5 w-3.5" />
              </ListBox.ItemIndicator>
            </ListBox.Item>
          ))}
        </ListBox>
      </Select.Popover>
    </Select>
  );
}
