import { cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const recipesDir = join(root, "content", "recipes");
const dist = join(root, "dist");

const mark = `<svg class="mark" viewBox="0 0 64 64" aria-hidden="true">
  <rect width="64" height="64" rx="18" fill="#c4492c"/>
  <path d="M32 13c9 4.2 14 11 14 19.2 0 8.6-6 15.2-14 17.2-8-2-14-8.6-14-17.2C18 24 23 17.2 32 13z" fill="#f6f0e6"/>
  <path d="M32 20c5.4 2.8 8 6.6 8 11.6 0 5.4-3.4 9.6-8 11-4.6-1.4-8-5.6-8-11 0-5 2.6-8.8 8-11.6z" fill="#5f6b3c"/>
  <path d="M32 27c2.4 1.3 3.6 3.2 3.6 5.6 0 2.6-1.6 4.6-3.6 5.2-2-.6-3.6-2.6-3.6-5.2 0-2.4 1.2-4.3 3.6-5.6z" fill="#f6f0e6"/>
</svg>`;

const searchIcon = `<svg class="search-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M16 16l5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;

const chevron = `<svg class="chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

function esc(value) {
  return String(value).replace(/[&<>"]/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
  }[ch]));
}

function parseFrontmatter(raw) {
  const text = raw.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
  if (!text.startsWith("---\n")) throw new Error("missing frontmatter");
  const end = text.indexOf("\n---\n", 4);
  if (end === -1) throw new Error("frontmatter is not closed");
  const data = {};
  let listKey = null;
  for (const line of text.slice(4, end).split("\n")) {
    if (!line.trim()) continue;
    const item = line.match(/^\s+-\s+(.*)$/);
    if (item) {
      if (!listKey) throw new Error(`list item without a key: ${line}`);
      data[listKey].push(item[1].trim());
      continue;
    }
    const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!match) throw new Error(`bad frontmatter line: ${line}`);
    const [, key, value] = match;
    if (!value.trim()) {
      data[key] = [];
      listKey = key;
    } else {
      data[key] = value.trim();
      listKey = null;
    }
  }
  return { data, body: text.slice(end + 5) };
}

function blankSection(title) {
  return { title, items: [], steps: [], paragraphs: [], quotes: [], quoteOpen: false };
}

