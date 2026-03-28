const $ = id => document.getElementById(id);
const cpIframe = $('cpIframe'), fileInput = $('fileInput'), inputStr = $('inputStr'), outputStr = $('outputStr');
const previewArea = $('previewArea'), layersList = $('layersList'), layersWrap = $('layersWrap');
const detVbW = $('detVbW'), detVbH = $('detVbH'), detObjW = $('detObjW'), detObjH = $('detObjH');

let cpActiveCallback = null, cpInitialHex = null;
let globalOptimizedSvg = null, globalOriginalSvg = null, colorMode = 'mono', zoomMode = 'fit';
let isLinkedMode = false;
const ctxHelper = document.createElement('canvas').getContext('2d');

// ==========================================
// Bounds Editor Engine
// ==========================================
let beBackupSvg = null, beBaseBBox = { x: 0, y: 0, width: 100, height: 100 };
let beAbW = 128, beAbH = 128;
let beTx = 0, beTy = 0, beSx = 1, beSy = 1;
let beAbLocked = true, beIbLocked = true, beLinkedLocked = false;

const popup = $('boundsEditorPopup'), fpHeader = $('fpHeader');
let isDraggingPopup = false, pStartX, pStartY, pStartLeft, pStartTop;

fpHeader.addEventListener('pointerdown', e => {
    if (e.target.closest('.fp-close')) return;
    isDraggingPopup = true; pStartX = e.clientX; pStartY = e.clientY;
    const rect = popup.getBoundingClientRect();
    pStartLeft = rect.left; pStartTop = rect.top;
    fpHeader.setPointerCapture(e.pointerId);
});
fpHeader.addEventListener('pointermove', e => {
    if (!isDraggingPopup) return;
    popup.style.left = `${pStartLeft + (e.clientX - pStartX)}px`;
    popup.style.top = `${pStartTop + (e.clientY - pStartY)}px`;
    popup.style.transform = 'none'; popup.dataset.moved = 'true';
});
const stopPopupDrag = e => { if (isDraggingPopup) { isDraggingPopup = false; fpHeader.releasePointerCapture(e.pointerId); } };
fpHeader.addEventListener('pointerup', stopPopupDrag);
fpHeader.addEventListener('pointercancel', stopPopupDrag);

function updateTransformAndPreview() {
    if (!globalOptimizedSvg) return;
    const wrapper = globalOptimizedSvg.querySelector('#forge-ink-wrapper');
    if (wrapper) wrapper.setAttribute('transform', `translate(${beTx}, ${beTy}) scale(${beSx}, ${beSy})`);
    
    globalOptimizedSvg.setAttribute('viewBox', `0 0 ${beAbW} ${beAbH}`);
    if (globalOptimizedSvg.hasAttribute('width')) globalOptimizedSvg.setAttribute('width', beAbW);
    if (globalOptimizedSvg.hasAttribute('height')) globalOptimizedSvg.setAttribute('height', beAbH);
    
    $('inpAbW').value = Number(beAbW.toFixed(2));
    $('inpAbH').value = Number(beAbH.toFixed(2));
    $('inpIbW').value = Number((beBaseBBox.width * beSx).toFixed(2));
    $('inpIbH').value = Number((beBaseBBox.height * beSy).toFixed(2));
    
    renderOutput(true);
}

function attachScrub(labelId, inputId, onChange) {
    const lbl = $(labelId), inp = $(inputId);
    let startVal = 0, startX = 0, isDragging = false;
    lbl.addEventListener('pointerdown', e => {
        isDragging = true; startX = e.clientX; startVal = parseFloat(inp.value) || 0;
        lbl.setPointerCapture(e.pointerId); document.body.classList.add('is-dragging');
    });
    lbl.addEventListener('pointermove', e => {
        if (!isDragging) return;
        let delta = e.clientX - startX; if (e.shiftKey) delta *= 10;
        onChange(Math.max(0.01, startVal + delta));
    });
    const stop = e => { if (isDragging) { isDragging = false; lbl.releasePointerCapture(e.pointerId); document.body.classList.remove('is-dragging'); } };
    lbl.addEventListener('pointerup', stop); lbl.addEventListener('pointercancel', stop);
    inp.addEventListener('change', e => onChange(Math.max(0.01, parseFloat(e.target.value) || 1)));
}

attachScrub('lblAbW', 'inpAbW', val => {
    let oldW = beAbW; beAbW = val;
    if (beAbLocked) beAbH = beAbW * (beAbH / oldW || 1);
    if (beLinkedLocked) { let f = beAbW / oldW; beSx *= f; beSy *= f; beTx *= f; beTy *= f; }
    updateTransformAndPreview();
});
attachScrub('lblAbH', 'inpAbH', val => {
    let oldH = beAbH; beAbH = val;
    if (beAbLocked) beAbW = beAbH * (beAbW / oldH || 1);
    if (beLinkedLocked) { let f = beAbH / oldH; beSx *= f; beSy *= f; beTx *= f; beTy *= f; }
    updateTransformAndPreview();
});
attachScrub('lblIbW', 'inpIbW', val => {
    let oldIbW = beBaseBBox.width * beSx, f = val / (oldIbW || 1);
    beSx *= f; if (beIbLocked) beSy *= f;
    if (beLinkedLocked) { beAbW *= f; beAbH *= f; beTx *= f; beTy *= f; }
    updateTransformAndPreview();
});
attachScrub('lblIbH', 'inpIbH', val => {
    let oldIbH = beBaseBBox.height * beSy, f = val / (oldIbH || 1);
    beSy *= f; if (beIbLocked) beSx *= f;
    if (beLinkedLocked) { beAbW *= f; beAbH *= f; beTx *= f; beTy *= f; }
    updateTransformAndPreview();
});

