import { db } from "./firebase.js";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const COLLECTION_NAME = "records";

const form = document.getElementById("recordForm");
const dateInput = document.getElementById("recordDate");
const cryList = document.getElementById("cryList");
const cryTemplate = document.getElementById("cryTemplate");
const cryCount = document.getElementById("cryCount");
const message = document.getElementById("formMessage");
const historyList = document.getElementById("historyList");
const writeView = document.getElementById("writeView");
const historyView = document.getElementById("historyView");
const reportView = document.getElementById("reportView");
const saveButton = document.getElementById("saveButton");

let editingDate = null;
let historyMonth = localDateString().slice(0, 7);
let reportMonth = localDateString().slice(0, 7);
let reportRequestId = 0;
let historyRequestId = 0;

function localDateString(date = new Date()) {
  const offset = date.getTimezoneOffset();

  return new Date(date.getTime() - offset * 60000)
    .toISOString()
    .slice(0, 10);
}

async function readRecords() {
  const snapshot = await getDocs(collection(db, COLLECTION_NAME));

  return snapshot.docs
    .map(item => item.data())
    .sort((a, b) => b.date.localeCompare(a.date));
}

function setMessage(text, isError = false) {
  message.textContent = text;
  message.style.color = isError ? "#b4234d" : "";
}

function setView(view) {
  writeView.classList.toggle("hidden", view !== "write");
  historyView.classList.toggle("hidden", view !== "history");
  reportView.classList.toggle("hidden", view !== "report");

  document.querySelectorAll(".tab").forEach(button => {
    button.classList.toggle("active", button.dataset.view === view);
  });

  if (view === "history") renderHistory();
  if (view === "report") renderReport();
}

document.querySelectorAll(".tab").forEach(button => {
  button.addEventListener("click", () => setView(button.dataset.view));
});

// 울음 기록 입력

function renumberCryCards() {
  const cards = [...cryList.querySelectorAll(".cry-card")];

  cards.forEach((card, index) => {
    card.querySelector(".cry-title").textContent = `울음 ${index + 1}회차`;

    card.querySelectorAll('input[type="radio"]').forEach(input => {
      input.name = `cryIntensity${index}`;
    });
  });

  cryCount.textContent = String(cards.length);
}

function addCry(data = {}) {
  const fragment = cryTemplate.content.cloneNode(true);
  const card = fragment.querySelector(".cry-card");

  card.querySelector(".cry-time").value = data.time || "";
  card.querySelector(".cry-duration").value = data.duration || "";

  card.querySelectorAll('input[type="radio"]').forEach(input => {
    input.checked = Number(input.value) === Number(data.intensity);
  });

  card.querySelector(".remove-cry").addEventListener("click", () => {
    card.remove();
    renumberCryCards();
  });

  cryList.appendChild(fragment);
  renumberCryCards();
}

function clearForm(date = localDateString()) {
  form.reset();
  cryList.innerHTML = "";
  editingDate = null;
  dateInput.value = date;
  saveButton.textContent = "기록 저장";
  setMessage("");
  renumberCryCards();
}

function fillForm(record) {
  clearForm(record.date);
  editingDate = record.date;

  const mood = form.querySelector(
    `input[name="mood"][value="${record.mood}"]`
  );

  if (mood) mood.checked = true;

  document.getElementById("dailyNote").value = record.note || "";

  (record.cries || []).forEach(cry => addCry(cry));

  saveButton.textContent = "수정 내용 저장";
}

