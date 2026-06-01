import { useEffect, useState } from "react";
import { useInput } from "ink";

type Options = {
  isActive: boolean;
  count: number;
  onReload?: (force?: boolean) => void;
  onOpenMenu?: () => void;
};

export function useListDetailNav({ isActive, count, onReload, onOpenMenu }: Options) {
  const [index, setIndex] = useState(0);
  const [prevIndex, setPrevIndex] = useState<number | null>(null);
  const [detail, setDetail] = useState(false);

  const moveTo = (next: number) => {
    const clamped = Math.max(0, Math.min(count - 1, next));
    setPrevIndex(index);
    setIndex(clamped);
  };

  useEffect(() => {
    setIndex(0);
    setPrevIndex(null);
    setDetail(false);
  }, [count]);

  useEffect(() => {
    if (index >= count && count > 0) {
      setIndex(count - 1);
    }
  }, [index, count]);

  useInput(
    (input, key) => {
      if (!isActive || count === 0) {
        if (input === "r" && onReload) onReload(true);
        return;
      }

      if (input === "r" && onReload) {
        onReload(true);
        return;
      }

      if (detail) {
        if (key.escape || input === "b") {
          setDetail(false);
          return;
        }
        if (key.upArrow) {
          moveTo(index - 1);
          return;
        }
        if (key.downArrow) {
          moveTo(index + 1);
          return;
        }
        return;
      }

      if (key.escape || input === "m") {
        onOpenMenu?.();
        return;
      }

      if (key.upArrow) {
        moveTo(index - 1);
        return;
      }
      if (key.downArrow) {
        moveTo(index + 1);
        return;
      }
      if (key.return || input === " ") {
        setDetail(true);
      }
    },
    { isActive },
  );

  return { index, prevIndex, detail, setDetail };
}
