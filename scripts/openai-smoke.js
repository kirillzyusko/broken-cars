import { DEFECTS, selectDefects, selectRepairs } from "../server/defects.js";

if (!process.env.OPENAI_API_KEY) {
  throw new Error("OPENAI_API_KEY is missing. Put it in the gitignored .env file.");
}

const players = [
  {
    id: "round-car",
    prompt: "A red rally car with round wheels. The wheels must stay round.",
  },
  { id: "moon-car", prompt: "A tiny moon buggy" },
];

const assignments = await selectDefects(players, { provider: "openai" });
for (const defectIds of Object.values(assignments)) {
  if (defectIds.length < 3 || defectIds.length > 4) {
    throw new Error("OpenAI did not assign three or four defects.");
  }
}
if (
  assignments["round-car"].includes("no_wheels")
  || assignments["round-car"].includes("square_wheels")
) {
  throw new Error("OpenAI violated the explicit round-wheel requirement.");
}

const repairedDefectIds = assignments["round-car"].slice(0, 2);
const repairedDefects = repairedDefectIds.map((id) =>
  DEFECTS.find((defect) => defect.id === id));
const repairs = await selectRepairs([
  {
    id: "specific",
    tuningPrompt: `I found these exact problems: ${repairedDefects.map((defect) => defect.label).join("; ")}`,
    defectIds: assignments["round-car"],
  },
  {
    id: "generic",
    tuningPrompt: "Car should be fully working",
    defectIds: assignments["moon-car"],
  },
], { provider: "openai" });

if (
  repairs.specific.length !== repairedDefectIds.length
  || repairedDefectIds.some((id) => !repairs.specific.includes(id))
) {
  throw new Error("OpenAI did not repair every specifically reported current defect.");
}
if (repairs.generic.length !== 0) {
  throw new Error("A generic repair request unexpectedly removed a defect.");
}

console.log(JSON.stringify({
  model: process.env.OPENAI_MODEL || "gpt-5-nano",
  initialDefectCounts: Object.fromEntries(
    Object.entries(assignments).map(([id, defectIds]) => [id, defectIds.length]),
  ),
  roundWheelConstraintHonored: true,
  concreteRepairsApplied: repairedDefectIds,
  genericRepairApplied: false,
}, null, 2));