function loadRecord(record) {
  fillForm(record);
  setView("write");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function loadTodayRecord() {
  const today = localDateString();
  dateInput.value = today;

  try {
    const snapshot = await getDoc(doc(db, COLLECTION_NAME, today));

    if (snapshot.exists()) {
      fillForm(snapshot.data());
    } else {
      clearForm(today);
    }
  } catch (error) {
    console.error("오늘 기록 불러오기 오류:", error);
    clearForm(today);
    setMessage(
      "오늘 기록을 불러오지 못했어요. Firebase 설정과 보안 규칙을 확인해 주세요.",
      true
    );
  }
}

function collectRecord() {
  const cries = [...cryList.querySelectorAll(".cry-card")].map(card => ({
    time: card.querySelector(".cry-time").value,
    duration: card.querySelector(".cry-duration").value,
    intensity: Number(
      card.querySelector('input[type="radio"]:checked')?.value || 0
    )
  }));

  if (cries.some(cry => !cry.time || !cry.duration || !cry.intensity)) {
    throw new Error(
      "각 울음 기록의 시각, 지속 시간, 강도를 모두 입력해 주세요."
    );
  }

  return {
    date: dateInput.value,
    mood: Number(
      form.querySelector('input[name="mood"]:checked')?.value || 0
    ),
    cries,
    cryCount: cries.length,
    note: document.getElementById("dailyNote").value.trim(),
    updatedAt: new Date().toISOString()
  };
}

// 기록 저장 및 수정

form.addEventListener("submit", async event => {
  event.preventDefault();
  setMessage("");

  if (!dateInput.value) {
    setMessage("기록 날짜를 선택해 주세요.", true);
    return;
  }

  try {
    const record = collectRecord();

    if (!record.mood) {
      setMessage("오늘의 우울감 강도를 선택해 주세요.", true);
      return;
    }

    const previousDate = editingDate;

    saveButton.disabled = true;
    saveButton.textContent = "저장 중...";

    await setDoc(doc(db, COLLECTION_NAME, record.date), record);

    if (previousDate && previousDate !== record.date) {
      await deleteDoc(doc(db, COLLECTION_NAME, previousDate));
    }

    editingDate = record.date;

    // 저장한 기록이 포함된 달을 지난 기록에서 표시
    historyMonth = record.date.slice(0, 7);

    setMessage("기록을 저장했어요.");

    // 저장 후 지난 기록 탭으로 이동
    setView("history");
  } catch (error) {
    console.error("기록 저장 오류:", error);

    setMessage(
      error.message?.startsWith("각 울음 기록")
        ? error.message
        : "기록을 저장하지 못했어요. Firebase 설정과 보안 규칙을 확인해 주세요.",
      true
    );
  } finally {
    saveButton.disabled = false;
    saveButton.textContent = editingDate ? "수정 내용 저장" : "기록 저장";
  }
});

document.getElementById("addCry").addEventListener("click", () => addCry());

// 날짜 표시

function formatDate(date) {
  const [year, month, day] = date.split("-");
  return `${year}.${month}.${day}`;
}

// 지난 기록: 월 선택 UI 생성

const historyHeading = historyView.querySelector(".section-heading");
const historyMonthControl = document.createElement("div");

historyMonthControl.className = "history-month-control";
historyMonthControl.innerHTML = `
  <button type="button" id="historyPrevMonth" aria-label="이전 달">‹</button>
  <h3 id="historyMonth"></h3>
  <button type="button" id="historyNextMonth" aria-label="다음 달">›</button>
`;

historyHeading.after(historyMonthControl);

function changeHistoryMonth(amount) {
  const [year, month] = historyMonth.split("-").map(Number);
  const date = new Date(year, month - 1 + amount, 1);

  historyMonth =
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

  renderHistory();
}

document.getElementById("historyPrevMonth").addEventListener("click", () => {
  changeHistoryMonth(-1);
});

document.getElementById("historyNextMonth").addEventListener("click", () => {
  changeHistoryMonth(1);
});

// 지난 기록 목록

async function renderHistory() {
  const requestId = ++historyRequestId;

  document.getElementById("historyMonth").textContent =
    `${Number(historyMonth.slice(0, 4))}년 ${Number(historyMonth.slice(5, 7))}월`;

  historyList.innerHTML =
    '<div class="empty-state">기록을 불러오는 중...</div>';

  try {
    const allRecords = await readRecords();

    // 월을 빠르게 이동했을 때 이전 요청 결과가 덮어쓰지 않도록 처리
    if (requestId !== historyRequestId) return;

    const records = allRecords.filter(record =>
      typeof record.date === "string" &&
      record.date.startsWith(`${historyMonth}-`)
    );

    historyList.innerHTML = "";

    if (!records.length) {
      historyList.innerHTML =
        '<div class="empty-state">이 달에는 저장된 기록이 없어요.</div>';
      return;
    }

    records.forEach(record => {
      const item = document.createElement("article");
      item.className = "history-item";

      const main = document.createElement("div");
      main.className = "history-main";

      const date = document.createElement("div");
      date.className = "history-date";
      date.textContent = formatDate(record.date);

      const badges = document.createElement("div");
      badges.className = "history-badges";

      const moodBadge = document.createElement("span");
      moodBadge.className = "small-badge";
      moodBadge.textContent = `우울감 ${record.mood}/5`;

      const cryBadge = document.createElement("span");
      cryBadge.className = "small-badge";
      cryBadge.textContent = `울음 ${(record.cries || []).length}회`;

      badges.append(moodBadge, cryBadge);
      main.append(date, badges);
      item.append(main);

      if (record.cries?.length) {
        const cryDetails = document.createElement("div");
        cryDetails.className = "history-cry";

        cryDetails.textContent = record.cries
          .map((cry, index) =>
            `${index + 1}회차 ${cry.time} · ${cry.duration} · 강도 ${cry.intensity}/5`
          )
          .join("  /  ");

        item.append(cryDetails);
      }

      if (record.note) {
        const note = document.createElement("p");
        note.className = "history-note";
        note.textContent = record.note;
        item.append(note);
      }

      const actions = document.createElement("div");
      actions.className = "history-actions";

      const edit = document.createElement("button");
      edit.type = "button";
      edit.textContent = "수정";
      edit.addEventListener("click", () => loadRecord(record));

      const remove = document.createElement("button");
      remove.type = "button";
      remove.textContent = "삭제";

      remove.addEventListener("click", async () => {
        if (!window.confirm(`${formatDate(record.date)} 기록을 삭제할까요?`)) {
          return;
        }

        remove.disabled = true;

        try {
          await deleteDoc(doc(db, COLLECTION_NAME, record.date));
          await renderHistory();
        } catch (error) {
          console.error("기록 삭제 오류:", error);
          setMessage("기록을 삭제하지 못했어요. 다시 확인해 주세요.", true);
          remove.disabled = false;
        }
      });

      actions.append(edit, remove);
      item.append(actions);
      historyList.append(item);
    });
  } catch (error) {
    console.error("기록 불러오기 오류:", error);

    if (requestId !== historyRequestId) return;

    historyList.innerHTML =
      '<div class="empty-state">기록을 불러오지 못했어요. Firebase 설정과 보안 규칙을 확인해 주세요.</div>';
  }
}

// 월간 리포트

function changeMonth(amount) {
  const [year, month] = reportMonth.split("-").map(Number);
  const date = new Date(year, month - 1 + amount, 1);

  reportMonth =
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

  renderReport();
}

document.getElementById("prevMonth").addEventListener("click", () => {
  changeMonth(-1);
});

document.getElementById("nextMonth").addEventListener("click", () => {
  changeMonth(1);
});

function countMostCommon(values) {
  if (!values.length) return "-";

  const counts = new Map();

  values.forEach(value => {
    counts.set(value, (counts.get(value) || 0) + 1);
  });

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])[0][0];
}


