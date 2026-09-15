import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_OPENAI_MODEL,
  DEFECT_COMPOSITIONS,
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
  assert.deepEqual(DEFECT_COMPOSITIONS, [
    { fatal: 1, critical: 2, annoying: 1 },
    { fatal: 0, critical: 3, annoying: 1 },
    { fatal: 0, critical: 2, annoying: 2 },
  ]);
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
    "У машины колёса должны быть круглыми",
  ]) {
    const avoided = defectTestUtils.explicitPromptAvoidances(prompt);
    assert.equal(avoided.has("square_wheels"), true);
    assert.equal(avoided.has("no_wheels"), true);
  }
});

test("local assignments return four defects in an allowed composition", async () => {
  const players = Array.from({ length: 2 }, (_, index) => ({
    id: `player-${index}`,
    prompt: index === 0 ? "A car with round wheels" : `Car ${index}`,
  }));
  const assignments = await selectDefects(players, { provider: "local" });
  const selected = Object.values(assignments).flat();

  assert.ok(new Set(selected).size >= 6);
  assert.equal(assignments["player-0"].includes("square_wheels"), false);
  assert.equal(assignments["player-0"].includes("no_wheels"), false);
  for (const ids of Object.values(assignments)) {
    assert.equal(ids.length, 4);
    assert.equal(defectTestUtils.validSelection(ids), true);
  }
});

test("selections prefer the standard compositions but allow safe substitutions", () => {
  assert.equal(
    defectTestUtils.validSelection(["no_engine", "sideways_wheels", "no_steering", "no_brakes"]),
    false,
  );
  assert.equal(
    defectTestUtils.validSelection(["no_engine", "no_steering", "no_grip", "no_brakes"]),
    true,
  );
  assert.equal(
    defectTestUtils.validSelection(["no_grip", "no_brakes", "no_seatbelt", "loose_wheel"]),
    true,
  );
  assert.equal(
    defectTestUtils.validSelection(["sideways_wheels", "no_steering", "backwards_engine", "no_grip"]),
    true,
  );
});

test("every current defect belongs to at least one valid initial combination", () => {
  const validCombinations = [];
  for (let first = 0; first < DEFECTS.length; first += 1) {
    for (let second = first + 1; second < DEFECTS.length; second += 1) {
      for (let third = second + 1; third < DEFECTS.length; third += 1) {
        for (let fourth = third + 1; fourth < DEFECTS.length; fourth += 1) {
          const ids = [first, second, third, fourth].map((index) => DEFECTS[index].id);
          if (defectTestUtils.validSelection(ids)) validCombinations.push(ids);
        }
      }
    }
  }
  for (const defect of DEFECTS) {
    const hasValidCombination = validCombinations.some((ids) => ids.includes(defect.id));
    assert.equal(hasValidCombination, true, `${defect.id} is unreachable`);
  }
});

test("all three severity compositions can be selected", () => {
  const samples = [
    ["no_engine", "no_steering", "no_grip", "no_brakes"],
    ["no_steering", "backwards_engine", "no_grip", "no_brakes"],
    ["backwards_engine", "no_grip", "reversed_steering", "loose_wheel"],
  ];

  for (const defectIds of samples) {
    const assignments = defectTestUtils.diversifyAssignments(
      [{ id: "driver", prompt: "Kart" }],
      new Map([["driver", { defectIds, avoidedDefectIds: [] }]]),
    );
    const selected = assignments.driver;
    assert.equal(defectTestUtils.validSelection(selected), true);
    assert.deepEqual(
      Object.fromEntries(DEFECT_SEVERITIES.map((severity) => [
        severity,
        selected.filter((id) => DEFECTS.find((defect) => defect.id === id).severity === severity).length,
      ])),
      Object.fromEntries(DEFECT_SEVERITIES.map((severity) => [
        severity,
        defectIds.filter((id) => DEFECTS.find((defect) => defect.id === id).severity === severity).length,
      ])),
    );
  }
});

test("prompt exclusions can replace a preferred category without creating contradictions", () => {
  const avoidedDefectIds = [
    "no_wheels",
    "no_engine",
    "sideways_wheels",
    "no_steering",
    "one_way_steering",
    "backwards_engine",
  ];
  const assignments = defectTestUtils.diversifyAssignments(
    [{ id: "driver", prompt: "Kart" }],
    new Map([["driver", { defectIds: [], avoidedDefectIds }]]),
  );
  const selected = assignments.driver;

  assert.equal(selected.length, 4);
  assert.equal(selected.some((id) => avoidedDefectIds.includes(id)), false);
  assert.equal(defectTestUtils.validSelection(selected), true);
  const criticalCount = selected.filter((id) => (
    DEFECTS.find((defect) => defect.id === id).severity === "critical"
  )).length;
  assert.ok(criticalCount < 2);
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
              defectIds: ["no_wheels", "no_steering", "backwards_engine", "no_brakes"],
              avoidedDefectIds: [],
            },
            {
              playerId: "moon-car",
              defectIds: ["no_engine", "no_steering", "no_grip", "no_brakes"],
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
  assert.deepEqual(modelInput.preferredSeverityCompositions, DEFECT_COMPOSITIONS);
  assert.deepEqual(
    new Set(modelInput.cars[0].serverDetectedAvoidances),
    new Set(["no_wheels", "square_wheels"]),
  );
});

test("OpenAI assignments with more than one fatal defect are rejected", async () => {
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
                defectIds: ["no_engine", "sideways_wheels", "no_steering", "no_brakes"],
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
