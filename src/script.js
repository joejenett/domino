'use strict';

const cube_directions = [
    [+1, -1, 0], [+1, 0, -1], [0, +1, -1], 
    [-1, +1, 0], [-1, 0, +1], [0, -1, +1], 
];

const colors = ['black', 'red', 'green', 'blue'];

class CardView {
    constructor(cell, card) {
        this.cell = cell;
        this.card = card;

        this.root = document.createElement('div');
        this.root.classList.add('card');
        this.root.draggable = true;

        this.text = document.createElement('div');
        this.root.appendChild(this.text);

        this.refresh();
    }

    setPosition(x, y, scale=1) {
        const transform = `translate(calc(${x}px - 50%), calc(${y}px - 50%)) scale(${scale}, ${scale})`;
        this.root.style.transform = transform;
    }

    refresh() {
        this.root.classList.remove(...colors);
        this.root.classList.add(this.card.type);
        this.text.innerHTML = this.card.text;
    }
}

async function playableHTMLBlob(json)
{
    const doc = document.documentElement.cloneNode(true);
    const data = doc.querySelector("#data");
    data.innerHTML = `\n${json}\n`;
    doc.querySelector("#scene").innerHTML = "";
    doc.querySelectorAll(".screen").forEach(screen => screen.hidden = true);

    return new Blob([doc.outerHTML], {type: "text/html"});
}

function setupClassHooks() {
    document.querySelectorAll('.block-clicks').forEach(element => {
        element.addEventListener('click', event => event.stopPropagation());
    });

    document.querySelectorAll('.click-to-hide').forEach(element => {
        element.addEventListener('click', () => element.hidden = true);
    })

    document.querySelectorAll('.close-parent-screen').forEach(element => {
        const screen = element.closest('.screen');
        element.addEventListener('click', () => screen.hidden = true);
    });
}

let deselect, makeEditable, clearBoard;
let editable = false;
let grid, scene, selectedCard;

const cellToView = new CoordStore();

function setCardType(type) {
    if (!selectedCard) return;

    selectedCard.type = type;
    refreshTypeSelect();
    updateAllViewContent();
}

function refreshTypeSelect() {
    if (!selectedCard) return;

    document.querySelectorAll('.type-button').forEach(button => {
        button.classList.remove('selected');
        if (button.classList.contains(selectedCard.type))
            button.classList.add('selected');
    });
}

function computeCardSize(parent) {
    const testCard = document.createElement('div');
    testCard.classList.add('card');
    parent.appendChild(testCard);
    const size = [testCard.clientWidth, testCard.clientHeight];
    parent.removeChild(testCard);
    return size;
}

function centerCell(coords) {
    const [cx, cy] = getElementCenter(document.documentElement);
    const [nx, ny] = grid.cellToPixel(coords);
    setPan(cx - nx , cy - ny);
    location.hash = `${coords[0]},${coords[1]}`;
}

const setPan = (x, y) => scene.style.transform = `translate(${x}px, ${y}px)`;

function projectDataFromDocument(document) {
    const json = document.querySelector('#data').innerHTML;
    return JSON.parse(json);
}

async function htmlFileToData(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = reject;
        reader.onload = () => {
            const html = document.createElement('html');
            html.innerHTML = reader.result;
            const data = projectDataFromDocument(html);
            resolve(data);
        };
        reader.readAsText(file); 
    });
}

function projectToData() {
    const cardData = {};
    const viewData = [];
    const cardToId = new Map();

    let nextId = 0;
    const generateID = () => (nextId++).toString();

    function getCardId(card) {
        let id = cardToId.get(card) || generateID();
        cardToId.set(card, id);
        cardData[id] = card;
        return id;
    }
    
    cellToView.store.forEach((view) => {
        viewData.push({ cell: view.cell, card: getCardId(view.card) });
    });

    return {
        editable: false,
        cards: cardData,
        views: viewData, 
    };
}

async function exportProject() {
    const json = JSON.stringify(projectToData());
    document.querySelector('#data').innerHTML = json;

    const name = "test";
    const blob = await playableHTMLBlob(json);
    saveAs(blob, `domino-${name}.html`);
}

function toggleFullscreen() {
    if (document.fullscreenElement) {
        return document.exitFullscreen();
    } else {
        return document.documentElement.requestFullscreen({ navigationUI: 'hide' });
    }
}

