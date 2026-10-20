
import { db } from "./firebase.js";
import {
  collection,
  doc,
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

let editingDate = null;

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
  const isHistory = view === "history";

  writeView.classList.toggle("hidden", isHistory);
  historyView.classList.toggle("hidden", !isHistory);

  document.querySelectorAll(".tab").forEach(button => {
    button.classList.toggle("active", button.dataset.view === view);
  });

  if (isHistory) {
    renderHistory();
  }
}

document.querySelectorAll(".tab").forEach(button => {
  button.addEventListener("click", () => setView(button.dataset.view));
});

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

function clearForm() {
  form.reset();
  cryList.innerHTML = "";
  editingDate = null;
  dateInput.value = localDateString();

  document.getElementById("saveButton").textContent = "기록 저장";

  setMessage("");
  renumberCryCards();
}

function loadRecord(record) {
  clearForm();

  editingDate = record.date;
  dateInput.value = record.date;

  const mood = form.querySelector(
    `input[name="mood"][value="${record.mood}"]`
  );

  if (mood) mood.checked = true;

  document.getElementById("dailyNote").value = record.note || "";

  (record.cries || []).forEach(cry => addCry(cry));

  document.getElementById("saveButton").textContent = "수정 내용 저장";

  setView("write");
  window.scrollTo({ top: 0, behavior: "smooth" });
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
    throw new Error("각 울음 기록의 시각, 지속 시간, 강도를 모두 입력해 주세요.");
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

form.addEventListener("submit", async event => {
  event.preventDefault();
  setMessage("");

  if (!dateInput.value) {
    setMessage("기록 날짜를 선택해 주세요.", true);
    return;
  }

  const saveButton = document.getElementById("saveButton");

  try {
    const record = collectRecord();

    if (!record.mood) {
      setMessage("오늘의 우울감 강도를 선택해 주세요.", true);
      return;
    }

    const previousDate = editingDate;

    saveButton.disabled = true;
    saveButton.textContent = "저장 중...";

    // 날짜를 문서 ID로 사용하여 날짜별 기록을 저장
    await setDoc(doc(db, COLLECTION_NAME, record.date), record);

    // 수정하면서 날짜가 변경된 경우 이전 날짜의 문서 삭제
    if (previousDate && previousDate !== record.date) {
      await deleteDoc(doc(db, COLLECTION_NAME, previousDate));
    }

    editingDate = record.date;
    saveButton.textContent = "수정 내용 저장";

    setMessage("기록을 저장했어요.");
  } catch (error) {
    console.error("기록 저장 오류:", error);
    setMessage(
      "기록을 저장하지 못했어요. Firebase 설정과 보안 규칙을 확인해 주세요.",
      true
    );
  } finally {
    saveButton.disabled = false;

    if (!editingDate) {
      saveButton.textContent = "기록 저장";
    } else {
      saveButton.textContent = "수정 내용 저장";
    }
  }
});

document.getElementById("addCry").addEventListener("click", () => addCry());

document.getElementById("resetForm").addEventListener("click", clearForm);

function formatDate(date) {
  const [year, month, day] = date.split("-");
  return `${year}.${month}.${day}`;
}

async function renderHistory() {
  historyList.innerHTML =
    '<div class="empty-state">기록을 불러오는 중...</div>';

  try {
    const records = await readRecords();

    historyList.innerHTML = "";

    if (!records.length) {
      historyList.innerHTML =
        '<div class="empty-state">아직 저장된 기록이 없어요.<br>첫 기록을 작성해 보세요.</div>';
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
      cryBadge.textContent = `울음 ${record.cries?.length || 0}회`;

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

    historyList.innerHTML =
      '<div class="empty-state">기록을 불러오지 못했어요. Firebase 설정과 보안 규칙을 확인해 주세요.</div>';
  }
}

dateInput.value = localDateString();