window.toggleAbLock = () => { beAbLocked = !beAbLocked; $('btnAbLock').innerHTML = `<svg class="icon-svg"><use href="#icon-${beAbLocked ? 'lock' : 'unlock'}"></use></svg>`; $('btnAbLock').classList.toggle('active', beAbLocked); };
window.toggleIbLock = () => { beIbLocked = !beIbLocked; $('btnIbLock').innerHTML = `<svg class="icon-svg"><use href="#icon-${beIbLocked ? 'lock' : 'unlock'}"></use></svg>`; $('btnIbLock').classList.toggle('active', beIbLocked); };
window.toggleLinkedLock = () => { beLinkedLocked = !beLinkedLocked; $('btnLinkedLock').innerHTML = `<svg class="icon-svg"><use href="#icon-${beLinkedLocked ? 'linked' : 'unlinked'}-layers"></use></svg>`; $('btnLinkedLock').classList.toggle('active', beLinkedLocked); };

window.centerBounds = axis => {
    let ibW = beBaseBBox.width * beSx, ibH = beBaseBBox.height * beSy;
    if (axis === 'H') beTx = (beAbW - ibW) / 2 - (beBaseBBox.x * beSx);
    if (axis === 'V') beTy = (beAbH - ibH) / 2 - (beBaseBBox.y * beSy);
    updateTransformAndPreview();
};

window.fitToBounds = () => {
    let ibW = beBaseBBox.width * beSx, ibH = beBaseBBox.height * beSy;
    beAbW = ibW; beAbH = ibH; beTx = -(beBaseBBox.x * beSx); beTy = -(beBaseBBox.y * beSy);
    updateTransformAndPreview();
};

window.openBoundsEditor = () => {
    if (!globalOptimizedSvg) return;
    beBackupSvg = globalOptimizedSvg.cloneNode(true);
    
    let wrapper = globalOptimizedSvg.querySelector('#forge-ink-wrapper');
    if (!wrapper) {
        wrapper = document.createElementNS("http://www.w3.org/2000/svg", "g");
        wrapper.id = 'forge-ink-wrapper';
        Array.from(globalOptimizedSvg.childNodes).forEach(node => {
            if (node.nodeType === 1 && !['defs', 'style', 'title', 'desc'].includes(node.tagName.toLowerCase())) wrapper.appendChild(node);
            else if (node.nodeType !== 1) wrapper.appendChild(node);
        });
        globalOptimizedSvg.appendChild(wrapper);
    }
    
    renderOutput(true);
    const svgInDom = previewArea.querySelector('svg:not(.icon-svg)'), wrapperInDom = svgInDom.querySelector('#forge-ink-wrapper');
    const currentTransform = wrapperInDom.getAttribute('transform');
    
    wrapperInDom.removeAttribute('transform');
    try { beBaseBBox = wrapperInDom.getBBox(); } catch(e) { beBaseBBox = { x: 0, y: 0, width: 100, height: 100 }; }
    if (beBaseBBox.width === 0) beBaseBBox.width = 1; if (beBaseBBox.height === 0) beBaseBBox.height = 1;
    wrapperInDom.setAttribute('transform', currentTransform || `translate(0, 0) scale(1, 1)`);
    
    let tx = 0, ty = 0, sx = 1, sy = 1;
    if (currentTransform) {
        const trMatch = currentTransform.match(/translate\(([^,]+),\s*([^)]+)\)/), scMatch = currentTransform.match(/scale\(([^,]+),\s*([^)]+)\)/);
        if (trMatch) { tx = parseFloat(trMatch[1]) || 0; ty = parseFloat(trMatch[2]) || 0; }
        if (scMatch) { sx = parseFloat(scMatch[1]) || 1; sy = parseFloat(scMatch[2]) || 1; }
    }
    beTx = tx; beTy = ty; beSx = sx; beSy = sy;
    
    const vb = globalOptimizedSvg.getAttribute('viewBox') || globalOptimizedSvg.getAttribute('viewbox');
    if (vb) { const p = vb.trim().split(/\s+|,/); beAbW = parseFloat(p[2]); beAbH = parseFloat(p[3]); } 
    else { beAbW = parseFloat(globalOptimizedSvg.getAttribute('width')) || 128; beAbH = parseFloat(globalOptimizedSvg.getAttribute('height')) || 128; }
    
    popup.style.display = 'flex';
    if (!popup.dataset.moved) {
        popup.style.left = `${(window.innerWidth / 2) - 130}px`; popup.style.top = `${(window.innerHeight / 2) - 200}px`;
        popup.style.transform = 'none'; popup.dataset.moved = 'true';
    }
    updateTransformAndPreview();
};

window.closeBoundsEditor = (save) => {
    popup.style.display = 'none';
    if (!save && beBackupSvg) { globalOptimizedSvg = beBackupSvg; renderOutput(); } 
    else { renderOutput(); buildLayersPanel(); }
    beBackupSvg = null;
};


// ==========================================
// Centralized Popup Engine
// ==========================================
let opPopup = $('opPopupWrap');
let strokePopup = $('strokePopupWrap');

if (!opPopup) {
    opPopup = document.createElement('div');
    opPopup.className = 'slider-popup vertical';
    opPopup.id = 'opPopupWrap';
    opPopup.innerHTML = `<input type="range" min="0" max="100" step="1">`;
    document.body.appendChild(opPopup);

    strokePopup = document.createElement('div');
    strokePopup.className = 'slider-popup horizontal';
    strokePopup.id = 'strokePopupWrap';
    strokePopup.innerHTML = `<input type="range" min="-1" max="1" step="any" value="0">`;
    document.body.appendChild(strokePopup);

    document.addEventListener('pointerdown', e => {
        if (opPopup.style.display === 'flex' && !opPopup.contains(e.target) && !e.target.closest('.slider-trigger.op')) {
            opPopup.style.display = 'none';
        }
        if (strokePopup.style.display === 'flex' && !strokePopup.contains(e.target) && !e.target.closest('.slider-trigger.stroke')) {
            strokePopup.style.display = 'none';
        }
        if (!e.target.closest('.slider-trigger')) {
            document.querySelectorAll('.slider-trigger').forEach(el => el.classList.remove('is-active'));
        }
    });
}

