// Popup renderer — handles menu interactions
const searchInput = document.getElementById("pet-search-input");

if (searchInput) {
  searchInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && searchInput.value.trim()) {
      window.electronAPI.menuAction("search:" + searchInput.value.trim());
    }
    if (e.key === "Escape") {
      window.electronAPI.menuAction("cancel");
    }
  });
  searchInput.focus();
}

document.querySelectorAll(".pet-menu-item").forEach((el) => {
  el.addEventListener("click", (e) => {
    e.stopPropagation();
    window.electronAPI.menuAction(el.dataset.action);
  });
});

// Escape closes popup
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    window.electronAPI.menuAction("cancel");
  }
});

// Close popup when focus is lost (handled in main.js via popupWin.on("blur"))
