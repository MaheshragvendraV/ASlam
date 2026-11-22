/* ================= Tiptangle — interactions ================= */
(() => {
  "use strict";
  const D = SITE;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const cur = D.agency.currency;
  const money = n => cur + Number(n).toLocaleString("en-IN");
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const get = path => path.split(".").reduce((o, k) => (o ? o[k] : ""), D);
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const img = (src, alt) => `<img src="${esc(src)}" alt="${esc(alt)}" loading="lazy">`;
  const modeIcon = { flight: "fa-plane", train: "fa-train", bus: "fa-bus", car: "fa-car-side", cruise: "fa-ship", tempo: "fa-van-shuttle" };
  const tripLabel = id => (D.tripTypes.find(t => t.id === id) || {}).label || id;
  const scopeLabel = id => (D.scopes.find(s => s.id === id) || {}).label || id;

  /* broken image → gradient fallback */
  document.addEventListener("error", e => {
    if (e.target.tagName === "IMG") { e.target.classList.add("broken"); e.target.parentElement && e.target.parentElement.classList.add("img-fallback"); }
  }, true);

  /* ---------- simple bindings ---------- */
  $$("[data-bind]").forEach(el => {
    const v = get(el.dataset.bind);
    el.textContent = v;
    if (el.dataset.href) el.href = `${el.dataset.href}:${String(v).replace(/\s/g, "")}`;
  });
  $$("[data-bind-src]").forEach(el => (el.src = get(el.dataset.bindSrc)));
  $("#year").textContent = new Date().getFullYear();
  $("#mapFrame").src = D.agency.mapEmbed;
  const waLink = (text = "Hi Tiptangle! I'd like to plan a trip.") => `https://wa.me/${D.agency.whatsapp}?text=${encodeURIComponent(text)}`;
  $("#floatWa").href = waLink();
  $("#floatCall").href = `tel:${D.agency.phone.replace(/\s/g, "")}`;
  const socIcons = { instagram: "fa-instagram", facebook: "fa-facebook-f", youtube: "fa-youtube", x: "fa-x-twitter" };
  $("#social").innerHTML = Object.entries(D.agency.social).map(([k, v]) => `<a href="${esc(v)}" aria-label="${k}" target="_blank" rel="noopener"><i class="fa-brands ${socIcons[k] || "fa-globe"}"></i></a>`).join("");
  $("#promoCode").textContent = D.promo.code;
  $("#promoText").textContent = D.promo.text;
  $("#promoDisc").textContent = D.promo.discount;

  /* ---------- select options ---------- */
  const opts = (list, all) => (all ? `<option value="all">${all}</option>` : "") + list.map(x => `<option value="${x.id}">${esc(x.label)}</option>`).join("");
  ["#finderType", "#fType"].forEach(s => ($(s).innerHTML = opts(D.tripTypes, "Any trip")));
  ["#finderScope", "#fScope"].forEach(s => ($(s).innerHTML = opts(D.scopes, "Anywhere")));
  $("#formType").innerHTML = opts(D.tripTypes, "Not sure yet");
  $("#formScope").innerHTML = opts(D.scopes, "Not sure yet");
  const B = D.budget;
  const steps = [];
  for (let v = B.min * 2; v <= B.max; v += Math.max(B.step, Math.round((B.max - B.min) / 8 / B.step) * B.step)) steps.push(v);
  if (steps[steps.length - 1] !== B.max) steps.push(B.max);
  $("#finderBudget").innerHTML = steps.map(v => `<option value="${v}" ${v >= B.start && !steps.some(s => s >= B.start && s < v) ? "selected" : ""}>${money(v)}</option>`).join("");

  /* ---------- nav ---------- */
  const nav = $("#nav");
  const burger = $("#burger");
  burger.addEventListener("click", () => { const o = nav.classList.toggle("open"); burger.setAttribute("aria-expanded", o); });
  $$("#navLinks a").forEach(a => a.addEventListener("click", () => { nav.classList.remove("open"); burger.setAttribute("aria-expanded", false); }));
  const onScroll = () => {
    nav.classList.toggle("is-solid", scrollY > 60);
    $("#toTop").classList.toggle("show", scrollY > 900);
  };
  addEventListener("scroll", onScroll, { passive: true }); onScroll();
  $("#toTop").addEventListener("click", () => scrollTo({ top: 0 }));
  const sections = $$("main section[id]");
  const spy = new IntersectionObserver(es => es.forEach(e => {
    if (e.isIntersecting) $$("#navLinks a").forEach(a => a.classList.toggle("active", a.getAttribute("href") === "#" + e.target.id));
  }), { rootMargin: "-45% 0px -50% 0px" });
  sections.forEach(s => spy.observe(s));

  /* ---------- hero slideshow ---------- */
  const slides = $("#heroSlides"), dots = $("#heroDots");
  slides.innerHTML = D.hero.map((h, i) => `<div class="hero__slide${i ? "" : " is-active"}" style="background-image:url('${h.img}')"></div>`).join("");
  dots.innerHTML = D.hero.map((h, i) => `<button type="button" aria-label="Show ${esc(h.caption)}" class="${i ? "" : "is-active"}"></button>`).join("");
  let hi = 0, htimer;
  const showSlide = i => {
    hi = (i + D.hero.length) % D.hero.length;
    $$(".hero__slide").forEach((s, k) => s.classList.toggle("is-active", k === hi));
    $$("#heroDots button").forEach((d, k) => d.classList.toggle("is-active", k === hi));
  };
  const autoSlide = () => { clearInterval(htimer); htimer = setInterval(() => showSlide(hi + 1), 5500); };
  $$("#heroDots button").forEach((d, k) => d.addEventListener("click", () => { showSlide(k); autoSlide(); }));
  autoSlide();
  addEventListener("scroll", () => { if (!reduced && scrollY < innerHeight) slides.style.transform = `translateY(${scrollY * 0.3}px)`; }, { passive: true });

  /* typewriter */
  const tw = $("#heroType");
  let wi = 0, ci = D.heroWords[0].length, del = true;
  const type = () => {
    const w = D.heroWords[wi];
    ci += del ? -1 : 1;
    tw.textContent = w.slice(0, ci);
    let t = del ? 45 : 85;
    if (!del && ci === w.length) { del = true; t = 1800; }
    else if (del && ci === 0) { del = false; wi = (wi + 1) % D.heroWords.length; t = 300; }
    setTimeout(type, t);
  };
  if (!reduced) setTimeout(type, 1800);

  /* ---------- marquee ---------- */
  const placeCard = p => `<article class="place">${img(p.img, p.name)}<div class="place__cap"><h3>${esc(p.name)}</h3><p>${esc(p.note)}</p></div></article>`;
  $("#marqueeTrack").innerHTML = [...D.topPlaces, ...D.topPlaces].map(placeCard).join("");
  $$("#marqueeTrack .place").slice(D.topPlaces.length).forEach(el => el.setAttribute("aria-hidden", "true"));

  /* ---------- scope tabs ---------- */
  $("#scopeTabs").innerHTML = D.scopes.map((s, i) => `<button class="tab" role="tab" aria-selected="${!i}" data-id="${s.id}"><i class="fa-solid ${s.icon}"></i>${esc(s.label)}</button>`).join("");
  const showScope = id => {
    const s = D.scopes.find(x => x.id === id);
    $$("#scopeTabs .tab").forEach(t => t.setAttribute("aria-selected", t.dataset.id === id));
    $("#scopeDesc").textContent = s.desc;
    $("#scopePlaces").innerHTML = s.places.map((p, i) => `<article class="card fade-in" style="animation-delay:${i * 90}ms"><div class="card__img">${img(p.img, p.name)}</div><div class="card__body"><h3>${esc(p.name)}</h3><p>${esc(s.label)} · <a href="#budget" data-scope="${s.id}" style="color:var(--pink);font-weight:600">See packages →</a></p></div></article>`).join("");
  };
  $("#scopeTabs").addEventListener("click", e => { const b = e.target.closest(".tab"); if (b) showScope(b.dataset.id); });
  showScope(D.scopes[0].id);

  /* ---------- themes & trip types ---------- */
  $("#themeGrid").innerHTML = D.themes.map(t => `<button class="tile reveal" data-theme="${t.id}" aria-label="${esc(t.label)} packages">${img(t.img, t.label)}<div class="tile__cap"><h3>${esc(t.label)}</h3><p>${esc(t.line)}</p><span class="tile__go">View packages <i class="fa-solid fa-arrow-right"></i></span></div></button>`).join("");
  $("#tripGrid").innerHTML = D.tripTypes.map(t => `<button class="tile reveal" data-trip="${t.id}" aria-label="${esc(t.label)} packages">${img(t.img, t.label)}<span class="trip-ico"><i class="fa-solid ${t.icon}"></i></span><div class="tile__cap"><h3>${esc(t.label)}</h3><span class="tile__go">View packages <i class="fa-solid fa-arrow-right"></i></span></div></button>`).join("");

  /* ---------- budget meter + packages ---------- */
  const range = $("#budgetRange"), fRange = $("#formBudget");
  [range, fRange].forEach(r => { r.min = B.min; r.max = B.max; r.step = B.step; r.value = B.start; });
  $("#rangeMin").textContent = money(B.min);
  $("#rangeMax").textContent = money(B.max) + "+";
  let themeFilter = "all";

  D.packages.forEach((p, i) => (p._i = i));
  const pkgCard = p => `
    <article class="card pkg" data-i="${p._i}">
      <div class="card__img">${img(p.img, p.name)}
        <div class="pkg__flags"><span class="chip ${p.flexibility.startsWith("Fully") ? "chip--flex" : "chip--part"}">${esc(p.flexibility)}</span><span class="chip">${esc(scopeLabel(p.scope))}</span></div>
      </div>
      <div class="card__body">
        <h3>${esc(p.name)}</h3>
        <div class="pkg__meta"><span><i class="fa-regular fa-clock"></i> ${esc(p.days)}</span><span><i class="fa-solid fa-users"></i> ${esc(tripLabel(p.tripType))}</span></div>
        <div class="pkg__stars" aria-label="Rated ${p.rating} out of 5">${stars(p.rating)}<span>${p.rating.toFixed(1)}</span></div>
        <div class="pkg__modes" aria-label="Transport">${p.transport.map(m => `<i class="fa-solid ${modeIcon[m] || "fa-route"}" title="${m}"></i>`).join("")}</div>
        <div class="pkg__foot"><div class="pkg__price"><small>Starting from</small><strong>${money(p.price)}</strong></div><button class="btn btn--ghost" data-open="${p._i}" type="button">View Details</button></div>
      </div>
    </article>`;
  function stars(r) { let s = ""; for (let i = 1; i <= 5; i++) s += `<i class="fa-${r >= i - 0.25 ? "solid fa-star" : r >= i - 0.75 ? "solid fa-star-half-stroke" : "regular fa-star"}"></i>`; return s; }

  const grid = $("#packageGrid");
  grid.innerHTML = D.packages.map(pkgCard).join("");
  const cards = new Map($$(".pkg", grid).map(c => [+c.dataset.i, c]));

  const moods = [[0.12, "Smart saver 💰"], [0.3, "Comfort explorer ✨"], [0.55, "Premium wanderer 🌴"], [0.8, "Luxury voyager 🛳️"], [2, "Sky's the limit 👑"]];
  const arcLen = 251.3; // π·80
  const gArc = $("#gaugeArc"); gArc.style.strokeDasharray = arcLen;

  function updateMeter(fromUser) {
    const v = +range.value, pct = (v - B.min) / (B.max - B.min);
    range.style.setProperty("--p", pct * 100 + "%");
    $("#budgetOut").textContent = money(v) + (v >= B.max ? "+" : "");
    $("#budgetMood").textContent = moods.find(m => pct <= m[0])[1];
    gArc.style.strokeDashoffset = arcLen * (1 - pct);
    $("#gaugeNeedle").style.transform = `rotate(${-90 + pct * 180}deg)`;
    if (fromUser !== "form") { fRange.value = v; syncForm(); }
    filterPackages();
  }

  function filterPackages() {
    const v = +range.value, t = $("#fType").value, s = $("#fScope").value, f = $("#fFlex").value, sort = $("#fSort").value;
    const unlimited = v >= B.max;
    const ok = D.packages.filter(p => (unlimited || p.price <= v) && (t === "all" || p.tripType === t) && (s === "all" || p.scope === s) && (f === "all" || p.flexibility === f) && (themeFilter === "all" || p.theme === themeFilter));
    const sorters = { match: (a, b) => b.price - a.price, low: (a, b) => a.price - b.price, high: (a, b) => b.price - a.price, rating: (a, b) => b.rating - a.rating };
    ok.sort(sorters[sort]);
    // FLIP: record positions
    const first = new Map(); cards.forEach((c, i) => { if (!c.classList.contains("is-hidden")) first.set(i, c.getBoundingClientRect()); });
    const okSet = new Set(ok.map(p => p._i));
    ok.forEach(p => grid.appendChild(cards.get(p._i)));
    D.packages.filter(p => !okSet.has(p._i)).forEach(p => grid.appendChild(cards.get(p._i)));
    cards.forEach((c, i) => {
      const show = okSet.has(i), was = !c.classList.contains("is-hidden");
      c.classList.toggle("is-hidden", !show);
      if (show && !was) { c.classList.remove("pop"); void c.offsetWidth; c.classList.add("pop"); }
      else if (show && was && !reduced) {
        const a = first.get(i), b = c.getBoundingClientRect();
        if (a) { const dx = a.left - b.left, dy = a.top - b.top; if (dx || dy) c.animate([{ transform: `translate(${dx}px,${dy}px)` }, { transform: "none" }], { duration: 450, easing: "cubic-bezier(.2,.8,.2,1)" }); }
      }
    });
    const n = ok.length;
    const cnt = $("#matchCount"); if (cnt.textContent != n) { cnt.textContent = n; cnt.animate([{ transform: "scale(1.5)" }, { transform: "none" }], { duration: 300 }); }
    $("#emptyMsg").hidden = n > 0;
  }

  range.addEventListener("input", () => updateMeter());
  ["#fType", "#fScope", "#fFlex", "#fSort"].forEach(s => $(s).addEventListener("change", filterPackages));
  const goPackages = () => $("#budget").scrollIntoView({ behavior: reduced ? "auto" : "smooth" });

  $("#finder").addEventListener("submit", e => {
    e.preventDefault();
    $("#fType").value = $("#finderType").value; $("#fScope").value = $("#finderScope").value;
    range.value = $("#finderBudget").value; themeFilter = "all";
    updateMeter(); goPackages();
  });
  document.addEventListener("click", e => {
    const th = e.target.closest("[data-theme]"), tr = e.target.closest("[data-trip]"), sc = e.target.closest("[data-scope]");
    if (th) { themeFilter = th.dataset.theme; $("#fType").value = "all"; $("#fScope").value = "all"; range.value = B.max; updateMeter(); goPackages(); toast(`Showing ${D.themes.find(t => t.id === themeFilter).label} packages ✨`); }
    else if (tr) { themeFilter = "all"; $("#fType").value = tr.dataset.trip; $("#fScope").value = "all"; range.value = B.max; updateMeter(); goPackages(); }
    else if (sc) { e.preventDefault(); themeFilter = "all"; $("#fScope").value = sc.dataset.scope; $("#fType").value = "all"; range.value = B.max; updateMeter(); goPackages(); }
  });
  updateMeter();

  /* ---------- package modal ---------- */
  const modal = $("#pkgModal");
  let current, lastFocus;
  const tabsDef = [
    ["itinerary", "Itinerary"], ["transport", "Transport"], ["vehicle", "Vehicle & Allowance"], ["food", "Food & Beverages"], ["advantages", "Why this place"], ["inclusions", "Inclusions"],
  ];
  const detail = (p, k) => (p[k] !== undefined ? p[k] : D.packageDefaults[k]);
  function renderTab(k) {
    const p = current;
    $$("#mTabs button").forEach(b => b.setAttribute("aria-selected", b.dataset.k === k));
    let h = "";
    if (k === "itinerary") h = `<table><thead><tr><th>Day</th><th>Timing</th><th>Plan</th></tr></thead><tbody>${detail(p, "itinerary").map(d => `<tr><td><b>${esc(d.day)}</b></td><td>${esc(d.time)}</td><td>${esc(d.plan)}</td></tr>`).join("")}</tbody></table>`;
    else if (k === "transport") h = `<p>This package can include any of these modes, and we can mix them for you:</p><div class="modes-list">${p.transport.map(m => `<div><i class="fa-solid ${modeIcon[m]}"></i>${m === "tempo" ? "Tempo Traveller" : m}</div>`).join("")}</div>`;
    else if (k === "inclusions") h = `<div class="inex"><div><h4>Included</h4><ul>${detail(p, "inclusions").map(x => `<li><i class="fa-solid fa-check"></i>${esc(x)}</li>`).join("")}</ul></div><div><h4>Not included</h4><ul>${detail(p, "exclusions").map(x => `<li><i class="fa-solid fa-xmark"></i>${esc(x)}</li>`).join("")}</ul></div></div>`;
    else h = `<p>${esc(detail(p, k))}</p>`;
    $("#mBody").innerHTML = `<div class="fade-in">${h}<p style="margin-top:18px;color:var(--muted);font-size:.88rem"><i class="fa-solid fa-handshake" style="color:var(--pink)"></i> This catalog is <b>${esc(p.flexibility.toLowerCase())}</b> and can be adjusted to suit you.</p></div>`;
  }
  function openModal(i) {
    current = D.packages[i]; lastFocus = document.activeElement;
    $("#mHero").style.backgroundImage = `url('${current.img}')`;
    $("#mTitle").textContent = current.name;
    $("#mFlex").textContent = current.flexibility;
    $("#mMeta").innerHTML = `${esc(current.days)} · ${esc(tripLabel(current.tripType))} · ${esc(scopeLabel(current.scope))} · <span style="color:#ffd166">${stars(current.rating)}</span> ${current.rating}`;
    $("#mPrice").textContent = "From " + money(current.price);
    $("#mTabs").innerHTML = tabsDef.map(([k, l]) => `<button role="tab" data-k="${k}" type="button">${l}</button>`).join("");
    renderTab("itinerary");
    show(modal);
  }
  $("#mTabs").addEventListener("click", e => { const b = e.target.closest("button"); if (b) renderTab(b.dataset.k); });
  grid.addEventListener("click", e => { const b = e.target.closest("[data-open]"); if (b) openModal(+b.dataset.open); });
  $("#mBook").addEventListener("click", () => {
    hide(modal);
    $("#formType").value = current.tripType; $("#formScope").value = current.scope;
    fRange.value = Math.min(B.max, Math.max(B.min, Math.round(current.price / B.step) * B.step)); syncForm();
    $("#formMsg").value = `I'm interested in "${current.name}" (${current.days}). I'd like to customise it.`;
    $("#enquire").scrollIntoView({ behavior: reduced ? "auto" : "smooth" });
    setTimeout(() => $("#enquiryForm [name=name]").focus({ preventScroll: true }), 700);
  });
  function show(m) { m.hidden = false; document.body.style.overflow = "hidden"; setTimeout(() => $(".modal__close", m).focus(), 50); }
  function hide(m) { m.hidden = true; document.body.style.overflow = ""; lastFocus && lastFocus.focus && lastFocus.focus({ preventScroll: true }); }
  $$(".modal").forEach(m => {
    m.addEventListener("click", e => { if (e.target === m || e.target.closest("[data-close]")) hide(m); });
  });
  document.addEventListener("keydown", e => {
    const open = $$(".modal").find(m => !m.hidden);
    if (!open) return;
    if (e.key === "Escape") hide(open);
    if (e.key === "Tab") {
      const f = $$("button, a[href], input, select, textarea", open).filter(x => x.offsetParent);
      if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    }
  });

  /* ---------- fleet / journey / steps / adv ---------- */
  $("#fleetGrid").innerHTML = D.fleet.map(f => `<article class="card fleet reveal"><div class="card__img" style="overflow:visible">${img(f.img, f.name)}<span class="fleet__ico"><i class="fa-solid ${f.icon}"></i></span></div><div class="card__body"><h3>${esc(f.name)}</h3><ul><li>Seats <b>${esc(f.seats)}</b></li><li>Comfort <b>${esc(f.ac)}</b></li><li>Allowance <b>${esc(f.allowance)}</b></li></ul></div></article>`).join("");
  $$("#fleetGrid .card__img img").forEach(i => (i.style.borderRadius = "18px 18px 0 0"));

  const tl = $("#timeline");
  tl.innerHTML = `<span class="timeline__fill" id="tlFill"></span>` + D.journey.map((j, i) => `<li class="tl"><span class="tl__dot"><i class="fa-solid ${j.icon}"></i></span><div class="tl__card reveal"><span class="tl__n">STEP ${String(i + 1).padStart(2, "0")}</span><h3>${esc(j.title)}</h3><p>${esc(j.text)}</p></div></li>`).join("");
  const tlFill = $("#tlFill");
  addEventListener("scroll", () => {
    const r = tl.getBoundingClientRect(), p = Math.min(1, Math.max(0, (innerHeight * 0.6 - r.top) / r.height));
    tlFill.style.height = p * 100 + "%";
    $$(".tl", tl).forEach(li => li.classList.toggle("in", li.getBoundingClientRect().top < innerHeight * 0.6));
  }, { passive: true });

  $("#stepsGrid").innerHTML = D.steps.map(s => `<div class="step reveal"><h3>${esc(s.title)}</h3><p>${esc(s.text)}</p></div>`).join("");
  $("#advGrid").innerHTML = D.advantages.map(a => `<div class="adv reveal"><i class="fa-solid ${a.icon}"></i><h3>${esc(a.title)}</h3><p>${esc(a.text)}</p></div>`).join("");

  /* ---------- stats & milestones ---------- */
  $("#stats").innerHTML = D.stats.map(s => `<div class="stat reveal"><strong data-count="${s.value}" data-suffix="${esc(s.suffix)}">0${esc(s.suffix)}</strong><span>${esc(s.label)}</span></div>`).join("");
  $("#milestoneGrid").innerHTML = D.milestones.map(m => `<article class="card reveal"><div class="card__img">${img(m.img, m.title)}<span class="mile__year">${esc(m.year)}</span></div><div class="card__body"><h3>${esc(m.title)}</h3><p>${esc(m.text)}</p></div></article>`).join("");
  const countUp = el => {
    const to = +el.dataset.count, suf = el.dataset.suffix, t0 = performance.now(), dur = 1600;
    const tick = t => { const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3); el.textContent = Math.round(to * e).toLocaleString("en-IN") + suf; if (k < 1) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  };

  /* ---------- blog & food ---------- */
  $("#blogGrid").innerHTML = D.blog.map(b => `<article class="card blog reveal"><div class="card__img">${img(b.img, b.title)}</div><div class="card__body"><span class="blog__date">${esc(b.date)}</span><h3>${esc(b.title)}</h3><p>${esc(b.excerpt)}</p><a href="${esc(b.link)}">Read story <i class="fa-solid fa-arrow-right"></i></a></div></article>`).join("");
  $("#foodGrid").innerHTML = D.food.map(f => `<article class="card reveal"><div class="card__img">${img(f.img, f.dish)}</div><div class="card__body"><span class="blog__date"><i class="fa-solid fa-utensils"></i> ${esc(f.place)}</span><h3>${esc(f.dish)}</h3><p>${esc(f.text)}</p></div></article>`).join("");

  /* ---------- testimonials ---------- */
  const testi = $("#testi");
  testi.innerHTML = D.testimonials.map((t, i) => `<blockquote class="quote${i ? "" : " is-active"}"><div class="pkg__stars">${stars(t.rating)}</div><p>${esc(t.text)}</p><footer><span class="avatar">${esc(t.name[0])}</span><div><b>${esc(t.name)}</b><small>${esc(t.trip)}</small></div></footer></blockquote>`).join("");
  let ti = 0, ttimer;
  const showT = i => { ti = (i + D.testimonials.length) % D.testimonials.length; $$(".quote", testi).forEach((q, k) => q.classList.toggle("is-active", k === ti)); };
  const autoT = () => { clearInterval(ttimer); ttimer = setInterval(() => showT(ti + 1), 6000); };
  $("#tPrev").addEventListener("click", () => { showT(ti - 1); autoT(); });
  $("#tNext").addEventListener("click", () => { showT(ti + 1); autoT(); });
  autoT();

  /* ---------- rate us ---------- */
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } },
  };
  const labels = ["", "We'll do better 🙏", "Thanks for the feedback", "Good — we'll make it great!", "Awesome! 😊", "You made our day! 🎉"];
  const sEl = $("#rateStars");
  sEl.innerHTML = [1, 2, 3, 4, 5].map(n => `<button type="button" role="radio" aria-checked="false" aria-label="${n} star${n > 1 ? "s" : ""}" data-n="${n}"><i class="fa-solid fa-star"></i></button>`).join("");
  const baseAvg = D.testimonials.reduce((a, t) => a + t.rating, 0) / D.testimonials.length || 5;
  let ratings = store.get("tt_ratings", []), mine = store.get("tt_mine", 0);
  const paint = n => $$("button", sEl).forEach(b => { b.classList.toggle("on", +b.dataset.n <= n); b.setAttribute("aria-checked", +b.dataset.n === n); });
  const renderAvg = () => {
    const all = [baseAvg, ...ratings];
    $("#rateAvg").textContent = (all.reduce((a, b) => a + b, 0) / all.length).toFixed(1);
    $("#rateCount").textContent = ratings.length;
  };
  sEl.addEventListener("mouseover", e => { const b = e.target.closest("button"); if (b) paint(+b.dataset.n); });
  sEl.addEventListener("mouseleave", () => paint(mine));
  sEl.addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b) return;
    const n = +b.dataset.n;
    if (mine) ratings[ratings.length - 1] = n; else ratings.push(n);
    mine = n; store.set("tt_ratings", ratings); store.set("tt_mine", mine);
    paint(n); $("#rateLabel").textContent = labels[n]; renderAvg();
    if (n >= 4) confetti();
  });
  paint(mine); renderAvg(); if (mine) $("#rateLabel").textContent = labels[mine];

  /* ---------- promo copy ---------- */
  $("#promoBtn").addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(D.promo.code); toast("Promo code copied! 🎁"); }
    catch { toast("Your code: " + D.promo.code); }
  });

  /* ---------- enquiry form ---------- */
  const form = $("#enquiryForm");
  function syncForm() {
    const v = +fRange.value;
    fRange.style.setProperty("--p", ((v - B.min) / (B.max - B.min)) * 100 + "%");
    $("#formBudgetOut").textContent = money(v) + (v >= B.max ? "+" : "");
  }
  fRange.addEventListener("input", () => { syncForm(); range.value = fRange.value; updateMeter("form"); });
  syncForm();
  form.addEventListener("submit", async e => {
    e.preventDefault();
    let ok = true;
    $$("[required]", form).forEach(i => { const bad = !i.checkValidity() || !i.value.trim(); i.classList.toggle("invalid", bad); if (bad && ok) { ok = false; i.focus(); } });
    if (!ok) return;
    const fd = new FormData(form);
    const text = `Hi Tiptangle! I'd like a free trip plan.\nName: ${fd.get("name")}\nPhone: ${fd.get("phone")}\nTrip: ${$("#formType").selectedOptions[0].text}\nWhere: ${$("#formScope").selectedOptions[0].text}\nDate: ${fd.get("date") || "Flexible"}\nTravellers: ${fd.get("travellers")}\nBudget: ${$("#formBudgetOut").textContent}\nMessage: ${fd.get("message") || "-"}`;
    const mode = D.enquiryMode;
    try {
      if (mode === "formspree" && D.formspreeEndpoint) {
        const r = await fetch(D.formspreeEndpoint, { method: "POST", body: fd, headers: { Accept: "application/json" } });
        if (!r.ok) throw new Error("send failed");
      } else if (mode === "netlify") {
        const r = await fetch("/", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(fd).toString() });
        if (!r.ok) throw new Error("send failed");
      } else if (mode === "email") {
        location.href = `mailto:${D.agency.email}?subject=${encodeURIComponent("Trip enquiry — " + fd.get("name"))}&body=${encodeURIComponent(text)}`;
      } else {
        window.open(waLink(text), "_blank", "noopener");
      }
      $("#formOk").hidden = false; confetti();
      setTimeout(() => { $("#formOk").hidden = true; form.reset(); fRange.value = range.value; syncForm(); }, 6000);
    } catch {
      toast("Couldn't send right now — please call or WhatsApp us 🙏");
    }
  });
  $$("[required]", form).forEach(i => i.addEventListener("input", () => i.classList.remove("invalid")));

  /* ---------- reveal on scroll ---------- */
  const io = new IntersectionObserver(es => es.forEach(e => {
    if (!e.isIntersecting) return;
    e.target.classList.add("in");
    const c = e.target.querySelector("[data-count]"); if (c) countUp(c);
    io.unobserve(e.target);
  }), { threshold: 0.12 });
  $$(".reveal").forEach((el, i) => { el.style.transitionDelay = (i % 4) * 80 + "ms"; io.observe(el); });

  /* ---------- toasts ---------- */
  const toastEl = $("#toast");
  let toastT;
  function toast(msg) {
    $("span", toastEl).textContent = msg; toastEl.classList.add("show");
    clearTimeout(toastT); toastT = setTimeout(() => toastEl.classList.remove("show"), 4200);
  }
  let tIdx = 0;
  setTimeout(function loop() { if (document.visibilityState === "visible" && $$(".modal").every(m => m.hidden)) toast(D.toasts[tIdx++ % D.toasts.length] + " · You're in safe hands"); setTimeout(loop, 22000); }, 12000);

  /* ---------- exit intent ---------- */
  const exitM = $("#exitModal");
  const exitSeen = () => { try { return sessionStorage.getItem("tt_exit"); } catch { return false; } };
  const tryExit = () => { if (exitSeen() || $$(".modal").some(m => !m.hidden)) return; try { sessionStorage.setItem("tt_exit", 1); } catch { /* ignore */ } lastFocus = document.activeElement; show(exitM); };
  document.addEventListener("mouseout", e => { if (!e.relatedTarget && e.clientY <= 0 && scrollY > 600) tryExit(); });
  let lastY = 0, upVel = 0; // mobile: fast scroll up near top after browsing
  addEventListener("scroll", () => { const d = lastY - scrollY; upVel = d > 0 ? upVel + d : 0; lastY = scrollY; if (upVel > 2500 && innerWidth < 860) tryExit(); }, { passive: true });

  /* ---------- confetti ---------- */
  const cv = $("#confetti"), cx = cv.getContext("2d");
  function confetti() {
    if (reduced) return;
    cv.width = innerWidth; cv.height = innerHeight;
    const cols = ["#ff6b35", "#f72585", "#7c3aed", "#0ea5e9", "#22c55e", "#ffd166"];
    const ps = Array.from({ length: 140 }, () => ({ x: innerWidth / 2, y: innerHeight / 2, vx: (Math.random() - .5) * 16, vy: Math.random() * -16 - 4, s: Math.random() * 6 + 4, c: cols[Math.random() * cols.length | 0], r: Math.random() * 6 }));
    let f = 0;
    (function draw() {
      cx.clearRect(0, 0, cv.width, cv.height);
      ps.forEach(p => { p.vy += .45; p.x += p.vx; p.y += p.vy; p.r += .1; cx.save(); cx.translate(p.x, p.y); cx.rotate(p.r); cx.fillStyle = p.c; cx.fillRect(-p.s / 2, -p.s / 2, p.s, p.s * .6); cx.restore(); });
      if (++f < 140) requestAnimationFrame(draw); else cx.clearRect(0, 0, cv.width, cv.height);
    })();
  }
})();
