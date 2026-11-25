/* =========================================================
   Powell-Roach Lab — interactions
   ========================================================= */
(function () {
  "use strict";
  document.documentElement.classList.remove("no-js");

  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- Hamburger site menu ---------- */
  var toggle = $(".menu-toggle");
  var menu = $("#site-menu");
  var uniBar = $(".uni-bar");
  if (toggle && menu) {
    var setOpen = function (open) {
      toggle.setAttribute("aria-expanded", String(open));
      toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
      menu.classList.toggle("open", open);
    };
    toggle.addEventListener("click", function () {
      setOpen(toggle.getAttribute("aria-expanded") !== "true");
    });
    $$("a", menu).forEach(function (a) { a.addEventListener("click", function () { setOpen(false); }); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") setOpen(false); });
    document.addEventListener("click", function (e) {
      if (menu.classList.contains("open") && uniBar && !uniBar.contains(e.target)) setOpen(false);
    });
  }

  /* ---------- Site search ---------- */
  var SEARCH_INDEX = [
    { t: "Home", u: "index.html", k: "home welcome powell-roach powell roach lab rutgers" },
    { t: "About the lab", u: "index.html#about", k: "about sickle cell disease scd vaso-occlusive crisis blood disorder mission" },
    { t: "What we study", u: "index.html#research-areas", k: "research focus areas topics" },
    { t: "Lab news", u: "index.html#news", k: "news updates world sickle cell day recruiting announcements" },
    { t: "Research overview", u: "research.html", k: "research science studies methods approach" },
    { t: "Pain mechanisms & phenotyping", u: "research.html#mechanisms", k: "acute chronic pain crisis central sensitization trajectories" },
    { t: "Biobehavioral factors", u: "research.html#biobehavioral", k: "sleep stress mood depression anxiety coping fatigue resilience" },
    { t: "Patient-reported outcomes & digital health", u: "research.html#outcomes", k: "mobile app diary ema symptom tracking self-management digital" },
    { t: "Health equity & access to care", u: "research.html#equity", k: "stigma bias emergency department transition community advocacy" },
    { t: "About the PI: Dr. Keesha Roach", u: "team.html#pi", k: "principal investigator professor keesha roach bio cv faculty" },
    { t: "Lab members", u: "team.html#members", k: "team people members students coordinator graduate phd jeanene barrett ashley iwu lokesh taduri hyejin jeon" },
    { t: "Publications", u: "publications.html", k: "papers articles journal pubmed research output" },
    { t: "Join the lab", u: "join.html", k: "join positions opportunities undergraduate graduate phd postdoc apply jobs" },
    { t: "Volunteer for a research study", u: "join.html#participate", k: "volunteer participate study patients families sickle cell research participation" },
    { t: "Collaborate with the lab", u: "join.html#collaborate", k: "collaborate collaboration clinicians researchers community partners" },
    { t: "Research participation & FAQ", u: "contact.html#faq", k: "participate study volunteer faq questions patients" },
    { t: "Contact", u: "contact.html", k: "contact email phone address location message" }
  ];
  if (window.PUBLICATIONS) {
    window.PUBLICATIONS.forEach(function (p) {
      SEARCH_INDEX.push({ t: p.title, u: "publications.html", k: p.authors + " " + p.journal + " " + p.topics.join(" "), pub: true });
    });
  }
  $$(".site-search").forEach(function (form) {
    var input = $("input", form);
    var list = $(".search-results", form);
    var results = [], active = -1;
    var close = function () { list.hidden = true; active = -1; input.setAttribute("aria-expanded", "false"); };
    var escH = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]; }); };
    var paint = function () {
      $$("a", list).forEach(function (a, i) { a.classList.toggle("active", i === active); a.setAttribute("aria-selected", String(i === active)); });
    };
    var search = function () {
      var q = input.value.trim().toLowerCase();
      if (!q) { close(); return; }
      var terms = q.split(/\s+/);
      results = SEARCH_INDEX.filter(function (r) {
        var hay = (r.t + " " + r.k).toLowerCase();
        return terms.every(function (term) { return hay.indexOf(term) > -1; });
      }).slice(0, 7);
      active = results.length ? 0 : -1;
      list.innerHTML = results.length
        ? results.map(function (r) {
            var where = r.pub ? "Publication" : r.u.replace(".html", "").replace("#", " › ").replace("index", "home");
            return '<li><a role="option" href="' + r.u + '">' + escH(r.t) + "<small>" + escH(where) + "</small></a></li>";
          }).join("")
        : '<li class="no-results">No results for "' + escH(input.value.trim()) + '"</li>';
      list.hidden = false;
      input.setAttribute("aria-expanded", "true");
      paint();
    };
    input.addEventListener("input", search);
    input.addEventListener("focus", function () { if (input.value.trim()) search(); });
    input.addEventListener("keydown", function (e) {
      if (list.hidden || !results.length) { if (e.key === "Escape") close(); return; }
      if (e.key === "ArrowDown") { e.preventDefault(); active = (active + 1) % results.length; paint(); }
      else if (e.key === "ArrowUp") { e.preventDefault(); active = (active - 1 + results.length) % results.length; paint(); }
      else if (e.key === "Escape") { close(); }
    });
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!input.value.trim()) { input.focus(); return; }
      search();
      if (results.length) window.location.href = results[Math.max(active, 0)].u;
    });
    document.addEventListener("click", function (e) { if (!form.contains(e.target)) close(); });
  });

  /* ---------- Active nav link ---------- */
  var page = (location.pathname.split("/").pop() || "index.html").toLowerCase();
  $$("#main-nav a, #site-menu a").forEach(function (a) {
    var raw = a.getAttribute("href") || "";
    if (raw.indexOf("#") > -1) return; // in-page section links are never "current page"
    var href = raw.toLowerCase();
    if (href === page) {
      a.classList.add("active");
      a.setAttribute("aria-current", "page");
    }
  });

  /* ---------- Header shadow + back to top ---------- */
  var header = $(".main-nav");
  var toTop = $(".to-top");
  var onScroll = function () {
    var y = window.scrollY;
    if (header) header.classList.toggle("scrolled", y > 10);
    if (toTop) toTop.classList.toggle("show", y > 600);
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();
  if (toTop) toTop.addEventListener("click", function () { window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" }); });

  /* ---------- Footer year ---------- */
  $$("[data-year]").forEach(function (el) { el.textContent = new Date().getFullYear(); });

  /* ---------- Reveal on scroll ---------- */
  var reveals = $$(".reveal");
  if ("IntersectionObserver" in window && !reduceMotion) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add("visible"); io.unobserve(en.target); }
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });
    reveals.forEach(function (el) { io.observe(el); });
  } else {
    reveals.forEach(function (el) { el.classList.add("visible"); });
  }

  /* ---------- Hero carousel ---------- */
  var hero = $(".hero");
  if (hero) {
    var slides = $$(".slide", hero);
    var dotsWrap = $(".dots", hero);
    var DELAY = 7000;
    var idx = 0, timer = null;
    hero.style.setProperty("--slide-ms", DELAY + "ms");

    var dots = slides.map(function (_, i) {
      var b = document.createElement("button");
      b.className = "dot";
      b.type = "button";
      b.setAttribute("aria-label", "Show slide " + (i + 1));
      b.addEventListener("click", function () { go(i); restart(); });
      dotsWrap.appendChild(b);
      return b;
    });

    var go = function (n) {
      idx = (n + slides.length) % slides.length;
      slides.forEach(function (s, i) {
        var on = i === idx;
        s.classList.toggle("active", on);
        s.setAttribute("aria-hidden", String(!on));
        $$("a, button", s).forEach(function (el) { el.tabIndex = on ? 0 : -1; });
      });
      dots.forEach(function (d, i) {
        d.classList.remove("active");
        if (i === idx) { void d.offsetWidth; d.classList.add("active"); }
        d.setAttribute("aria-current", i === idx ? "true" : "false");
      });
    };
    var restart = function () {
      clearInterval(timer);
      if (!reduceMotion) timer = setInterval(function () { if (!hero.classList.contains("paused")) go(idx + 1); }, DELAY);
    };
    var prev = $(".carousel-prev", hero), next = $(".carousel-next", hero);
    if (prev) prev.addEventListener("click", function () { go(idx - 1); restart(); });
    if (next) next.addEventListener("click", function () { go(idx + 1); restart(); });

    hero.addEventListener("mouseenter", function () { hero.classList.add("paused"); });
    hero.addEventListener("mouseleave", function () { hero.classList.remove("paused"); });
    hero.addEventListener("focusin", function () { hero.classList.add("paused"); });
    hero.addEventListener("focusout", function () { hero.classList.remove("paused"); });
    hero.addEventListener("keydown", function (e) {
      if (e.key === "ArrowLeft") { go(idx - 1); restart(); }
      if (e.key === "ArrowRight") { go(idx + 1); restart(); }
    });

    // touch swipe (on the text only, so dragging over the animation doesn't change slides)
    var startX = null;
    var swipeArea = $(".slides", hero) || hero;
    swipeArea.addEventListener("touchstart", function (e) { startX = e.touches[0].clientX; }, { passive: true });
    swipeArea.addEventListener("touchend", function (e) {
      if (startX === null) return;
      var dx = e.changedTouches[0].clientX - startX;
      if (Math.abs(dx) > 50) { go(idx + (dx < 0 ? 1 : -1)); restart(); }
      startX = null;
    });

    go(0);
    restart();
  }

  /* ---------- Photo icon (shared by slider + banner placeholders) ---------- */
  var CAMERA = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>';

  // Shows a friendly placeholder when a photo file hasn't been added yet
  function photoFallback(host, img, cls) {
    var src = img.getAttribute("src");
    var fail = function () {
      if (host.classList.contains("is-empty")) return;
      host.classList.add("is-empty");
      var ph = document.createElement("div");
      ph.className = cls;
      ph.innerHTML = CAMERA + "<b>Group photo coming soon</b><small>Save a photo as <code>" + src + "</code></small>";
      host.insertBefore(ph, host.firstChild);
    };
    img.addEventListener("error", fail);
    if (img.complete && img.naturalWidth === 0) fail();
  }

  /* ---------- Full-width group photo slider (home page) ---------- */
  $$("[data-photo-strip]").forEach(function (strip) {
    var track = $(".strip-track", strip);
    var originals = $$(".strip-slide", track);
    var n = originals.length;
    if (!n) return;
    var dotsWrap = $(".strip-dots", strip);
    var DELAY = 5000, pos = 1, moving = false, timer = null, safety = null;

    // clone first + last slide for a seamless, gap-free loop
    var firstClone = originals[0].cloneNode(true), lastClone = originals[n - 1].cloneNode(true);
    [firstClone, lastClone].forEach(function (c) { c.setAttribute("aria-hidden", "true"); c.classList.add("is-clone"); });
    track.insertBefore(lastClone, originals[0]);
    track.appendChild(firstClone);
    $$(".strip-slide", track).forEach(function (s) { photoFallback(s, $("img", s), "strip-placeholder"); });

    var dots = originals.map(function (_, i) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "strip-dot";
      b.setAttribute("aria-label", "Show photo " + (i + 1));
      b.addEventListener("click", function () { if (!moving) { setPos(i + 1, true); restart(); } });
      dotsWrap.appendChild(b);
      return b;
    });

    function setPos(p, animate) {
      pos = p;
      track.style.transition = animate && !reduceMotion ? "" : "none";
      track.style.transform = "translateX(" + (-100 * pos) + "%)";
      if (animate && !reduceMotion) {
        moving = true;
        clearTimeout(safety);
        safety = setTimeout(function () { if (moving) loopFix(); }, 950); // in case transitionend never fires
      }
      var real = (pos - 1 + n) % n;
      dots.forEach(function (d, i) { d.classList.toggle("active", i === real); d.setAttribute("aria-current", i === real ? "true" : "false"); });
      originals.forEach(function (s, i) { s.setAttribute("aria-hidden", String(i !== real)); s.setAttribute("aria-label", (i + 1) + " of " + n); });
      if (!animate || reduceMotion) loopFix();
    }
    function loopFix() {
      moving = false;
      clearTimeout(safety);
      if (pos === 0) setPos(n, false);
      else if (pos === n + 1) setPos(1, false);
    }
    track.addEventListener("transitionend", function (e) { if (e.target === track) loopFix(); });

    function next() { if (!moving) setPos(pos + 1, true); }
    function prev() { if (!moving) setPos(pos - 1, true); }
    function restart() {
      clearInterval(timer);
      if (reduceMotion || n < 2) return;
      timer = setInterval(function () { if (!strip.classList.contains("paused") && !document.hidden) next(); }, DELAY);
    }

    $(".strip-next", strip).addEventListener("click", function () { next(); restart(); });
    $(".strip-prev", strip).addEventListener("click", function () { prev(); restart(); });
    strip.addEventListener("mouseenter", function () { strip.classList.add("paused"); });
    strip.addEventListener("mouseleave", function () { strip.classList.remove("paused"); });
    strip.addEventListener("focusin", function () { strip.classList.add("paused"); });
    strip.addEventListener("focusout", function () { strip.classList.remove("paused"); });
    strip.addEventListener("keydown", function (e) {
      if (e.key === "ArrowLeft") { prev(); restart(); }
      if (e.key === "ArrowRight") { next(); restart(); }
    });
    var sx = null;
    strip.addEventListener("touchstart", function (e) { sx = e.touches[0].clientX; }, { passive: true });
    strip.addEventListener("touchend", function (e) {
      if (sx === null) return;
      var dx = e.changedTouches[0].clientX - sx;
      if (Math.abs(dx) > 45) { if (dx < 0) next(); else prev(); restart(); }
      sx = null;
    });

    setPos(1, false);
    restart();
  });

  /* ---------- Full-width photo banner (Join the Lab page) ---------- */
  $$("[data-photo-banner]").forEach(function (banner) {
    var img = $("img", banner);
    if (img) photoFallback(banner, img, "banner-placeholder");
  });

  /* ---------- Animated counters ---------- */
  var counters = $$("[data-count]");
  if (counters.length) {
    var format = function (n) { return n.toLocaleString("en-US"); };
    var run = function (el) {
      var target = parseFloat(el.getAttribute("data-count"));
      var prefix = el.getAttribute("data-prefix") || "";
      var suffix = el.getAttribute("data-suffix") || "";
      if (reduceMotion) { el.textContent = prefix + format(target) + suffix; return; }
      var start = null, dur = 1800;
      var step = function (t) {
        if (!start) start = t;
        var p = Math.min((t - start) / dur, 1);
        var eased = 1 - Math.pow(1 - p, 3);
        el.textContent = prefix + format(Math.round(target * eased)) + suffix;
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    };
    if ("IntersectionObserver" in window) {
      var cio = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) { if (en.isIntersecting) { run(en.target); cio.unobserve(en.target); } });
      }, { threshold: 0.5 });
      counters.forEach(function (c) { cio.observe(c); });
    } else counters.forEach(run);
  }

  /* ---------- Accordion ---------- */
  $$(".acc-trigger").forEach(function (btn) {
    var panel = document.getElementById(btn.getAttribute("aria-controls"));
    if (!panel) return;
    btn.addEventListener("click", function () {
      var open = btn.getAttribute("aria-expanded") === "true";
      btn.setAttribute("aria-expanded", String(!open));
      panel.style.maxHeight = open ? "0px" : panel.scrollHeight + "px";
    });
  });
  window.addEventListener("resize", function () {
    $$('.acc-trigger[aria-expanded="true"]').forEach(function (btn) {
      var p = document.getElementById(btn.getAttribute("aria-controls"));
      if (p) p.style.maxHeight = p.scrollHeight + "px";
    });
  });

  /* ---------- Publications ---------- */
  var pubList = $("#pub-list");
  if (pubList && window.PUBLICATIONS) {
    var pubs = window.PUBLICATIONS.map(function (p, i) {
      var q = Object.assign({}, p);
      if (!q.year) q.year = parseInt(String(q.date || "").slice(0, 4), 10);
      q._order = i;
      return q;
    }).sort(function (a, b) {
      // Newest first: compare full dates ("YYYY-MM-DD" or "YYYY-MM"), then keep file order.
      var da = String(a.date || a.year), db = String(b.date || b.year);
      return da < db ? 1 : da > db ? -1 : a._order - b._order;
    });
    var searchEl = $("#pub-search"), yearEl = $("#pub-year"), topicEl = $("#pub-topic");
    var countEl = $("#pub-count"), emptyEl = $("#pub-empty");

    var years = pubs.map(function (p) { return p.year; }).filter(function (y, i, a) { return a.indexOf(y) === i; });
    years.forEach(function (y) { var o = document.createElement("option"); o.value = y; o.textContent = y; yearEl.appendChild(o); });
    var topics = [];
    pubs.forEach(function (p) { p.topics.forEach(function (t) { if (topics.indexOf(t) < 0) topics.push(t); }); });
    topics.sort().forEach(function (t) { var o = document.createElement("option"); o.value = t; o.textContent = t; topicEl.appendChild(o); });

    var esc = function (s) { return String(s).replace(/[&<>"']/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]; }); };
    var hl = function (text, q) {
      var safe = esc(text);
      if (!q) return safe;
      var re = new RegExp("(" + q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ")", "gi");
      return safe.replace(re, "<mark>$1</mark>");
    };

    var render = function () {
      var q = searchEl.value.trim();
      var ql = q.toLowerCase();
      var y = yearEl.value, t = topicEl.value;
      var filtered = pubs.filter(function (p) {
        if (y && String(p.year) !== y) return false;
        if (t && p.topics.indexOf(t) < 0) return false;
        if (ql && (p.title + " " + p.authors + " " + p.journal).toLowerCase().indexOf(ql) < 0) return false;
        return true;
      });
      var html = "", current = null;
      filtered.forEach(function (p, i) {
        if (p.year !== current) { current = p.year; html += '<h2 class="pub-year">' + p.year + "</h2>"; }
        var authors = hl(p.authors, q).replace(/\b((?:Powell-)?Roach K[A-Z]?)\b/g, "<strong>$1</strong>");
        var pubmedUrl = p.pmid ? "https://pubmed.ncbi.nlm.nih.gov/" + encodeURIComponent(p.pmid) + "/" : p.pubmed;
        var doiUrl = p.doi ? "https://doi.org/" + p.doi : "";
        var mainUrl = doiUrl || pubmedUrl;
        var links = "";
        if (doiUrl) links += '<a href="' + esc(doiUrl) + '" target="_blank" rel="noopener">Full article</a>';
        if (pubmedUrl) links += '<a href="' + esc(pubmedUrl) + '" target="_blank" rel="noopener">PubMed</a>';
        if (p.pdf) links += '<a href="' + esc(p.pdf) + '" target="_blank" rel="noopener">PDF</a>';
        if (p.type) links += '<span class="tag tag-type">' + esc(p.type) + "</span>";
        links += p.topics.map(function (tp) { return '<span class="tag">' + esc(tp) + "</span>"; }).join("");
        var title = hl(p.title, q);
        if (mainUrl) title = '<a href="' + esc(mainUrl) + '" target="_blank" rel="noopener">' + title + "</a>";
        html += '<article class="pub" style="animation-delay:' + Math.min(i * 40, 400) + 'ms"><span class="bar"></span><div>' +
          "<h3>" + title + "</h3>" +
          '<p class="authors">' + authors + "</p>" +
          '<p class="journal">' + hl(p.journal, q) + (p.doi ? ' <span class="doi">doi: ' + esc(p.doi) + "</span>" : "") + "</p>" +
          (p.note ? '<p class="pub-note">' + esc(p.note) + "</p>" : "") +
          '<div class="pub-links">' + links + "</div></div></article>";
      });
      pubList.innerHTML = html;
      countEl.textContent = "Showing " + filtered.length + " of " + pubs.length + " publications";
      emptyEl.style.display = filtered.length ? "none" : "block";
    };

    var debounce;
    searchEl.addEventListener("input", function () { clearTimeout(debounce); debounce = setTimeout(render, 150); });
    yearEl.addEventListener("change", render);
    topicEl.addEventListener("change", render);
    var reset = $("#pub-reset");
    if (reset) reset.addEventListener("click", function () { searchEl.value = ""; yearEl.value = ""; topicEl.value = ""; render(); });
    render();
  }

  /* ---------- Contact form ---------- */
  var form = $("#contact-form");
  if (form) {
    var rules = {
      name: function (v) { return v.trim().length >= 2 || "Please enter your full name."; },
      email: function (v) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()) || "Please enter a valid email address."; },
      subject: function (v) { return v !== "" || "Please choose a topic."; },
      message: function (v) { return v.trim().length >= 10 || "Please write a message (at least 10 characters)."; }
    };
    var check = function (field) {
      var rule = rules[field.name];
      if (!rule) return true;
      var res = rule(field.value);
      var group = field.closest(".form-group");
      var err = $(".error", group);
      if (res === true) { group.classList.remove("invalid"); field.removeAttribute("aria-invalid"); return true; }
      group.classList.add("invalid"); field.setAttribute("aria-invalid", "true"); err.textContent = res; return false;
    };
    $$(".field", form).forEach(function (f) {
      f.addEventListener("blur", function () { check(f); });
      f.addEventListener("input", function () { if (f.closest(".form-group").classList.contains("invalid")) check(f); });
    });
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var fields = $$(".field", form);
      var ok = fields.map(check).every(Boolean);
      if (!ok) { var first = $(".invalid .field", form); if (first) first.focus(); return; }
      var data = {};
      fields.forEach(function (f) { data[f.name] = f.value.trim(); });
      var to = form.getAttribute("data-email");
      var subject = "[Powell-Roach Lab] " + data.subject + " inquiry from " + data.name;
      var success = $(".form-success", form);
      var failure = $(".form-failure", form);
      var btn = $("button[type=submit]", form);
      var honey = $("input[name=_honey]", form);
      success.classList.remove("show");
      if (failure) failure.classList.remove("show");

      // Fallback: open the visitor's email app with everything pre-filled.
      var openMailApp = function () {
        var body = "Name: " + data.name + "\nEmail: " + data.email + (data.affiliation ? "\nAffiliation: " + data.affiliation : "") + "\nTopic: " + data.subject + "\n\n" + data.message;
        window.location.href = "mailto:" + to + "?subject=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(body);
      };

      var label = btn.innerHTML;
      btn.disabled = true;
      btn.textContent = "Sending…";

      // Send the submission straight to the lab inbox (FormSubmit relay, no backend needed).
      fetch("https://formsubmit.co/ajax/" + encodeURIComponent(to), {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify({
          "Name": data.name,
          "Email": data.email,
          "Affiliation": data.affiliation || "(not provided)",
          "Topic": data.subject,
          "Message": data.message,
          "Sent from": window.location.href,
          _replyto: data.email,
          _subject: subject,
          _template: "table",
          _captcha: "false",
          _honey: honey ? honey.value : ""
        })
      })
        .then(function (r) { return r.json().then(function (j) { if (!r.ok || String(j.success) !== "true") throw new Error(j.message || "Send failed"); }); })
        .then(function () {
          success.classList.add("show");
          form.reset();
        })
        .catch(function () {
          if (failure) failure.classList.add("show");
          openMailApp();
        })
        .then(function () {
          btn.disabled = false;
          btn.innerHTML = label;
        });
    });

    // Preselect the topic when arriving from a link like contact.html?topic=Joining%20the%20lab
    var topic = new URLSearchParams(window.location.search).get("topic");
    var topicSelect = $("#subject", form);
    if (topic && topicSelect) {
      Array.prototype.forEach.call(topicSelect.options, function (o) { if (o.text === topic) topicSelect.value = o.value || o.text; });
    }
  }
})();
