(() => {
  const input = document.querySelector("#q");
  const cards = [...document.querySelectorAll(".card")];
  const count = document.querySelector("#count");

  if (input && count && cards.length) {
    const chips = [...document.querySelectorAll(".chip")];
    let tag = "";

    const norm = (value) => value.trim().toLowerCase();
    const label = (n) => (n === 1 ? "מתכון אחד" : `${n} מתכונים`);

    const apply = () => {
      const query = norm(input.value);
      let shown = 0;
      for (const card of cards) {
        const hay = norm(card.dataset.search || "");
        const tags = (card.dataset.tags || "").split("|").filter(Boolean);
        const match = (!query || hay.includes(query)) && (!tag || tags.includes(tag));
        card.hidden = !match;
        if (match) shown += 1;
      }
      const none = shown === 0;
      count.classList.toggle("is-empty", none);
      count.textContent = none ? "אין מתכונים שמתאימים לחיפוש." : label(shown);
    };

    input.addEventListener("input", apply);
    for (const chip of chips) {
      chip.addEventListener("click", () => {
        tag = chip.dataset.tag || "";
        for (const other of chips) {
          const on = other === chip;
          other.classList.toggle("is-active", on);
          other.setAttribute("aria-pressed", String(on));
        }
        apply();
      });
    }
  }

  const boxes = document.querySelectorAll('.ingredients input[type="checkbox"]');
  if (!boxes.length) return;
  const slug = document.body.dataset.recipe || "recipe";
  for (const box of boxes) {
    const key = `matkonim:${slug}:${box.dataset.id}`;
    try {
      box.checked = localStorage.getItem(key) === "1";
    } catch {
      /* private mode */
    }
    box.addEventListener("change", () => {
      try {
        localStorage.setItem(key, box.checked ? "1" : "0");
      } catch {
        /* ignore quota or private mode */
      }
    });
  }
})();
