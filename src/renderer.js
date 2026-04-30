const SVG_MARKUP = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><defs><style>.cls-1{fill:#fff;}.cls-2{fill:#235ceb;}</style></defs><g id="图层_2" data-name="图层 2"><g id="图层_1-2" data-name="图层 1"><rect class="cls-1" width="512" height="512" rx="128"/></g><g id="图层_2-2" data-name="图层 2"><polygon class="cls-2" points="242.86 208.88 385.45 208.88 385.45 308.7 242.86 308.7 242.86 346.12 385.45 346.12 385.45 445.94 242.86 445.94 242.86 445.96 143.68 445.96 143.68 71.61 242.86 71.61 242.86 208.88"/><rect class="cls-2" x="286.27" y="71.61" width="99.18" height="99.82"/></g></g></svg>`;

const SVG_W = 80;
const SVG_H = 80;

let hitCtx = null;

function buildHitCanvas() {
  const canvas = document.createElement("canvas");
  canvas.width = SVG_W;
  canvas.height = SVG_H;
  hitCtx = canvas.getContext("2d");

  const blob = new Blob([SVG_MARKUP], { type: "image/svg+xml" });
  const url = URL.createObjectURL(blob);
  const img = new Image();
  img.onload = () => {
    hitCtx.clearRect(0, 0, SVG_W, SVG_H);
    hitCtx.drawImage(img, 0, 0, SVG_W, SVG_H);
    URL.revokeObjectURL(url);
  };
  img.src = url;
}

function isOpaqueAt(winX, winY) {
  if (!hitCtx) return true;
  const petRect = pet.getBoundingClientRect();
  const svgX = winX - petRect.left;
  const svgY = winY - petRect.top;
  if (svgX < 0 || svgY < 0 || svgX >= SVG_W || svgY >= SVG_H) return false;
  const pixel = hitCtx.getImageData(Math.floor(svgX), Math.floor(svgY), 1, 1).data;
  return pixel[3] > 10;
}

// Insert SVG into page
const pet = document.getElementById("pet");
pet.innerHTML = SVG_MARKUP;

buildHitCanvas();

// Drag state
let isDragging = false;
let mouseDownX = 0;
let mouseDownY = 0;

// Store pet screen position for menu
let petScreenX = 0;
let petScreenY = 0;

let lastIgnore = null;

function setIgnore(ignore) {
  if (ignore !== lastIgnore) {
    lastIgnore = ignore;
    window.electronAPI.setIgnoreMouse(ignore);
  }
}

window.addEventListener("mousedown", (e) => {
  if (e.button !== 0) return;
  if (!isOpaqueAt(e.clientX, e.clientY)) return;
  petScreenX = e.screenX;
  petScreenY = e.screenY;
  isDragging = false;
  mouseDownX = e.screenX;
  mouseDownY = e.screenY;
  e.preventDefault();
});

window.addEventListener("mousemove", (e) => {
  const opaque = isOpaqueAt(e.clientX, e.clientY);
  setIgnore(!opaque && !isDragging);

  if (isDragging) {
    const dx = e.screenX - mouseDownX;
    const dy = e.screenY - mouseDownY;
    if (dx !== 0 || dy !== 0) {
      window.electronAPI.moveWindowBy(dx, dy);
      mouseDownX = e.screenX;
      mouseDownY = e.screenY;
    }
  } else if (mouseDownX !== 0) {
    const dx = e.screenX - mouseDownX;
    const dy = e.screenY - mouseDownY;
    if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
      isDragging = true;
      window.electronAPI.dragStart();
    }
  }
});

window.addEventListener("mouseup", (e) => {
  if (e.button !== 0) return;

  if (isDragging) {
    isDragging = false;
    window.electronAPI.dragEnd();
    const opaque = isOpaqueAt(e.clientX, e.clientY);
    setIgnore(!opaque);
    mouseDownX = 0;
    mouseDownY = 0;
    return;
  }

  const dx = e.screenX - mouseDownX;
  const dy = e.screenY - mouseDownY;
  mouseDownX = 0;
  mouseDownY = 0;

  if (Math.abs(dx) <= 5 && Math.abs(dy) <= 5) {
    window.electronAPI.openMenu();
    return;
  }

  const opaque = isOpaqueAt(e.clientX, e.clientY);
  setIgnore(!opaque);
});

window.addEventListener("mouseleave", () => {
  if (!isDragging) setIgnore(true);
});

window.addEventListener("contextmenu", (e) => {
  e.preventDefault();
  window.electronAPI.openContextMenu(e.screenX, e.screenY);
});

window.electronAPI.onPopupClosed(() => {
  lastIgnore = null;
});
