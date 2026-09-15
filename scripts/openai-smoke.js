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

const repairedDefectId = assignments["round-car"][0];
const repairedDefect = DEFECTS.find((defect) => defect.id === repairedDefectId);
const repairs = await selectRepairs([
  {
    id: "specific",
    tuningPrompt: `I found this exact problem: ${repairedDefect.label}`,
    defectIds: assignments["round-car"],
  },
  {
    id: "generic",
    tuningPrompt: "Car should be fully working",
    defectIds: assignments["moon-car"],
  },
], { provider: "openai" });

if (repairs.specific !== repairedDefectId) {
  throw new Error("OpenAI did not repair the specifically reported current defect.");
}
if (repairs.generic !== null) {
  throw new Error("A generic repair request unexpectedly removed a defect.");
}

console.log(JSON.stringify({
  model: process.env.OPENAI_MODEL || "gpt-5-nano",
  initialDefectCounts: Object.fromEntries(
    Object.entries(assignments).map(([id, defectIds]) => [id, defectIds.length]),
  ),
  roundWheelConstraintHonored: true,
  concreteRepairApplied: repairedDefectId,
  genericRepairApplied: false,
}, null, 2));
