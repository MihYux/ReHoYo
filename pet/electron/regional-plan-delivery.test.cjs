const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const skillProfile = require("../shared/march7th-skill-profile.json");
const {
  CompanionStore,
  isPlayerInRollout,
} = require("./companion-store.cjs");

function setup() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "march7-release-agent-"));
  const filePath = path.join(directory, "companion-data.json");
  const store = new CompanionStore({
    filePath,
    skillProfile,
    clock: () => "2026-07-24T08:00:00.000Z",
  });
  store.loadDemoScenario("japan_story");
  return { directory, filePath, store };
}

function planInput(sourceId = "release-plan-1", rolloutPercent = 100) {
  return {
    sourceId,
    taskId: "task-summer",
    regionId: "japan",
    rolloutPercent,
    messageMode: "casual_check_in",
    plan: {
      id: "task-summer",
      title: "夏日同行版本",
      theme: "和三月七继续新的旅程",
      narrative: "从共同经历自然过渡到新版本体验",
      timeWindow: "2026-07-25 至 2026-08-10",
      facts: [{
        id: "fact-version",
        label: "版本",
        value: "夏日同行版本",
        source: "区域发行方案",
      }],
    },
    source: {
      name: "日本区域发行方案.md",
      content: "已确认的区域方案正文。",
    },
  };
}

test("a 100% cloud dispatch sends a casual check-in without announcing the version", (t) => {
  const { directory, store } = setup();
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  store.setMemoryCampaignReusable(
    "memory-demo-player-jp-choice",
    true,
  );

  const snapshot = store.receiveRegionalReleasePlan(planInput());
  const message = snapshot.messages[0];
  assert.equal(message.type, "daily");
  assert.equal(message.title, "来聊两句吧");
  assert.equal(message.deliveryMode, "proactive");
  assert.ok(message.sentAt);
  assert.ok(message.body.length > 0);
  assert.doesNotMatch(message.body, /最近列车上多了件和[“"]?.{20,}[”"]?有关的新鲜事/);
  assert.doesNotMatch(message.body, /发行方案|发行目标|共生发行目标|咱刚看到一段/);
  assert.doesNotMatch(message.body, /版本|更新|上线|发布/);
  assert.ok(message.trace.ruleIds.includes("release.regional_plan_received"));
  assert.ok(message.trace.ruleIds.includes("relationship.casual_online_guide"));
  assert.equal(message.action, undefined);
  assert.equal(message.trace.memoryIds.length, 0);
  assert.equal(snapshot.events.at(-1).status, "executed");

  const context = store.getActiveReleasePlanContext();
  assert.equal(context.plan.title, "夏日同行版本");
  assert.equal(context.proactiveStatus, "executed");

  const duplicate = store.receiveRegionalReleasePlan(planInput());
  assert.equal(
    duplicate.messages.filter((item) =>
      item.trace.ruleIds.includes("release.regional_plan_received"),
    ).length,
    1,
  );
});

test("turns operator objectives into concrete natural March 7th dialogue", (t) => {
  const { directory, store } = setup();
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const input = planInput("release-plan-natural-language");
  input.messageMode = "release_context";
  input.plan.theme = "由三月七以同行者视角介绍黑天鹅，激发玩家对匹诺康尼的兴趣。";
  input.plan.facts = [{
    id: "fact-penacony",
    label: "版本信息",
    value: "我想带你认识黑天鹅，也一起看看匹诺康尼：匹诺康尼是全新世界大版本。",
    source: "已审核角色共生方案",
  }];
  const prepared = store.prepareRegionalReleaseMessage(input);
  assert.equal(
    prepared.text,
    "开拓者，我最近正想和你聊聊黑天鹅，也想和你一起去匹诺康尼看看。你有空的时候，咱们再慢慢说？最近忙也没关系。",
  );
  assert.doesNotMatch(prepared.text, /由三月七|激发玩家|同行者视角/);
});

test("contact policy can defer proactive chat while retaining passive context", (t) => {
  const { directory, store } = setup();
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  store.setCompanionPaused(true);

  const snapshot = store.receiveRegionalReleasePlan(
    planInput("release-plan-paused"),
  );
  assert.equal(
    snapshot.messages.some((item) =>
      item.trace.ruleIds.includes("release.regional_plan_received"),
    ),
    false,
  );
  assert.equal(snapshot.events.at(-1).status, "suppressed");
  assert.ok(store.getActiveReleasePlanContext());
});

test("a companion outside gray rollout does not receive plan context", (t) => {
  const { directory, store } = setup();
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const playerId = store.getSnapshot().profile.id;
  let sourceId = "";
  for (let index = 0; index < 500; index += 1) {
    const candidate = `release-plan-gray-${index}`;
    if (!isPlayerInRollout(playerId, `regional-plan:${candidate}`, 1)) {
      sourceId = candidate;
      break;
    }
  }
  assert.ok(sourceId);

  const snapshot = store.receiveRegionalReleasePlan(planInput(sourceId, 1));
  assert.equal(snapshot.events.at(-1).suppressionReason, "gray_rollout_not_selected");
  assert.equal(store.getActiveReleasePlanContext(), null);
});

