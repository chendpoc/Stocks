"use client";

import { useState } from "react";
import { AgentPanel } from "./AgentPanel";
import { DataSourcePanel } from "./DataSourcePanel";
import { OpportunityBoard } from "./OpportunityBoard";

function currentBeijingDay() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function ResearchWorkspace() {
  const [day, setDay] = useState(currentBeijingDay);

  return (
    <>
      <DataSourcePanel />
      <OpportunityBoard day={day} onDayChange={setDay} />
      <AgentPanel day={day} onDayChange={setDay} />
    </>
  );
}