// ==========================================
// Reusable Custom Scrollbar Engine
// ==========================================
const initCustomScroll = (contentEl, wrapEl) => {
    if (!contentEl || !wrapEl) return () => {};
    const track = wrapEl.querySelector('.custom-scroll-track');
    const thumb = wrapEl.querySelector('.custom-scroll-thumb');
    if (!track || !thumb) return () => {};

    let scrollTimeout, isDraggingScroll = false, scrollStartY = 0, scrollStartTop = 0;

    const updateScroll = () => {
        const sh = contentEl.scrollHeight, ch = contentEl.clientHeight;
        if (sh <= ch + 1 || ch === 0) { 
            thumb.style.opacity = '0';
            track.style.pointerEvents = 'none';
            return; 
        }
        track.style.pointerEvents = 'auto';
        const ratio = ch / sh;
        const thumbH = Math.max(30, ch * ratio);
        thumb.style.height = `${thumbH}px`;
        const maxScroll = sh - ch;
        const maxThumbY = ch - thumbH - 4; 
        const thumbY = (contentEl.scrollTop / maxScroll) * maxThumbY;
        thumb.style.transform = `translateY(${thumbY}px)`;
    };

    const showScroll = () => {
        const sh = contentEl.scrollHeight, ch = contentEl.clientHeight;
        if (sh <= ch + 1) return;
        track.classList.add('is-active');
        clearTimeout(scrollTimeout);
        scrollTimeout = setTimeout(() => {
            if (!isDraggingScroll && !track.classList.contains('is-hovered')) {
                track.classList.remove('is-active');
            }
        }, 800);
    };

    contentEl.addEventListener('scroll', () => { 
        updateScroll(); 
        showScroll(); 
        opPopup.style.display = 'none';
        strokePopup.style.display = 'none';
        document.querySelectorAll('.slider-trigger').forEach(el => el.classList.remove('is-active'));
    }, { passive: true });
    new ResizeObserver(updateScroll).observe(contentEl);

    track.addEventListener('pointerenter', () => {
        const sh = contentEl.scrollHeight, ch = contentEl.clientHeight;
        if (sh > ch + 1) track.classList.add('is-hovered');
    });
    
    track.addEventListener('pointerleave', () => {
        track.classList.remove('is-hovered');
        showScroll();
    });

    thumb.addEventListener('pointerdown', (e) => {
        isDraggingScroll = true; scrollStartY = e.clientY; scrollStartTop = contentEl.scrollTop;
        track.classList.add('is-active');
        thumb.setPointerCapture(e.pointerId);
        document.body.classList.add('is-dragging');
        e.preventDefault();
    });

    thumb.addEventListener('pointermove', (e) => {
        if (!isDraggingScroll) return;
        const sh = contentEl.scrollHeight, ch = contentEl.clientHeight;
        const maxScroll = sh - ch;
        const maxThumbY = ch - parseFloat(thumb.style.height) - 4;
        const deltaY = e.clientY - scrollStartY;
        const scrollDelta = (deltaY / maxThumbY) * maxScroll;
        contentEl.scrollTop = scrollStartTop + scrollDelta;
    });

    const stopScrollDrag = (e) => {
        if (!isDraggingScroll) return;
        isDraggingScroll = false;
        try { thumb.releasePointerCapture(e.pointerId); } catch(err) {}
        document.body.classList.remove('is-dragging');
        track.classList.remove('is-active');
        showScroll();
    };
    
    window.addEventListener('pointerup', stopScrollDrag);
    window.addEventListener('pointercancel', stopScrollDrag);

    return updateScroll;
};

const updateLayersScroll = initCustomScroll(layersList, layersWrap);
const updateImportScroll = initCustomScroll(inputStr, $('importWrap'));
const updateExportScroll = initCustomScroll(outputStr, $('exportWrap'));

window.updateAllScrollbars = () => {
    updateLayersScroll();
    updateImportScroll();
    updateExportScroll();
};

window.openCustomPicker = (initialHex, callback) => {
    cpActiveCallback = callback; cpInitialHex = initialHex;
    cpIframe.style.pointerEvents = 'auto';
    cpIframe.contentWindow.postMessage({ action: 'open', hex: initialHex }, '*');
};

window.addEventListener('message', e => {
    if (e.source !== cpIframe.contentWindow || !e.data?.action) return;
    const { action, hex, isScrubbing } = e.data;
    if (action === 'update' && cpActiveCallback) cpActiveCallback(hex, isScrubbing);
    else if (action === 'confirm' || action === 'cancel') {
        if (cpActiveCallback) cpActiveCallback(action === 'confirm' ? hex : cpInitialHex, false);
        cpIframe.style.pointerEvents = 'none'; cpActiveCallback = cpInitialHex = null;
    }
});

const createEl = (tag, className = '', props = {}, children = []) => {
    const el = document.createElement(tag);
    if (className) el.className = className;
    Object.entries(props).forEach(([k, v]) => k === 'style' ? Object.assign(el.style, v) : el[k] = v);
    children.forEach(c => el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c));
    return el;
};

const colorToHex = col => {
    if (!col || col === 'none' || col.includes('url')) return '#000000';
    ctxHelper.fillStyle = '#000000'; ctxHelper.fillStyle = col; return ctxHelper.fillStyle;
};