test("a running pet process can reload a plan written by the console process", (t) => {
  const { directory, filePath, store: consoleStore } = setup();
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const petStore = new CompanionStore({
    filePath,
    skillProfile,
    clock: () => "2026-07-24T08:00:00.000Z",
  });

  consoleStore.receiveRegionalReleasePlan(planInput("release-plan-cross-process"));
  const reloaded = petStore.reloadFromDisk();
  assert.ok(
    reloaded.messages.some((item) =>
      item.trace.ruleIds.includes("release.regional_plan_received"),
    ),
  );
});


test("full dispatch starts another casual chat despite frequency limits", (t) => {
  const { directory, store } = setup();
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));

  store.receiveRegionalReleasePlan(planInput("release-plan-normal"));
  const example = planInput("release-plan-example");
  example.frequencyBypass = true;
  const snapshot = store.receiveRegionalReleasePlan(example);
  const releaseMessages = snapshot.messages.filter((item) =>
    item.trace.ruleIds.includes("release.regional_plan_received"),
  );

  assert.equal(releaseMessages.length, 2);
  assert.equal(snapshot.events.at(-1).status, "executed");
  assert.ok(
    releaseMessages[0].trace.ruleIds.includes(
      "release.manual_dispatch_frequency_bypass",
    ),
  );
});

test("a selected gray cohort dispatch can send despite normal cadence limits", (t) => {
  const { directory, store } = setup();
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));

  const first = planInput("release-plan-first", 100);
  first.frequencyBypass = true;
  store.receiveRegionalReleasePlan(first);

  const second = planInput("release-plan-second", 50);
  second.frequencyBypass = true;
  const playerId = store.getSnapshot().profile.id;
  if (!isPlayerInRollout(playerId, "regional-plan:release-plan-second", 50)) {
    second.sourceId = Array.from({ length: 500 }, (_, index) => `release-plan-half-${index}`)
      .find((sourceId) => isPlayerInRollout(playerId, `regional-plan:${sourceId}`, 50));
  }
  assert.ok(second.sourceId);

  const snapshot = store.receiveRegionalReleasePlan(second);
  assert.equal(snapshot.events.at(-1).status, "executed");
  assert.equal(
    snapshot.messages.filter((item) => item.trace.ruleIds.includes("release.regional_plan_received")).length,
    2,
  );
});

test("rollout selection is stable, with 100% selecting all and 50% selecting about half", () => {
  const players = Array.from({ length: 1_000 }, (_, index) => `player-${index}`);
  assert.equal(
    players.filter((playerId) => isPlayerInRollout(playerId, "regional-plan:all", 100)).length,
    players.length,
  );
  const selected = players.filter((playerId) =>
    isPlayerInRollout(playerId, "regional-plan:half", 50),
  );
  assert.ok(selected.length >= 450 && selected.length <= 550, `selected ${selected.length}/1000`);
  assert.deepEqual(
    selected,
    players.filter((playerId) => isPlayerInRollout(playerId, "regional-plan:half", 50)),
  );
});


test("never exposes internal plan labels in new or historical player messages", (t) => {
  const { directory, filePath, store } = setup();
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));

  const unsafe = planInput("release-plan-internal-label");
  unsafe.plan.title = "角色共生发行方案 · 日本区域 · 共生发行目标";
  unsafe.plan.theme = "角色共生发行方案 · 日本区域 · 共生发行目标";
  const snapshot = store.receiveRegionalReleasePlan(unsafe);
  const generated = snapshot.messages[0];
  assert.doesNotMatch(
    generated.body,
    /发行方案|发行目标|共生发行目标|咱刚看到一段|不用急着现在就去/,
  );

  const persisted = JSON.parse(fs.readFileSync(filePath, "utf8"));
  persisted.messages.unshift({
    ...generated,
    id: "historical-leak",
    title: "角色共生发行方案",
    body: "咱刚看到一段和“角色共生发行方案 · 日本区域 · 共生发行目标”有关的新旅程。不用急着现在就去，等你哪天正好想换个心情，咱再一起看看，好不好？",
  });
  fs.writeFileSync(filePath, JSON.stringify(persisted), "utf8");
  store.reloadFromDisk();

  const playerSnapshot = store.getPlayerSnapshot();
  const historical = playerSnapshot.messages.find(
    (message) => message.id === "historical-leak",
  );
  assert.ok(historical);
  assert.doesNotMatch(
    `${historical.title} ${historical.body}`,
    /发行方案|发行目标|共生发行目标|咱刚看到一段|不用急着现在就去/,
  );
});