function showNumber(value) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function renderMoodChart(records, daysInMonth) {
  const container = document.getElementById("moodChart");

  const points = records
    .filter(record => Number(record.mood) >= 1 && Number(record.mood) <= 5)
    .sort((a, b) => a.date.localeCompare(b.date));

  if (!points.length) {
    container.innerHTML =
      '<p class="empty-state">이 달에는 우울감 기록이 없어요.</p>';
    return;
  }

  const width = 340;
  const height = 190;
  const left = 30;
  const right = 12;
  const top = 18;
  const bottom = 30;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;

  const x = day =>
    left + ((day - 1) / Math.max(daysInMonth - 1, 1)) * plotWidth;

  const y = score =>
    top + ((5 - score) / 4) * plotHeight;

  const grid = [1, 2, 3, 4, 5].map(score => `
    <line x1="${left}" y1="${y(score)}" x2="${width - right}" y2="${y(score)}"
      stroke="currentColor" stroke-opacity=".13"/>
    <text x="${left - 10}" y="${y(score) + 4}" text-anchor="middle"
      font-size="10" fill="currentColor">${score}</text>
  `).join("");

  const labels = [1, Math.ceil(daysInMonth / 2), daysInMonth]
    .filter((day, index, array) => array.indexOf(day) === index)
    .map(day => `
      <text x="${x(day)}" y="${height - 8}" text-anchor="middle"
        font-size="10" fill="currentColor">${day}일</text>
    `).join("");

  const line = points.map((record, index) => {
    const day = Number(record.date.slice(8, 10));
    return `${index ? "L" : "M"} ${x(day)} ${y(Number(record.mood))}`;
  }).join(" ");

  const circles = points.map(record => {
    const day = Number(record.date.slice(8, 10));
    const score = Number(record.mood);

    return `<circle cx="${x(day)}" cy="${y(score)}" r="3.5"
      fill="#c66c94">
      <title>${day}일 · 우울감 ${score}/5</title>
    </circle>`;
  }).join("");

  container.innerHTML = `
    <svg class="chart-svg" viewBox="0 0 ${width} ${height}" role="img"
      aria-label="날짜별 우울감 점수 그래프">
      ${grid}
      <path d="${line}" fill="none" stroke="#c66c94" stroke-width="2.5"
        stroke-linecap="round" stroke-linejoin="round"/>
      ${circles}
      ${labels}
    </svg>
  `;
}