const applyZoomState = () => {
    const svg = previewArea.querySelector('svg:not(.icon-svg)'), btn = $('btnZoomToggle');
    if (!svg) return;
    const nw = parseFloat(svg.dataset.nativeW) || 128, nh = parseFloat(svg.dataset.nativeH) || 128;
    Object.assign(svg.style, { transition: 'width 0.2s, height 0.2s', maxWidth: 'none', maxHeight: 'none' });
    
    if (zoomMode === 'fit') {
        const cw = previewArea.clientWidth - 40, ch = previewArea.clientHeight - 40;
        if (cw <= 0 || ch <= 0) return;
        const scale = Math.min(cw / nw, ch / nh);
        svg.style.width = `${nw * scale}px`; svg.style.height = `${nh * scale}px`;
        if (btn) btn.innerHTML = '<svg class="icon-svg"><use href="#icon-zoom-size"></use></svg>';
    } else {
        svg.style.width = `${nw}px`; svg.style.height = `${nh}px`;
        if (btn) btn.innerHTML = '<svg class="icon-svg"><use href="#icon-zoom-fit"></use></svg>';
    }
};

window.toggleZoom = () => { zoomMode = zoomMode === 'fit' ? 'size' : 'fit'; applyZoomState(); };
new ResizeObserver(() => { if (zoomMode === 'fit') applyZoomState(); }).observe(previewArea);

window.resetAllLayers = () => {
    if (!globalOriginalSvg) return;
    globalOptimizedSvg = globalOriginalSvg.cloneNode(true);
    isLinkedMode = false;
    buildLayersPanel(); 
    renderOutput();
};

window.setColorMode = mode => {
    colorMode = mode;
    $('btnMono').classList.toggle('active', mode === 'mono');
    $('btnLocal').classList.toggle('active', mode === 'local');
    document.body.classList.toggle('mode-mono', mode === 'mono');
    if (globalOptimizedSvg) renderOutput();
};

const resetUI = () => {
    [detVbW, detVbH, detObjW, detObjH].forEach(el => el.textContent = '-');
    layersList.innerHTML = '<div style="font-size:11px;color:var(--text-secondary);text-align:center;margin-top:30px;">Import SVG to view layers</div>';
    previewArea.innerHTML = $('btnZoomToggle').outerHTML;
    outputStr.value = ''; globalOptimizedSvg = globalOriginalSvg = null;
    isLinkedMode = false;
    const btnLink = $('btnLinkLayers');
    if(btnLink) btnLink.style.display = 'none';
    if(opPopup) opPopup.style.display = 'none';
    if(strokePopup) strokePopup.style.display = 'none';
    window.updateAllScrollbars();
};

inputStr.addEventListener('input', () => { window.processSVG(); });
fileInput.addEventListener('change', e => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => { inputStr.value = ev.target.result; window.processSVG(); };
    reader.readAsText(file); e.target.value = '';
});

window.focusAndSelectSVG = (btn) => {
    inputStr.focus();
    if (inputStr.value.trim().length > 0) inputStr.setSelectionRange(0, inputStr.value.length);
    btn.classList.add('btn-blue'); inputStr.classList.add('ring-blue');
    setTimeout(() => { btn.classList.remove('btn-blue'); inputStr.classList.remove('ring-blue'); }, 1000);
};

window.clearSVG = (btn) => {
    inputStr.value = ''; window.processSVG();
    btn.classList.add('btn-yellow'); inputStr.classList.add('ring-yellow');
    setTimeout(() => { btn.classList.remove('btn-yellow'); inputStr.classList.remove('ring-yellow'); }, 1000);
};

window.processSVG = () => {
    const rawCode = inputStr.value.trim();
    if (!rawCode) return resetUI();
    const oldSvg = new DOMParser().parseFromString(rawCode, "image/svg+xml").querySelector('svg');
    if (!oldSvg) { resetUI(); return; }

    const classStyles = {};
    oldSvg.querySelectorAll('style').forEach(tag => {
        let match; const regex = /\.([a-zA-Z0-9_-]+)\s*\{([^}]+)\}/g;
        while ((match = regex.exec(tag.textContent)) !== null) classStyles[match[1].trim()] = match[2].trim();
    });

    const optimizeNode = node => {
        if (node.nodeType !== 1) return null;
        const tagName = node.tagName.toLowerCase();
        if (!['svg', 'path', 'circle', 'rect', 'polygon', 'polyline', 'ellipse', 'line', 'defs', 'linearGradient', 'radialGradient', 'stop', 'g', 'clipPath', 'mask', 'use'].includes(tagName)) return null;

        const newNode = document.createElementNS("http://www.w3.org/2000/svg", tagName);
        if (tagName === 'svg') newNode.setAttribute("xmlns", "http://www.w3.org/2000/svg");

        const structAttrs = ['viewbox', 'd', 'cx', 'cy', 'r', 'rx', 'ry', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'width', 'height', 'points', 'transform', 'id', 'offset', 'gradientunits', 'gradienttransform', 'href', 'xlink:href'];
        const presAttrs = ['fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit', 'fill-rule', 'clip-rule', 'opacity', 'stop-color', 'stop-opacity', 'fill-opacity', 'stroke-opacity'];

        let styles = node.hasAttribute('style') ? node.getAttribute('style') + ";" : "";
        if (node.hasAttribute('class')) node.getAttribute('class').split(/\s+/).forEach(cls => { if (classStyles[cls]) styles += classStyles[cls] + ";"; });

        styles.split(';').forEach(decl => {
            if (!decl.includes(':')) return;
            const [k, v] = decl.split(':').map(s => s.trim());
            if (presAttrs.includes(k.toLowerCase()) && !newNode.hasAttribute(k.toLowerCase())) newNode.setAttribute(k.toLowerCase(), v);
        });

        Array.from(node.attributes).forEach(attr => {
            const name = attr.name.toLowerCase(); let val = attr.value.trim();
            if (name === 'class' || name === 'style') return;
            if (structAttrs.includes(name)) {
                if (name === 'd') val = val.replace(/\s+/g, ' ').replace(/-?\d*\.\d+(?:[eE][-+]?\d+)?/g, m => Number.isInteger(+m) ? (+m).toString() : (+m).toFixed(2).replace(/\.?0+$/, '')).replace(/\s*([a-zA-Z])\s*/g, '$1');
                if (!(tagName === 'svg' && (name === 'width' || name === 'height'))) newNode.setAttribute(attr.name, val);
            } else if (presAttrs.includes(name) && !newNode.hasAttribute(attr.name)) newNode.setAttribute(attr.name, val);
        });

        if (['path', 'circle', 'rect', 'polygon', 'polyline', 'ellipse', 'line'].includes(tagName) && !newNode.hasAttribute('fill') && !newNode.hasAttribute('stroke')) newNode.setAttribute('fill', '#000000');
        Array.from(node.childNodes).forEach(child => { const opt = optimizeNode(child); if (opt) newNode.appendChild(opt); });
        return newNode;
    };

    globalOptimizedSvg = optimizeNode(oldSvg);
    
    if (!globalOptimizedSvg.getAttribute("viewBox") && !globalOptimizedSvg.getAttribute("viewbox") && oldSvg.getAttribute("width")) {
        globalOptimizedSvg.setAttribute("viewBox", `0 0 ${parseFloat(oldSvg.getAttribute("width"))} ${parseFloat(oldSvg.getAttribute("height"))}`);
    }
        
    globalOriginalSvg = globalOptimizedSvg.cloneNode(true);
    buildLayersPanel(); renderOutput();
};

