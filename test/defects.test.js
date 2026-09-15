import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_OPENAI_MODEL,
  DEFECT_SEVERITIES,
  DEFECTS,
  defectTestUtils,
  selectDefects,
  selectRepairs,
} from "../server/defects.js";

const EXPECTED_DEFECT_IDS = [
  "no_wheels",
  "square_wheels",
  "loose_wheel",
  "no_engine",
  "no_brakes",
  "no_cooling",
  "no_steering",
  "no_seatbelt",
  "swapped_pedals",
  "reversed_steering",
  "one_way_steering",
  "backwards_engine",
  "bad_engine_power",
  "stuck_accelerator",
  "no_grip",
  "sideways_wheels",
];

const EXPECTED_DEFECTS_BY_SEVERITY = {
  fatal: ["no_wheels", "no_engine", "sideways_wheels"],
  critical: ["no_steering", "one_way_steering", "backwards_engine", "no_grip"],
  annoying: [
    "square_wheels",
    "loose_wheel",
    "no_brakes",
    "no_cooling",
    "no_seatbelt",
    "swapped_pedals",
    "reversed_steering",
    "bad_engine_power",
    "stuck_accelerator",
  ],
};

test("the defect catalog contains the complete demo list", () => {
  assert.deepEqual(DEFECTS.map((defect) => defect.id), EXPECTED_DEFECT_IDS);
  assert.deepEqual(DEFECT_SEVERITIES, ["fatal", "critical", "annoying"]);
  assert.deepEqual(
    Object.fromEntries(DEFECT_SEVERITIES.map((severity) => [
      severity,
      DEFECTS.filter((defect) => defect.severity === severity).map((defect) => defect.id),
    ])),
    EXPECTED_DEFECTS_BY_SEVERITY,
  );
});

test("round-wheel requirements are hard constraints", () => {
  for (const prompt of [
    "A rally car whose wheels must be round",
    "Машина с круглыми колёсами",
  ]) {
    const avoided = defectTestUtils.explicitPromptAvoidances(prompt);
    assert.equal(avoided.has("square_wheels"), true);
    assert.equal(avoided.has("no_wheels"), true);
  }
});

test("local assignments return one defect per severity and avoid repeats while possible", async () => {
  const players = Array.from({ length: 2 }, (_, index) => ({
    id: `player-${index}`,
    prompt: index === 0 ? "A car with round wheels" : `Car ${index}`,
  }));
  const assignments = await selectDefects(players, { provider: "local" });
  const selected = Object.values(assignments).flat();

  assert.equal(new Set(selected).size, selected.length);
  assert.equal(assignments["player-0"].includes("square_wheels"), false);
  assert.equal(assignments["player-0"].includes("no_wheels"), false);
  for (const ids of Object.values(assignments)) {
    assert.equal(ids.length, 3);
    assert.deepEqual(
      new Set(ids.map((id) => DEFECTS.find((defect) => defect.id === id).severity)),
      new Set(DEFECT_SEVERITIES),
    );
  }
});

test("selections reject multiple defects from the same severity", () => {
  assert.equal(
    defectTestUtils.validSelection(["no_wheels", "no_engine", "reversed_steering"]),
    false,
  );
  assert.equal(
    defectTestUtils.validSelection(["no_engine", "no_steering", "no_brakes"]),
    true,
  );
});

test("every current defect belongs to at least one valid initial combination", () => {
  for (const defect of DEFECTS) {
    const hasValidCombination = DEFECTS.some((second) => (
      DEFECTS.some((third) => (
        defectTestUtils.validSelection([defect.id, second.id, third.id])
      ))
    ));
    assert.equal(hasValidCombination, true, `${defect.id} is unreachable`);
  }
});

