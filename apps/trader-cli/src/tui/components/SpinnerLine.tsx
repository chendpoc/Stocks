import React, { useEffect, useState } from "react";
import { Text } from "ink";

const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧"];

type Props = {
  active: boolean;
  label?: string;
};

export function SpinnerLine({ active, label = "处理中" }: Props) {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setFrame((f) => (f + 1) % FRAMES.length), 120);
    return () => clearInterval(id);
  }, [active]);

  if (!active) return null;
  return (
    <Text color="yellow">
      {FRAMES[frame]} {label}…
    </Text>
  );
}