window.toggleLinkLayers = () => {
    if (!globalOptimizedSvg) return;
    const btnLink = $('btnLinkLayers');
    btnLink.style.pointerEvents = 'none'; 
    if(opPopup) opPopup.style.display = 'none';
    if(strokePopup) strokePopup.style.display = 'none';
    
    const shapes = Array.from(globalOptimizedSvg.querySelectorAll('path, circle, rect, polygon, polyline, ellipse, line'));

    if (!isLinkedMode) {
        if (shapes.length > 1) {
            const topShape = shapes[0];
            const fill = topShape.getAttribute('fill');
            const stroke = topShape.getAttribute('stroke');
            const strokeWidth = topShape.getAttribute('stroke-width');
            const hiddenFill = topShape.getAttribute('data-hidden-fill');
            const hiddenStroke = topShape.getAttribute('data-hidden-stroke');
            const fillOp = topShape.getAttribute('fill-opacity');
            const strokeOp = topShape.getAttribute('stroke-opacity');

            for (let i = 1; i < shapes.length; i++) {
                const s = shapes[i];
                if (fill !== null) s.setAttribute('fill', fill); else s.removeAttribute('fill');
                if (stroke !== null) s.setAttribute('stroke', stroke); else s.removeAttribute('stroke');
                if (strokeWidth !== null) s.setAttribute('stroke-width', strokeWidth); else s.removeAttribute('stroke-width');
                if (hiddenFill) s.setAttribute('data-hidden-fill', 'true'); else s.removeAttribute('data-hidden-stroke');
                if (hiddenStroke) s.setAttribute('data-hidden-stroke', 'true'); else s.removeAttribute('data-hidden-stroke');
                if (fillOp !== null) s.setAttribute('fill-opacity', fillOp); else s.removeAttribute('fill-opacity');
                if (strokeOp !== null) s.setAttribute('stroke-opacity', strokeOp); else s.removeAttribute('stroke-opacity');
            }
            renderOutput();
        }

        btnLink.innerHTML = '<svg class="icon-svg"><use href="#icon-linked-layers"></use></svg>';

        const items = Array.from(layersList.querySelectorAll('.layer-item'));
        if (items.length > 0) {
            const firstTop = items[0].offsetTop;
            items.forEach((item, i) => {
                if (i > 0) {
                    const dist = firstTop - item.offsetTop;
                    item.style.transition = 'transform 0.4s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s ease';
                    item.style.transform = `translateY(${dist}px) scale(0.95)`;
                    item.style.opacity = '0';
                    item.style.pointerEvents = 'none';
                } else {
                    item.style.transition = 'transform 0.4s cubic-bezier(0.4, 0, 0.2, 1)';
                    item.style.transform = 'scale(1.02)';
                    item.style.zIndex = '10';
                    item.style.position = 'relative';
                }
            });
        }
        setTimeout(() => {
            isLinkedMode = true;
            buildLayersPanel();
            btnLink.style.pointerEvents = 'auto';
        }, 400);
    } else {
        layersList.style.opacity = '0';
        btnLink.innerHTML = '<svg class="icon-svg"><use href="#icon-unlinked-layers"></use></svg>';
        isLinkedMode = false;
        buildLayersPanel();
        
        const newItems = Array.from(layersList.querySelectorAll('.layer-item'));
        if (newItems.length > 0) {
            const firstTop = newItems[0].offsetTop;
            newItems.forEach((item, i) => {
                if (i > 0) {
                    item.style.transition = 'none';
                    const dist = firstTop - item.offsetTop;
                    item.style.transform = `translateY(${dist}px) scale(0.95)`;
                    item.style.opacity = '0';
                } else {
                    item.style.transition = 'none';
                    item.style.transform = 'scale(1.02)';
                    item.style.zIndex = '10';
                    item.style.position = 'relative';
                }
            });
        }
        
        layersList.style.opacity = '1';
        
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                newItems.forEach((item, i) => {
                    item.style.transition = 'transform 0.5s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.4s ease';
                    item.style.transform = 'translateY(0) scale(1)';
                    item.style.opacity = '1';
                });
                setTimeout(() => {
                    newItems.forEach(item => {
                        item.style.transition = '';
                        item.style.transform = '';
                        item.style.zIndex = '';
                        item.style.position = '';
                    });
                    btnLink.style.pointerEvents = 'auto';
                }, 500);
            });
        });
    }
};

