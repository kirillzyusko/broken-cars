import { randomInt, randomUUID } from "node:crypto";

export const DEFECTS = Object.freeze([
  {
    id: "no_wheels",
    label: "No wheels",
    description: "Bare hubs create huge drag and cap the car at a crawl.",
  },
  {
    id: "square_wheels",
    label: "Square wheels",
    description: "Every rotation costs speed and makes the car bounce.",
  },
  {
    id: "loose_wheel",
    label: "Loose wheel screw",
    description: "The car wobbles from side to side as speed rises.",
  },
  {
    id: "no_engine",
    label: "No engine",
    description: "The accelerator has nothing to accelerate.",
  },
  {
    id: "no_brakes",
    label: "No brakes",
    description: "The brake control does not slow the car down.",
  },
  {
    id: "no_cooling",
    label: "No engine cooling",
    description: "Full throttle builds heat until engine power fades.",
  },
  {
    id: "no_steering",
    label: "No steering wheel",
    description: "Left and right controls do nothing.",
  },
  {
    id: "no_seatbelt",
    label: "No seatbelt",
    description: "Hard turns make the driver lift off the accelerator.",
  },
]);

const DEFECT_IDS = new Set(DEFECTS.map((defect) => defect.id));
const INCOMPATIBLE_PAIRS = [
  new Set(["no_wheels", "square_wheels"]),
  new Set(["no_engine", "no_cooling"]),
];

function isCompatible(ids) {
  return INCOMPATIBLE_PAIRS.every(
    (pair) => ![...pair].every((id) => ids.includes(id)),
  );
}

function localSelection() {
  const count = randomInt(1, 3);
  const selected = [];

  while (selected.length < count) {
    const candidate = DEFECTS[randomInt(DEFECTS.length)].id;
    const next = [...selected, candidate];
    if (!selected.includes(candidate) && isCompatible(next)) {
      selected.push(candidate);
    }
  }

  return selected;
}

function validSelection(value) {
  return (
    Array.isArray(value) &&
    value.length >= 1 &&
    value.length <= 2 &&
    new Set(value).size === value.length &&
    value.every((id) => DEFECT_IDS.has(id)) &&
    isCompatible(value)
  );
}

function extractOutputText(response) {
  if (typeof response.output_text === "string") return response.output_text;

  for (const item of response.output ?? []) {
    for (const content of item.content ?? []) {
      if (content.type === "output_text" && typeof content.text === "string") {
        return content.text;
      }
    }
  }

  throw new Error("The model response did not contain output text.");
}

async function selectWithOpenAI(players) {
  const model = process.env.OPENAI_MODEL;
  if (!process.env.OPENAI_API_KEY || !model) {
    throw new Error("OPENAI_API_KEY and OPENAI_MODEL are required for OpenAI selection.");
  }

  const allowedIds = DEFECTS.map((defect) => defect.id);
  const schema = {
    type: "object",
    properties: {
      assignments: {
        type: "array",
        minItems: players.length,
        maxItems: players.length,
        items: {
          type: "object",
          properties: {
            playerId: { type: "string", enum: players.map((player) => player.id) },
            defectIds: {
              type: "array",
              minItems: 1,
              maxItems: 2,
              uniqueItems: true,
              items: { type: "string", enum: allowedIds },
            },
          },
          required: ["playerId", "defectIds"],
          additionalProperties: false,
        },
      },
    },
    required: ["assignments"],
    additionalProperties: false,
  };

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      store: false,
      temperature: 1.2,
      instructions:
        "You are the chaos mechanic for a party racing game. Randomly assign one or two compatible broken parts to every car. Return every player exactly once. Never pair no_wheels with square_wheels or no_engine with no_cooling.",
      input: JSON.stringify({
        randomNonce: randomUUID(),
        cars: players.map(({ id, prompt }) => ({ playerId: id, prompt })),
      }),
      text: {
        format: {
          type: "json_schema",
          name: "broken_car_assignments",
          strict: true,
          schema,
        },
      },
    }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    throw new Error(`OpenAI returned ${response.status}.`);
  }

  const payload = JSON.parse(extractOutputText(await response.json()));
  const byPlayer = new Map(
    payload.assignments.map((assignment) => [assignment.playerId, assignment.defectIds]),
  );

  if (
    byPlayer.size !== players.length ||
    players.some((player) => !validSelection(byPlayer.get(player.id)))
  ) {
    throw new Error("OpenAI returned an invalid defect assignment.");
  }

  return Object.fromEntries(byPlayer);
}

export function getSelectorName() {
  return process.env.LLM_PROVIDER === "openai" ? "OpenAI" : "Local randomizer";
}

export async function selectDefects(players) {
  if (process.env.LLM_PROVIDER === "openai") {
    try {
      return await selectWithOpenAI(players);
    } catch (error) {
      console.warn(`AI defect selection failed; using local randomizer. ${error.message}`);
    }
  }

  return Object.fromEntries(players.map((player) => [player.id, localSelection()]));
}

export const defectTestUtils = { isCompatible, validSelection };
