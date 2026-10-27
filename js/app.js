
import { db } from "./firebase.js";

import {
  collection,
  doc,
  getDocs,
  setDoc,
  deleteDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const C = {
  behavior: "behaviorEvents",
  crying: "cryingEvents",
  weight: "weights",
  meds: "medications",
  changes: "medicationChanges",
  logs: "medicationLogs"
};

const $ = id => document.getElementById(id);

function localDate(d = new Date()) {
  const x = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return x.toISOString().slice(0, 10);
}

const today = localDate();

const months = {
  behavior: today.slice(0, 7),
  crying: today.slice(0, 7),
  weight: today.slice(0, 7),
  medicationLogs: today.slice(0, 7)
};

let cache = {
  behavior: [],
  crying: [],
  weight: [],
  meds: [],
  changes: [],
  logs: []
};

let activeView = "dashboard";

function newId() {
  return crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function monthLabel(m) {
  const [y, mm] = m.split("-").map(Number);
  return `${y}년 ${mm}월`;
}

function formatDate(s) {
  if (!s) return "날짜 없음";
  return s.replaceAll("-", ".");
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function avg(arr) {
  return arr.length
    ? arr.reduce((a, b) => a + b, 0) / arr.length
    : null;
}

function displayNum(v, digits = 1) {
  return v == null
    ? "-"
    : Number(v).toFixed(digits).replace(/\.0$/, "");
}

function showMessage(id, text, error = false) {
  const el = $(id);
  if (!el) return;
  el.textContent = text;
  el.style.color = error ? "#b4234d" : "";
}

function sortNewest(arr) {
  return [...arr].sort((a, b) =>
    `${b.date || ""} ${b.time || ""}`.localeCompare(
      `${a.date || ""} ${a.time || ""}`
    )
  );
}

// Firebase 데이터

async function readCollection(name) {
  const snap = await getDocs(collection(db, name));
  return snap.docs.map(d => ({
    id: d.id,
    ...d.data()
  }));
}

async function refreshData() {
  const [
    behavior,
    crying,
    weight,
    meds,
    changes,
    logs
  ] = await Promise.all(
    Object.values(C).map(readCollection)
  );

  cache = { behavior, crying, weight, meds, changes, logs };
}

async function saveDoc(collectionName, id, data) {
  const finalId = id || newId();

  const now = new Date().toISOString();

  await setDoc(doc(db, collectionName, finalId), {
    ...data,
    id: finalId,
    createdAt: data.createdAt || now,
    updatedAt: now
  });

  return finalId;
}

async function removeDoc(collectionName, id) {
  await deleteDoc(doc(db, collectionName, id));
}

// 화면 전환

function setView(view) {
  activeView = view;

  document.querySelectorAll(".view").forEach(el => {
    el.classList.toggle("hidden", el.id !== `${view}View`);
  });

  document.querySelectorAll(".tab").forEach(el => {
    el.classList.toggle("active", el.dataset.view === view);
  });

  renderCurrent().catch(showLoadError);

  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function renderCurrent() {
  if (activeView === "dashboard") await renderDashboard();
  if (activeView === "behavior") await renderBehavior();
  if (activeView === "crying") await renderCrying();
  if (activeView === "weight") await renderWeight();
  if (activeView === "medication") await renderMedication();
}

function showLoadError(error) {
  console.error(error);
  alert("데이터를 불러오지 못했어요. Firebase 설정과 Firestore 보안 규칙을 확인해 주세요.");
}

document.querySelectorAll(".tab").forEach(b => {
  b.addEventListener("click", () => setView(b.dataset.view));
});

document.querySelectorAll("[data-go]").forEach(b => {
  b.addEventListener("click", () => setView(b.dataset.go));
});

document.querySelectorAll("[data-month-target]").forEach(b => {
  b.addEventListener("click", () => {
    changeMonth(b.dataset.monthTarget, Number(b.dataset.delta));
  });
});

function changeMonth(key, delta) {
  const [y, m] = months[key].split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);

  months[key] =
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

  renderCurrent().catch(showLoadError);
}

// 공통 기록 카드

function itemCard({ title, meta, context, actions = [] }) {
  const article = document.createElement("article");
  article.className = "record-item";

  const top = document.createElement("div");
  top.className = "record-top";

  const main = document.createElement("div");

  const t = document.createElement("div");
  t.className = "record-title";
  t.textContent = title;

  const m = document.createElement("div");
  m.className = "record-meta";
  m.textContent = meta;

  main.append(t, m);
  top.append(main);
  article.append(top);

  if (context) {
    const c = document.createElement("p");
    c.className = "record-context";
    c.style.whiteSpace = "pre-line";
    c.textContent = context;
    article.append(c);
  }

  if (actions.length) {
    const row = document.createElement("div");
    row.className = "record-actions";

    actions.forEach(a => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = a.label;

      if (a.danger) b.className = "delete";

      b.addEventListener("click", a.onClick);
      row.append(b);
    });

    article.append(row);
  }

  return article;
}

function showEmpty(containerId, message = "저장된 기록이 없어요.") {
  const container = $(containerId);
  if (!container) return;

  container.innerHTML = "";

  const p = document.createElement("div");
  p.className = "empty-state";
  p.textContent = message;
  container.append(p);
}

function monthRecords(type) {
  return sortNewest(
    cache[type].filter(r => (r.date || "").startsWith(months[type]))
  );
}

// 도전적 행동 및 울음 기록

function eventFormData(form, type) {
  const fd = new FormData(form);

  return {
    date: fd.get("date"),
    time: fd.get("time"),
    type: fd.get("type"),
    intensity: num(fd.get("intensity")),
    duration: num(fd.get("duration")),
    context: String(fd.get("context") || "").trim(),
    category: type
  };
}

function resetEventForm(formId, cancelId, dateId, messageId) {
  const form = $(formId);

  form.reset();
  form.elements.id.value = "";
  $(dateId).value = localDate();
  $(cancelId).classList.add("hidden");
  showMessage(messageId, "");
}

function populateEventForm(formId, record, cancelId, messageId) {
  const f = $(formId);

  Object.entries(record).forEach(([k, v]) => {
    if (f.elements[k]) f.elements[k].value = v ?? "";
  });

  f.elements.id.value = record.id;
  $(cancelId).classList.remove("hidden");
  showMessage(messageId, "수정 중인 기록입니다.");

  f.scrollIntoView({ behavior: "smooth", block: "center" });
}

function bindEventForm(formId, type, collectionName, cancelId, dateId, messageId) {
  $(formId).addEventListener("submit", async e => {
    e.preventDefault();

    const f = e.currentTarget;
    const btn = f.querySelector('[type="submit"]');
    btn.disabled = true;

    try {
      const data = eventFormData(f, type);

      if (
        !data.date ||
        !data.time ||
        !data.type ||
        data.intensity < 1 ||
        data.intensity > 5 ||
        data.duration < 0
      ) {
        throw new Error("날짜, 시간, 유형, 강도, 지속 시간을 확인해 주세요.");
      }

      await saveDoc(collectionName, f.elements.id.value, data);
      await refreshData();

      resetEventForm(formId, cancelId, dateId, messageId);
      showMessage(messageId, "기록을 저장했어요.");

      await renderCurrent();
    } catch (err) {
      console.error(err);
      showMessage(
        messageId,
        err.message || "저장하지 못했어요. Firebase 설정을 확인해 주세요.",
        true
      );
    } finally {
      btn.disabled = false;
    }
  });

  $(cancelId).addEventListener("click", () => {
    resetEventForm(formId, cancelId, dateId, messageId);
  });
}

bindEventForm(
  "behaviorForm", "behavior", C.behavior,
  "cancelBehaviorEdit", "behaviorDate", "behaviorMessage"
);

bindEventForm(
  "cryingForm", "crying", C.crying,
  "cancelCryingEdit", "cryDate", "cryingMessage"
);

function renderEventList(containerId, records, type) {
  const container = $(containerId);
  container.innerHTML = "";

  if (!records.length) {
    showEmpty(containerId, "선택한 달에 기록이 없어요.");
    return;
  }

  records.forEach(r => {
    container.append(
      itemCard({
        title: `${formatDate(r.date)} ${r.time || ""} · ${r.type}`,
        meta: `강도 ${r.intensity}/5 · 지속 ${r.duration}분`,
        context: r.context,
        actions: [
          {
            label: "수정",
            onClick: () => populateEventForm(
              type === "behavior" ? "behaviorForm" : "cryingForm",
              r,
              type === "behavior" ? "cancelBehaviorEdit" : "cancelCryingEdit",
              type === "behavior" ? "behaviorMessage" : "cryingMessage"
            )
          },
          {
            label: "삭제",
            danger: true,
            onClick: () => deleteAndRefresh(C[type], r.id)
          }
        ]
      })
    );
  });
}

async function deleteAndRefresh(collectionName, id) {
  if (!confirm("이 기록을 삭제할까요?")) return;

  try {
    await removeDoc(collectionName, id);
    await refreshData();
    await renderCurrent();
  } catch (e) {
    console.error(e);
    alert("삭제하지 못했어요. 다시 확인해 주세요.");
  }
}

function renderEventStats(type, prefix) {
  const rs = monthRecords(type);

  const intensities = rs
    .map(r => num(r.intensity))
    .filter(n => n >= 1 && n <= 5);

  const durations = rs.map(r => num(r.duration));

  $(`${prefix}StatCount`).textContent = rs.length;
  $(`${prefix}StatDays`).textContent = new Set(rs.map(r => r.date)).size;
  $(`${prefix}StatIntensity`).textContent = displayNum(avg(intensities));
  $(`${prefix}StatDuration`).textContent =
    avg(durations) == null ? "-" : `${displayNum(avg(durations))}분`;
}

async function renderBehavior() {
  $("behaviorMonth").textContent = monthLabel(months.behavior);
  renderEventStats("behavior", "behavior");
  renderEventList("behaviorList", monthRecords("behavior"), "behavior");

  const counts = new Map(
    ["타해", "자해", "물건 던지기", "그외"].map(x => [x, 0])
  );

  monthRecords("behavior").forEach(r => {
    counts.set(r.type, (counts.get(r.type) || 0) + 1);
  });

  const box = $("behaviorTypeStats");
  box.innerHTML = "";

  counts.forEach((v, k) => {
    const d = document.createElement("div");
    d.className = "type-stat";

    const a = document.createElement("span");
    a.textContent = k;

    const b = document.createElement("strong");
    b.textContent = `${v}회`;

    d.append(a, b);
    box.append(d);
  });
}

async function renderCrying() {
  $("cryingMonth").textContent = monthLabel(months.crying);
  renderEventStats("crying", "cry");
  renderEventList("cryingList", monthRecords("crying"), "crying");
}

// 체중 기록
// 같은 날짜의 중복 기록을 정리하고 날짜별 한 건만 유지한다.

$("weightForm").addEventListener("submit", async e => {
  e.preventDefault();

  const f = e.currentTarget;
  const btn = f.querySelector('[type="submit"]');
  btn.disabled = true;

  try {
    const data = {
      date: f.elements.date.value,
      weight: num(f.elements.weight.value)
    };

    if (!data.date || data.weight <= 0) {
      throw new Error("측정 날짜와 체중을 확인해 주세요.");
    }

    const editingId = f.elements.id.value;

    const sameDate = cache.weight.filter(
      r => r.date === data.date && r.id !== editingId
    );

    const existing = sameDate[0];
    const weightId = editingId || existing?.id || data.date;

    await saveDoc(C.weight, weightId, data);

    const duplicates = sameDate.filter(r => r.id !== weightId);

    for (const r of duplicates) {
      await removeDoc(C.weight, r.id);
    }

    await refreshData();

    f.reset();
    f.elements.id.value = "";
    $("weightDate").value = localDate();
    $("cancelWeightEdit").classList.add("hidden");

    showMessage("weightMessage", "체중을 저장했어요.");
    await renderWeight();
  } catch (err) {
    console.error(err);
    showMessage("weightMessage", err.message || "저장하지 못했어요.", true);
  } finally {
    btn.disabled = false;
  }
});

$("cancelWeightEdit").addEventListener("click", () => {
  const f = $("weightForm");

  f.reset();
  f.elements.id.value = "";
  $("weightDate").value = localDate();
  $("cancelWeightEdit").classList.add("hidden");
  showMessage("weightMessage", "");
});

function renderWeightChart(records) {
  const el = $("weightChart");
  el.innerHTML = "";

  if (!records.length) {
    showEmpty("weightChart", "선택한 달의 체중 기록이 없어요.");
    return;
  }

  const sorted = [...records].sort((a, b) => a.date.localeCompare(b.date));

  const w = 600, h = 235, l = 48, r = 18, t = 20, b = 35;
  const pw = w - l - r;
  const ph = h - t - b;

  const vals = sorted.map(x => num(x.weight));
  let min = Math.min(...vals);
  let max = Math.max(...vals);

  if (min === max) {
    min -= 1;
    max += 1;
  }

  const pad = (max - min) * 0.15;
  min -= pad;
  max += pad;

  const x = i => l + (
    sorted.length === 1 ? pw / 2 : (i / (sorted.length - 1)) * pw
  );

  const y = v => t + ((max - v) / (max - min)) * ph;

  let svg = `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="월별 체중 변화 그래프">`;

  for (let i = 0; i < 5; i++) {
    const val = min + ((max - min) * i) / 4;
    const yy = y(val);

    svg += `
      <line x1="${l}" y1="${yy}" x2="${w - r}" y2="${yy}"
        stroke="currentColor" stroke-opacity=".13" />
      <text x="${l - 8}" y="${yy + 4}" text-anchor="end"
        font-size="11" fill="currentColor">${val.toFixed(1)}</text>
    `;
  }

  const points = sorted
    .map((v, i) => `${i ? "L" : "M"} ${x(i)} ${y(num(v.weight))}`)
    .join(" ");

  svg += `<path d="${points}" fill="none" stroke="#c66c94"
    stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />`;

  sorted.forEach((v, i) => {
    const day = Number(v.date.slice(-2));

    svg += `
      <circle cx="${x(i)}" cy="${y(num(v.weight))}" r="4" fill="#c66c94">
        <title>${day}일 · ${num(v.weight).toFixed(1)}kg</title>
      </circle>
    `;
  });

  [
    0,
    Math.floor((sorted.length - 1) / 2),
    sorted.length - 1
  ].filter((v, i, a) => a.indexOf(v) === i).forEach(i => {
    svg += `
      <text x="${x(i)}" y="${h - 10}" text-anchor="middle"
        font-size="11" fill="currentColor">${Number(sorted[i].date.slice(-2))}일</text>
    `;
  });

  svg += "</svg>";
  el.innerHTML = svg;
}

async function renderWeight() {
  $("weightMonth").textContent = monthLabel(months.weight);

  const rs = monthRecords("weight").sort((a, b) => a.date.localeCompare(b.date));

  $("weightFirst").textContent = rs.length
    ? `${num(rs[0].weight).toFixed(1)}kg` : "-";

  $("weightLast").textContent = rs.length
    ? `${num(rs[rs.length - 1].weight).toFixed(1)}kg` : "-";

  const change = rs.length > 1
    ? num(rs[rs.length - 1].weight) - num(rs[0].weight)
    : null;

  $("weightChange").textContent = change == null
    ? "-"
    : `${change > 0 ? "+" : ""}${change.toFixed(1)}kg`;

  renderWeightChart(rs);

  const list = $("weightList");
  list.innerHTML = "";

  // 기존처럼 전체 체중 기록 목록을 표시한다.
  const all = sortNewest(cache.weight);

  if (!all.length) {
    showEmpty("weightList");
    return;
  }

  all.forEach(r => {
    list.append(
      itemCard({
        title: `${formatDate(r.date)} · ${num(r.weight).toFixed(1)}kg`,
        meta: "체중 측정",
        actions: [
          {
            label: "수정",
            onClick: () => {
              const f = $("weightForm");

              f.elements.id.value = r.id;
              f.elements.date.value = r.date;
              f.elements.weight.value = r.weight;
              $("cancelWeightEdit").classList.remove("hidden");

              f.scrollIntoView({ behavior: "smooth", block: "center" });
            }
          },
          {
            label: "삭제",
            danger: true,
            onClick: () => deleteAndRefresh(C.weight, r.id)
          }
        ]
      })
    );
  });
}

// 약물 관리

function activeMeds() {
  return cache.meds
    .filter(m => m.active !== false)
    .sort((a, b) => (a.name || "").localeCompare(b.name || "", "ko"));
}

function resetMedicationForm(clearMessage = true) {
  const f = $("medicationForm");

  f.reset();
  f.elements.id.value = "";
  $("medManageSelect").value = "";
  $("medStartDate").value = localDate();
  $("medStatus").value = "true";
  $("cancelMedicationEdit").classList.add("hidden");

  const submit = f.querySelector('[type="submit"]');
  submit.textContent = "약물 등록";

  if (clearMessage) showMessage("medicationMessage", "");
}

function renderMedicationSelector() {
  const select = $("medManageSelect");
  const selectedId = select.value;

  select.innerHTML = "";

  const newOption = document.createElement("option");
  newOption.value = "";
  newOption.textContent = "＋ 새 약물 등록";
  select.append(newOption);

  [...cache.meds]
    .sort((a, b) => (a.name || "").localeCompare(b.name || "", "ko"))
    .forEach(m => {
      const option = document.createElement("option");
      option.value = m.id;
      option.textContent =
        `${m.name}${m.active === false ? " (복용 중단)" : ""}`;
      select.append(option);
    });

  if (selectedId && cache.meds.some(m => m.id === selectedId)) {
    select.value = selectedId;
  }
}

function selectMedicationForEdit(id) {
  const f = $("medicationForm");

  if (!id) {
    resetMedicationForm();
    return;
  }

  const med = cache.meds.find(m => m.id === id);

  if (!med) {
    resetMedicationForm();
    return;
  }

  f.elements.id.value = med.id;
  f.elements.name.value = med.name || "";
  f.elements.dose.value = med.dose || "";
  f.elements.startDate.value = med.startDate || localDate();
  f.elements.active.value = med.active === false ? "false" : "true";

  $("cancelMedicationEdit").classList.remove("hidden");
  f.querySelector('[type="submit"]').textContent = "변경사항 저장";

  showMessage("medicationMessage", "선택한 약물의 정보를 수정할 수 있어요.");
}

$("medManageSelect").addEventListener("change", e => {
  selectMedicationForEdit(e.target.value);
});

$("cancelMedicationEdit").addEventListener("click", () => {
  resetMedicationForm();
});

// 복용 상태 선택란에서 약물 삭제
// 삭제 이력을 먼저 저장하고, 그 다음 실제 약물 정보를 삭제한다.

$("medStatus").addEventListener("change", async e => {
  if (e.target.value !== "delete") return;

  const select = e.target;
  const id = $("medicationForm").elements.id.value;
  const med = cache.meds.find(m => m.id === id);

  if (!med) {
    alert("먼저 삭제할 약물을 선택해 주세요.");
    select.value = "true";
    return;
  }

  if (!confirm(
    `${med.name} 약물 정보를 삭제할까요?\n\n` +
    "삭제 이력은 보관되며 기존 복용 기록과 변경 이력은 유지됩니다."
  )) {
    select.value = med.active === false ? "false" : "true";
    return;
  }

  select.disabled = true;

  try {
    const deletedAt = new Date().toISOString();
    const deletedDate = localDate();

    // 삭제 이력을 별도 문서로 저장한다.
    await saveDoc(C.changes, newId(), {
      date: deletedDate,
      deletedAt,
      medicationId: med.id,
      medicationName: med.name || "이름 없는 약물",
      action: "삭제",
      dose: med.dose || "",
      startDate: med.startDate || "",
      active: med.active !== false,
      note: [
        "약물 삭제",
        `약물명: ${med.name || "미입력"}`,
        `용량·복용법: ${med.dose || "미입력"}`,
        `시작 날짜: ${formatDate(med.startDate)}`,
        `삭제 당시 상태: ${med.active === false ? "복용 중단" : "복용 중"}`
      ].join("\n")
    });

    // 기존 복용 기록과 변경 이력은 삭제하지 않는다.
    await removeDoc(C.meds, id);
    await refreshData();

    resetMedicationForm();
    renderMedicationSelector();
    await renderMedication();

    showMessage(
      "medicationMessage",
      "약물을 삭제하고 삭제 이력을 저장했어요."
    );
  } catch (err) {
    console.error(err);

    // 삭제 이력 저장 후 실제 삭제가 실패했을 수도 있으므로 데이터를 다시 읽는다.
    await refreshData().catch(console.error);
    renderMedicationSelector();

    const currentMed = cache.meds.find(m => m.id === id);

    if (currentMed) {
      $("medManageSelect").value = id;
      selectMedicationForEdit(id);
    } else {
      resetMedicationForm();
    }

    alert(
      "약물 삭제 과정에서 문제가 발생했어요. 약물 목록과 변경 이력을 확인해 주세요."
    );
  } finally {
    select.disabled = false;
  }
});

// 약물 등록 및 수정 시 변경 이력을 함께 저장한다.

$("medicationForm").addEventListener("submit", async e => {
  e.preventDefault();

  const f = e.currentTarget;
  const btn = f.querySelector('[type="submit"]');
  btn.disabled = true;

  try {
    if (f.elements.active.value === "delete") {
      throw new Error("삭제는 복용 상태 선택란에서 진행해 주세요.");
    }

    const editingId = f.elements.id.value;
    const existing = editingId
      ? cache.meds.find(m => m.id === editingId)
      : null;

    const data = {
      name: f.elements.name.value.trim(),
      dose: f.elements.dose.value.trim(),
      startDate: f.elements.startDate.value,
      active: f.elements.active.value === "true"
    };

    if (!data.name || !data.startDate) {
      throw new Error("약물명과 시작 날짜를 입력해 주세요.");
    }

    const id = editingId || newId();
    const now = localDate();

    if (!existing) {
      await saveDoc(C.meds, id, data);

      await saveDoc(C.changes, newId(), {
        date: now,
        medicationId: id,
        medicationName: data.name,
        action: "등록",
        dose: data.dose,
        startDate: data.startDate,
        active: data.active,
        note:
          `약물 등록 · 용량·복용법: ${data.dose || "미입력"} · ` +
          `시작 날짜: ${formatDate(data.startDate)} · ` +
          `상태: ${data.active ? "복용 중" : "복용 중단"}`
      });
    } else {
      const nameChanged = existing.name !== data.name;
      const doseChanged = (existing.dose || "") !== data.dose;
      const startChanged = (existing.startDate || "") !== data.startDate;
      const statusChanged = (existing.active !== false) !== data.active;

      if (!nameChanged && !doseChanged && !startChanged && !statusChanged) {
        showMessage("medicationMessage", "변경된 내용이 없어요.");
        return;
      }

      await saveDoc(C.meds, id, data);

      if (nameChanged || doseChanged || startChanged) {
        const details = [];

        if (nameChanged) {
          details.push(`약물명: ${existing.name || "미입력"} → ${data.name}`);
        }

        if (doseChanged) {
          details.push(
            `용량·복용법: ${existing.dose || "미입력"} → ${data.dose || "미입력"}`
          );
        }

        if (startChanged) {
          details.push(
            `시작 날짜: ${formatDate(existing.startDate)} → ${formatDate(data.startDate)}`
          );
        }

        await saveDoc(C.changes, newId(), {
          date: now,
          medicationId: id,
          medicationName: data.name,
          action: "정보 수정",
          dose: data.dose,
          startDate: data.startDate,
          active: data.active,
          note: details.join("\n")
        });
      }

      if (statusChanged) {
        await saveDoc(C.changes, newId(), {
          date: now,
          medicationId: id,
          medicationName: data.name,
          action: data.active ? "복용 재개" : "복용 중단",
          dose: data.dose,
          startDate: data.startDate,
          active: data.active,
          note:
            `복용 상태 변경: ${existing.active === false ? "복용 중단" : "복용 중"} → ` +
            `${data.active ? "복용 중" : "복용 중단"}`
        });
      }
    }

    await refreshData();

    resetMedicationForm(false);
    renderMedicationSelector();
    await renderMedication();

    showMessage(
      "medicationMessage",
      existing
        ? "약물 정보를 수정하고 변경 이력을 저장했어요."
        : "약물을 등록하고 변경 이력을 저장했어요."
    );
  } catch (err) {
    console.error(err);
    showMessage(
      "medicationMessage",
      err.message || "약물을 저장하지 못했어요.",
      true
    );
  } finally {
    btn.disabled = false;
  }
});

// 복용 체크

function renderMedicationChecks() {
  const box = $("medicationChecks");
  box.innerHTML = "";

  const meds = activeMeds();

  if (!meds.length) {
    showEmpty("medicationChecks", "현재 복용 중인 약물이 없어요.");
    return;
  }

  const date = $("medLogDate").value || localDate();
  const logs = cache.logs.filter(l => l.date === date);

  meds.forEach(m => {
    const log = logs.find(l => l.medicationId === m.id);

    const row = document.createElement("div");
    row.className = "med-check";

    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.id = `medcheck-${m.id}`;
    cb.dataset.medId = m.id;
    cb.checked = Boolean(log?.taken);

    const label = document.createElement("label");
    label.htmlFor = cb.id;
    label.textContent = m.name;

    const dose = document.createElement("span");
    dose.className = "dose";
    dose.textContent = m.dose || "용량 미입력";

    label.append(document.createElement("br"), dose);
    row.append(cb, label);
    box.append(row);
  });
}

$("medLogDate").addEventListener("change", () => {
  renderMedicationChecks();
  showMessage("medicationLogMessage", "");
});

$("medicationLogForm").addEventListener("submit", async e => {
  e.preventDefault();

  const btn = e.currentTarget.querySelector('[type="submit"]');
  btn.disabled = true;

  try {
    const date = $("medLogDate").value;

    if (!date) throw new Error("복용 기록 날짜를 선택해 주세요.");

    const checks = [
      ...$("medicationChecks").querySelectorAll('input[type="checkbox"]')
    ];

    if (!checks.length) {
      throw new Error("먼저 복용 중인 약물을 등록해 주세요.");
    }

    const note = $("medLogNote").value.trim();

    for (const cb of checks) {
      const med = cache.meds.find(m => m.id === cb.dataset.medId);
      const id = `${date}_${cb.dataset.medId}`;

      await saveDoc(C.logs, id, {
        date,
        medicationId: cb.dataset.medId,
        medicationName: med?.name || "삭제된 약물",
        dose: med?.dose || "",
        taken: cb.checked,
        note
      });
    }

    await refreshData();

    showMessage("medicationLogMessage", "복용 여부를 저장했어요.");
    await renderMedication();
  } catch (err) {
    console.error(err);
    showMessage(
      "medicationLogMessage",
      err.message || "복용 기록을 저장하지 못했어요.",
      true
    );
  } finally {
    btn.disabled = false;
  }
});

// 약물 변경 이력
// 월 선택은 약물 변경 이력과 복용 기록 조회에 공통 적용된다.

async function renderMedicationChanges() {
  const box = $("medicationChanges");
  box.innerHTML = "";

const changes = cache.changes
  .filter(r =>
    (r.date || "").startsWith(months.medicationLogs)
  )
  .sort((a, b) => {
    const timeA = a.createdAt || a.updatedAt || "";
    const timeB = b.createdAt || b.updatedAt || "";

    if (timeA !== timeB) {
      return timeB.localeCompare(timeA);
    }

    return (b.id || "").localeCompare(a.id || "");
  });

  if (!changes.length) {
    showEmpty("medicationChanges", "선택한 달에 약물 변경 이력이 없어요.");
    return;
  }

  changes.forEach(r => {
    const details = [];

    details.push(
      r.dose ? `용량·복용법: ${r.dose}` : "용량·복용법 미입력"
    );

    if (r.action === "삭제") {
      details.push(
        `삭제 당시 상태: ${r.active === false ? "복용 중단" : "복용 중"}`
      );

      if (r.startDate) {
        details.push(`시작 날짜: ${formatDate(r.startDate)}`);
      }
    }

    box.append(
      itemCard({
        title:
          `${formatDate(r.date)} · ` +
          `${r.medicationName || "약물"} · ${r.action || "변경"}`,
        meta: details.join(" · "),
        context: r.note,
        actions: [
          {
            label: "삭제",
            danger: true,
            onClick: () => deleteAndRefresh(C.changes, r.id)
          }
        ]
      })
    );
  });
}

// 복용 기록 조회
// 선택한 월에 해당하는 복용 기록만 표시한다.

async function renderMedicationLogHistory() {
  const logBox = $("medicationLogHistory");
  logBox.innerHTML = "";

  $("medicationLogsMonth").textContent =
    monthLabel(months.medicationLogs);

  const logs = sortNewest(
    cache.logs.filter(r =>
      (r.date || "").startsWith(months.medicationLogs)
    )
  );

  if (!logs.length) {
    showEmpty("medicationLogHistory", "선택한 달에 복용 기록이 없어요.");
    return;
  }

  const grouped = new Map();

  logs.forEach(r => {
    if (!grouped.has(r.date)) grouped.set(r.date, []);
    grouped.get(r.date).push(r);
  });

  grouped.forEach((dayLogs, date) => {
    const takenCount = dayLogs.filter(r => r.taken).length;
    const notTakenCount = dayLogs.filter(r => !r.taken).length;

    const details = dayLogs
      .map(r =>
        `${r.medicationName || "약물"}: ${r.taken ? "복용" : "미복용"} (${r.dose || "용량 미입력"})`
      )
      .join("\n");

    const notes = [
      ...new Set(dayLogs.map(r => (r.note || "").trim()).filter(Boolean))
    ].join("\n");

    logBox.append(
      itemCard({
        title: formatDate(date),
        meta: `${takenCount}개 복용 · ${notTakenCount}개 미복용`,
        context: details + (notes ? `\n메모: ${notes}` : ""),
        actions: [
          {
            label: "이 날짜 기록 전체 삭제",
            danger: true,
            onClick: async () => {
              if (!confirm(`${formatDate(date)} 복용 기록을 모두 삭제할까요?`)) {
                return;
              }

              try {
                for (const r of dayLogs) {
                  await removeDoc(C.logs, r.id);
                }

                await refreshData();
                await renderMedication();
              } catch (err) {
                console.error(err);
                alert("복용 기록을 삭제하지 못했어요.");
              }
            }
          }
        ]
      })
    );
  });
}

async function renderMedication() {
  $("medicationLogsMonth").textContent =
    monthLabel(months.medicationLogs);

  renderMedicationSelector();
  renderMedicationChecks();

  await renderMedicationChanges();
  await renderMedicationLogHistory();
}

// 대시보드

async function renderDashboard() {
  $("todayLabel").textContent = formatDate(today);

  $("dashBehavior").textContent =
    cache.behavior.filter(r => r.date === today).length;

  $("dashCrying").textContent =
    cache.crying.filter(r => r.date === today).length;

  const latestWeight = sortNewest(cache.weight)[0];

  $("dashWeight").textContent = latestWeight
    ? num(latestWeight.weight).toFixed(1)
    : "-";

  const todaysLogs = cache.logs.filter(r => r.date === today);

  $("dashMeds").textContent =
    todaysLogs.filter(r => r.taken).length;
}

// 날짜 기본값 및 첫 화면

for (const id of [
  "behaviorDate",
  "cryDate",
  "weightDate",
  "medStartDate",
  "medLogDate"
]) {
  $(id).value = today;
}

try {
  await refreshData();
  await renderMedication();
  await renderDashboard();
} catch (error) {
  console.error("초기 데이터 불러오기 오류:", error);
  alert("데이터를 불러오지 못했어요. Firebase 설정과 Firestore 보안 규칙을 확인해 주세요.");
}