function parseBody(body) {
  const sections = [];
  let current = null;
  for (const line of body.split("\n")) {
    const heading = line.match(/^##\s+(.+?)\s*$/);
    if (heading) {
      current = blankSection(heading[1].trim());
      sections.push(current);
      continue;
    }
    if (!line.trim()) {
      if (current) current.quoteOpen = false;
      continue;
    }
    if (!current) {
      current = blankSection("");
      sections.push(current);
    }
    const item = line.match(/^-\s+(.+)$/);
    if (item) {
      current.items.push(item[1].trim());
      current.quoteOpen = false;
      continue;
    }
    const step = line.match(/^\d+\.\s+(.+)$/);
    if (step) {
      current.steps.push(step[1].trim());
      current.quoteOpen = false;
      continue;
    }
    if (line.startsWith(">")) {
      const text = line.replace(/^>\s?/, "").trim();
      if (current.quoteOpen && current.quotes.length) {
        current.quotes[current.quotes.length - 1] += text ? ` ${text}` : "";
      } else if (text) {
        current.quotes.push(text);
        current.quoteOpen = true;
      }
      continue;
    }
    current.paragraphs.push(line.trim());
    current.quoteOpen = false;
  }
  return sections.filter((section) => section.items.length || section.steps.length || section.paragraphs.length || section.quotes.length);
}

function requireField(data, key, slug) {
  const value = data[key];
  if (value == null || value === "" || (Array.isArray(value) && value.length === 0)) {
    throw new Error(`${slug}: missing ${key}`);
  }
  return value;
}

function hebrewCount(count) {
  return count === 1 ? "מתכון אחד" : `${count} מתכונים`;
}

function renderProse(parts) {
  return parts.map((part) => `<p>${esc(part)}</p>`).join("\n");
}

function renderSection(section) {
  const prose = [...section.paragraphs, ...section.quotes];
  const tip = section.items.length === 0 && section.steps.length === 0 && (section.title === "טיפ" || section.quotes.length > 0);
  if (tip) {
    const title = section.title || "טיפ";
    return `<aside class="tip">\n<h2>${esc(title)}</h2>\n${renderProse(prose)}\n</aside>`;
  }
  const chunks = [`<section class="section">`, `<h2>${esc(section.title)}</h2>`];
  if (prose.length) chunks.push(renderProse(prose));
  if (section.items.length) {
    const items = section.items
      .map((item) => `<li><label><input type="checkbox" data-id="${esc(encodeURIComponent(item))}"><span>${esc(item)}</span></label></li>`)
      .join("\n");
    chunks.push(`<ul class="ingredients">\n${items}\n</ul>`);
  }
  if (section.steps.length) {
    const steps = section.steps.map((step) => `<li>${esc(step)}</li>`).join("\n");
    chunks.push(`<ol class="steps">\n${steps}\n</ol>`);
  }
  chunks.push("</section>");
  return chunks.join("\n");
}

function layout({ title, description, depth, content, recipe }) {
  const prefix = "../".repeat(depth);
  const fullTitle = title === "מתכונים" ? "מתכונים" : `${title} · מתכונים`;
  const bodyAttr = recipe ? ` data-recipe="${esc(recipe)}"` : "";
  return `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(fullTitle)}</title>
<meta name="description" content="${esc(description)}">
<meta name="theme-color" content="#f3ecdf">
<link rel="icon" href="${prefix}favicon.svg" type="image/svg+xml">
<link rel="preload" href="${prefix}fonts/heebo-hebrew.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="${prefix}fonts/frank-ruhl-libre-hebrew.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="${prefix}styles.css">
</head>
<body${bodyAttr}>
<a class="skip" href="#content">לתוכן</a>
${content}
<footer class="wrap foot"><p>בתיאבון</p></footer>
<script src="${prefix}site.js"></script>
</body>
</html>
`;
}

function renderHome(recipes) {
  const tags = [];
  for (const recipe of recipes) {
    for (const tag of recipe.tags) {
      if (!tags.includes(tag)) tags.push(tag);
    }
  }
  const chips = [`<button type="button" class="chip is-active" data-tag="" aria-pressed="true">הכל</button>`]
    .concat(tags.map((tag) => `<button type="button" class="chip" data-tag="${esc(tag)}" aria-pressed="false">${esc(tag)}</button>`))
    .join("\n");
  const cards = recipes
    .map((recipe) => {
      const search = [recipe.title, recipe.description, ...recipe.tags].join(" ");
      const tagItems = recipe.tags.map((tag) => `<li>${esc(tag)}</li>`).join("");
      return `<article class="card" data-search="${esc(search)}" data-tags="${esc(recipe.tags.join("|"))}">
<h2><a href="recipes/${recipe.slug}/">${esc(recipe.title)}</a></h2>
<p class="card-desc">${esc(recipe.description)}</p>
<p class="card-meta"><span>${esc(recipe.servings)} מנות</span><span class="dot" aria-hidden="true">·</span><span>${esc(recipe.time)}</span></p>
<ul class="tags">${tagItems}</ul>
</article>`;
    })
    .join("\n");
  const content = `<header class="mast wrap">
<div class="brand">
${mark}
<div>
<p class="eyebrow">המטבח של בני</p>
<h1>מתכונים</h1>
</div>
</div>
</header>
<main id="content" class="wrap">
<div class="search">
<label class="visually-hidden" for="q">חיפוש לפי שם או תגית</label>
${searchIcon}
<input id="q" type="search" placeholder="חיפוש לפי שם או תגית" autocomplete="off" enterkeyhint="search">
</div>
<div class="filters" role="group" aria-label="סינון לפי תגית">
${chips}
</div>
<p id="count" class="count" aria-live="polite">${hebrewCount(recipes.length)}</p>
<div class="grid">
${cards}
</div>
</main>`;
  return layout({
    title: "מתכונים",
    description: "אוסף מתכונים ביתי — המטבח של בני.",
    depth: 0,
    content,
  });
}

function renderRecipe(recipe) {
  const tags = recipe.tags.map((tag) => `<li>${esc(tag)}</li>`).join("");
  const content = `<main id="content" class="wrap">
<p class="back-row"><a class="back" href="../../">${chevron}<span>כל המתכונים</span></a></p>
<article class="sheet">
<header>
<h1>${esc(recipe.title)}</h1>
<p class="lede">${esc(recipe.description)}</p>
<ul class="tags">${tags}</ul>
<dl class="facts">
<div><dt>מנות</dt><dd>${esc(recipe.servings)}</dd></div>
<div><dt>זמן</dt><dd>${esc(recipe.time)}</dd></div>
</dl>
</header>
${recipe.sections.map(renderSection).join("\n")}
</article>
</main>`;
  return layout({
    title: recipe.title,
    description: recipe.description,
    depth: 2,
    content,
    recipe: recipe.slug,
  });
}

async function loadRecipes() {
  let names;
  try {
    names = await readdir(recipesDir);
  } catch {
    throw new Error(`missing recipes directory: content/recipes`);
  }
  const recipes = [];
  for (const name of names.filter((entry) => entry.endsWith(".md")).sort()) {
    const slug = basename(name, ".md");
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      throw new Error(`${name}: file name must be a lowercase english slug, like coleslaw.md`);
    }
    const raw = await readFile(join(recipesDir, name), "utf8");
    let parsed;
    try {
      parsed = parseFrontmatter(raw);
    } catch (error) {
      throw new Error(`${slug}: ${error.message}`);
    }
    const { data, body } = parsed;
    const tags = requireField(data, "tags", slug);
    if (!Array.isArray(tags)) throw new Error(`${slug}: tags must be a list`);
    if (tags.some((tag) => tag.includes("|"))) throw new Error(`${slug}: tags cannot contain |`);
    const sections = parseBody(body);
    if (!sections.length) throw new Error(`${slug}: recipe has no body`);
    recipes.push({
      slug,
      title: requireField(data, "title", slug),
      description: requireField(data, "description", slug),
      servings: requireField(data, "servings", slug),
      time: requireField(data, "time", slug),
      tags,
      sections,
    });
  }
  recipes.sort((a, b) => a.title.localeCompare(b.title, "he"));
  return recipes;
}

async function build() {
  const recipes = await loadRecipes();
  await rm(dist, { recursive: true, force: true });
  await mkdir(join(dist, "recipes"), { recursive: true });
  await cp(join(root, "src", "styles.css"), join(dist, "styles.css"));
  await cp(join(root, "src", "site.js"), join(dist, "site.js"));
  await cp(join(root, "src", "favicon.svg"), join(dist, "favicon.svg"));
  await cp(join(root, "src", "fonts"), join(dist, "fonts"), { recursive: true });
  await writeFile(join(dist, "index.html"), renderHome(recipes));
  for (const recipe of recipes) {
    const dir = join(dist, "recipes", recipe.slug);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "index.html"), renderRecipe(recipe));
  }
  console.log(`built ${recipes.length} ${recipes.length === 1 ? "recipe" : "recipes"} → dist/`);
}

build().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
