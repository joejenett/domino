function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function killEvent(event) {
    event.stopPropagation();
    event.preventDefault();
}

function eventToElementPixel(event, element) {
    const rect = element.getBoundingClientRect();
    return [event.clientX - rect.x, event.clientY - rect.y];
}

function getElementCenter(element) {
    return [element.clientWidth / 2, element.clientHeight / 2];
}

function setElementDragoverDropEffect(query, effect) {
    addListener(query, 'dragover', event => {
        killEvent(event);
        event.dataTransfer.dropEffect = effect;
    });
}

function queryToElement(query) {
    return (query instanceof Element) ? query : document.querySelector(query);
}

function cloneTemplateElement(query) {
    const template = queryToElement(query);
    const clone = template.cloneNode(true);
    clone.removeAttribute('id');
    return clone;
}

function addListener(query, type, listener) {
    queryToElement(query).addEventListener(type, listener);
}

function coordsAreEqual(a, b) {
    if (a.length !== b.length) 
        return false;

    for (let i = 0; i < a.length; ++i)
        if (a[i] !== b[1])
            return false;
    
    return true;
}

function coordsToKey(coords) {
    return coords.join(',');
}

class CoordStore {
    constructor() { this.store = new Map(); }
    get size() { return this.store.size; }
    get(coords) { return this.store.get(coordsToKey(coords)); }
    set(coords, value) { return this.store.set(coordsToKey(coords), value); }
    delete(coords) { return this.store.delete(coordsToKey(coords)); }
    has(coords) { return this.store.has(coordsToKey(coords)); }
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