test("OpenAI selection uses gpt-5-nano, honors constraints, and removes repeats", async () => {
  const players = [
    { id: "round-car", prompt: "Red car; the wheels must be round" },
    { id: "moon-car", prompt: "Moon buggy" },
  ];
  let requestBody;
  const fetchImpl = async (_url, options) => {
    requestBody = JSON.parse(options.body);
    return {
      ok: true,
      status: 200,
      json: async () => ({
        output_text: JSON.stringify({
          assignments: [
            {
              playerId: "round-car",
              defectIds: ["no_engine", "no_steering", "no_brakes"],
              avoidedDefectIds: [],
            },
            {
              playerId: "moon-car",
              defectIds: ["no_engine", "no_steering", "no_brakes"],
              avoidedDefectIds: [],
            },
          ],
        }),
      }),
    };
  };

  const assignments = await defectTestUtils.selectWithOpenAI(players, {
    apiKey: "test-key",
    model: DEFAULT_OPENAI_MODEL,
    fetchImpl,
  });

  assert.equal(requestBody.model, "gpt-5-nano");
  assert.deepEqual(requestBody.reasoning, { effort: "none" });
  assert.equal("temperature" in requestBody, false);
  assert.equal(assignments["round-car"].includes("square_wheels"), false);
  assert.equal(assignments["round-car"].includes("no_wheels"), false);
  assert.equal(
    new Set(Object.values(assignments).flat()).size,
    Object.values(assignments).flat().length,
  );

  const modelInput = JSON.parse(requestBody.input);
  assert.deepEqual(
    new Set(modelInput.defects.map((defect) => defect.severity)),
    new Set(DEFECT_SEVERITIES),
  );
  assert.deepEqual(
    new Set(modelInput.cars[0].serverDetectedAvoidances),
    new Set(["no_wheels", "square_wheels"]),
  );
});

test("OpenAI assignments with duplicate severities are rejected", async () => {
  await assert.rejects(
    defectTestUtils.selectWithOpenAI(
      [{ id: "driver", prompt: "Kart" }],
      {
        apiKey: "test-key",
        fetchImpl: async () => ({
          ok: true,
          status: 200,
          json: async () => ({
            output_text: JSON.stringify({
              assignments: [{
                playerId: "driver",
                defectIds: ["no_wheels", "no_engine", "reversed_steering"],
                avoidedDefectIds: [],
              }],
            }),
          }),
        }),
      },
    ),
    /invalid defect assignment/,
  );
});

test("repair selection never falls back to local prompt parsing", async () => {
  const players = [
    {
      id: "driver",
      tuningPrompt: "Fix wheel alignemnt; wheels should be straight, not mounted to the side",
      defectIds: ["sideways_wheels", "no_brakes"],
    },
  ];

  await assert.rejects(
    selectRepairs(players, { provider: "local" }),
    /requires LLM_PROVIDER=openai/,
  );
});

test("OpenAI repair selection keeps every current, concrete defect and rejects generic requests", async () => {
  const players = [
    {
      id: "generic",
      tuningPrompt: "Fix everything",
      defectIds: ["no_brakes", "no_grip", "reversed_steering"],
    },
    {
      id: "specific",
      tuningPrompt: "The steering goes the opposite way and the brakes do not work",
      defectIds: ["no_brakes", "no_grip", "reversed_steering"],
    },
  ];
  let requestBody;
  const repairs = await selectRepairs(players, {
    provider: "openai",
    apiKey: "test-key",
    fetchImpl: async (_url, options) => {
      requestBody = JSON.parse(options.body);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          output_text: JSON.stringify({
            assignments: [
              { playerId: "generic", repairedDefectIds: [] },
              { playerId: "specific", repairedDefectIds: ["reversed_steering", "no_brakes"] },
            ],
          }),
        }),
      };
    },
  });

  assert.deepEqual(repairs.generic, []);
  assert.deepEqual(repairs.specific, ["reversed_steering", "no_brakes"]);
  assert.ok(
    requestBody.text.format.schema.properties.assignments.items.properties
      .repairedDefectIds.maxItems > 1,
  );
});

test("OpenAI failures do not silently bypass prompt constraints", async () => {
  await assert.rejects(
    selectDefects(
      [{ id: "player-1", prompt: "Car with round wheels" }],
      {
        provider: "openai",
        apiKey: "test-key",
        fetchImpl: async () => ({ ok: false, status: 500 }),
      },
    ),
    /OpenAI returned 500/,
  );
});