function renderCryChart(records, daysInMonth) {
  const container = document.getElementById("cryChart");
  const recordMap = new Map(records.map(record => [record.date, record]));

  const values = Array.from({ length: daysInMonth }, (_, index) => {
    const day = index + 1;
    const date = `${reportMonth}-${String(day).padStart(2, "0")}`;

    if (!recordMap.has(date)) {
      return { day, count: null };
    }

    return {
      day,
      count: (recordMap.get(date).cries || []).length
    };
  });

  if (!records.length) {
    container.innerHTML =
      '<p class="empty-state">이 달에는 저장된 기록이 없어요.</p>';
    return;
  }

  const width = 340;
  const height = 190;
  const left = 28;
  const right = 10;
  const top = 15;
  const bottom = 30;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const maxCount = Math.max(1, ...values.map(item => item.count ?? 0));
  const slot = plotWidth / daysInMonth;
  const barWidth = Math.max(2, Math.min(10, slot * 0.65));

  const grid = Array.from({ length: 4 }, (_, index) => {
    const value = Math.ceil(maxCount * index / 3);
    const y = top + plotHeight - (value / maxCount) * plotHeight;

    return `
      <line x1="${left}" y1="${y}" x2="${width - right}" y2="${y}"
        stroke="currentColor" stroke-opacity=".12"/>
      <text x="${left - 7}" y="${y + 4}" text-anchor="middle"
        font-size="9" fill="currentColor">${value}</text>
    `;
  }).join("");

  const bars = values.map(item => {
    const x = left + (item.day - 0.5) * slot - barWidth / 2;

    if (item.count === null) {
      return `<line x1="${x + barWidth / 2}" y1="${top + plotHeight - 3}"
        x2="${x + barWidth / 2}" y2="${top + plotHeight}"
        stroke="currentColor" stroke-opacity=".2">
        <title>${item.day}일 · 기록 없음</title>
      </line>`;
    }

    const barHeight = item.count === 0
      ? 0
      : (item.count / maxCount) * plotHeight;

    const y = top + plotHeight - barHeight;

    return `<rect x="${x}" y="${y}" width="${barWidth}"
      height="${Math.max(item.count === 0 ? 0 : 2, barHeight)}"
      rx="2" fill="#c66c94" fill-opacity="${item.count === 0 ? 0.18 : 0.85}">
      <title>${item.day}일 · 울음 ${item.count}회</title>
    </rect>`;
  }).join("");

  const labels = [1, Math.ceil(daysInMonth / 2), daysInMonth]
    .filter((day, index, array) => array.indexOf(day) === index)
    .map(day => `
      <text x="${left + (day - 0.5) * slot}" y="${height - 8}"
        text-anchor="middle" font-size="10" fill="currentColor">${day}일</text>
    `).join("");

  container.innerHTML = `
    <svg class="chart-svg" viewBox="0 0 ${width} ${height}" role="img"
      aria-label="날짜별 울음 횟수 그래프">
      ${grid}
      ${bars}
      ${labels}
    </svg>
    <p class="chart-legend">
      <span class="legend-dot"></span> 기록한 날
      <span class="legend-dash"></span> 기록 없는 날
    </p>
  `;
}