const buildLayersPanel = () => {
    layersList.innerHTML = ''; 
    if (!globalOptimizedSvg) { window.updateAllScrollbars(); return; }
    
    const shapes = Array.from(globalOptimizedSvg.querySelectorAll('path, circle, rect, polygon, polyline, ellipse, line'));
    const btnLink = $('btnLinkLayers');
    
    if (shapes.length > 1) {
        btnLink.style.display = 'flex';
        btnLink.innerHTML = `<svg class="icon-svg"><use href="#icon-${isLinkedMode ? 'linked' : 'unlinked'}-layers"></use></svg>`;
    } else {
        if (btnLink) btnLink.style.display = 'none';
        isLinkedMode = false;
    }

    if (!shapes.length) {
        layersList.innerHTML = '<div style="font-size:11px;color:var(--text-secondary);text-align:center;margin-top:30px;">No editable paths found.</div>';
        window.updateAllScrollbars();
        return;
    }

    const createAttrRow = (attrName, nodes) => {
        const isStroke = attrName === 'Stroke';
        const attrKey = attrName.toLowerCase();
        const origVal = nodes[0].getAttribute(attrKey);
        const isHidden = nodes[0].getAttribute(`data-hidden-${attrKey}`) || (!origVal || origVal === 'none');
        
        if (isHidden) nodes.forEach(n => n.setAttribute(`data-hidden-${attrKey}`, 'true'));
        
        let activeHex = colorToHex(origVal).toUpperCase(), updateRaf = null;

        const row = createEl('div', `layer-attr ${isHidden ? 'hidden-row' : ''}`);

        const updateColor = (hex, scrub) => {
            activeHex = hex.toUpperCase(); 
            pCenter.style.backgroundColor = activeHex; 
            nodes.forEach(n => n.setAttribute(attrKey, activeHex));
            
            if (!isStroke) {
                const hexInp = row.querySelector('.cp-hex-input');
                if (hexInp) hexInp.value = activeHex.replace('#', '');
            } else {
                nodes.forEach(n => {
                    if (!n.hasAttribute('stroke-width') || parseFloat(n.getAttribute('stroke-width')) === 0) {
                        n.setAttribute('stroke-width', '1'); 
                    }
                });
                const sizeInp = row.querySelector('.cp-size-input');
                if (sizeInp && parseFloat(sizeInp.value) === 0) sizeInp.value = '1';
            }
            
            nodes.forEach(n => n.removeAttribute(`data-hidden-${attrKey}`)); 
            tglBtn.classList.remove('hidden-state'); 
            row.classList.remove('hidden-row');
            tglBtn.innerHTML = '<svg class="icon-svg"><use href="#icon-eye"></use></svg>';
            
            if (scrub) { 
                if (updateRaf) cancelAnimationFrame(updateRaf); 
                updateRaf = requestAnimationFrame(() => renderOutput(true)); 
            } else {
                renderOutput(false);
            }
        };

        const label = createEl('span', 'layer-attr-label', { textContent: attrName });
        
        const pCenter = createEl('div', 'picker-center', { style: { backgroundColor: activeHex } });
        const pickerWrap = createEl('div', 'picker-wrap', { onclick: () => window.openCustomPicker(activeHex, (newCol, scrub) => updateColor(newCol, scrub)) }, [
            createEl('div', 'picker-ios', {}, [pCenter])
        ]);

        let opValue = nodes[0].getAttribute(`${attrKey}-opacity`);
        let opParsed = opValue !== null ? parseFloat(opValue) * 100 : 100;
        if (isNaN(opParsed)) opParsed = 100;

        const opInp = createEl('input', 'cp-op-input', { 
            type: 'number', value: Math.round(opParsed), min: 0, max: 100, 
            oninput: e => {
                let v = Math.min(100, Math.max(0, parseInt(e.target.value) || 0));
                let finalVal = (v / 100).toFixed(2).replace(/\.?0+$/, '');
                if (finalVal === "") finalVal = "0";
                nodes.forEach(n => {
                    if (v === 100) n.removeAttribute(`${attrKey}-opacity`);
                    else n.setAttribute(`${attrKey}-opacity`, finalVal);
                });
                if (updateRaf) cancelAnimationFrame(updateRaf); 
                updateRaf = requestAnimationFrame(() => renderOutput(true));
            }, 
            onblur: e => {
                let v = Math.min(100, Math.max(0, parseInt(e.target.value) || 0));
                e.target.value = v; renderOutput();
            }
        });
        
        const opInpGroup = createEl('div', 'cp-input-group', { title: 'Opacity %' }, [ opInp, createEl('span', 'cp-unit', { textContent: '%' }) ]);

        const opTrigger = createEl('div', 'slider-trigger op', {
            title: 'Adjust Opacity',
            innerHTML: `<svg class="icon-svg" style="width:16px;height:16px;"><use href="#icon-slider-vertical"></use></svg>`,
            onclick: e => {
                e.stopPropagation();
                document.querySelectorAll('.slider-trigger').forEach(el => el.classList.remove('is-active'));
                opTrigger.classList.add('is-active');

                const rect = opTrigger.getBoundingClientRect();
                opPopup.style.display = 'flex';
                opPopup.style.left = `${rect.left + (rect.width / 2) - 17}px`;
                opPopup.style.top = `${rect.top - 148}px`; 

                const range = opPopup.querySelector('input');
                range.value = Math.round(parseFloat(opInp.value) || 0);
                
                range.oninput = ev => {
                    opInp.value = ev.target.value;
                    opInp.dispatchEvent(new Event('input'));
                };
            }
        });

        const tglBtn = createEl('div', `layer-toggle ${isHidden ? 'hidden-state' : ''}`, { innerHTML: `<svg class="icon-svg"><use href="#icon-eye${isHidden ? '-hidden' : ''}"></use></svg>` });
        tglBtn.onclick = () => {
            if (nodes[0].getAttribute(`data-hidden-${attrKey}`)) {
                nodes.forEach(n => {
                    n.removeAttribute(`data-hidden-${attrKey}`); 
                    n.setAttribute(attrKey, activeHex);
                    if (isStroke && (!n.hasAttribute('stroke-width') || parseFloat(n.getAttribute('stroke-width')) === 0)) { n.setAttribute('stroke-width', '1'); }
                });
                if (isStroke) {
                    const sizeInp = row.querySelector('.cp-size-input');
                    if (sizeInp && parseFloat(sizeInp.value) === 0) sizeInp.value = '1';
                }
                tglBtn.classList.remove('hidden-state'); row.classList.remove('hidden-row'); 
                tglBtn.innerHTML = '<svg class="icon-svg"><use href="#icon-eye"></use></svg>';
            } else {
                nodes.forEach(n => n.setAttribute(`data-hidden-${attrKey}`, 'true')); 
                tglBtn.classList.add('hidden-state'); row.classList.add('hidden-row'); 
                tglBtn.innerHTML = '<svg class="icon-svg"><use href="#icon-eye-hidden"></use></svg>';
            }
            renderOutput();
        };

        const leftBlock = createEl('div', 'attr-left');
        leftBlock.appendChild(label);
        leftBlock.appendChild(pickerWrap);
        row.appendChild(leftBlock);

        const middleBlock = createEl('div', 'attr-middle');

        if (isStroke) {
            const sizeInp = createEl('input', 'cp-size-input', { type: 'number', value: nodes[0].getAttribute('stroke-width') || 1, min: 0, step: 0.5, oninput: e => {
                let v = Math.max(0, parseFloat(e.target.value) || 0); 
                nodes.forEach(n => n.setAttribute('stroke-width', v));
                if (v > 0 && nodes[0].getAttribute('data-hidden-stroke')) updateColor(activeHex || '#000000'); 
                if (updateRaf) cancelAnimationFrame(updateRaf); 
                updateRaf = requestAnimationFrame(() => renderOutput(true));
            }});
            const sizeInpGroup = createEl('div', 'cp-input-group', {}, [sizeInp, createEl('span', 'cp-unit', { textContent: 'px' })]);
            
            const strokeTrigger = createEl('div', 'slider-trigger stroke', {
                title: 'Adjust Stroke Width',
                innerHTML: `<svg class="icon-svg" style="width:16px;height:16px;"><use href="#icon-slider-horizontal"></use></svg>`,
                onclick: e => {
                    e.stopPropagation();
                    document.querySelectorAll('.slider-trigger').forEach(el => el.classList.remove('is-active'));
                    strokeTrigger.classList.add('is-active');

                    const rect = strokeTrigger.getBoundingClientRect();
                    strokePopup.style.display = 'flex';
                    strokePopup.style.left = `${rect.left + (rect.width / 2) - 70}px`;
                    strokePopup.style.top = `${rect.top - 44}px`; 

                    const range = strokePopup.querySelector('input');
                    range.value = 0; 
                    let dragBase = 0, dragging = false;

                    range.onpointerdown = () => {
                        dragging = true; dragBase = parseFloat(sizeInp.value) || 0;
                        const handleStop = () => {
                            if (dragging) { dragging = false; range.value = 0; if (updateRaf) cancelAnimationFrame(updateRaf); updateRaf = requestAnimationFrame(() => renderOutput(true)); }
                            window.removeEventListener('pointerup', handleStop); window.removeEventListener('pointercancel', handleStop);
                        };
                        window.addEventListener('pointerup', handleStop); window.addEventListener('pointercancel', handleStop);
                    };

                    range.oninput = ev => {
                        if (!dragging) return;
                        let v = Number(Math.max(0, dragBase + parseFloat(ev.target.value)).toFixed(2));
                        sizeInp.value = v; sizeInp.dispatchEvent(new Event('input'));
                    };
                }
            });

            middleBlock.appendChild(sizeInpGroup);
            middleBlock.appendChild(strokeTrigger);
            middleBlock.appendChild(createEl('div', 'row-divider'));
            middleBlock.appendChild(opInpGroup);
            middleBlock.appendChild(opTrigger);
        } else {
            const hexInp = createEl('input', 'cp-hex-input', { type: 'text', value: activeHex.replace('#', ''), maxLength: 6, spellcheck: false, onchange: e => {
                let v = e.target.value.trim().replace(/[^0-9A-Fa-f]/g, ''); if (v.length === 3) v = v.split('').map(c => c+c).join('');
                if (v.length === 6) { updateColor('#' + v); e.target.value = v.toUpperCase(); } else e.target.value = activeHex.replace('#', '');
            }, onkeydown: e => { if (e.key === 'Enter') { e.preventDefault(); hexInp.blur(); } } });
            
            const hexInpGroup = createEl('div', 'cp-input-group hex-target', {}, [createEl('span', 'cp-unit', { textContent: '#' }), hexInp]);
            
            const presetColors = ['#FF3B30', '#34C759', '#007AFF', '#FFCC00', '#00C7BE', '#804B98'];
            const presetGroup = createEl('div', 'preset-group', {}, presetColors.map(c => 
                createEl('div', 'preset-swatch', { style: { backgroundColor: c }, onclick: () => updateColor(c) })
            ));

            middleBlock.appendChild(hexInpGroup);
            middleBlock.appendChild(presetGroup);
            middleBlock.appendChild(createEl('div', 'row-divider'));
            middleBlock.appendChild(opInpGroup);
            middleBlock.appendChild(opTrigger);
        }

        row.appendChild(middleBlock);
        row.appendChild(tglBtn);

        return row;
    };

    if (isLinkedMode) {
        layersList.appendChild(createEl('div', 'layer-item', {}, [
            createEl('div', 'layer-title-row', {}, [
                createEl('div', 'layer-title', { textContent: `Linked Layers (${shapes.length})` }),
                createEl('div', 'layer-toggle', { title: 'Reset Layer', style: { opacity: '0', pointerEvents: 'none' }, innerHTML: '<svg class="icon-svg"><use href="#icon-reset"></use></svg>' })
            ]), 
            createAttrRow('Fill', shapes), 
            createAttrRow('Stroke', shapes)
        ]));
    } else {
        shapes.forEach((shape, i) => {
            layersList.appendChild(createEl('div', 'layer-item', {}, [
                createEl('div', 'layer-title-row', {}, [
                    createEl('div', 'layer-title', { textContent: `${shape.tagName.charAt(0).toUpperCase() + shape.tagName.slice(1)} ${i + 1}` }),
                    createEl('div', 'layer-toggle', { title: 'Reset Layer', innerHTML: '<svg class="icon-svg"><use href="#icon-reset"></use></svg>', onclick: () => {
                        const orig = globalOriginalSvg.querySelectorAll('path, circle, rect, polygon, polyline, ellipse, line')[i];
                        if (orig) { shape.replaceWith(orig.cloneNode(true)); buildLayersPanel(); renderOutput(); }
                    }})
                ]), 
                createAttrRow('Fill', [shape]), 
                createAttrRow('Stroke', [shape])
            ]));
        });
    }

    requestAnimationFrame(window.updateAllScrollbars); 
};

