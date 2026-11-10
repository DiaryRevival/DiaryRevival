/* Diary Revival — all the site's behaviour, no libraries. */

// Change this once and every page picks it up.
var SITE = {
  name: "Diary Revival",
  url: "https://diaryrevival.com",
  // Base64, so the address isn't lying in the code for email-harvesting bots.
  // To change it, run btoa("new@address") in a browser console and paste the result.
  email: atob("Y29udGFjdEBkaWFyeXJldml2YWwuY29t"),
};

/* ---------- Theme (light / dark) ---------- */

(function () {
  var saved = null;
  try { saved = localStorage.getItem("dnr-theme"); } catch (e) {}
  if (saved === "light" || saved === "dark") {
    document.documentElement.setAttribute("data-theme", saved);
  }
})();

function currentTheme() {
  var set = document.documentElement.getAttribute("data-theme");
  if (set) return set;
  return window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function labelThemeButton(btn) {
  btn.textContent = currentTheme() === "dark" ? "[ light mode ]" : "[ dark mode ]";
  btn.setAttribute("aria-label", currentTheme() === "dark" ? "Switch to light mode" : "Switch to dark mode");
}

document.addEventListener("DOMContentLoaded", function () {
  var btn = document.querySelector(".theme-toggle");
  if (btn) {
    labelThemeButton(btn);
    btn.addEventListener("click", function () {
      var next = currentTheme() === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", next);
      try { localStorage.setItem("dnr-theme", next); } catch (e) {}
      labelThemeButton(btn);
    });
  }

  document.querySelectorAll("[data-email]").forEach(function (el) {
    var a = document.createElement("a");
    a.href = "mailto:" + SITE.email;
    a.textContent = SITE.email;
    el.replaceChildren(a);
  });

  document.querySelectorAll("a[data-mailto]").forEach(function (a) {
    a.href = "mailto:" + SITE.email;
  });

  if (document.getElementById("archive")) initArchive();
  if (document.getElementById("entry")) initEntry();
  if (document.getElementById("latest")) initLatest();
});

/* ---------- Helpers ---------- */

function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// Diary text -> HTML for the page (transcriber's notes).
function textToHtml(text) {
  return esc(text)
    .replace(/\{\{(.+?)\}\}/g, '<span class="note">[$1]</span>');
}

// Diary text -> plain text for searching.
function textToPlain(text) {
  return text
    .replace(/\{\{(.+?)\}\}/g, "[Note: $1]");
}

// Who the diarist was: what the main search looks at.
function personText(d) {
  return [d.title, d.writer, d.summary, d.occupation, d.region, d.covers, d.decade, String(d.year), d.tags.join(" ")]
    .join(" ")
    .toLowerCase();
}

// What they wrote: only searched when "inside the pages" is ticked.
function pageText(d) {
  return d.days.map(function (x) { return x.heading + " " + textToPlain(x.text); }).join(" ").toLowerCase();
}

function findDiary(id) {
  return (window.DIARIES || []).filter(function (d) { return d.id === id; })[0];
}

// "diary" unless the entry says kind: "notebook".
function kindOf(d) {
  return d.kind === "notebook" ? "notebook" : "diary";
}

function tagLink(t, d) {
  return '<a class="tag" href="archive.html?tag=' + encodeURIComponent(t) +
    (kindOf(d) === "notebook" ? "&kind=notebook" : "") + '">' + esc(t) + "</a>";
}

/* ---------- Home: latest additions ---------- */

function initLatest() {
  var list = document.getElementById("latest");
  var items = (window.DIARIES || []).slice().sort(function (a, b) { return b.added.localeCompare(a.added); }).slice(0, 5);
  list.innerHTML = items.length ? items.map(function (d) { return entryListItem(d); }).join("") : "<li><p>Nothing yet.</p></li>";
}

function entryListItem(d, query, fromPages) {
  var snippet = d.summary;
  if (query && fromPages) {
    var plain = d.days.map(function (x) { return textToPlain(x.text); }).join(" ");
    var i = plain.toLowerCase().indexOf(query);
    if (i > -1) {
      var start = Math.max(0, i - 60);
      snippet = (start > 0 ? "…" : "") + plain.slice(start, i + query.length + 80) + "…";
    }
  }
  var snip = esc(snippet);
  if (query) {
    var re = new RegExp("(" + query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ")", "ig");
    snip = snip.replace(re, "<mark>$1</mark>");
  }
  return (
    "<li>" +
    '<div class="meta">' + esc(d.covers) + " &middot; " + esc(d.occupation) + " &middot; " + esc(d.region) +
    (d.placeholder ? ' &middot; <span class="stamp">placeholder</span>' : "") + "</div>" +
    '<div class="title"><a href="entry.html?id=' + encodeURIComponent(d.id) + '">' + esc(d.title) + "</a></div>" +
    '<p class="snippet">' + snip + "</p>" +
    '<div class="tags">' + d.tags.map(function (t) { return tagLink(t, d); }).join("") + "</div>" +
    "</li>"
  );
}

/* ---------- Archive: search, tags, filters, sorting ---------- */

function initArchive() {
  var diaries = window.DIARIES || [];
  var params = new URLSearchParams(location.search);
  var state = {
    kind: ["diary", "notebook"].indexOf(params.get("kind")) > -1 ? params.get("kind") : "all",
    q: params.get("q") || "",
    tags: params.getAll("tag"),
    decade: params.get("decade") || "",
    occupation: params.get("occupation") || "",
    sort: params.get("sort") || "oldest",
    inside: params.get("inside") === "1",
  };

  var q = document.getElementById("q");
  var inside = document.getElementById("inside");
  var decade = document.getElementById("decade");
  var occupation = document.getElementById("occupation");
  var sort = document.getElementById("sort");
  var tagBox = document.getElementById("tag-list");
  var kindBox = document.getElementById("kind-switch");
  var out = document.getElementById("results");
  var count = document.getElementById("result-count");

  function uniq(list) { return list.filter(function (v, i) { return list.indexOf(v) === i; }).sort(); }

  function inKind(d) { return state.kind === "all" || kindOf(d) === state.kind; }

  // The decade, occupation and tag choices only offer what the current kind has.
  function fillFilters() {
    var books = diaries.filter(inKind);
    decade.length = 1;
    occupation.length = 1;
    uniq(books.map(function (d) { return d.decade; })).forEach(function (v) { decade.add(new Option(v, v)); });
    uniq(books.map(function (d) { return d.occupation; })).forEach(function (v) { occupation.add(new Option(v, v)); });

    var allTags = uniq([].concat.apply([], books.map(function (d) { return d.tags; })));
    tagBox.innerHTML = allTags.map(function (t) {
      return '<button type="button" class="tag" data-tag="' + esc(t) + '" aria-pressed="false">' + esc(t) + "</button>";
    }).join("");
  }

  fillFilters();

  q.value = state.q;
  decade.value = state.decade;
  occupation.value = state.occupation;
  sort.value = state.sort;
  inside.checked = state.inside;

  kindBox.addEventListener("click", function (e) {
    var b = e.target.closest("button[data-kind]");
    if (!b || b.getAttribute("data-kind") === state.kind) return;
    state.kind = b.getAttribute("data-kind");
    state.tags = []; state.decade = ""; state.occupation = "";
    fillFilters();
    render();
  });

  // On phones the filters stay tucked away unless one is in use.
  var controls = document.querySelector(".controls");
  var toggle = document.getElementById("filter-toggle");

  function showFilters(on) {
    controls.classList.toggle("show-filters", on);
    toggle.setAttribute("aria-expanded", on ? "true" : "false");
    toggle.textContent = on ? "fewer filters" : "more filters";
  }

  showFilters(!!(state.decade || state.occupation || state.tags.length || state.sort !== "oldest"));
  toggle.addEventListener("click", function () {
    showFilters(!controls.classList.contains("show-filters"));
  });

  tagBox.addEventListener("click", function (e) {
    var b = e.target.closest("button[data-tag]");
    if (!b) return;
    var t = b.getAttribute("data-tag");
    var i = state.tags.indexOf(t);
    if (i > -1) state.tags.splice(i, 1); else state.tags.push(t);
    render();
  });

  q.addEventListener("input", function () { state.q = q.value; render(); });
  decade.addEventListener("change", function () { state.decade = decade.value; render(); });
  occupation.addEventListener("change", function () { state.occupation = occupation.value; render(); });
  sort.addEventListener("change", function () { state.sort = sort.value; render(); });
  inside.addEventListener("change", function () { state.inside = inside.checked; render(); });

  document.getElementById("clear").addEventListener("click", function () {
    state = { kind: state.kind, q: "", tags: [], decade: "", occupation: "", sort: state.sort, inside: state.inside };
    q.value = ""; decade.value = ""; occupation.value = "";
    render();
  });

  function render() {
    var query = state.q.trim().toLowerCase();
    var list = diaries.filter(function (d) {
      if (!inKind(d)) return false;
      if (state.decade && d.decade !== state.decade) return false;
      if (state.occupation && d.occupation !== state.occupation) return false;
      for (var i = 0; i < state.tags.length; i++) if (d.tags.indexOf(state.tags[i]) === -1) return false;
      if (query && personText(d).indexOf(query) === -1 && !(state.inside && pageText(d).indexOf(query) > -1)) return false;
      return true;
    });

    list.sort({
      oldest: function (a, b) { return a.year - b.year || a.title.localeCompare(b.title); },
      newest: function (a, b) { return b.year - a.year || a.title.localeCompare(b.title); },
      added: function (a, b) { return b.added.localeCompare(a.added); },
      title: function (a, b) { return a.title.localeCompare(b.title); },
    }[state.sort] || function () { return 0; });

    kindBox.querySelectorAll("button[data-kind]").forEach(function (b) {
      b.setAttribute("aria-pressed", b.getAttribute("data-kind") === state.kind ? "true" : "false");
    });

    tagBox.querySelectorAll("button[data-tag]").forEach(function (b) {
      b.setAttribute("aria-pressed", state.tags.indexOf(b.getAttribute("data-tag")) > -1 ? "true" : "false");
    });

    count.textContent = list.length + (list.length === 1 ? " writer" : " writers") + " found";
    var kindIsEmpty = !diaries.some(inKind);
    count.parentNode.hidden = kindIsEmpty;
    out.innerHTML = list.length
      ? list.map(function (d) {
          var fromPages = !!query && personText(d).indexOf(query) === -1;
          return entryListItem(d, query, fromPages);
        }).join("")
      : kindIsEmpty
        ? "<li><p>Nothing yet.</p></li>"
        : "<li><p>Nobody matches that. Yet. Try fewer tags" +
          (state.inside ? "" : ", or tick &ldquo;also search inside the pages&rdquo; to look for words they wrote") +
          ".</p></li>";

    // Keep the address bar in step so searches can be bookmarked or shared.
    var p = new URLSearchParams();
    if (state.kind !== "all") p.set("kind", state.kind);
    if (state.q) p.set("q", state.q);
    state.tags.forEach(function (t) { p.append("tag", t); });
    if (state.decade) p.set("decade", state.decade);
    if (state.occupation) p.set("occupation", state.occupation);
    if (state.sort !== "oldest") p.set("sort", state.sort);
    if (state.inside) p.set("inside", "1");
    var qs = p.toString();
    history.replaceState(null, "", location.pathname + (qs ? "?" + qs : ""));
  }

  render();
}

/* ---------- Single entry ---------- */

var MONTHS = ["January", "February", "March", "April", "May", "June", "July",
  "August", "September", "October", "November", "December"];

// "1930-01" from a day's date, or "" if it has none.
function monthOf(x) {
  var m = /^(\d{4}-\d{2})/.exec(x.date || "");
  return m ? m[1] : "";
}

// A row of links, one per month, worked out from the days' dates.
function monthLinks(d) {
  var months = d.days.map(monthOf).filter(function (m, i, all) { return m && all.indexOf(m) === i; });
  if (!months.length) return "";
  var years = months.map(function (m) { return m.slice(0, 4); });
  var manyYears = years.some(function (y) { return y !== years[0]; });
  return '<p class="months">' + months.map(function (m) {
    var name = MONTHS[Number(m.slice(5)) - 1] + (manyYears ? " " + m.slice(0, 4) : "");
    return '<a href="#month-' + m + '">' + name + "</a>";
  }).join(" &middot; ") + "</p>";
}

// A drawn cover.
function bookCover(d) {
  var label = esc(d.year) + "<br>" + (kindOf(d) === "notebook" ? "Notebook" : "Diary");
  var colour = /^#[0-9a-f]{6}$/i.test(d.cover || "") ? d.cover : "#4a5a6a";
  return '<div class="book-cover" style="background-color:' + colour + '" aria-hidden="true"><span>' + label + "</span></div>";
}

// Photos of the real book. The first one (normally the cover) shows on the
// entry page; clicking it opens a viewer to slide through them all.
function photoThumb(photos, title) {
  var p = photos[0];
  var n = photos.length;
  return '<button type="button" class="photo-thumb" id="open-photos" aria-label="Look at the photos of this book (' + n + ')">' +
    '<img src="' + esc(p.src) + '" alt="' + esc(p.alt || p.caption || title) + '">' +
    '<span class="photo-count">' + n + (n === 1 ? " photo" : " photos") + "</span></button>";
}

// Opens the photo viewer. returnTo is the button to put focus back on after.
function openPhotos(title, photos, start, returnTo) {
  var i = start || 0;
  var dlg = document.createElement("dialog");
  dlg.className = "lightbox";
  dlg.setAttribute("aria-label", "Photos of " + title);
  dlg.innerHTML =
    '<div class="lightbox-bar"><span class="lightbox-count"></span>' +
    '<button type="button" class="btn lightbox-close">Close &times;</button></div>' +
    '<figure><div class="lightbox-stage">' +
    '<button type="button" class="lightbox-arrow prev" aria-label="Previous photo">&lsaquo;</button>' +
    '<img alt="">' +
    '<button type="button" class="lightbox-arrow next" aria-label="Next photo">&rsaquo;</button>' +
    "</div><figcaption></figcaption></figure>";
  document.body.appendChild(dlg);

  var img = dlg.querySelector("img");
  function show(n) {
    i = (n + photos.length) % photos.length;
    var p = photos[i];
    img.src = p.src;
    img.alt = p.alt || p.caption || "";
    dlg.querySelector("figcaption").textContent = p.caption || "";
    dlg.querySelector(".lightbox-count").textContent = "Photo " + (i + 1) + " of " + photos.length;
  }
  var single = photos.length < 2;
  dlg.querySelectorAll(".lightbox-arrow").forEach(function (b) { b.hidden = single; });
  dlg.querySelector(".prev").addEventListener("click", function () { show(i - 1); });
  dlg.querySelector(".next").addEventListener("click", function () { show(i + 1); });
  function finish() {
    if (!dlg.isConnected) return;
    if (dlg.open) dlg.close();
    dlg.remove();
    if (returnTo) returnTo.focus();
  }
  dlg.querySelector(".lightbox-close").addEventListener("click", finish);
  // Click the dark area around the photo to close.
  dlg.addEventListener("click", function (e) { if (e.target === dlg) finish(); });
  dlg.addEventListener("keydown", function (e) {
    if (e.key === "ArrowLeft") show(i - 1);
    if (e.key === "ArrowRight") show(i + 1);
  });
  // Swipe left or right on a phone.
  var x0 = null;
  img.addEventListener("touchstart", function (e) { x0 = e.touches[0].clientX; }, { passive: true });
  img.addEventListener("touchend", function (e) {
    if (x0 === null) return;
    var dx = e.changedTouches[0].clientX - x0;
    if (Math.abs(dx) > 40) show(dx < 0 ? i + 1 : i - 1);
    x0 = null;
  });
  dlg.addEventListener("close", finish); // Esc key

  show(i);
  dlg.showModal();
  dlg.querySelector(single ? ".lightbox-close" : ".next").focus();
}

// The "Context of the time" drop-down. Only shows if the entry has context.
function contextBox(d) {
  if (!d.context) return "";
  return '<details class="box context"><summary>Context of the time</summary><p>' + esc(d.context) + "</p></details>";
}

function keepOutOfSearch() {
  var m = document.createElement("meta");
  m.name = "robots";
  m.content = "noindex";
  document.head.appendChild(m);
}

function initEntry() {
  var box = document.getElementById("entry");
  var d = findDiary(new URLSearchParams(location.search).get("id"));
  if (!d) {
    keepOutOfSearch();
    box.innerHTML = '<h2>Not found</h2><p>That page has gone missing. <a href="archive.html">Back to the archive</a>.</p>';
    return;
  }
  document.title = d.title + " — " + SITE.name;
  document.querySelector('meta[name="description"]').content = d.summary;
  var canonical = document.createElement("link");
  canonical.rel = "canonical";
  canonical.href = SITE.url + "/entry.html?id=" + encodeURIComponent(d.id);
  document.head.appendChild(canonical);
  // Share previews (Facebook, X, messaging apps) use the entry's own title and summary.
  function setOg(prop, value) {
    var tag = document.querySelector('meta[property="' + prop + '"]');
    if (!tag) { tag = document.createElement("meta"); tag.setAttribute("property", prop); document.head.appendChild(tag); }
    tag.content = value;
  }
  setOg("og:title", d.title);
  setOg("og:description", d.summary);
  setOg("og:url", canonical.href);
  setOg("og:type", "article");
  // Structured data so search engines know this is a transcribed manuscript.
  var ld = document.createElement("script");
  ld.type = "application/ld+json";
  ld.textContent = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "CreativeWork",
    "name": d.title,
    "description": d.summary,
    "url": canonical.href,
    "inLanguage": "en-GB",
    "dateCreated": String(d.year),
    "keywords": (d.tags || []).join(", "),
    "isPartOf": { "@type": "WebSite", "name": SITE.name, "url": SITE.url + "/" }
  });
  document.head.appendChild(ld);
  if (d.placeholder) keepOutOfSearch();
  // A photo with an empty src is a slot waiting to be filled: it is skipped
  // in the viewer, and on a page it shows as an empty frame.
  var coverPhotos = (d.photos || []).filter(function (p) { return p && p.src; });
  var hasPhotos = coverPhotos.length > 0;
  // Page photos, in page order, so the viewer can slide from one page to the next.
  var pagePhotos = d.days.map(function (x) {
    if (x.photo && !x.photo.caption) x.photo.caption = x.heading;
    return x.photo && x.photo.src ? x.photo : null;
  }).filter(Boolean);

  box.innerHTML =
    '<div class="entry-head">' + (hasPhotos ? photoThumb(coverPhotos, d.title) : bookCover(d)) + "<div>" +
    "<h2>" + esc(d.title) + (d.placeholder ? ' <span class="stamp">placeholder</span>' : "") + "</h2>" +
    "<p><em>" + esc(d.summary) + "</em></p>" +
    "</div></div>" +
    '<details class="box context"><summary>About this book</summary>' +
    '<table class="facts"><tbody>' +
    row("Written by", d.writer) + row("Covers", d.covers) + row("Occupation", d.occupation) +
    row("Region", d.region) + row("The book", d.format) + row("Condition", d.condition) +
    row("Where it came from", d.acquired) + row("Added to the archive", d.added) +
    "</tbody></table></details>" +
    contextBox(d) +
    '<div class="tags">' + d.tags.map(function (t) { return tagLink(t, d); }).join("") + "</div>" +
    monthLinks(d) +
    '<div class="page-sheet">' +
    d.days.map(function (x, i) {
      var month = monthOf(x);
      var first = month && (i === 0 || monthOf(d.days[i - 1]) !== month);
      var text = "<h3>" + esc(x.heading) + "</h3><p>" + textToHtml(x.text) + "</p>";
      if (x.photo && !x.photo.src) {
        text = '<div class="page-photo empty" aria-hidden="true"><span>Photo to come</span></div>' +
          '<div class="day-text">' + text + "</div>";
      } else if (x.photo) {
        // The photo of this page, side by side with its transcription.
        text = '<button type="button" class="page-photo" data-page="' + pagePhotos.indexOf(x.photo) + '" aria-label="Look closer at the photo of ' + esc(x.heading) + '">' +
          '<img src="' + esc(x.photo.src) + '" alt="' + esc(x.photo.alt || "Photo of the page for " + x.heading) + '" loading="lazy"></button>' +
          '<div class="day-text">' + text + "</div>";
      }
      return '<div class="day' + (x.photo ? " has-photo" : "") + '"' + (first ? ' id="month-' + month + '"' : "") + ">" + text + "</div>";
    }).join("") +
    "</div>" +
    '<p class="small">Names, places and dates may have been changed to protect the people in the book. Spelling and punctuation are kept as written.</p>' +
    '<p><a href="archive.html">&larr; Back to the archive</a></p>';

  if (hasPhotos) {
    var thumb = document.getElementById("open-photos");
    thumb.addEventListener("click", function () { openPhotos(d.title, coverPhotos, 0, thumb); });
  }

  box.querySelectorAll(".page-photo").forEach(function (b) {
    b.addEventListener("click", function () { openPhotos(d.title, pagePhotos, Number(b.dataset.page), b); });
  });

  function row(k, v) { return v ? "<tr><th>" + esc(k) + "</th><td>" + esc(v) + "</td></tr>" : ""; }
}