async function renderReport() {
  const requestId = ++reportRequestId;
  const [year, month] = reportMonth.split("-").map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();

  document.getElementById("reportMonth").textContent =
    `${year}년 ${month}월`;

  document.getElementById("reportStatus").textContent =
    "기록을 분석하고 있어요.";

  try {
    const allRecords = await readRecords();

    // 월이 빠르게 바뀌면 가장 최근 요청 결과만 표시
    if (requestId !== reportRequestId) return;

    const records = allRecords
      .filter(record =>
        typeof record.date === "string" &&
        record.date.startsWith(`${reportMonth}-`)
      )
      .sort((a, b) => a.date.localeCompare(b.date));

    const totalCries = records.reduce(
      (sum, record) => sum + (record.cries || []).length,
      0
    );

    const moodValues = records
      .map(record => Number(record.mood))
      .filter(mood => mood >= 1 && mood <= 5);

    const averageMood = moodValues.length
      ? moodValues.reduce((sum, mood) => sum + mood, 0) / moodValues.length
      : null;

    const cryDays = records.filter(
      record => (record.cries || []).length > 0
    ).length;

    const allCries = records.flatMap(record => record.cries || []);

    const validIntensities = allCries
      .map(cry => Number(cry.intensity))
      .filter(value => value >= 1 && value <= 5);

    const avgIntensity = validIntensities.length
      ? validIntensities.reduce((sum, value) => sum + value, 0) /
        validIntensities.length
      : null;

    document.getElementById("statDays").textContent = records.length;
    document.getElementById("statCries").textContent = totalCries;

    document.getElementById("statMood").textContent =
      averageMood === null ? "-" : showNumber(averageMood);

    document.getElementById("statCryDays").textContent = cryDays;

    document.getElementById("avgIntensity").textContent =
      avgIntensity === null ? "-" : `${showNumber(avgIntensity)} / 5`;

    document.getElementById("commonDuration").textContent =
      countMostCommon(
        allCries.map(cry => cry.duration).filter(Boolean)
      );


    renderMoodChart(records, daysInMonth);
    renderCryChart(records, daysInMonth);

    const notesContainer = document.getElementById("monthlyNotes");
    notesContainer.innerHTML = "";

    const notes = records.filter(record => record.note?.trim());

    if (!notes.length) {
      notesContainer.innerHTML =
        '<p class="empty-state">이 달에 작성한 메모가 없어요.</p>';
    } else {
      notes.forEach(record => {
        const entry = document.createElement("article");
        entry.className = "monthly-note";

        const date = document.createElement("strong");
        date.textContent = formatDate(record.date);

        const text = document.createElement("p");
        text.textContent = record.note;

        entry.append(date, text);
        notesContainer.append(entry);
      });
    }

    document.getElementById("reportStatus").textContent =
      records.length
        ? `${records.length}일의 기록을 분석했어요. 기록이 없는 날은 우울감 평균에서 제외했어요.`
        : "선택한 달에는 저장된 기록이 없어요.";
  } catch (error) {
    console.error("월간 리포트 오류:", error);

    if (requestId !== reportRequestId) return;

    document.getElementById("reportStatus").textContent =
      "리포트를 불러오지 못했어요. Firebase 설정과 보안 규칙을 확인해 주세요.";

    ["statDays", "statCries", "statMood", "statCryDays"].forEach(id => {
      document.getElementById(id).textContent = "-";
    });

    document.getElementById("avgIntensity").textContent = "-";
    document.getElementById("commonDuration").textContent = "-";
    document.getElementById("monthlyNotes").innerHTML = "";
    document.getElementById("moodChart").innerHTML = "";
    document.getElementById("cryChart").innerHTML = "";
  }
}

// 최초 실행
loadTodayRecord();