const updateAllViewContent = () => cellToView.store.forEach(view => view.refresh());

async function loaded() {
    setupClassHooks();

    scene = document.querySelector('#scene');
    const [cw, ch] = computeCardSize(scene);
    grid = new HexGrid([cw + 32, ch + 32]);

    clearBoard = () => loadData({editable: true, cards:[], views:[]});
    deselect = () => selectCardView(undefined);

    const cardbar = document.querySelector('#cardbar').cloneNode(true);
    const editCard = cardbar.querySelector('#edit-card');

    const aboutScreen = document.querySelector('#about-screen');
    const editorPanel = document.querySelector('#editor-panel');
    setElementDragoverDropEffect(editorPanel, 'none');
    addListener(editorPanel, 'drop', killEvent);

    addListener(editCard,       'click', () => editorPanel.hidden = false);
    addListener('#center',      'click', () => centerCell([0, 0]));
    addListener('#open-about',  'click', () => aboutScreen.hidden = false);
    addListener('#enable-edit', 'click', () => setEditable(true));
    addListener('#reset',       'click', () => clearBoard());
    addListener('#import',      'click', () => importFile.click());
    addListener('#export',      'click', () => exportProject());
    addListener('#fullscreen',  'click', () => toggleFullscreen());

    document.querySelector('#fullscreen').hidden = !document.fullscreenEnabled;

    function moveViewToCell(view, cell, scale=1) {
        view.cell = cell;
        console.assert(!cellToView.has(cell) || cellToView.get(cell) === view);
        cellToView.set(cell, view);

        const [x, y] = grid.cellToPixel(cell);
        view.setPosition(x, y, scale);
    }

    const importFile = document.querySelector('#import-file');
    addListener(importFile, 'change', async event => {
        loadData(await htmlFileToData(event.target.files[0]));
    });

    const addCard = document.querySelector('#add-delete-icon');
    addListener(addCard, 'dragstart', event => {
        event.dataTransfer.setData('card/new', '');
    });

    setElementDragoverDropEffect(addCard, 'move');

    addListener(addCard, 'drop', event => {
        killEvent(event);
        if (event.dataTransfer.types.includes('card/move')) {
            const originJson = event.dataTransfer.getData('card-origin-cell');
            const view = cellToView.get(JSON.parse(originJson));
            removeCardView(view);
        }
    });

    const contentInput = document.querySelector('#content-input');

    contentInput.addEventListener('input', () => {
        if (!selectedCard) return;

        selectedCard.text = contentInput.value;
        updateAllViewContent();
    });

    function selectCardView(view) {
        selectedCard = view ? view.card : undefined;
        cardbar.hidden = (view === undefined) || !editable;

        if (view) {
            contentInput.value = view.card.text;
            view.root.appendChild(cardbar);
        }

        refreshTypeSelect();
        updateAllViewContent();
    }

    function addCardViewListeners(view) {
        view.root.addEventListener('click', () => {
            selectCardView(view);
            centerCell(view.cell);
        });
        view.root.addEventListener('dragstart', event => {
            event.dataTransfer.setData('card-origin-cell', JSON.stringify(view.cell));
            event.dataTransfer.setData('text/plain', view.card.text);
            event.dataTransfer.setData('card/move', '');

            const [x, y] = getElementCenter(view.root);
            event.dataTransfer.setDragImage(view.root, x, y);
        });
        view.root.addEventListener('dragover', event => {
            killEvent(event);
            const newCard = event.dataTransfer.types.includes('card/new');
            event.dataTransfer.dropEffect = newCard ? 'none' : 'move'; 
        });
        view.root.addEventListener('drop', event => {
            killEvent(event);
            if (!event.dataTransfer.types.includes('card/move'))
                return;

            const originJson = event.dataTransfer.getData('card-origin-cell');
            const cell = JSON.parse(originJson);
            swapViewCells(cell, view.cell);
        });
    }

    function addCardView(card, cell) {
        const view = new CardView(cell, card);

        addCardViewListeners(view);
        scene.appendChild(view.root);
        moveViewToCell(view, cell);

        return view;
    }

    function removeCardView(view) {
        scene.removeChild(view.root);
        cellToView.delete(view.cell);
        if (selectedCard === view.card)
            selectCardView(undefined);
    }

    function swapViewCells(a, b) {
        if (coordsAreEqual(a, b))
            return;
        
        const aView = cellToView.get(a);
        const bView = cellToView.get(b);

        cellToView.delete(a);
        cellToView.delete(b);

        if (aView)
            moveViewToCell(aView, b);
        if (bView)
            moveViewToCell(bView, a);
    }

    async function spawnCardView(card, cell) {
        const view = addCardView(card, cell);
        moveViewToCell(view, view.cell, 0);
        await sleep(10);
        moveViewToCell(view, view.cell, 1);
        return view;
    }

    const screen = document.querySelector('#screen');
    setElementDragoverDropEffect(screen, 'copy');
    addListeners(screen, {
        'click': event => {
            killEvent(event);
            const clickPixel = eventToElementPixel(event, scene);
            const clickCell = grid.pixelToCell(clickPixel);
            centerCell(clickCell);
            deselect();
        },
        'drop': async event => {
            killEvent(event);

            const rect = scene.getBoundingClientRect();
            const dropPixel = [event.clientX - rect.x, event.clientY - rect.y];
            const dropCell = grid.pixelToCell(dropPixel);
    
            if (event.dataTransfer.types.includes('card/move')) {
                const originJson = event.dataTransfer.getData('card-origin-cell');
                const originCell = JSON.parse(originJson);
    
                swapViewCells(originCell, dropCell);
            } else if (!cellToView.has(dropCell)) {
                const types = event.dataTransfer.types;
                let content = undefined;
    
                if (types.includes('card/new')) {
                    content = "new card";
                } else if (types.includes('text/html')) {
                    content = event.dataTransfer.getData('text/html');
                } else if (types.includes('text/uri-list')) {
                    content = event.dataTransfer
                        .getData('text/uri-list')
                        .split('\n')
                        .filter(uri => !uri.startsWith('#'))
                        .map(uri => `<a href="${uri}">link</a>`);
                } else if (types.includes('text/plain')) {
                    content = event.dataTransfer.getData('text/plain');
                } else if (types.includes('text')) {
                    content = event.dataTransfer.getData('text');
                }
    
                if (content) {
                    const card = { text: content, type: 'black' };
                    const view = await spawnCardView(card, dropCell);
                    selectCardView(view);
                }
            }
        },
    });

    function setEditable(state) {
        editable = state;
        document.querySelector('#enable-edit').disabled = editable;
        addCard.hidden = !editable;
    }

    function loadDataFromEmbed() {
        const data = projectDataFromDocument(document);
        setEditable(data.editable);
        loadData(data);
    }

    function loadData(data) {
        scene.innerHTML = "";
        cellToView.store.clear();

        for (let view of data.views) {
            addCardView(data.cards[view.card], view.cell);
        }
        updateAllViewContent();
    }
    
    loadDataFromEmbed();
    selectCardView(undefined);

    function locationFromHash() {
        let coords = [0, 0];

        try {
            let fragment = location.hash.slice(1).split(',').map(i => parseInt(i) || 0);
            if (fragment.length === 2) coords = fragment;
        } catch(e) {}

        centerCell(coords);
    }

    scene.classList.add('skiptransition');
    locationFromHash();
    await sleep(10);
    scene.classList.remove('skiptransition');
}

// based on https://www.redblobgames.com/grids/hexagons/
class HexGrid {
    constructor(cellSize) {
        this.cellSize = cellSize;
    }

    cellToPixel(cellCoords) {
        const [q, r] = cellCoords;
        const [w, h] = this.cellSize;

        const x = q * w;
        const y = (r + q / 2) * h;
        return [x, y];
    }

    pixelToCell(pixelCoords) {
        const [x, y] = pixelCoords;
        const [w, h] = this.cellSize;
        // pixel to axial coordinates
        const q = x / w;
        const r = y / h - q / 2;
        // convert axial to cube coordinates
        const [cx, cy, cz] = [q, r, -q-r];
        // determine rounding error
        let [rx, ry, rz] = [cx, cy, cz].map(Math.round);
        const [dx, dy, dz] = [rx - cx, ry - cy, rz - cz].map(Math.abs);
        // recompute worst coordinate from others
        if (dx > dy && dx > dz) {
            rx = -ry-rz
        } else if (dy > dz) {
            ry = -rx-rz
        } else {
            rz = -rx-ry
        }
        // return axial components
        return [rx, ry];
    }
}
