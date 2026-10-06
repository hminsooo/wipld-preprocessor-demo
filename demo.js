/* Standalone UI demonstration. No CAD, mesher, or solver is invoked. */
(() => {
  "use strict";
  const STORAGE_KEY = "wipld-preprocessor-web-demo-v1";
  const $ = (selector, root = document) => root.querySelector(selector);
  const icon = (name) =>
    `<svg aria-hidden="true"><use href="#i-${name}"/></svg>`;
  const escape = (value) =>
    String(value).replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  const frames = {
    TOP_A: { position: [1.5, 0, 2.4], label: "상부 전방" },
    SIDE_B: { position: [0.2, -0.95, 1.55], label: "측면" },
    TAIL_C: { position: [-4.4, 0, 2.05], label: "후방" },
    TOP_D: { position: [-1.7, 0, 2.35], label: "상부 후방" },
    BOTTOM_E: { position: [1.1, 0.6, 0.55], label: "하부" },
  };
  const catalog = {
    vhf: { name: "VHF blade", band: [30, 180], role: "TX_RX", shape: "blade" },
    uhf: { name: "UHF blade", band: [200, 400], role: "TX_RX", shape: "blade" },
    wideband: {
      name: "Wideband receiver",
      band: [30, 400],
      role: "RX_ONLY",
      shape: "patch",
    },
  };
  const roleNames = { TX_RX: "TX / RX", TX_ONLY: "TX", RX_ONLY: "RX" };
  const steps = {
    project: {
      number: "01",
      en: "PROJECT / INPUT",
      title: "프로젝트 입력",
      description: "플랫폼과 장착 좌표계를 확인하고, 작업을 시작하세요.",
    },
    mounting: {
      number: "02",
      en: "ANTENNA MOUNTING",
      title: "안테나 배치",
      description: "플랫폼 위에 안테나를 배치하고, 공통 Base를 준비하세요.",
    },
    analysis: {
      number: "03",
      en: "ANALYSIS",
      title: "해석 설정",
      description: "MAIN 안테나, 계산 주파수와 해석 목적을 설정하세요.",
    },
    cases: {
      number: "04",
      en: "CASE PLAN",
      title: "Case 구성",
      description: "주파수별로 Case를 나누고, 필요한 관계를 확인하세요.",
    },
    generate: {
      number: "05",
      en: "GENERATE & VERIFY",
      title: "생성 · 검증",
      description: "프로젝트 생성과 설정 확인의 흐름을 모의 체험하세요.",
    },
    run: {
      number: "06",
      en: "RUN & LOGS",
      title: "실행 · 로그",
      description: "순차 실행, 진행률, 실패 후 계속 진행을 모의 체험하세요.",
    },
  };
  const freshState = () => ({
    version: 1,
    name: "AERIS · Concept platform",
    baseReady: false,
    selected: "ANT_VHF",
    antennas: [
      {
        id: "ANT_VHF",
        model: "vhf",
        mount: "TOP_A",
        role: "TX_RX",
        offset: [0, 0, 0],
      },
      {
        id: "ANT_UHF",
        model: "uhf",
        mount: "SIDE_B",
        role: "TX_RX",
        offset: [0, 0, 0],
      },
      {
        id: "ANT_RX",
        model: "wideband",
        mount: "TAIL_C",
        role: "RX_ONLY",
        offset: [0, 0, 0],
      },
    ],
    plan: {
      name: "MAIN co-site",
      purpose: "cosite",
      main: "ANT_VHF",
      frequencies: [30, 60, 100, 150, 225, 300, 400],
      saved: false,
      maxpatch: 2,
      theta: 19,
      phi: 37,
    },
    edges: [30, 100, 200, 400],
    ratio: 2,
    cases: [],
    generationLogs: [],
    runLogs: [],
    scenario: "normal",
    history: [],
  });
  let state = load();
  let currentStep = steps[location.hash.slice(1)]
    ? location.hash.slice(1)
    : "mounting";
  let busy = false,
    toastTimer,
    runTimer = null,
    stopRequested = false,
    tourActive = false;
  function load() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (
        !raw ||
        raw.version !== 1 ||
        !Array.isArray(raw.antennas) ||
        raw.antennas.length > 16
      )
        return freshState();
      const result = freshState();
      const valid = raw.antennas.every(
        (a) =>
          a &&
          typeof a.id === "string" &&
          a.id.length <= 50 &&
          catalog[a.model] &&
          frames[a.mount] &&
          roleNames[a.role] &&
          Array.isArray(a.offset) &&
          a.offset.length === 3 &&
          a.offset.every((n) => Number.isFinite(n) && Math.abs(n) <= 10),
      );
      if (
        !valid ||
        new Set(raw.antennas.map((a) => a.id)).size !== raw.antennas.length
      )
        return result;
      result.antennas = raw.antennas.map((a) => ({
        id: a.id,
        model: a.model,
        mount: a.mount,
        role: a.role,
        offset: a.offset,
      }));
      result.name =
        typeof raw.name === "string" ? raw.name.slice(0, 80) : result.name;
      result.selected = result.antennas.some((a) => a.id === raw.selected)
        ? raw.selected
        : result.antennas[0]?.id;
      if (
        raw.plan &&
        Array.isArray(raw.plan.frequencies) &&
        raw.plan.frequencies.length <= 256 &&
        raw.plan.frequencies.length &&
        raw.plan.frequencies.every(
          (n) => Number.isFinite(n) && n > 0 && n <= 100000,
        )
      ) {
        result.plan = {
          ...result.plan,
          name: String(raw.plan.name || result.plan.name).slice(0, 80),
          purpose: raw.plan.purpose === "coverage" ? "coverage" : "cosite",
          main: result.antennas.some((a) => a.id === raw.plan.main)
            ? raw.plan.main
            : result.selected,
          frequencies: raw.plan.frequencies,
          saved: !!raw.plan.saved,
          maxpatch:
            Number.isFinite(raw.plan.maxpatch) &&
            raw.plan.maxpatch >= 0.1 &&
            raw.plan.maxpatch <= 20
              ? raw.plan.maxpatch
              : 2,
        };
      }
      if (
        Array.isArray(raw.edges) &&
        raw.edges.length >= 2 &&
        raw.edges.length <= 32 &&
        raw.edges.every(Number.isFinite)
      )
        result.edges = raw.edges;
      result.baseReady = !!raw.baseReady && result.antennas.length > 0;
      // Restore inputs, not in-flight simulation timers. Cases can be rebuilt.
      return result;
    } catch {
      return freshState();
    }
  }
  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* Storage can be disabled in privacy mode. */
    }
  }
  function toast(message) {
    $("#toast").textContent = message;
    $("#toast").classList.add("visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(
      () => $("#toast").classList.remove("visible"),
      3300,
    );
  }
  function navigate(step) {
    if (!steps[step]) return;
    currentStep = step;
    history.replaceState(null, "", `#${step}`);
    render();
  }
  window.addEventListener("hashchange", () => {
    if (steps[location.hash.slice(1)]) {
      currentStep = location.hash.slice(1);
      render();
    }
  });
  const tag = (text, type = "") =>
    `<span class="tag ${type}">${escape(text)}</span>`;
  const button = (label, action, type = "", disabled = false, graphic = "") =>
    `<button class="button ${type}" data-action="${action}" ${disabled ? "disabled" : ""}>${graphic ? icon(graphic) : ""}${escape(label)}</button>`;
  const field = (label, control, hint = "") =>
    `<label class="field"><span>${label}</span>${control}${hint ? `<small>${hint}</small>` : ""}</label>`;
  const empty = (title, description, action, label) =>
    `<section class="card"><div class="empty-state"><div class="empty-symbol">↗</div><h3>${title}</h3><p>${description}</p>${button(label, action, "primary")}</div></section>`;
  const selected = () =>
    state.antennas.find((a) => a.id === state.selected) || state.antennas[0];
  const position = (a) =>
    frames[a.mount].position.map((n, i) => n + a.offset[i]);
  const frequencies = (list) =>
    list
      .map((n) =>
        Number(n).toLocaleString("en-US", { maximumFractionDigits: 3 }),
      )
      .join(", ");
  const options = (entries, value) =>
    entries
      .map(
        ([id, label]) =>
          `<option value="${escape(id)}" ${id === value ? "selected" : ""}>${escape(label)}</option>`,
      )
      .join("");
  function invalidateAssembly() {
    state.baseReady = false;
    invalidateCases();
    if (!state.antennas.some((a) => a.id === state.plan.main))
      state.plan.main = state.antennas[0]?.id || "";
  }
  function invalidateCases() {
    state.cases = [];
    state.generationLogs = [];
    state.runLogs = [];
    state.history = [];
  }
  function render() {
    const step = steps[currentStep];
    document.title = `${step.title} · WIPL-D Web demo`;
    $("#project-label").textContent = state.name;
    $("#step-eyebrow").textContent = `${step.number} / ${step.en}`;
    $("#step-title").textContent = step.title;
    $("#step-description").textContent = step.description;
    $("#project-metrics").innerHTML =
      `<div class="metric"><strong>${String(state.antennas.length).padStart(2, "0")}</strong><span>ANTENNAS</span></div><div class="metric"><strong class="${state.baseReady ? "ready" : ""}">${state.baseReady ? "READY" : "—"}</strong><span>BASE MODEL</span></div><div class="metric"><strong>${String(state.cases.length).padStart(2, "0")}</strong><span>CASES</span></div>`;
    const included = state.cases.filter((c) => c.included);
    const complete = {
      project: true,
      mounting: state.baseReady,
      analysis: state.plan.saved,
      cases: !!state.cases.length,
      generate: included.length > 0 && included.every((c) => c.verified),
      run:
        included.length > 0 && included.every((c) => c.status === "completed"),
    };
    $("#workflow-nav")
      .querySelectorAll("button")
      .forEach((b) => {
        b.classList.toggle("active", b.dataset.step === currentStep);
        b.classList.toggle("complete", complete[b.dataset.step]);
        b.setAttribute(
          "aria-current",
          b.dataset.step === currentStep ? "step" : "false",
        );
      });
    document
      .querySelectorAll('[data-action="tour"],[data-action="reset"]')
      .forEach((b) => (b.disabled = busy || !!runTimer));
    $("#content").innerHTML = {
      project: renderProject,
      mounting: renderMounting,
      analysis: renderAnalysis,
      cases: renderCases,
      generate: renderGenerate,
      run: renderRun,
    }[currentStep]();
    renderViewerMetadata();
    requestDraw();
    const terminal = $("#content .terminal");
    if (terminal) terminal.scrollTop = terminal.scrollHeight;
  }
  function renderProject() {
    return `<section class="card"><div class="card-heading"><div><span class="overline">PROJECT SETTINGS</span><h2>프로젝트 정보</h2></div>${tag("샘플 로드됨")}</div><form id="project-form" class="card-body"><div class="form-grid"><div class="full">${field("프로젝트 이름", `<input name="projectName" value="${escape(state.name)}" maxlength="80" required>`, "변경한 이름은 이 브라우저에 저장됩니다.")}</div><div class="full">${field("플랫폼 프로젝트 · 예시", `<input value="demo-platform.wcm" readonly>`, "공개용으로 만든 개념 형상입니다. 실제 WCM 파일을 읽지 않습니다.")}</div>${field("길이 단위", `<input value="Meter (m)" readonly>`)}${field("형상 유형", `<input value="Concept rotorcraft" readonly>`)}</div><div class="action-row"><span>실제 파일 업로드는 지원하지 않습니다.</span><button class="button primary" type="submit">프로젝트 이름 저장</button></div></form></section><section class="card"><div class="card-heading"><div><span class="overline">MOUNTING FRAMES</span><h2>장착 좌표계</h2></div>${tag("5 FRAMES", "neutral")}</div><div class="table-wrap"><table><thead><tr><th>좌표계</th><th>위치</th><th>원점 (m)</th><th>상태</th></tr></thead><tbody>${Object.entries(
      frames,
    )
      .map(
        ([id, f]) =>
          `<tr><td><strong class="mono">${id}</strong></td><td>${f.label}</td><td class="mono">${f.position.map((n) => n.toFixed(2)).join(", ")}</td><td>${tag("등록됨")}</td></tr>`,
      )
      .join(
        "",
      )}</tbody></table></div><div class="table-footnote">좌표·단위는 샘플 정의입니다. 실제 플랫폼과 관계가 없습니다.</div></section><div class="action-row">${button("샘플 다시 불러오기", "reset", "", "", "reset")}${button("다음: 안테나 배치", "goto-mounting", "primary", false, "arrow")}</div>`;
  }
  function renderMounting() {
    const a = selected();
    const rows = state.antennas
      .map(
        (item) =>
          `<tr class="selectable ${a?.id === item.id ? "selected" : ""}" data-select="${escape(item.id)}" tabindex="0" aria-selected="${a?.id === item.id}"><td><strong><span class="antenna-dot"></span>${escape(item.id)}</strong><small>${catalog[item.model].name}</small></td><td class="mono">${item.mount}</td><td>${tag(roleNames[item.role], item.role === "RX_ONLY" ? "neutral" : "")}</td><td class="mono">${catalog[item.model].band.join("–")}</td></tr>`,
      )
      .join("");
    return `<section class="card"><div class="card-heading"><div><span class="overline">MOUNTED ANTENNAS</span><h2>배치된 안테나 <span class="mono" style="color:#94a4a4">/ ${String(state.antennas.length).padStart(2, "0")}</span></h2></div>${button("안테나 추가", "add-antenna", "small", busy || !!runTimer || state.antennas.length >= 16, "plus")}</div><div class="table-wrap"><table><thead><tr><th>안테나 / 모델</th><th>좌표계</th><th>역할</th><th>대역 (MHz)</th></tr></thead><tbody>${rows || '<tr><td colspan="4">안테나 추가 버튼으로 시작하세요.</td></tr>'}</tbody></table></div><div class="table-footnote"><span class="live-dot"></span>행이나 3D 마커를 선택해 배치 설정을 확인하세요.</div></section>${
      a
        ? `<section class="card"><form class="card-body top-padding" id="mount-form"><div class="selected-heading"><div><span class="overline">SELECTED ANTENNA</span><h2>${escape(a.id)}</h2></div>${button("삭제", "remove-antenna", "small danger", busy || !!runTimer, "trash")}</div><div class="form-grid">${field(
            "장착 좌표계",
            `<select name="mount">${options(
              Object.entries(frames).map(([id, f]) => [
                id,
                `${id} · ${f.label}`,
              ]),
              a.mount,
            )}</select>`,
          )}${field("송수신 역할", `<select name="role">${options(Object.entries(roleNames), a.role)}</select>`)}</div><hr class="form-divider"><div class="section-label"><h3>로컬 위치 보정</h3><span>좌표계 기준 · m</span></div><div class="form-grid three">${["X", "Y", "Z"].map((axis, i) => field(`${axis} offset`, `<div class="input-unit"><input name="offset${i}" type="number" step="0.05" min="-10" max="10" value="${a.offset[i]}" required><span>m</span></div>`)).join("")}</div><div class="action-row"><span>설정 변경 시 Base와 Case를 재구성합니다.</span><button type="submit" class="button" ${busy || runTimer ? "disabled" : ""}>배치 적용</button></div></form></section>`
        : ""
    }<section class="card base-action"><div><span class="base-icon">${icon("cube")}</span><div><h3>${state.baseReady ? "공통 Base 준비 완료" : busy ? "Base 생성 단계 체험 중…" : "공통 Base를 준비하세요"}</h3><p>${state.baseReady ? "데모 상태 · 실제 CAD 생성은 수행되지 않음" : "현재 배치로 Base 생성 흐름을 체험합니다."}</p></div></div>${state.baseReady ? button("해석 설정", "goto-analysis", "primary", false, "arrow") : button(busy ? "준비 중…" : "Base 생성 (데모)", "build-base", "primary", busy || !!runTimer || !state.antennas.length, "cube")}</section>`;
  }
  function renderAnalysis() {
    if (!state.antennas.length)
      return empty(
        "배치된 안테나가 없습니다.",
        "안테나를 먼저 추가한 뒤 해석 설정을 진행하세요.",
        "goto-mounting",
        "안테나 배치로 이동",
      );
    const p = state.plan;
    return `<section class="card"><div class="card-heading"><div><span class="overline">ANALYSIS PLAN</span><h2>해석 플랜</h2></div>${tag(p.saved ? "저장됨" : "입력 준비", p.saved ? "" : "warm")}</div><form id="analysis-form" class="card-body"><div id="form-error" class="error-message" role="alert"></div><div class="form-grid">${field("플랜 이름", `<input name="planName" value="${escape(p.name)}" maxlength="80" required>`)}${field(
      "해석 목적",
      `<select name="purpose">${options(
        [
          ["cosite", "Co-site · 상호 결합"],
          ["coverage", "Coverage · 방사 패턴"],
        ],
        p.purpose,
      )}</select>`,
    )}<div class="full">${field(
      "MAIN 안테나",
      `<select name="main">${options(
        state.antennas.map((a) => [a.id, `${a.id} · ${catalog[a.model].name}`]),
        p.main,
      )}</select>`,
      "Co-site는 MAIN ↔ 주변 안테나의 두 방향을 확인합니다.",
    )}</div><div class="full">${field("계산 주파수 (MHz)", `<input name="frequency" value="${frequencies(p.frequencies)}" required placeholder="30, 60, 100 또는 30:150:5">`, "쉼표로 구분하거나 시작:끝:개수 형식을 사용하세요. 최대 256개.")}</div>${field("Max patch (λ)", `<input name="maxpatch" type="number" min="0.1" max="20" step="0.1" value="${p.maxpatch}" required>`, "Case의 최고 주파수로 표시용 크기를 산정합니다.")}${field("포트 유지 정책", `<input value="전체 포트 유지" readonly>`, "웹 데모에서는 Generator 제거를 수행하지 않습니다.")}</div><div class="inline-note">${icon("info")}<span>수신 평가 대역으로 MAIN 관계를 선정합니다. 송신 대역 밖 성분은 가정하며, 실제 방출량이나 결합값을 예측하지 않습니다.</span></div><div class="action-row"><span>주파수와 역할은 공개용 샘플 값입니다.</span><button type="submit" class="button primary" ${busy || runTimer ? "disabled" : ""}>플랜 저장 ${icon("check")}</button></div></form></section><section class="card"><div class="card-heading"><div><span class="overline">PLAN SUMMARY</span><h2>현재 플랜</h2></div>${tag(p.purpose.toUpperCase(), "neutral")}</div><div class="card-body"><div class="section-label"><h3>${escape(p.name)}</h3><span class="mono">${p.frequencies.length} frequencies</span></div><p class="card-description">MAIN <strong>${escape(p.main)}</strong> · ${frequencies(p.frequencies)} MHz<br>변경 내용을 저장한 뒤 Case를 구성하세요.</p><div class="action-row"><span>${state.baseReady ? "Base 준비 완료" : "Base를 먼저 생성해야 합니다."}</span>${button("다음: Case 구성", "goto-cases", "primary", !p.saved, "arrow")}</div></div></section>`;
  }
  function renderCases() {
    if (!state.baseReady)
      return empty(
        "Base 준비가 필요합니다.",
        "안테나 배치 단계에서 공통 Base 생성 흐름을 먼저 체험하세요.",
        "goto-mounting",
        "Base 준비하기",
      );
    if (!state.plan.saved)
      return empty(
        "해석 플랜을 저장하세요.",
        "MAIN 안테나와 계산 주파수를 설정하면 Case를 구성할 수 있습니다.",
        "goto-analysis",
        "해석 설정으로 이동",
      );
    const rows = state.cases
      .map(
        (c) =>
          `<tr><td><input type="checkbox" data-case-include="${c.id}" aria-label="${c.id} 실행에 포함" ${c.included ? "checked" : ""} ${busy || runTimer ? "disabled" : ""}></td><td><strong class="mono">${c.id}</strong><small>BASE_DEMO_01</small></td><td class="mono">${frequencies(c.frequencies)}</td><td>${c.ports.length}</td><td class="mono">${c.mesh.toFixed(3)} m</td><td>${tag(c.verified ? "DEMO PASS" : "미생성", c.verified ? "" : "neutral")}</td></tr>`,
      )
      .join("");
    const pairs = state.cases.flatMap((c) =>
      c.pairs.map((p) => ({ ...p, caseId: c.id })),
    );
    return `<section class="card"><div class="card-heading"><div><span class="overline">AUTOMATIC CASE PLANNING</span><h2>주파수 분할</h2></div>${tag(state.plan.purpose.toUpperCase(), "neutral")}</div><form id="case-form" class="card-body"><div id="form-error" class="error-message" role="alert"></div>${field("주파수 분할 경계 (MHz)", `<input name="edges" value="${frequencies(state.edges)}" placeholder="예: 30, 100, 200, 400">`, "경계는 계산점이 아닙니다. 마지막 구간만 상한을 포함합니다. 비워두면 단일 Case입니다.")}<div class="form-grid" style="margin-top:15px">${field(
      "자동 분할 주파수 비",
      `<select name="ratio">${options(
        [1, 1.5, 2, 3, 5, 10].map((n) => [String(n), `${n}배 (최고 / 최저)`]),
        String(state.ratio),
      )}</select>`,
    )}${field("포트 정책", `<input value="전체 포트 유지" readonly>`)}</div><div class="action-row">${button("주파수까지 자동 구성", "auto-frequency", "", busy || !!runTimer)}<button class="button primary" type="submit" ${busy || runTimer ? "disabled" : ""}>Case 자동 구성 ${icon("arrow")}</button></div></form></section><section class="card"><div class="card-heading"><div><span class="overline">CASE PREVIEW</span><h2>구성된 Case</h2></div>${tag(`${state.cases.length} CASES`, state.cases.length ? "" : "neutral")}</div>${state.cases.length ? `<div class="table-wrap"><table><thead><tr><th>실행</th><th>Case</th><th>주파수 (MHz)</th><th>포트</th><th>Mesh · 표시용</th><th>상태</th></tr></thead><tbody>${rows}</tbody></table></div><div class="result-summary"><div><strong>${state.cases.length}</strong><span>CASES</span></div><div><strong>${state.plan.frequencies.length}</strong><span>FREQUENCIES</span></div><div><strong>${pairs.length}</strong><span>DIRECTED PAIRS</span></div></div><details class="details"><summary>분석 구성 · 근거 확인</summary><p>전체 안테나 포트는 유지됩니다. 아래 표는 주파수별 수신 대역과 송수신 역할로 선정한 MAIN 관계의 데모입니다. 형상 유효성·실제 계산값은 검증하지 않습니다.</p>${pairs.length ? `<div class="table-wrap"><table><thead><tr><th>MHz</th><th>TX → RX</th><th>선정 근거</th></tr></thead><tbody>${pairs.map((p) => `<tr><td class="mono">${p.frequency}</td><td class="mono">${escape(p.tx)} → ${escape(p.rx)}</td><td>MAIN 관계 · RX 대역 내</td></tr>`).join("")}</tbody></table></div>` : "<p>Coverage 플랜은 전체 안테나를 유지하고 방사 패턴 단계의 UI를 보여줍니다.</p>"}</details>` : '<div class="empty-state"><div class="empty-symbol">04</div><h3>계산할 Case를 구성하세요.</h3><p>위의 Case 자동 구성 버튼으로 주파수 그룹과 메시 크기 표시를 만듭니다.</p></div>'}</section>${state.cases.length ? `<div class="action-row"><span>모든 요청 주파수가 Case에 포함되었습니다.</span>${button("다음: 생성 · 검증", "goto-generate", "primary", false, "arrow")}</div>` : ""}`;
  }
  function renderGenerate() {
    if (!state.cases.length)
      return empty(
        "구성된 Case가 없습니다.",
        "주파수 분할을 적용한 뒤 생성·검증 흐름을 체험하세요.",
        "goto-cases",
        "Case 구성으로 이동",
      );
    const included = state.cases.filter((c) => c.included);
    return `<section class="card"><div class="card-heading"><div><span class="overline">CASE PROJECTS</span><h2>프로젝트 생성 · 설정 확인</h2></div>${tag("SIMULATED", "warm")}</div><div class="card-body"><p class="card-description">실제 .wcm 파일을 생성하지 않고, 생성과 설정 재확인 단계를 재현합니다. DEMO PASS는 WIPL-D 계산 가능 여부를 보증하지 않습니다.</p><div class="action-row" style="margin-top:0">${button(busy ? "생성 흐름 진행 중…" : "생성 · 검증 (데모)", "generate", "primary", busy || !!runTimer || !included.length, "cube")}${button("Manifest 다운로드", "manifest", "", busy || !included.some((c) => c.verified), "download")}</div></div><div class="table-wrap"><table><thead><tr><th>Case</th><th>예시 프로젝트 경로</th><th>모의 검증</th></tr></thead><tbody>${state.cases.map((c) => `<tr><td><strong class="mono">${c.id}</strong><small>${c.included ? "실행 포함" : "실행 제외"}</small></td><td class="mono">demo/${c.id}.wcm</td><td>${tag(c.verified ? "DEMO PASS" : "생성 대기", c.verified ? "" : "neutral")}</td></tr>`).join("")}</tbody></table></div><div class="table-footnote">표시된 경로는 예시이며, 서버 파일이나 실제 WCM 프로젝트가 아닙니다.</div></section><section class="card"><div class="terminal-heading"><span>GENERATION LOG</span><span>SIMULATED</span></div><div class="terminal" id="generation-log" role="log" aria-label="모의 생성 로그">${escape(state.generationLogs.join("\n") || "[DEMO] 생성 버튼을 누르면 예시 로그가 표시됩니다.\n[DEMO] 실제 CAD · WCM · 메시 파일은 생성하지 않습니다.")}</div></section><div class="action-row"><span>${included.filter((c) => c.verified).length} / ${included.length} Case · 모의 검증 완료</span>${button("다음: 실행 · 로그", "goto-run", "primary", !included.length || !included.every((c) => c.verified), "arrow")}</div>`;
  }
  const statusNames = {
    idle: "준비",
    queued: "대기",
    running: "실행 중",
    completed: "완료",
    failed: "실패",
  };
  function renderRun() {
    const included = state.cases.filter((c) => c.included);
    if (!included.length || !included.every((c) => c.verified))
      return empty(
        "모의 검증을 완료하세요.",
        "실행할 Case가 생성·검증 단계를 마쳐야 큐를 시작할 수 있습니다.",
        "goto-generate",
        "생성 · 검증으로 이동",
      );
    const done = included.filter((c) =>
      ["completed", "failed"].includes(c.status),
    ).length;
    const total = Math.round(
      included.reduce((sum, c) => sum + c.progress, 0) / included.length,
    );
    return `<section class="card"><div class="card-heading"><div><span class="overline">SEQUENTIAL RUN QUEUE</span><h2>배치 실행</h2></div>${tag(runTimer ? "모의 실행 중" : done === included.length ? "모의 실행 완료" : "실행 준비", runTimer ? "warm" : "")}</div><div class="run-overview"><div class="progress-caption"><span>${done} / ${included.length} Case ${stopRequested ? "· 현재 Case 후 중지 예약" : ""}</span><strong>${total}%</strong></div><div class="progress-track"><div class="progress-fill" style="width:${total}%"></div></div><div class="form-grid" style="margin-top:18px">${field(
      "데모 시나리오",
      `<select id="run-scenario" ${runTimer ? "disabled" : ""}>${options(
        [
          ["normal", "정상 완료"],
          ["hang", "결과 작성 후 종료 지연"],
          ["failure", "두 번째 Case 실패 후 계속"],
        ],
        state.scenario,
      )}</select>`,
    )}<div class="field"><span>실행 환경</span><input readonly value="브라우저 · 모의 실행"></div></div><div class="action-row">${button(runTimer ? "실행 중…" : done === included.length ? "다시 실행" : "모의 실행 시작", "run-start", "primary", !!runTimer, "play")}${button(stopRequested ? "중지 예약됨" : "현재 Case 후 중지", "run-stop", "", !runTimer || stopRequested)}</div></div><div class="table-wrap"><table><thead><tr><th>Case</th><th>상태</th><th>진행률</th><th>결과</th></tr></thead><tbody>${included.map((c) => `<tr><td><strong class="mono">${c.id}</strong><small>${frequencies(c.frequencies)} MHz</small></td><td><span class="run-state ${c.status}">${c.status === "running" ? '<span class="running-dot"></span>' : ""}${statusNames[c.status] || "준비"}</span></td><td><div class="small-progress"><div class="progress-track"><div class="progress-fill" style="width:${c.progress}%"></div></div><span class="mono">${c.progress}%</span></div></td><td>${c.status === "completed" ? tag("샘플 완료") : c.status === "failed" ? tag("예시 실패", "error") : "—"}</td></tr>`).join("")}</tbody></table></div></section><section class="card"><div class="terminal-heading"><span><span class="running-dot" style="${runTimer ? "" : "animation:none;opacity:.5"}"></span>RUNNER LOG</span><span>SIMULATED · NO SOLVER</span></div><div id="run-log" class="terminal" role="log" aria-label="모의 실행 로그">${escape(state.runLogs.join("\n") || "[DEMO] 순차 큐 실행을 체험할 준비가 되었습니다.\n[DEMO] 실제 .ad1 / .ra1 결과는 생성되지 않습니다.")}</div></section><div class="action-row"><span>샘플 실행 기록만 다운로드됩니다.</span>${button("모의 실행 기록 다운로드", "results", "", !!runTimer || !done, "download")}</div>`;
  }
  function renderViewerMetadata() {
    const a = selected();
    $("#viewport-selection").innerHTML = a
      ? `<div><span class="overline">SELECTED OBJECT</span><strong>${escape(a.id)} ${tag(roleNames[a.role], a.role === "RX_ONLY" ? "neutral" : "")}</strong></div><div><span class="overline">WORLD POSITION · m</span><strong class="mono">${position(
          a,
        )
          .map((n) => n.toFixed(2))
          .join(" / ")}</strong></div>`
      : `<div><span class="overline">SELECTED OBJECT</span><strong>가상 플랫폼</strong></div><div><span class="overline">MOUNTED ANTENNAS</span><strong class="mono">0</strong></div>`;
    $("#viewer-legend").innerHTML = state.antennas
      .map(
        (a) =>
          `<button class="${a.id === state.selected ? "active" : ""}" data-select="${escape(a.id)}"><span class="antenna-dot" style="${a.id === state.selected ? "background:var(--orange)" : ""}"></span>${escape(a.id)}</button>`,
      )
      .join("");
  }
  function showModal(title, body) {
    $("#modal-content").innerHTML =
      `<div class="modal-heading"><h2>${title}</h2><button class="icon-button" data-action="close-modal" aria-label="닫기">${icon("close")}</button></div><div class="modal-body">${body}</div>`;
    $("#modal").showModal();
  }
  function showAdd() {
    let n = state.antennas.length + 1;
    while (
      state.antennas.some((a) => a.id === `ANT_${String(n).padStart(2, "0")}`)
    )
      n++;
    showModal(
      "안테나 추가",
      `<p>샘플 모델을 선택해 가상 플랫폼에 배치하세요.</p><form id="add-form"><div id="modal-error" class="error-message" role="alert"></div><div class="form-grid"><div class="full">${field("안테나 이름", `<input name="name" value="ANT_${String(n).padStart(2, "0")}" maxlength="50" required>`)}</div>${field(
        "샘플 모델",
        `<select name="model">${options(
          Object.entries(catalog).map(([id, m]) => [id, m.name]),
          "vhf",
        )}</select>`,
      )}${field(
        "장착 좌표계",
        `<select name="mount">${options(
          Object.entries(frames).map(([id, f]) => [id, `${id} · ${f.label}`]),
          "TOP_D",
        )}</select>`,
      )}</div><div class="action-row"><span>모델의 기본 송수신 역할을 적용합니다.</span><button type="submit" class="button primary">추가 ${icon("plus")}</button></div></form>`,
    );
  }
  function parseFrequencies(text) {
    const values = [];
    const tokens = text
      .trim()
      .split(/[\s,;]+/)
      .filter(Boolean);
    if (!tokens.length) throw Error("계산 주파수를 입력하세요.");
    for (const token of tokens) {
      if (token.includes(":")) {
        const parts = token.split(":").map(Number);
        if (
          parts.length !== 3 ||
          !parts.every(Number.isFinite) ||
          parts[0] <= 0 ||
          parts[1] < parts[0] ||
          !Number.isInteger(parts[2]) ||
          parts[2] < 2 ||
          parts[2] > 256
        )
          throw Error(
            "주파수 범위는 시작:끝:개수 형식으로 입력하세요. 예: 30:150:5",
          );
        for (let i = 0; i < parts[2]; i++)
          values.push(
            Number(
              (parts[0] + ((parts[1] - parts[0]) * i) / (parts[2] - 1)).toFixed(
                6,
              ),
            ),
          );
      } else {
        const n = Number(token);
        if (!Number.isFinite(n) || n <= 0 || n > 100000)
          throw Error(
            "주파수는 0보다 크고 100,000 MHz 이하인 숫자로 입력하세요.",
          );
        values.push(n);
      }
      if (values.length > 256)
        throw Error("계산점은 최대 256개까지 입력할 수 있습니다.");
    }
    if (values.some((n) => n > 100000))
      throw Error("주파수는 100,000 MHz 이하여야 합니다.");
    return [...new Set(values)].sort((a, b) => a - b);
  }
  function pairsAt(frequency) {
    if (state.plan.purpose !== "cosite") return [];
    const main = state.antennas.find((a) => a.id === state.plan.main);
    const tx = (a) => a.role !== "RX_ONLY";
    const rx = (a) =>
      a.role !== "TX_ONLY" &&
      frequency >= catalog[a.model].band[0] &&
      frequency <= catalog[a.model].band[1];
    const pairs = [];
    if (!main) return pairs;
    for (const other of state.antennas.filter((a) => a.id !== main.id)) {
      if (tx(main) && rx(other))
        pairs.push({ frequency, tx: main.id, rx: other.id });
      if (tx(other) && rx(main))
        pairs.push({ frequency, tx: other.id, rx: main.id });
    }
    return pairs;
  }
  function makeCases(groups) {
    state.cases = groups
      .filter((g) => g.length)
      .map((group, i) => ({
        id: `CASE_${String(i + 1).padStart(2, "0")}`,
        frequencies: group,
        ports: state.antennas.map((a) => a.id),
        pairs: group.flatMap(pairsAt),
        mesh: (state.plan.maxpatch * 299.792458) / Math.max(...group),
        included: true,
        verified: false,
        status: "idle",
        progress: 0,
      }));
    state.generationLogs = [];
    state.runLogs = [];
    state.history = [];
    save();
  }
  function configureCaseForm(automatic = false) {
    if (busy || runTimer) return;
    const form = $("#case-form");
    try {
      const values = state.plan.frequencies;
      state.ratio = Number(form.elements.ratio.value);
      let groups;
      if (automatic) {
        groups = [];
        for (const f of values) {
          let g = groups.at(-1);
          if (!g || f / g[0] > state.ratio) {
            g = [];
            groups.push(g);
          }
          g.push(f);
        }
      } else {
        const edgeText = form.elements.edges.value.trim();
        const edges = edgeText
          ? edgeText
              .split(/[\s,;]+/)
              .filter(Boolean)
              .map(Number)
          : [];
        if (
          edges.length &&
          (edges.length < 2 ||
            edges.length > 32 ||
            edges.some((n) => !Number.isFinite(n) || n <= 0) ||
            edges.some((n, i) => i && n <= edges[i - 1]))
        )
          throw Error(
            "경계는 작은 값부터 서로 다른 양수를 2개 이상 입력하세요.",
          );
        if (
          edges.length &&
          (edges[0] > values[0] || edges.at(-1) < values.at(-1))
        )
          throw Error(
            "분할 경계가 모든 계산 주파수를 포함해야 합니다. 첫 경계와 마지막 경계를 넓혀주세요.",
          );
        state.edges = edges;
        groups = edges.length
          ? edges
              .slice(0, -1)
              .map((lo, i) =>
                values.filter(
                  (f) =>
                    f >= lo &&
                    (i === edges.length - 2
                      ? f <= edges[i + 1]
                      : f < edges[i + 1]),
                ),
              )
          : [values];
      }
      makeCases(groups);
      render();
      toast(
        `${state.cases.length}개 Case를 구성했습니다. 주파수 누락 없음 · 전체 포트 유지`,
      );
    } catch (error) {
      $("#form-error").textContent = error.message;
    }
  }
  async function buildBase() {
    if (busy || runTimer || !state.antennas.length) return;
    busy = true;
    render();
    await new Promise((resolve) => setTimeout(resolve, 800));
    state.baseReady = true;
    busy = false;
    save();
    render();
    toast("Base 생성 흐름 체험 완료 · 실제 CAD 파일은 생성되지 않습니다.");
  }
  async function generate() {
    if (busy || runTimer || !state.cases.some((c) => c.included)) return;
    busy = true;
    state.generationLogs = ["[DEMO] 모의 생성 시작 · 실제 파일 생성 없음"];
    render();
    for (const c of state.cases.filter((c) => c.included)) {
      state.generationLogs.push(
        `[DEMO] ${c.id}: ${frequencies(c.frequencies)} MHz / ${c.ports.length} ports`,
      );
      await new Promise((resolve) => setTimeout(resolve, 320));
      c.verified = true;
      c.status = "idle";
      c.progress = 0;
      state.generationLogs.push(
        `[DEMO] ${c.id}: 주파수 · 전체 포트 · 표시용 mesh → DEMO PASS`,
      );
      render();
    }
    state.generationLogs.push(
      "[DEMO] 모의 검증 완료 · solver 실행 가능 여부는 보증하지 않습니다.",
    );
    busy = false;
    save();
    render();
    toast("모의 검증 완료. 실행 · 로그 단계에서 큐를 체험하세요.");
  }
  function addLog(message) {
    const time = new Date().toLocaleTimeString("en-GB", { hour12: false });
    state.runLogs.push(`${time}  [DEMO] ${message}`);
    if (state.runLogs.length > 300) state.runLogs.shift();
  }
  function startRun() {
    if (busy || runTimer) return;
    const included = state.cases.filter((c) => c.included);
    if (!included.length || !included.every((c) => c.verified)) return;
    if (included.every((c) => ["completed", "failed"].includes(c.status))) {
      state.history.push({
        time: new Date().toISOString(),
        cases: included.map((c) => ({ id: c.id, status: c.status })),
        simulated: true,
      });
      included.forEach((c) => {
        c.status = "idle";
        c.progress = 0;
      });
    }
    included
      .filter((c) => !["completed", "failed"].includes(c.status))
      .forEach((c) => {
        c.status = "queued";
        c.progress = 0;
      });
    stopRequested = false;
    addLog(
      `순차 큐 시작 · ${included.filter((c) => c.status === "queued").length}개 Case · NO SOLVER`,
    );
    let active = null,
      tick = 0;
    runTimer = setInterval(() => {
      if (!active) {
        active = included.find((c) => c.status === "queued");
        tick = 0;
        if (!active) {
          finishRun("전체 큐 종료 · 기록은 모의 데이터입니다.");
          return;
        }
        active.status = "running";
        addLog(`${active.id}: 시작 · 이전 결과 정리 (모의)`);
      }
      tick++;
      active.progress = Math.min(100, Math.round((tick / 10) * 100));
      if (tick === 3)
        addLog(`${active.id}: mesh / ${active.mesh.toFixed(3)} m (표시용)`);
      if (tick === 6)
        addLog(`${active.id}: 샘플 결과 작성 단계 (실제 AD1/RA1 없음)`);
      if (tick >= 10) {
        const index = included.indexOf(active);
        if (state.scenario === "failure" && index === 1) {
          active.status = "failed";
          addLog(`${active.id}: 예시 결과 누락 → 실패. 다음 Case로 계속 진행`);
        } else {
          active.status = "completed";
          if (state.scenario === "hang" && index === 0)
            addLog(
              `${active.id}: 종료 지연 가정 → after-results 복구 흐름 재현`,
            );
          addLog(`${active.id}: 모의 완료 · 100%`);
        }
        active = null;
        if (stopRequested) {
          finishRun(
            "현재 Case 완료 후 중지 · 남은 큐는 다시 시작할 수 있습니다.",
          );
          return;
        }
      }
      render();
    }, 200);
    render();
  }
  function finishRun(message) {
    clearInterval(runTimer);
    runTimer = null;
    stopRequested = false;
    tourActive = false;
    addLog(message);
    save();
    render();
    toast("모의 실행 상태가 업데이트되었습니다.");
  }
  function quickTour() {
    if (busy || runTimer) return;
    state = freshState();
    state.baseReady = true;
    state.plan.saved = true;
    makeCases([
      [30, 60],
      [100, 150],
      [225, 300, 400],
    ]);
    state.cases.forEach((c) => (c.verified = true));
    state.generationLogs = [
      "[DEMO] 빠른 체험: Base 준비 · 해석 플랜 저장 · 3개 Case 구성",
      "[DEMO] 모든 Case: DEMO PASS · 실제 파일 생성 없음",
    ];
    tourActive = true;
    save();
    navigate("run");
    startRun();
    toast("샘플 전체 흐름을 준비했습니다. 모의 배치 실행을 시작합니다.");
  }
  function download(filename, value) {
    const blob = new Blob([JSON.stringify(value, null, 2)], {
      type: "application/json;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
  function demoExport(kind) {
    return {
      schema: "wipld-ui-demo/v1",
      demo_only: true,
      notice: "UI demonstration only. Not a WIPL-D project or solver output.",
      exported_at: new Date().toISOString(),
      project: state.name,
      ...(kind === "settings"
        ? { antennas: state.antennas, analysis: state.plan }
        : {}),
      ...(kind !== "settings"
        ? {
            cases: state.cases.map((c) => ({
              ...c,
              verification: c.verified ? "DEMO_PASS" : "NOT_GENERATED",
            })),
            ...(kind === "results"
              ? {
                  scenario: state.scenario,
                  logs: state.runLogs,
                  history: state.history,
                }
              : {}),
          }
        : {}),
    };
  }
  document.addEventListener("click", (event) => {
    const nav = event.target.closest("[data-step]");
    if (nav) {
      navigate(nav.dataset.step);
      return;
    }
    const chosen = event.target.closest("[data-select]");
    if (chosen) {
      state.selected = chosen.dataset.select;
      save();
      render();
      return;
    }
    const view = event.target.closest("[data-view]");
    if (view) {
      setView(view.dataset.view);
      return;
    }
    const camera = event.target.closest("[data-camera]");
    if (camera) {
      if (camera.dataset.camera === "reset") setView("iso");
      else {
        cameraView.zoom = Math.max(
          0.5,
          Math.min(
            2,
            cameraView.zoom +
              (camera.dataset.camera === "zoom-in" ? 0.15 : -0.15),
          ),
        );
        requestDraw();
      }
      return;
    }
    const el = event.target.closest("[data-action]");
    if (!el || el.disabled) return;
    const action = el.dataset.action;
    if (action.startsWith("goto-")) {
      navigate(action.slice(5));
      return;
    }
    if (action === "close-modal") {
      $("#modal").close();
      return;
    }
    if (action === "help")
      showModal(
        "웹 데모 사용 안내",
        `<p>기존 PySide6 전처리기의 6단계 작업 흐름을 브라우저 화면으로 재구현했습니다.</p><ol><li>안테나를 선택하거나 추가하고 배치를 조정합니다.</li><li>Base 생성 → 해석 플랜 저장을 진행합니다.</li><li>Case 자동 구성 → 모의 생성·검증을 진행합니다.</li><li>순차 실행과 모의 로그를 확인합니다.</li></ol><p>오른쪽 형상은 직접 만든 개념 플랫폼입니다. 드래그로 회전하고 휠로 확대할 수 있습니다. 빠른 체험 버튼은 기본 샘플로 전체 흐름을 준비합니다.</p><div class="notice">모든 상태와 로그는 데모입니다. CAD 변환, 메시 생성, 전자기 계산 및 실제 WCM/AD1/RA1 생성은 수행하지 않습니다. 내보내기는 데모 전용 JSON입니다.</div><div class="action-row">${button("데모로 돌아가기", "close-modal", "primary")}</div>`,
      );
    if (action === "reset" && !busy && !runTimer) {
      state = freshState();
      save();
      navigate("mounting");
      setView("iso");
      toast("공개용 기본 샘플로 초기화했습니다.");
    }
    if (action === "export")
      download("wipld-demo-settings.json", demoExport("settings"));
    if (action === "manifest")
      download("wipld-demo-manifest.json", demoExport("manifest"));
    if (action === "results")
      download("wipld-demo-run.json", demoExport("results"));
    if (action === "add-antenna" && !busy && !runTimer) showAdd();
    if (action === "remove-antenna" && !busy && !runTimer) {
      const a = selected();
      state.antennas = state.antennas.filter((x) => x.id !== a?.id);
      state.selected = state.antennas[0]?.id;
      invalidateAssembly();
      save();
      render();
      toast("선택한 안테나를 삭제했습니다. Base를 다시 준비하세요.");
    }
    if (action === "build-base") buildBase();
    if (action === "auto-frequency") configureCaseForm(true);
    if (action === "generate") generate();
    if (action === "run-start") startRun();
    if (action === "run-stop" && runTimer) {
      stopRequested = true;
      addLog("중지 요청 · 현재 Case까지 진행");
      render();
    }
    if (action === "tour") quickTour();
  });
  document.addEventListener("keydown", (event) => {
    if (
      ["Enter", " "].includes(event.key) &&
      event.target.matches("tr[data-select]")
    ) {
      event.preventDefault();
      event.target.click();
    }
  });
  document.addEventListener("change", (event) => {
    if (event.target.matches("[data-case-include]") && !busy && !runTimer) {
      const c = state.cases.find(
        (c) => c.id === event.target.dataset.caseInclude,
      );
      if (c) c.included = event.target.checked;
      save();
      render();
    }
    if (event.target.id === "run-scenario" && !runTimer) {
      state.scenario = event.target.value;
      save();
    }
  });
  document.addEventListener("submit", (event) => {
    event.preventDefault();
    const form = event.target;
    if (busy || runTimer) return;
    if (form.id === "project-form") {
      state.name =
        form.elements.projectName.value.trim() || "AERIS · Concept platform";
      save();
      render();
      toast("프로젝트 이름을 저장했습니다.");
    }
    if (form.id === "mount-form") {
      const a = selected(),
        offset = [0, 1, 2].map((i) =>
          Number(form.elements[`offset${i}`].value),
        );
      if (!a || offset.some((n) => !Number.isFinite(n) || Math.abs(n) > 10))
        return;
      a.mount = form.elements.mount.value;
      a.role = form.elements.role.value;
      a.offset = offset;
      invalidateAssembly();
      save();
      render();
      toast("배치를 적용했습니다. Base와 Case를 다시 구성하세요.");
    }
    if (form.id === "add-form") {
      const id = form.elements.name.value.trim();
      if (!id || state.antennas.some((a) => a.id === id)) {
        $("#modal-error").textContent = "서로 다른 안테나 이름을 입력하세요.";
        return;
      }
      if (state.antennas.length >= 16) {
        $("#modal-error").textContent =
          "샘플 안테나는 최대 16개까지 배치할 수 있습니다.";
        return;
      }
      const model = form.elements.model.value;
      state.antennas.push({
        id,
        model,
        mount: form.elements.mount.value,
        role: catalog[model].role,
        offset: [0, 0, 0],
      });
      state.selected = id;
      invalidateAssembly();
      save();
      $("#modal").close();
      render();
      toast("샘플 안테나를 추가했습니다.");
    }
    if (form.id === "analysis-form") {
      try {
        const parsed = parseFrequencies(form.elements.frequency.value);
        const maxpatch = Number(form.elements.maxpatch.value);
        if (!Number.isFinite(maxpatch) || maxpatch < 0.1 || maxpatch > 20)
          throw Error("Max patch는 0.1~20 범위로 입력하세요.");
        state.plan = {
          ...state.plan,
          name: form.elements.planName.value.trim() || "Analysis plan",
          purpose: form.elements.purpose.value,
          main: form.elements.main.value,
          frequencies: parsed,
          maxpatch,
          saved: true,
        };
        invalidateCases();
        save();
        render();
        toast(`${parsed.length}개 주파수로 플랜을 저장했습니다.`);
      } catch (error) {
        $("#form-error").textContent = error.message;
      }
    }
    if (form.id === "case-form") configureCaseForm();
  });
  $("#modal").addEventListener("click", (event) => {
    if (event.target === $("#modal")) {
      const r = $("#modal").getBoundingClientRect();
      if (
        event.clientX < r.left ||
        event.clientX > r.right ||
        event.clientY < r.top ||
        event.clientY > r.bottom
      )
        $("#modal").close();
    }
  });

  // Small, dependency-free 3D concept viewer. All geometry is generated here.
  const canvas = $("#assembly-canvas"),
    ctx = canvas.getContext("2d");
  const cameraView = { yaw: -0.53, pitch: 0.4, zoom: 1, mode: "iso" };
  let drawPending = false,
    hitMarkers = [],
    drag = null;
  const faces = [];
  function box(x, y, z, l, w, h, color) {
    const v = [
      [x - l / 2, y - w / 2, z],
      [x + l / 2, y - w / 2, z],
      [x + l / 2, y + w / 2, z],
      [x - l / 2, y + w / 2, z],
      [x - l / 2, y - w / 2, z + h],
      [x + l / 2, y - w / 2, z + h],
      [x + l / 2, y + w / 2, z + h],
      [x - l / 2, y + w / 2, z + h],
    ];
    for (const indices of [
      [0, 1, 2, 3],
      [0, 4, 5, 1],
      [1, 5, 6, 2],
      [2, 6, 7, 3],
      [3, 7, 4, 0],
      [4, 7, 6, 5],
    ])
      faces.push({ points: indices.map((i) => v[i]), color });
  }
  function ellipsoid(cx, cy, cz, rx, ry, rz, color) {
    const point = (a, b) => [
      cx + rx * Math.cos(a) * Math.cos(b),
      cy + ry * Math.cos(a) * Math.sin(b),
      cz + rz * Math.sin(a),
    ];
    for (let i = 0; i < 12; i++)
      for (let j = 0; j < 24; j++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 12,
          b = (j * Math.PI) / 12;
        faces.push({
          points: [
            point(a, b),
            point(a + Math.PI / 12, b),
            point(a + Math.PI / 12, b + Math.PI / 12),
            point(a, b + Math.PI / 12),
          ],
          color,
        });
      }
  }
  ellipsoid(0.4, 0, 1.35, 3.5, 0.87, 1.03, [207, 220, 220]);
  ellipsoid(2.8, 0, 1.45, 1.05, 0.68, 0.66, [152, 180, 181]);
  // Tapered tail boom, a mast, blades and landing skids; not production CAD.
  faces.push({
    points: [
      [-2, -0.52, 1.15],
      [-6.5, -0.15, 2.05],
      [-6.5, -0.15, 2.45],
      [-2, -0.52, 1.85],
    ],
    color: [190, 207, 208],
  });
  faces.push({
    points: [
      [-2, 0.52, 1.15],
      [-6.5, 0.15, 2.05],
      [-6.5, 0.15, 2.45],
      [-2, 0.52, 1.85],
    ],
    color: [207, 221, 220],
  });
  faces.push({
    points: [
      [-2, -0.52, 1.85],
      [-6.5, -0.15, 2.45],
      [-6.5, 0.15, 2.45],
      [-2, 0.52, 1.85],
    ],
    color: [219, 231, 228],
  });
  box(-5.7, 0, 2.1, 0.6, 2.6, 0.07, [168, 193, 188]);
  faces.push({
    points: [
      [-6.5, -0.06, 2.1],
      [-7.1, -0.06, 3.4],
      [-6.5, -0.06, 3.4],
      [-5.9, -0.06, 2.1],
    ],
    color: [179, 202, 198],
  });
  box(-0.6, 0, 2.3, 0.3, 0.3, 0.8, [109, 142, 141]);
  box(-0.6, 0, 3.07, 9.5, 0.14, 0.07, [125, 158, 155]);
  box(-0.6, 0, 3.07, 0.14, 9, 0.07, [137, 169, 165]);
  for (const y of [-1.02, 1.02]) {
    box(0.2, y, 0.12, 4.8, 0.11, 0.1, [135, 162, 160]);
    for (const x of [-1.3, 1.5])
      box(x, y, 0.2, 0.1, 0.1, 0.65, [150, 178, 174]);
  }
  function setView(view) {
    Object.assign(
      cameraView,
      view === "top"
        ? { yaw: 0, pitch: 1.5, zoom: 1, mode: "top" }
        : view === "side"
          ? { yaw: 0, pitch: 0.08, zoom: 1, mode: "side" }
          : { yaw: -0.53, pitch: 0.4, zoom: 1, mode: "iso" },
    );
    $(".segmented")
      .querySelectorAll("button")
      .forEach((b) => b.classList.toggle("active", b.dataset.view === view));
    $("#view-coordinate").textContent = `${view.toUpperCase()} VIEW`;
    requestDraw();
  }
  function requestDraw() {
    if (drawPending) return;
    drawPending = true;
    requestAnimationFrame(() => {
      drawPending = false;
      draw();
    });
  }
  function draw() {
    const bounds = canvas.getBoundingClientRect(),
      w = bounds.width,
      h = bounds.height;
    if (!w || !h || !ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (
      canvas.width !== Math.round(w * dpr) ||
      canvas.height !== Math.round(h * dpr)
    ) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const gradient = ctx.createLinearGradient(0, 0, 0, h);
    gradient.addColorStop(0, "#f1f5f4");
    gradient.addColorStop(1, "#e7eeee");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);
    const scale = Math.min(w / 14.8, h / 9.2) * cameraView.zoom,
      cy = Math.cos(cameraView.yaw),
      sy = Math.sin(cameraView.yaw),
      cp = Math.cos(cameraView.pitch),
      sp = Math.sin(cameraView.pitch);
    const project = (p) => {
      const x = p[0] + 1.3,
        y = p[1],
        z = p[2];
      const rx = x * cy - y * sy,
        ry = x * sy + y * cy,
        depth = ry * cp - z * sp,
        vertical = ry * sp + z * cp,
        factor = 25 / (25 - depth);
      return {
        x: w * 0.5 + rx * scale * factor,
        y: h * 0.7 - vertical * scale * factor,
        depth,
      };
    };
    const line = (a, b, color, width = 1) => {
      const p = project(a),
        q = project(b);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(q.x, q.y);
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.stroke();
    };
    for (let x = -9; x <= 7; x++)
      line([x, -6, 0], [x, 6, 0], x === 0 ? "#b7cdcb" : "#d6e1df", 0.6);
    for (let y = -6; y <= 6; y++)
      line([-9, y, 0], [7, y, 0], y === 0 ? "#b7cdcb" : "#d6e1df", 0.6);
    // Soft ground shadow remains purely decorative.
    ctx.save();
    const origin = project([-0.3, 0, 0]);
    ctx.translate(origin.x, origin.y);
    ctx.scale(1, 0.21);
    const shadow = ctx.createRadialGradient(0, 0, 1, 0, 0, scale * 4.5);
    shadow.addColorStop(0, "#567e7736");
    shadow.addColorStop(1, "#567e7700");
    ctx.fillStyle = shadow;
    ctx.beginPath();
    ctx.ellipse(0, 0, scale * 4.5, scale * 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    const mesh = $("#show-mesh").checked;
    faces
      .map((face) => ({ ...face, projected: face.points.map(project) }))
      .map((face) => ({
        ...face,
        depth:
          face.projected.reduce((sum, p) => sum + p.depth, 0) /
          face.projected.length,
      }))
      .sort((a, b) => a.depth - b.depth)
      .forEach((face) => {
        ctx.beginPath();
        face.projected.forEach((p, i) =>
          i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y),
        );
        ctx.closePath();
        const brightness = 0.89 + (0.12 * (face.depth + 9)) / 20;
        ctx.fillStyle = `rgb(${face.color.map((n) => Math.min(255, Math.round(n * brightness))).join(",")})`;
        ctx.fill();
        ctx.lineWidth = mesh ? 0.55 : 0.35;
        ctx.strokeStyle = mesh ? "#5c928766" : "#728f8420";
        ctx.stroke();
      });
    hitMarkers = [];
    state.antennas.forEach((a) => {
      const base = position(a),
        height = catalog[a.model].shape === "patch" ? 0.16 : 0.62,
        tip = [base[0], base[1], base[2] + height],
        p = project(tip),
        q = project(base),
        active = a.id === state.selected,
        color = active ? "#df7d53" : "#398b7d";
      const left = project([base[0] - 0.2, base[1], base[2]]),
        right = project([base[0] + 0.16, base[1], base[2]]);
      ctx.beginPath();
      ctx.moveTo(left.x, left.y);
      ctx.lineTo(p.x, p.y);
      ctx.lineTo(right.x, right.y);
      ctx.closePath();
      ctx.fillStyle = active ? "#f4ad8650" : "#63978866";
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.stroke();
      if ($("#show-frames").checked) {
        line(base, [base[0] + 0.7, base[1], base[2]], "#cf9274", 1);
        line(base, [base[0], base[1] + 0.7, base[2]], "#76a898", 1);
        line(base, [base[0], base[1], base[2] + 0.7], "#759cae", 1);
      }
      ctx.beginPath();
      ctx.arc(p.x, p.y, active ? 7 : 5, 0, Math.PI * 2);
      ctx.fillStyle = active ? "#fff2e4" : "#e9f2ec";
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.8;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      const label = frames[a.mount].label;
      ctx.font = '9px "Segoe UI", "Malgun Gothic", sans-serif';
      const width = ctx.measureText(a.id).width + 16,
        lx = p.x + 11,
        ly = p.y - 19;
      ctx.fillStyle = "rgba(255,255,255,.93)";
      ctx.strokeStyle = active ? "#e7b598" : "#cbded4";
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.roundRect(lx, ly, width, 20, 4);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = color;
      ctx.fillText(a.id, lx + 8, ly + 13);
      hitMarkers.push({ x: p.x, y: p.y, id: a.id });
    });
    // Fixed screen-space axis guide.
    ctx.font = "9px Consolas, monospace";
    for (const [label, color, x, y] of [
      ["X", "#bd876a", 34, h - 66],
      ["Y", "#649d83", 52, h - 79],
      ["Z", "#739bab", 31, h - 100],
    ]) {
      ctx.beginPath();
      ctx.moveTo(32, h - 79);
      ctx.lineTo(x, y);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.3;
      ctx.stroke();
      ctx.fillStyle = color;
      ctx.fillText(label, x + 3, y - 2);
    }
  }
  canvas.addEventListener("pointerdown", (event) => {
    drag = {
      x: event.clientX,
      y: event.clientY,
      originX: event.clientX,
      originY: event.clientY,
      moved: false,
    };
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener("pointermove", (event) => {
    if (!drag) return;
    const dx = event.clientX - drag.x,
      dy = event.clientY - drag.y;
    if (
      Math.hypot(event.clientX - drag.originX, event.clientY - drag.originY) > 5
    )
      drag.moved = true;
    cameraView.yaw += dx * 0.008;
    cameraView.pitch = Math.max(
      -0.15,
      Math.min(1.55, cameraView.pitch + dy * 0.006),
    );
    drag.x = event.clientX;
    drag.y = event.clientY;
    cameraView.mode = "custom";
    $(".segmented")
      .querySelectorAll("button")
      .forEach((b) => b.classList.remove("active"));
    $("#view-coordinate").textContent = "CUSTOM VIEW";
    requestDraw();
  });
  canvas.addEventListener("pointerup", (event) => {
    if (drag && !drag.moved) {
      const r = canvas.getBoundingClientRect();
      const hit = hitMarkers.find(
        (p) =>
          Math.hypot(
            p.x - event.clientX + r.left,
            p.y - event.clientY + r.top,
          ) < 18,
      );
      if (hit) {
        state.selected = hit.id;
        save();
        render();
      }
    }
    drag = null;
  });
  canvas.addEventListener("pointercancel", () => (drag = null));
  canvas.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      cameraView.zoom = Math.max(
        0.5,
        Math.min(2, cameraView.zoom - event.deltaY * 0.001),
      );
      requestDraw();
    },
    { passive: false },
  );
  canvas.addEventListener("keydown", (event) => {
    if (
      ![
        "ArrowLeft",
        "ArrowRight",
        "ArrowUp",
        "ArrowDown",
        "+",
        "-",
        "Home",
      ].includes(event.key)
    )
      return;
    event.preventDefault();
    if (event.key === "Home") {
      setView("iso");
      return;
    }
    if (event.key === "ArrowLeft") cameraView.yaw -= 0.12;
    if (event.key === "ArrowRight") cameraView.yaw += 0.12;
    if (event.key === "ArrowUp")
      cameraView.pitch = Math.min(1.55, cameraView.pitch + 0.08);
    if (event.key === "ArrowDown")
      cameraView.pitch = Math.max(-0.15, cameraView.pitch - 0.08);
    if (event.key === "+") cameraView.zoom = Math.min(2, cameraView.zoom + 0.1);
    if (event.key === "-")
      cameraView.zoom = Math.max(0.5, cameraView.zoom - 0.1);
    requestDraw();
  });
  $("#show-frames").addEventListener("change", requestDraw);
  $("#show-mesh").addEventListener("change", requestDraw);
  new ResizeObserver(requestDraw).observe(canvas);
  render();
})();