const renderOutput = (isScrubbing = false) => {
    if (!globalOptimizedSvg) return;
    const clone = globalOptimizedSvg.cloneNode(true);
    
    clone.querySelectorAll('path, circle, rect, polygon, polyline, ellipse, line').forEach(s => {
        if (s.getAttribute('data-hidden-fill')) s.setAttribute('fill', 'none');
        if (s.getAttribute('data-hidden-stroke')) s.setAttribute('stroke', 'none');
        s.removeAttribute('data-hidden-fill'); s.removeAttribute('data-hidden-stroke');
        const f = s.getAttribute('fill'), st = s.getAttribute('stroke');
        if ((!f || f === 'none') && (!st || st === 'none')) return s.remove();
        if (colorMode === 'mono') {
            if (f && f !== 'none' && !f.startsWith('url')) s.setAttribute('fill', 'currentColor');
            if (st && st !== 'none' && !st.startsWith('url')) s.setAttribute('stroke', 'currentColor');
        }
    });

    const emps = clone.querySelectorAll('g:not(#forge-ink-wrapper), defs');
    for (let i = emps.length - 1; i >= 0; i--) if (!emps[i].children.length) emps[i].remove();

    const code = new XMLSerializer().serializeToString(clone);
    previewArea.innerHTML = $('btnZoomToggle').outerHTML + code;
    if (!isScrubbing) outputStr.value = code;

    const vb = clone.getAttribute("viewBox") || clone.getAttribute("viewbox");
    let nw = 128, nh = 128;
    if (vb) {
        const p = vb.trim().split(/\s+|,/); nw = parseFloat(p[2]); nh = parseFloat(p[3]);
        detVbW.textContent = `${nw.toFixed(2)}px`; detVbH.textContent = `${nh.toFixed(2)}px`;
    } else {
        detVbW.textContent = `-`; detVbH.textContent = `-`;
    }

    const svg = previewArea.querySelector('svg:not(.icon-svg)');
    if (svg) {
        svg.dataset.nativeW = nw; svg.dataset.nativeH = nh;
        try { 
            const boundsTarget = svg.querySelector('#forge-ink-wrapper') || svg;
            const b = boundsTarget.getBBox(); 
            detObjW.textContent = `${b.width.toFixed(2)}px`; 
            detObjH.textContent = `${b.height.toFixed(2)}px`; 
        } 
        catch { detObjW.textContent = detObjH.textContent = 'Error'; }
        applyZoomState();
    }
};

