document.addEventListener('DOMContentLoaded', () => {
    const STORAGE_KEY = 'kanban-board-data';

    // State management
    let state = {
        columns: [
            { id: 'col-1', title: '未着手', cardIds: [] },
            { id: 'col-2', title: '進行中', cardIds: [] },
            { id: 'col-3', title: '完了', cardIds: [] }
        ],
        cards: {},
        nextColumnId: 4,
        nextCardId: 1
    };

    // Elements
    const columnsEl = document.getElementById('columns');
    const addColumnBtn = document.getElementById('addColumnBtn');
    const columnDialog = document.getElementById('columnDialog');
    const columnDialogTitle = document.getElementById('columnDialogTitle');
    const columnNameInput = document.getElementById('columnNameInput');
    const columnCancelBtn = document.getElementById('columnCancelBtn');
    const columnSubmitBtn = document.getElementById('columnSubmitBtn');

    const cardDialog = document.getElementById('cardDialog');
    const cardDialogTitle = document.getElementById('cardDialogTitle');
    const cardTitleInput = document.getElementById('cardTitleInput');
    const cardDescriptionInput = document.getElementById('cardDescriptionInput');
    const cardDueDateInput = document.getElementById('cardDueDateInput');
    const cardCancelBtn = document.getElementById('cardCancelBtn');
    const cardSubmitBtn = document.getElementById('cardSubmitBtn');

    const searchBox = document.getElementById('searchBox');

    // Dialog state
    let currentColumnEditId = null;
    let currentCardEditId = null;
    let currentCardColumnId = null;
    let selectedLabel = null;

    // ---- Utility Functions ----

    function saveState() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        } catch(e) {
            console.error('Failed to save state:', e);
        }
    }

    function loadState() {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved) {
                state = JSON.parse(saved);
            }
        } catch(e) {
            console.error('Failed to load state:', e);
        }
    }

    function generateColumnId() {
        return 'col-' + (state.nextColumnId++);
    }

    function generateCardId() {
        return 'card-' + (state.nextCardId++);
    }

    function isOverdue(dueDateStr) {
        if (!dueDateStr) return false;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const due = new Date(dueDateStr);
        return due < today;
    }

    function formatDate(dateStr) {
        if (!dateStr) return '';
        return new Date(dateStr).toLocaleDateString('ja-JP');
    }

    // ---- Column Functions ----

    function addColumn() {
        const newColumn = {
            id: generateColumnId(),
            title: '新しいカラム',
            cardIds: []
        };
        state.columns.push(newColumn);
        saveState();
        renderColumns();
    }

    function renameColumn(columnId, newTitle) {
        const column = state.columns.find(c => c.id === columnId);
        if (column) {
            column.title = newTitle;
            saveState();
            renderColumns();
        }
    }

    function deleteColumn(columnId) {
        const column = state.columns.find(c => c.id === columnId);
        if (!column) return;
        
        // Move all cards to the first remaining column or orphan them
        if (state.columns.length > 1) {
            const targetColumn = state.columns.find(c => c.id !== columnId);
            if (targetColumn) {
                targetColumn.cardIds.push(...column.cardIds);
            }
        }
        
        // Delete cards
        column.cardIds.forEach(cardId => {
            delete state.cards[cardId];
        });
        
        state.columns = state.columns.filter(c => c.id !== columnId);
        saveState();
        renderColumns();
    }

    // ---- Card Functions ----

    function addCard(columnId, cardData) {
        const cardId = generateCardId();
        state.cards[cardId] = {
            id: cardId,
            title: cardData.title,
            description: cardData.description,
            label: cardData.label,
            dueDate: cardData.dueDate,
            columnId: columnId
        };
        const column = state.columns.find(c => c.id === columnId);
        if (column) {
            column.cardIds.push(cardId);
        }
        saveState();
        renderColumns();
    }

    function updateCard(cardId, cardData) {
        const card = state.cards[cardId];
        if (card) {
            card.title = cardData.title;
            card.description = cardData.description;
            card.label = cardData.label;
            card.dueDate = cardData.dueDate;
        }
        saveState();
        renderColumns();
    }

    function deleteCard(cardId) {
        const card = state.cards[cardId];
        if (card) {
            const column = state.columns.find(c => c.id === card.columnId);
            if (column) {
                column.cardIds = column.cardIds.filter(id => id !== cardId);
            }
            delete state.cards[cardId];
            saveState();
            renderColumns();
        }
    }

    function moveCard(cardId, newColumnId, newIndex) {
        const card = state.cards[cardId];
        if (!card) return;

        const oldColumn = state.columns.find(c => c.id === card.columnId);
        const newColumn = state.columns.find(c => c.id === newColumnId);
        
        if (oldColumn && oldColumn.id !== newColumnId) {
            oldColumn.cardIds = oldColumn.cardIds.filter(id => id !== cardId);
        }
        
        if (newColumn) {
            if (oldColumn && oldColumn.id === newColumnId) {
                // Moving within same column
                const idx = newColumn.cardIds.indexOf(cardId);
                if (idx > -1) {
                    newColumn.cardIds.splice(idx, 1);
                }
            } else {
                card.columnId = newColumnId;
            }
            newColumn.cardIds.splice(newIndex, 0, cardId);
        }
        
        saveState();
        renderColumns();
    }

    // ---- Search ----

    function filterCards(searchTerm) {
        if (!searchTerm) return state.cards;
        const term = searchTerm.toLowerCase().trim();
        const filtered = {};
        Object.keys(state.cards).forEach(cardId => {
            const card = state.cards[cardId];
            if (card.title.toLowerCase().includes(term) || 
                (card.description && card.description.toLowerCase().includes(term))) {
                filtered[cardId] = card;
            }
        });
        return filtered;
    }

    // ---- Render Functions ----

    function renderColumns() {
        columnsEl.innerHTML = '';
        const filteredCards = filterCards(searchBox.value);
        const visibleColumns = state.columns.map(col => ({
            ...col,
            cardIds: col.cardIds.filter(id => filteredCards[id])
        }));

        visibleColumns.forEach(col => {
            const colEl = createColumnElement(col, filteredCards);
            columnsEl.appendChild(colEl);
        });
    }

    function createColumnElement(column, allCards) {
        const div = document.createElement('div');
        div.className = 'column';
        div.dataset.columnId = column.id;
        
        div.innerHTML = `
            <div class="column-header">
                <input type="text" class="column-title" value="${escapeHtml(column.title)}" placeholder="カラム名">
                <div class="column-menu">
                    <button type="button" class="edit-column-btn" title="名前変更">✏️</button>
                    <button type="button" class="delete-column-btn" title="削除">🗑</button>
                </div>
            </div>
            <div class="cards-container" data-column-id="${column.id}">
                ${column.cardIds.map(cardId => createCardHTML(allCards[cardId])).join('')}
            </div>
            <button type="button" class="add-card-btn">＋カードを追加</button>
        `;

        // Event listeners
        const titleInput = div.querySelector('.column-title');
        titleInput.addEventListener('blur', () => {
            renameColumn(column.id, titleInput.value.trim() || column.title);
        });
        titleInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                renameColumn(column.id, titleInput.value.trim() || column.title);
            }
        });

        div.querySelector('.edit-column-btn').addEventListener('click', () => {
            openColumnDialog(column.id, column.title);
        });

        div.querySelector('.delete-column-btn').addEventListener('click', () => {
            if (confirm('カラムを削除しますか？')) {
                deleteColumn(column.id);
            }
        });

        div.querySelector('.add-card-btn').addEventListener('click', () => {
            openCardDialog(column.id);
        });

        // Drag and drop for column
        const cardsContainer = div.querySelector('.cards-container');
        cardsContainer.addEventListener('dragover', handleColumnDragOver);
        cardsContainer.addEventListener('drop', (e) => handleColumnDrop(e, column.id));

        return div;
    }

    function createCardHTML(card) {
        const labelName = card.label ? card.label.replace('label-', '') : '';
        const overdue = isOverdue(card.dueDate);
        const overdueClass = overdue ? 'overdue' : '';
        const labelClass = card.label || '';
        
        return `
            <div class="card ${overdueClass}" data-card-id="${card.id}" draggable="true" data-label="${labelClass}">
                <div class="card-header">
                    <div class="card-title">${escapeHtml(card.title)}</div>
                    <div class="card-actions">
                        <button type="button" class="edit-card-btn" title="編集">✏️</button>
                        <button type="button" class="delete-card-btn" title="削除">🗑</button>
                    </div>
                </div>
                ${card.description ? `<div class="card-description">${escapeHtml(card.description)}</div>` : ''}
                ${card.label ? `<div class="column-label"><span class="card-label ${labelClass}"></span>${escapeLabelName(labelClass)}</div>` : ''}
                ${card.dueDate ? `<div class="card-due-date">${formatDate(card.dueDate)}</div>` : ''}
            </div>
        `;
    }

    function escapeLabelName(labelClass) {
        const names = {
            'label-red': '赤',
            'label-orange': '橙',
            'label-yellow': '黄',
            'label-green': '緑',
            'label-blue': '青'
        };
        return names[labelClass] || '';
    }

    function escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // ---- Drag and Drop ----

    function handleColumnDragOver(e) {
        e.preventDefault();
        const afterElement = getDragAfterElement(this, e.clientY);
        const draggable = document.querySelector('.card.dragging');
        if (draggable) {
            if (afterElement) {
                this.insertBefore(draggable, afterElement);
            } else {
                this.appendChild(draggable);
            }
        }
    }

    function getDragAfterElement(container, y) {
        const draggableElements = container.querySelectorAll('.card:not(.dragging)');
        let closest = null;
        let closestOffset = -Infinity;
        
        draggableElements.forEach(child => {
            const rect = child.getBoundingClientRect();
            const offset = y - rect.top;
            if (offset < 0 && offset > closestOffset) {
                closestOffset = offset;
                closest = child;
            }
        });
        
        return closest;
    }

    function handleColumnDrop(e, columnId) {
        e.preventDefault();
    }

    function handleCardDragStart(e) {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', e.target.dataset.cardId);
        e.target.classList.add('dragging');
    }

    function handleCardDragEnd(e) {
        e.target.classList.remove('dragging');
        const cardId = e.target.dataset.cardId;
        const container = e.target.closest('.cards-container');
        const columnId = container.dataset.columnId;
        const cards = Array.from(container.querySelectorAll('.card'));
        const newIndex = cards.indexOf(e.target);
        const card = state.cards[cardId];
        if (card && card.columnId !== columnId) {
            moveCard(cardId, columnId, newIndex);
        } else if (card) {
            // Reorder within same column
            const column = state.columns.find(c => c.id === columnId);
            if (column) {
                const idx = column.cardIds.indexOf(cardId);
                if (idx > -1) {
                    column.cardIds.splice(idx, 1);
                }
                column.cardIds.splice(newIndex, 0, cardId);
                card.columnId = columnId;
                saveState();
            }
        }
    }

    // ---- Dialog Functions ----

    function openColumnDialog(columnId = null, currentTitle = '') {
        currentColumnEditId = columnId;
        columnNameInput.value = currentTitle || '';
        columnDialogTitle.textContent = columnId ? 'カラム名変更' : 'カラムを追加';
        columnDialog.showModal();
    }

    function openCardDialog(columnId, cardId = null) {
        currentCardColumnId = columnId;
        currentCardEditId = cardId;
        selectedLabel = null;
        document.querySelectorAll('.label-option').forEach(btn => btn.classList.remove('selected'));

        if (cardId && state.cards[cardId]) {
            const card = state.cards[cardId];
            cardTitleInput.value = card.title;
            cardDescriptionInput.value = card.description || '';
            cardDueDateInput.value = card.dueDate || '';
            cardDialogTitle.textContent = 'カードを編集';
            if (card.label) {
                selectedLabel = card.label;
                const labelBtn = document.querySelector(`.label-option[data-label="${card.label}"]`);
                if (labelBtn) labelBtn.classList.add('selected');
            }
        } else {
            cardTitleInput.value = '';
            cardDescriptionInput.value = '';
            cardDueDateInput.value = '';
            cardDialogTitle.textContent = 'カードを追加';
        }
        cardDialog.showModal();
    }

    function closeAllDialogs() {
        columnDialog.close();
        cardDialog.close();
    }

    // ---- Event Listeners ----

    addColumnBtn.addEventListener('click', () => {
        openColumnDialog();
    });

    columnCancelBtn.addEventListener('click', () => {
        columnDialog.close();
        currentColumnEditId = null;
    });

    columnSubmitBtn.addEventListener('click', (e) => {
        e.preventDefault();
        const title = columnNameInput.value.trim();
        if (!title) return;
        
        if (currentColumnEditId) {
            renameColumn(currentColumnEditId, title);
        } else {
            const newColumn = {
                id: generateColumnId(),
                title: title,
                cardIds: []
            };
            state.columns.push(newColumn);
            saveState();
            renderColumns();
        }
        
        columnDialog.close();
        currentColumnEditId = null;
    });

    cardCancelBtn.addEventListener('click', () => {
        cardDialog.close();
        currentCardEditId = null;
        currentCardColumnId = null;
    });

    cardSubmitBtn.addEventListener('click', (e) => {
        e.preventDefault();
        const title = cardTitleInput.value.trim();
        if (!title) return;
        
        const cardData = {
            title: title,
            description: cardDescriptionInput.value.trim(),
            label: selectedLabel,
            dueDate: cardDueDateInput.value || null
        };
        
        if (currentCardEditId) {
            updateCard(currentCardEditId, cardData);
        } else {
            addCard(currentCardColumnId, cardData);
        }
        
        cardDialog.close();
        currentCardEditId = null;
        currentCardColumnId = null;
    });

    // Label options
    document.querySelectorAll('.label-option').forEach(btn => {
        btn.addEventListener('click', () => {
            const label = btn.dataset.label;
            selectedLabel = label === selectedLabel ? null : label;
            document.querySelectorAll('.label-option').forEach(b => b.classList.toggle('selected', b.dataset.label === selectedLabel));
        });
    });

    // Search
    searchBox.addEventListener('input', () => {
        renderColumns();
    });

    // Global event delegation for card actions
    columnsEl.addEventListener('click', (e) => {
        const card = e.target.closest('.card');
        if (!card) return;
        const cardId = card.dataset.cardId;
        
        const editBtn = e.target.closest('.edit-card-btn');
        if (editBtn) {
            const columnEl = card.closest('.column');
            const columnId = columnEl.dataset.columnId;
            openCardDialog(columnId, cardId);
        }
        
        const deleteBtn = e.target.closest('.delete-card-btn');
        if (deleteBtn) {
            if (confirm('カードを削除しますか？')) {
                deleteCard(cardId);
            }
        }
    });

    // Drag and drop event delegation
    columnsEl.addEventListener('dragstart', (e) => {
        const card = e.target.closest('.card');
        if (!card) return;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', card.dataset.cardId);
        card.classList.add('dragging');
    });

    columnsEl.addEventListener('dragend', (e) => {
        const card = e.target.closest('.card');
        if (!card) return;
        card.classList.remove('dragging');
        
        const cardId = card.dataset.cardId;
        const container = card.closest('.cards-container');
        const columnId = container.dataset.columnId;
        const cards = Array.from(container.querySelectorAll('.card'));
        const newIndex = cards.indexOf(card);
        const cardData = state.cards[cardId];
        
        if (cardData && cardData.columnId !== columnId) {
            moveCard(cardId, columnId, newIndex);
        } else if (cardData) {
            const column = state.columns.find(c => c.id === columnId);
            if (column) {
                const idx = column.cardIds.indexOf(cardId);
                if (idx > -1) {
                    column.cardIds.splice(idx, 1);
                }
                column.cardIds.splice(newIndex, 0, cardId);
                cardData.columnId = columnId;
                saveState();
            }
        }
    });

    columnsEl.addEventListener('dragover', (e) => {
        e.preventDefault();
        const container = e.target.closest('.cards-container');
        if (!container) return;
        
        const afterElement = getDragAfterElement(container, e.clientY);
        const draggable = container.querySelector('.card.dragging');
        if (draggable) {
            if (afterElement) {
                container.insertBefore(draggable, afterElement);
            } else {
                container.appendChild(draggable);
            }
        }
    });

    // Close dialogs on Escape
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeAllDialogs();
            currentColumnEditId = null;
            currentCardEditId = null;
            currentCardColumnId = null;
        }
    });

    // Initialize
    loadState();
    renderColumns();
});
