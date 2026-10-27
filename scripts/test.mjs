import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { BASE, createPreviewServer, dist } from "./preview.mjs";

const failures = [];
const check = (condition, message) => {
  if (!condition) failures.push(message);
};

const home = await readFile(join(dist, "index.html"), "utf8");
const recipe = await readFile(join(dist, "recipes", "coleslaw", "index.html"), "utf8");
const css = await readFile(join(dist, "styles.css"), "utf8");
const js = await readFile(join(dist, "site.js"), "utf8");

check(home.includes('lang="he"') && home.includes('dir="rtl"'), "home is hebrew rtl");
check(recipe.includes('lang="he"') && recipe.includes('dir="rtl"'), "recipe is hebrew rtl");
check(home.includes("<title>מתכונים</title>"), "home title");
check(home.includes("<h1>מתכונים</h1>"), "home heading");
check(recipe.includes("<title>קולסלאו קלאסי · מתכונים</title>"), "recipe title");
check(home.includes('href="recipes/coleslaw/"'), "card links to the recipe");
check(home.includes('href="styles.css"'), "home stylesheet is relative");
check(recipe.includes('href="../../styles.css"'), "recipe stylesheet is relative");
check(recipe.includes('href="../../"'), "recipe links back home");
check(recipe.includes('src="../../site.js"'), "recipe script is relative");
check((recipe.match(/type="checkbox"/g) || []).length === 10, "ten ingredient checkboxes");
check((recipe.match(/<ol class="steps">/) || []).length === 1, "steps list");
check((recipe.match(/<li>/g) || []).length >= 13, "ingredient and step items");

const ingredients = [
  "חצי כרוב לבן, פרוס דק",
  "רבע כרוב סגול, פרוס דק",
  "2 גזרים מגוררים גס",
  "2 בצלים ירוקים קצוצים (לא חובה)",
  "3/4 כוס מיונז",
  "2 כפות חומץ תפוחים",
  "כף סוכר",
  "כפית חרדל דיז'ון",
  "חצי כפית מלח ופלפל שחור",
  "רבע כפית זרעי סלרי (לא חובה, אבל זה הטעם הקלאסי)",
];
let cursor = 0;
for (const line of ingredients) {
  const at = recipe.indexOf(line, cursor);
  check(at !== -1, `missing ingredient: ${line}`);
  if (at !== -1) cursor = at + line.length;
}

const steps = [
  "מערבבים את כל מרכיבי הרוטב בקערה קטנה עד שהוא חלק.",
  "שמים את הכרוב, הגזר והבצל הירוק בקערה גדולה, יוצקים מעל את הרוטב ומערבבים טוב.",
  "מכניסים למקרר לפחות לחצי שעה, כדי שהכרוב יתרכך קצת והטעמים יתערבבו.",
];
cursor = 0;
for (const line of steps) {
  const at = recipe.indexOf(line, cursor);
  check(at !== -1, `missing step: ${line}`);
  if (at !== -1) cursor = at + line.length;
}
check(recipe.includes("אם רוצים גרסה קלילה יותר, אפשר להחליף חצי מהמיונז ביוגורט יווני."), "tip text");
check(recipe.includes(">רוטב<"), "dressing heading");
check(home.includes("סלט") && home.includes("תוספת") && home.includes("מנגל"), "tags on the home page");
check(home.includes("4–6") && home.includes("15 דקות + צינון"), "servings and time on the card");

for (const [name, text] of [
  ["home", home],
  ["recipe", recipe],
  ["css", css],
  ["js", js],
]) {
  check(!/href="\//.test(text), `${name} has a root-absolute href`);
  check(!/src="\//.test(text), `${name} has a root-absolute src`);
  check(!/url\(\s*["']?\//.test(text), `${name} has a root-absolute css url`);
  check(!/https?:\/\//.test(text), `${name} depends on an external url`);
}

const server = createPreviewServer();
await new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", resolve);
});
const { port } = server.address();
const origin = `http://127.0.0.1:${port}`;

async function get(pathname) {
  const response = await fetch(origin + pathname, { redirect: "manual" });
  const bytes = Buffer.from(await response.arrayBuffer());
  return { response, text: bytes.toString("utf8"), bytes: bytes.length };
}

const index = await get(`${BASE}/`);
check(index.response.status === 200, `GET ${BASE}/ → ${index.response.status}`);
check(index.text.includes("קולסלאו קלאסי"), "home served under the base path lists the recipe");

const root = await get("/");
check(root.response.status === 302 && root.response.headers.get("location") === `${BASE}/`, "site root redirects to the base path");

const recipeUrl = new URL(`${BASE}/recipes/coleslaw/`, origin);
const recipePage = await get(recipeUrl.pathname);
check(recipePage.response.status === 200, "recipe page status");
for (const href of [...recipePage.text.matchAll(/(?:href|src)="([^"]+)"/g)].map((match) => match[1])) {
  if (href.startsWith("#")) continue;
  const asset = await get(new URL(href, recipeUrl).pathname);
  check(asset.response.status === 200, `${href} from the recipe page → ${asset.response.status}`);
}

const stylesheet = await get(`${BASE}/styles.css`);
check(stylesheet.response.status === 200, "stylesheet status");
check(stylesheet.response.headers.get("content-type")?.includes("text/css"), "stylesheet content type");
for (const href of [...stylesheet.text.matchAll(/url\("([^"]+)"\)/g)].map((match) => match[1])) {
  const asset = await get(new URL(href, new URL(`${BASE}/styles.css`, origin)).pathname);
  check(asset.response.status === 200 && asset.bytes > 100, `font ${href} → ${asset.response.status}`);
}

const bare = await get(`${BASE}/recipes/coleslaw`);
check(bare.response.status === 302 && bare.response.headers.get("location") === `${BASE}/recipes/coleslaw/`, "recipe directory redirects to a trailing slash");

server.close();

if (failures.length) {
  console.error(failures.map((failure) => `FAIL ${failure}`).join("\n"));
  process.exit(1);
}
console.log("ok");