window.copyOutput = btn => {
    if (!outputStr.value || btn.classList.contains('btn-success')) return;
    const span = btn.querySelector('span'), trigger = () => {
        btn.classList.add('btn-success'); 
        outputStr.classList.add('ring-green'); 
        
        if (span) span.textContent = 'Copied! ✓';
        setTimeout(() => { 
            btn.classList.remove('btn-success'); 
            outputStr.classList.remove('ring-green'); 
            if (span) span.textContent = 'Copy to Clipboard'; 
        }, 2000);
    };
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(outputStr.value).then(trigger).catch(fallback); else fallback();
    function fallback() {
        outputStr.focus(); outputStr.select(); outputStr.setSelectionRange(0, 999999);
        try { if (document.execCommand('copy')) trigger(); } catch (e) { console.error(e); }
        window.getSelection().removeAllRanges(); outputStr.blur();
    }
};

window.downloadSVG = async () => {
    if (!outputStr.value) return;
    if (window.isSecureContext && navigator.share && navigator.canShare) {
        const file = new File([new Blob([outputStr.value], { type: 'image/svg+xml' })], 'icon_optimized.svg', { type: 'image/svg+xml' });
        if (navigator.canShare({ files: [file] })) try { return await navigator.share({ files: [file] }); } catch (e) { if (e.name !== 'AbortError') throw e; }
    }
    const a = document.createElement('a');
    a.href = `data:application/octet-stream;base64,${btoa(unescape(encodeURIComponent(outputStr.value)))}`;
    a.download = 'icon_optimized.svg'; document.body.appendChild(a); a.click(); a.remove();
};
