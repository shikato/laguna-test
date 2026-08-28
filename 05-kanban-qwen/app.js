(function () {
  "use strict";

  const STORAGE_KEY = "kanban-board-state-v1";

  const LABELS = [
    { value: "red", name: "赤" },
    { value: "orange", name: "オレンジ" },
    { value: "green", name: "緑" },
    { value: "blue", name: "青" },
    { value: "purple", name: "紫" },
  ];

  let state = { columns: [], search: "" };
  let draggedCardId = null;
  let suppressCardClick = false;
  let currentEditCardId = null;
  let currentColumnId = null;

  const boardEl = document.getElementById("board");
  const searchInput = document.getElementById("search-input");
  const addColumnBtn = document.getElementById("add-column-btn");
  const cardDialog = document.getElementById("card-dialog");
  const cardForm = document.getElementById("card-form");
  const cardIdInput = document.getElementById("card-id");
  const cardDialogTitle = document.getElementById("card-dialog-title");
  const cardTitleInput = document.getElementById("card-title");
  const cardDescInput = document.getElementById("card-desc");
  const cardLabelSelect = document.getElementById("card-label");
  const cardDueInput = document.getElementById("card-due");
  const cardDeleteBtn = document.getElementById("card-delete-btn");
  const cardCancelBtn = document.getElementById("card-cancel-btn");

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function defaultState() {
    return {
      columns: [
        { id: uid(), title: "未着手", cards: [] },
        { id: uid(), title: "進行中", cards: [] },
        { id: uid(), title: "完了", cards: [] },
      ],
      search: "",
    };
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      const parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.columns)) return defaultState();
      return {
        columns: parsed.columns.map((col) => ({
          id: String(col.id || uid()),
          title: String(col.title || "カラム"),
          cards: Array.isArray(col.cards)
            ? col.cards.map(normalizeCard)
            : [],
        })),
        search: "",
      };
    } catch (e) {
      return defaultState();
    }
  }

  function normalizeCard(card) {
    return {
      id: String(card.id || uid()),
      title: String(card.title || ""),
      desc: String(card.desc || ""),
      label: LABELS.some((l) => l.value === card.label) ? card.label : "",
      due: typeof card.due === "string" && card.due ? card.due : "",
    };
  }

  function saveState() {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ columns: state.columns })
    );
  }

  function isOverdue(card) {
    if (!card.due) return false;
    const due = new Date(card.due + "T23:59:59");
    return !isNaN(due.getTime()) && due < new Date();
  }

  function matchesSearch(card) {
    const q = state.search.trim().toLowerCase();
    if (!q) return true;
    return (
      card.title.toLowerCase().includes(q) ||
      card.desc.toLowerCase().includes(q)
    );
  }

  function esc(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  function render() {
    boardEl.innerHTML = "";
    for (const col of state.columns) {
      boardEl.appendChild(renderColumn(col));
    }
    applySearch();
  }

  function renderColumn(col) {
    const section = document.createElement("section");
    section.className = "column";
    section.dataset.columnId = col.id;

    const header = document.createElement("div");
    header.className = "column-header";

    const titleInput = document.createElement("input");
    titleInput.type = "text";
    titleInput.className = "column-title";
    titleInput.value = col.title;
    titleInput.setAttribute("aria-label", "カラム名");
    titleInput.addEventListener("change", () => {
      const v = titleInput.value.trim();
      col.title = v ? v : "カラム";
      titleInput.value = col.title;
      saveState();
    });
    titleInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        titleInput.blur();
      }
    });

    const count = document.createElement("span");
    count.className = "column-count";
    count.textContent = String(col.cards.length);

    const menu = document.createElement("div");
    menu.className = "column-menu";

    const deleteColBtn = document.createElement("button");
    deleteColBtn.type = "button";
    deleteColBtn.className = "btn btn-ghost";
    deleteColBtn.textContent = "削除";
    deleteColBtn.title = "カラムを削除";
    deleteColBtn.addEventListener("click", () => {
      const msg =
        "カラム「" +
        col.title +
        "」と" +
        col.cards.length +
        "件のカードを削除します。よろしいですか？";
      if (!window.confirm(msg)) return;
      state.columns = state.columns.filter((c) => c.id !== col.id);
      saveState();
      render();
    });

    menu.appendChild(deleteColBtn);
    header.appendChild(titleInput);
    header.appendChild(count);
    header.appendChild(menu);

    const body = document.createElement("div");
    body.className = "column-body";
    body.dataset.columnId = col.id;

    const searching = state.search.trim().length > 0;
    let visible = 0;
    for (const card of col.cards) {
      if (!matchesSearch(card)) continue;
      visible++;
      body.appendChild(renderCard(card));
    }
    if (col.cards.length === 0) {
      const hint = document.createElement("div");
      hint.className = "empty-hint";
      hint.textContent = "カードがありません";
      body.appendChild(hint);
    } else if (visible === 0) {
      const hint = document.createElement("div");
      hint.className = "empty-hint";
      hint.textContent = "一致するカードがありません";
      body.appendChild(hint);
    }

    body.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      body.classList.add("drag-over");
    });
    body.addEventListener("dragleave", (e) => {
      if (!body.contains(e.relatedTarget)) {
        body.classList.remove("drag-over");
      }
    });
    body.addEventListener("drop", (e) => {
      e.preventDefault();
      body.classList.remove("drag-over");
      handleDrop(e, col, body);
    });

    const addCardBtn = document.createElement("button");
    addCardBtn.type = "button";
    addCardBtn.className = "column-add-card";
    addCardBtn.textContent = "＋ カード追加";
    addCardBtn.addEventListener("click", () => {
      openCardDialog(null, col.id);
    });

    section.appendChild(header);
    section.appendChild(body);
    section.appendChild(addCardBtn);
    return section;
  }

  function renderCard(card) {
    const el = document.createElement("article");
    el.className = "card";
    el.dataset.cardId = card.id;
    el.draggable = true;
    if (isOverdue(card)) el.classList.add("overdue");
    el.classList.toggle("hidden", !matchesSearch(card));

    if (card.label) {
      const labelEl = document.createElement("span");
      labelEl.className = "card-label-color label-" + card.label;
      labelEl.dataset.label = card.label;
      el.appendChild(labelEl);
    }

    const titleEl = document.createElement("h3");
    titleEl.className = "card-title";
    titleEl.textContent = card.title;
    el.appendChild(titleEl);

    if (card.desc) {
      const descEl = document.createElement("p");
      descEl.className = "card-desc";
      descEl.textContent = card.desc;
      el.appendChild(descEl);
    }

    const footer = document.createElement("div");
    footer.className = "card-footer";

    if (card.due) {
      const dueEl = document.createElement("span");
      dueEl.className = "due-date";
      if (isOverdue(card)) {
        dueEl.classList.add("overdue");
        dueEl.textContent = "期限切れ " + card.due;
      } else {
        dueEl.textContent = "期限 " + card.due;
      }
      footer.appendChild(dueEl);
    }

    const actions = document.createElement("div");
    actions.className = "card-actions";

    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "btn btn-ghost";
    editBtn.textContent = "編集";
    editBtn.addEventListener("click", () => {
      openCardDialog(card.id, null);
    });

    actions.appendChild(editBtn);
    footer.appendChild(actions);
    el.appendChild(footer);

    el.addEventListener("click", (e) => {
      if (suppressCardClick) return;
      const target = e.target;
      if (target && target.closest && target.closest(".card-actions")) return;
      openCardDialog(card.id, null);
    });

    el.addEventListener("dragstart", (e) => {
      draggedCardId = card.id;
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", card.id);
      requestAnimationFrame(() => el.classList.add("dragging"));
    });
    el.addEventListener("dragend", () => {
      draggedCardId = null;
      el.classList.remove("dragging");
      document
        .querySelectorAll(".column-body.drag-over")
        .forEach((b) => b.classList.remove("drag-over"));
    });

    return el;
  }

  function handleDrop(e, col, body) {
    const cardId =
      draggedCardId || e.dataTransfer.getData("text/plain") || null;
    if (!cardId) return;

    const fromCol = state.columns.find((c) =>
      c.cards.some((cd) => cd.id === cardId)
    );
    if (!fromCol) return;

    const card = fromCol.cards.find((cd) => cd.id === cardId);
    if (!card) return;

    const cardIndex = fromCol.cards.indexOf(card);
    fromCol.cards.splice(cardIndex, 1);

    const afterId = getDropAfterId(e, body);
    if (afterId == null) {
      col.cards.push(card);
    } else {
      const idx = col.cards.findIndex((cd) => cd.id === afterId);
      if (idx === -1) col.cards.push(card);
      else col.cards.splice(idx, 0, card);
    }

    saveState();
    suppressCardClick = true;
    setTimeout(() => {
      suppressCardClick = false;
    }, 150);
    render();
  }

  function getDropAfterId(e, body) {
    const cards = Array.from(
      body.querySelectorAll(".card:not(.dragging):not(.hidden)")
    );
    let closest = { offset: -Infinity, el: null };
    for (const c of cards) {
      const rect = c.getBoundingClientRect();
      const offset = e.clientY - rect.top - rect.height / 2;
      if (offset < 0 && offset > closest.offset) {
        closest = { offset: offset, el: c };
      }
    }
    return closest.el ? closest.el.dataset.cardId : null;
  }

  function applySearch() {
    const q = state.search.trim().toLowerCase();
    if (!q) return;
    const cards = document.querySelectorAll(".card");
    cards.forEach((el) => {
      const card = findCardById(el.dataset.cardId);
      el.classList.toggle("hidden", !card || !matchesSearch(card));
    });
    updateEmptyHints();
  }

  function updateEmptyHints() {
    document.querySelectorAll(".column-body").forEach((body) => {
      const col = state.columns.find(
        (c) => c.id === body.dataset.columnId
      );
      if (!col) return;
      const visibleCount = col.cards.filter(matchesSearch).length;
      let hint = body.querySelector(".empty-hint");
      const searching = state.search.trim().length > 0;
      if (col.cards.length === 0 || (searching && visibleCount === 0)) {
        if (!hint) {
          hint = document.createElement("div");
          hint.className = "empty-hint";
          body.appendChild(hint);
      }
      hint.textContent =
        col.cards.length === 0 ? "カードがありません" : "一致するカードがありません";
    } else if (hint) {
        hint.remove();
      }
    });
  }

  function findCardById(id) {
    for (const col of state.columns) {
      const card = col.cards.find((cd) => cd.id === id);
      if (card) return card;
    }
    return null;
  }

  function findColumnOfCard(cardId) {
    return state.columns.find((c) => c.cards.some((cd) => cd.id === cardId));
  }

  function openCardDialog(cardId, columnId) {
    currentEditCardId = cardId || null;
    currentColumnId = columnId || null;

    if (cardId) {
      const card = findCardById(cardId);
      if (!card) return;
      const col = findColumnOfCard(cardId);
      currentColumnId = col ? col.id : null;
      cardDialogTitle.textContent = "カード編集";
      cardIdInput.value = card.id;
      cardTitleInput.value = card.title;
      cardDescInput.value = card.desc;
      cardLabelSelect.value = card.label;
      cardDueInput.value = card.due;
      cardDeleteBtn.classList.add("visible");
    } else {
      cardDialogTitle.textContent = "新規カード";
      cardIdInput.value = "";
      cardTitleInput.value = "";
      cardDescInput.value = "";
      cardLabelSelect.value = "";
      cardDueInput.value = "";
      cardDeleteBtn.classList.remove("visible");
    }

    if (!cardDialog.showModal) {
      cardDialog.setAttribute("open", "");
    } else {
      cardDialog.showModal();
    }
    cardTitleInput.focus();
  }

  function closeCardDialog() {
    if (cardDialog.close) cardDialog.close();
    else cardDialog.removeAttribute("open");
    currentEditCardId = null;
    currentColumnId = null;
  }

  function handleCardSubmit(e) {
    e.preventDefault();
    const title = cardTitleInput.value.trim();
    if (!title) {
      cardTitleInput.focus();
      return;
    }
    const data = {
      title: title,
      desc: cardDescInput.value,
      label: cardLabelSelect.value,
      due: cardDueInput.value,
    };

    if (currentEditCardId) {
      const card = findCardById(currentEditCardId);
      if (card) Object.assign(card, data);
    } else {
      const col = state.columns.find((c) => c.id === currentColumnId);
      if (col) {
        col.cards.push({ id: uid(), ...data });
      }
    }
    saveState();
    closeCardDialog();
    render();
  }

  function handleCardDelete() {
    if (!currentEditCardId) return;
    const card = findCardById(currentEditCardId);
    if (!card) {
      closeCardDialog();
      return;
    }
    if (!window.confirm("このカードを削除します。よろしいですか？")) return;
    const col = findColumnOfCard(currentEditCardId);
    if (col) {
      col.cards = col.cards.filter((cd) => cd.id !== currentEditCardId);
      saveState();
    }
    closeCardDialog();
    render();
  }

  function handleAddColumn() {
    state.columns.push({ id: uid(), title: "新規カラム", cards: [] });
    saveState();
    render();
    const cols = boardEl.querySelectorAll(".column");
    const last = cols[cols.length - 1];
    if (last) {
      const input = last.querySelector(".column-title");
      if (input) {
        input.focus();
        input.select();
      }
    }
  }

  function initLabelOptions() {
    for (const l of LABELS) {
      const opt = document.createElement("option");
      opt.value = l.value;
      opt.textContent = l.name;
      cardLabelSelect.appendChild(opt);
    }
  }

  function init() {
    state = loadState();
    initLabelOptions();
    render();

    searchInput.value = state.search;
    searchInput.addEventListener("input", () => {
      state.search = searchInput.value;
      applySearch();
    });

    addColumnBtn.addEventListener("click", handleAddColumn);
    cardForm.addEventListener("submit", handleCardSubmit);
    cardDeleteBtn.addEventListener("click", handleCardDelete);
    cardCancelBtn.addEventListener("click", closeCardDialog);
    cardDialog.addEventListener("cancel", (e) => {
      e.preventDefault();
      closeCardDialog();
    });
  }

  init();
})();
