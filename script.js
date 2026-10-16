/* CORE-START: pure functions, no page access. Tests call these through window.Audit. */
const Audit = (() => {
  const PERIODS = [["day", "per working day"], ["week", "per week"], ["month", "per month"], ["year", "per year"]];
  const RULES = [["yes", "Yes, fixed rules"], ["partly", "Partly"], ["no", "No, needs judgment"]];
  const RULE_TAG = { yes: "Follows fixed rules", partly: "Partly fixed rules", no: "Needs judgment", "": "Rules not answered" };

  // Numbers as people type them: "1,5" and "1.5" both work; "$" and "%" are ignored.
  function num(s) {
    let v = String(s == null ? "" : s).trim().replace(/[\s$%]/g, "");
    if (v === "") return null;
    if (/^\d+,\d+$/.test(v)) v = v.replace(",", ".");
    v = v.replace(/,/g, "");
    return /^\d+(\.\d+)?$/.test(v) ? parseFloat(v) : NaN;
  }
  function perYear(count, per, days) {
    return count * ({ day: days, week: 52, month: 12, year: 1 }[per] || 0);
  }
  function checkSettings(rate, days) {
    const e = {}, r = num(rate), d = num(days);
    if (r === null) e.rate = "Enter an hourly cost, like 35.";
    else if (Number.isNaN(r)) e.rate = "Enter a number, like 35.";
    if (d === null || Number.isNaN(d) || d < 1 || d > 366 || !Number.isInteger(d)) e.days = "Enter a whole number of days from 1 to 366.";
    return { errors: e, rate: e.rate ? null : r, days: e.days ? null : d };
  }
  function checkStep(s) {
    const e = {}, v = {};
    const need = (k, label) => { const x = num(s[k]); if (x === null) e[k] = "Enter " + label + "."; else if (Number.isNaN(x)) e[k] = "Enter a number."; return x; };
    v.minutes = need("minutes", "the minutes it takes");
    if (!e.minutes && v.minutes <= 0) e.minutes = "Enter more than 0 minutes.";
    v.count = need("count", "how many times");
    if (!e.count && v.count <= 0) e.count = "Enter more than 0.";
    const p = num(s.people);
    v.people = p === null ? 1 : p;
    if (Number.isNaN(p) || (p !== null && (p < 1 || !Number.isInteger(p)))) e.people = "Enter a whole number, 1 or more.";
    const w = num(s.wrong);
    v.wrong = w === null ? 0 : w;
    if (Number.isNaN(w) || (w !== null && w > 100)) e.wrong = "Enter a percentage from 0 to 100.";
    const f = num(s.fix);
    v.fix = f === null ? 0 : f;
    if (Number.isNaN(f)) e.fix = "Enter a number.";
    if (!e.wrong && !e.fix && v.wrong > 0 && v.fix === 0) e.fix = "Enter how long a fix takes, or set the percentage to 0.";
    return { errors: e, value: v };
  }
  // All arithmetic is kept in minutes and only divided by 60 at the end.
  function stepMinutes(v, per, days) {
    const runs = perYear(v.count, per, days);
    const base = v.minutes * runs * v.people;
    const fixes = runs * (v.wrong / 100) * v.fix * v.people;
    return { runs, base, fixes, total: base + fixes };
  }
  function compute(state) {
    const set = checkSettings(state.rate, state.days);
    const rows = [], excluded = [];
    state.steps.forEach((s, i) => {
      const c = checkStep(s);
      const name = String(s.name || "").trim() || "Step " + (i + 1);
      if (Object.keys(c.errors).length) { excluded.push({ index: i, name, errors: c.errors }); return; }
      if (set.days === null && s.per === "day") { excluded.push({ index: i, name, errors: { days: "needs a valid number of working days" } }); return; }
      const m = stepMinutes(c.value, s.per, set.days || 0);
      rows.push({ index: i, name, rules: s.rules || "", per: s.per, v: c.value, runs: m.runs, base: m.base, fixes: m.fixes, minutes: m.total, hours: m.total / 60 });
    });
    rows.sort((a, b) => b.minutes - a.minutes || a.index - b.index);
    const totalHours = rows.reduce((t, r) => t + r.hours, 0);
    return { rows, excluded, totalHours, rate: set.rate, days: set.days, settingsErrors: set.errors };
  }
  const h1 = h => (Math.round(h * 10) / 10).toLocaleString("en-CA", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const money = x => "$" + (Math.round(x * 100) / 100).toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const trim = x => String(Math.round(x * 100) / 100);
  function howText(r) {
    const people = r.v.people === 1 ? "1 person" : r.v.people + " people";
    let s = "(" + trim(r.v.minutes) + " min × " + trim(r.runs) + " times × " + people;
    if (r.fixes > 0) s += " + " + trim(r.runs) + " × " + trim(r.v.wrong) + "% × " + trim(r.v.fix) + " min × " + people;
    return s + ") ÷ 60 = " + h1(r.hours) + " hours";
  }
  function summary(state, res, url) {
    const name = String(state.process || "").trim() || "My task";
    const lines = ["Task: " + name];
    if (!res.rows.length) return lines.concat(["No steps with numbers yet."]).join("\n");
    lines.push("Time it takes now: " + h1(res.totalHours) + " hours a year" + (res.rate !== null ? ", about " + money(res.totalHours * res.rate) + " at " + money(res.rate) + " an hour" : "") + ".");
    lines.push("", "Steps by hours a year:");
    res.rows.forEach((r, i) => lines.push((i + 1) + ". " + r.name + ": " + h1(r.hours) + " hours" + (res.rate !== null ? " (" + money(r.hours * res.rate) + ")" : "") + ". " + RULE_TAG[r.rules] + "."));
    lines.push("", "These numbers come only from what I entered. They show time spent now, not time saved.", "Worked out with " + url);
    return lines.join("\n");
  }
  const CSV_HEAD = ["Rank", "Step", "Minutes each time", "How many times", "How often", "Times a year", "People", "Goes wrong (%)", "Minutes to fix", "Hours a year", "Cost a year", "Follows fixed rules"];
  function toCSV(res) {
    const cell = x => { let s = String(x); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return /[",\r\n]|^\s|\s$/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const per = k => (PERIODS.find(p => p[0] === k) || ["", ""])[1];
    const rows = res.rows.map((r, i) => [i + 1, r.name, trim(r.v.minutes), trim(r.v.count), per(r.per), trim(r.runs), r.v.people, trim(r.v.wrong), trim(r.v.fix),
      (Math.round(r.hours * 100) / 100).toFixed(2), res.rate !== null ? (Math.round(r.hours * res.rate * 100) / 100).toFixed(2) : "", { yes: "Yes", partly: "Partly", no: "No", "": "" }[r.rules]]);
    return [CSV_HEAD, ...rows].map(r => r.map(cell).join(",")).join("\r\n") + "\r\n";
  }
  const SAMPLE = {
    process: "Monthly customer invoicing", rate: "35", days: "250",
    steps: [
      { name: "Export hours from the timesheet app", minutes: "15", count: "1", per: "month", people: "1", wrong: "5", fix: "30", rules: "yes" },
      { name: "Copy hours into the invoice template", minutes: "6", count: "40", per: "month", people: "1", wrong: "10", fix: "15", rules: "yes" },
      { name: "Answer billing questions in the shared inbox", minutes: "6", count: "1", per: "day", people: "1", wrong: "", fix: "", rules: "partly" },
      { name: "Email invoices to customers", minutes: "2", count: "40", per: "month", people: "1", wrong: "2", fix: "10", rules: "yes" },
      { name: "Chase late payments by phone", minutes: "10", count: "3", per: "week", people: "1", wrong: "", fix: "", rules: "partly" },
      { name: "Monthly review meeting", minutes: "45", count: "1", per: "month", people: "3", wrong: "", fix: "", rules: "no" }
    ]
  };
  return { PERIODS, RULES, RULE_TAG, num, perYear, checkStep, checkSettings, compute, summary, toCSV, howText, h1, money, SAMPLE };
})();
window.Audit = Audit;
/* CORE-END */

(() => {
  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const URL_SELF = "https://casimbahadar.github.io/time-audit/";
  const blank = () => ({ name: "", minutes: "", count: "", per: "week", people: "1", wrong: "", fix: "", rules: "" });
  let seq = 0;
  const withId = s => Object.assign({ id: "s" + (++seq) }, s);
  const state = { process: "", rate: "", days: "250", steps: [withId(blank())] };
  let removed = null;

  function stepCard(s, i) {
    const f = (key, label, help, mode) => {
      const id = key + "-" + s.id;
      return '<div class="field"><label for="' + id + '">' + label + "</label>" + (help ? '<span class="help" id="h' + id + '">' + help + "</span>" : "") +
        '<input type="text" id="' + id + '" data-step="' + s.id + '" data-key="' + key + '" inputmode="' + mode + '" autocomplete="off" value="' + esc(s[key]) + '" aria-describedby="' + (help ? "h" + id + " " : "") + "e" + id + '"><span class="err" id="e' + id + '"></span></div>';
    };
    return '<li class="step-card" id="card-' + s.id + '"><h3>Step ' + (i + 1) + "</h3>" +
      '<div class="field"><label for="name-' + s.id + '">What happens in this step</label><input type="text" id="name-' + s.id + '" data-step="' + s.id + '" data-key="name" autocomplete="off" value="' + esc(s.name) + '" placeholder="For example, copy hours into invoices"></div>' +
      '<div class="grid2">' + f("minutes", "Minutes each time", "", "decimal") + f("people", "People who each do it", "", "numeric") + "</div>" +
      '<div class="field"><span class="label" id="lo-' + s.id + '">How often</span><div class="often">' +
      '<input type="text" id="count-' + s.id + '" data-step="' + s.id + '" data-key="count" inputmode="decimal" autocomplete="off" value="' + esc(s.count) + '" aria-labelledby="lo-' + s.id + '" aria-describedby="ecount-' + s.id + '">' +
      '<select class="full" id="per-' + s.id + '" data-step="' + s.id + '" data-key="per" aria-label="How often, period">' + Audit.PERIODS.map(p => '<option value="' + p[0] + '"' + (s.per === p[0] ? " selected" : "") + ">" + p[1] + "</option>").join("") + "</select></div>" +
      '<span class="err" id="ecount-' + s.id + '"></span></div>' +
      '<div class="grid2">' + f("wrong", "How often it goes wrong (%)", "", "decimal") + f("fix", "Minutes to fix it", "", "decimal") + "</div>" +
      '<fieldset class="field rules-choice"><legend>Does it follow fixed rules?</legend>' +
      Audit.RULES.map(r => '<label class="choice"><input type="radio" name="rules-' + s.id + '" value="' + r[0] + '" data-step="' + s.id + '" data-key="rules"' + (s.rules === r[0] ? " checked" : "") + "> " + r[1] + "</label>").join("") + "</fieldset>" +
      (state.steps.length > 1 ? '<div class="actions"><button class="btn btn-quiet" type="button" data-remove="' + s.id + '">Remove step ' + (i + 1) + "</button></div>" : "") + "</li>";
  }
  function renderSteps() {
    $("steps").innerHTML = state.steps.map(stepCard).join("");
    $("f-process").value = state.process; $("f-rate").value = state.rate; $("f-days").value = state.days;
  }

  function showErrors(res) {
    const bad = {};
    res.excluded.forEach(x => { bad[state.steps[x.index].id] = x.errors; });
    for (const s of state.steps) for (const k of ["minutes", "count", "people", "wrong", "fix"]) {
      const msg = (bad[s.id] && bad[s.id][k]) || "", el = $(k + "-" + s.id);
      if (!el) continue;
      const show = msg && (touched.has(s.id + k) || tried) ? msg : "";
      $("e" + k + "-" + s.id).textContent = show;
      if (show) el.setAttribute("aria-invalid", "true"); else el.removeAttribute("aria-invalid");
    }
    for (const k of ["rate", "days"]) {
      const msg = res.settingsErrors[k] && (touched.has(k) || tried) ? res.settingsErrors[k] : "";
      $("e-" + k).textContent = msg;
      if (msg) $("f-" + k).setAttribute("aria-invalid", "true"); else $("f-" + k).removeAttribute("aria-invalid");
    }
  }
  // A field shows its message once the person has left it with something typed, so nothing jumps while typing.
  const touched = new Set();
  const tried = false;

  // Grow a text box to fit its text. Measuring briefly shrinks the page, which can pull the scroll
  // position up, so the position is put back; otherwise a button under the finger could jump away mid-tap.
  function fitHeight(t) {
    const y = window.scrollY;
    t.style.height = "auto";
    t.style.height = (t.scrollHeight + 4) + "px";
    if (window.scrollY !== y) window.scrollTo(0, y);
  }
  function render() {
    const res = Audit.compute(state);
    showErrors(res);
    $("days-echo").textContent = res.days !== null ? res.days : "your working days";
    const rate = res.rate;
    if (!res.rows.length) {
      $("total").textContent = "Add a step with its minutes and how often it happens to see results here.";
      $("ranked").innerHTML = ""; $("worked").textContent = "";
    } else {
      $("total").innerHTML = "This task takes <b>" + Audit.h1(res.totalHours) + " hours a year</b>" + (rate !== null ? ", about <b>" + Audit.money(res.totalHours * rate) + "</b> at " + Audit.money(rate) + " an hour." : ". Enter an hourly cost to see what that time costs.");
      const max = res.rows[0].hours || 1;
      $("ranked").innerHTML = res.rows.map((r, i) =>
        '<li class="rank-item"><span class="rank-num" aria-hidden="true">' + (i + 1) + "</span><h4>" + esc(r.name) + '</h4><div class="rank-figs"><span><b>' + Audit.h1(r.hours) + "</b> hours a year</span>" +
        (rate !== null ? "<span>" + Audit.money(r.hours * rate) + "</span>" : "") + '<span class="tag">' + esc(Audit.RULE_TAG[r.rules]) + "</span></div>" +
        '<div class="rank-bar" aria-hidden="true"><span style="width:' + (r.hours / max * 100).toFixed(1) + '%"></span></div>' +
        '<p class="rank-how">' + esc(Audit.howText(r)) + "</p></li>").join("");
      const top = res.rows[0];
      $("worked").textContent = "For your top step, " + top.name + ": " + Audit.howText(top) + "." + (rate !== null ? " " + Audit.h1(top.hours) + " hours × " + Audit.money(rate) + " = " + Audit.money(top.hours * rate) + " a year." : "");
    }
    if (res.excluded.length) {
      $("excluded").hidden = false;
      $("excluded").innerHTML = "<p>Not counted until they're filled in:</p><ul>" + res.excluded.map(x => "<li>" + esc(x.name) + ": " + esc(Object.values(x.errors)[0].replace(/\.$/, "").toLowerCase()) + "</li>").join("") + "</ul>";
    } else $("excluded").hidden = true;
    const text = Audit.summary(state, res, URL_SELF), sb = $("summary");
    if (sb.value !== text) { sb.value = text; fitHeight(sb); }
    save();
    return res;
  }

  // What's typed is kept in this browser tab only (sessionStorage), so a reload doesn't lose it.
  // Closing the tab clears it. If the browser blocks storage, the page works as before.
  const KEY = "time-audit:v1";
  function save() {
    try { sessionStorage.setItem(KEY, JSON.stringify({ process: state.process, rate: state.rate, days: state.days, steps: state.steps.map(({ id, ...rest }) => rest) })); } catch (e) { /* storage unavailable */ }
  }
  function restore() {
    let d;
    try { d = JSON.parse(sessionStorage.getItem(KEY) || "null"); } catch (e) { return false; }
    const str = v => typeof v === "string" ? v.slice(0, 500) : "";
    if (!d || typeof d !== "object" || !Array.isArray(d.steps) || !d.steps.length) return false;
    const steps = d.steps.slice(0, 5000).filter(x => x && typeof x === "object").map(x => withId(Object.assign(blank(), Object.fromEntries(Object.keys(blank()).map(k => [k, str(x[k])])))));
    if (!steps.length) return false;
    const untouched = !str(d.process) && !str(d.rate) && steps.length === 1 && !Object.entries(steps[0]).some(([k, v]) => k !== "id" && v && v !== blank()[k]);
    if (untouched) return false;
    state.process = str(d.process); state.rate = str(d.rate); state.days = str(d.days) || "250"; state.steps = steps;
    return true;
  }

  $("steps").addEventListener("input", e => {
    const el = e.target, s = state.steps.find(x => x.id === el.dataset.step);
    if (!s) return;
    s[el.dataset.key] = el.value;
    render();
  });
  $("steps").addEventListener("change", e => {
    const el = e.target, s = state.steps.find(x => x.id === el.dataset.step);
    if (!s) return;
    s[el.dataset.key] = el.value;
    render();
  });
  $("steps").addEventListener("focusout", e => {
    const el = e.target;
    if (el.dataset.step && el.dataset.key && el.value !== "") { touched.add(el.dataset.step + el.dataset.key); render(); }
  });
  for (const k of ["process", "rate", "days"]) {
    $("f-" + k).addEventListener("input", () => { state[k] = $("f-" + k).value; render(); });
    if (k !== "process") $("f-" + k).addEventListener("focusout", () => { if ($("f-" + k).value !== "") { touched.add(k); render(); } });
  }

  $("btn-add").addEventListener("click", () => {
    const s = withId(blank());
    state.steps.push(s);
    // Append only the new card. The first card gets its Remove button when there are two.
    if (state.steps.length === 2) renderSteps();
    else $("steps").insertAdjacentHTML("beforeend", stepCard(s, state.steps.length - 1));
    render();
    $("name-" + s.id).focus();
  });
  $("steps").addEventListener("click", e => {
    const b = e.target.closest("[data-remove]");
    if (!b) return;
    const i = state.steps.findIndex(x => x.id === b.dataset.remove);
    removed = { step: state.steps[i], index: i };
    state.steps.splice(i, 1);
    renderSteps(); render();
    $("undo-text").textContent = "Removed " + (removed.step.name.trim() || "step " + (i + 1)) + ".";
    $("undo").hidden = false;
    $("btn-undo").focus();
  });
  $("btn-undo").addEventListener("click", () => {
    if (!removed) return;
    state.steps.splice(removed.index, 0, removed.step);
    const id = removed.step.id; removed = null;
    $("undo").hidden = true;
    renderSteps(); render();
    $("name-" + id).focus();
  });

  function loadSample() {
    state.process = Audit.SAMPLE.process; state.rate = Audit.SAMPLE.rate; state.days = Audit.SAMPLE.days;
    state.steps = Audit.SAMPLE.steps.map(s => withId(Object.assign({}, s)));
    touched.clear(); removed = null; $("undo").hidden = true;
    renderSteps(); render();
  }
  $("btn-sample").addEventListener("click", () => {
    loadSample();
    $("announce").textContent = "Sample task loaded. Results are below the steps.";
    $("h-results").scrollIntoView({ block: "start", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    $("h-results").focus({ preventScroll: true });
  });
  $("btn-start").addEventListener("click", () => {
    $("f-process").focus();
    $("h-steps").scrollIntoView({ block: "start", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  });

  $("btn-copy").addEventListener("click", async () => {
    try {
      await Promise.race([navigator.clipboard.writeText($("summary").value), new Promise((_, no) => setTimeout(() => no(new Error("timeout")), 1500))]);
      $("copied").textContent = "Copied.";
    }
    catch (e) { $("summary").focus(); $("summary").select(); $("copied").textContent = "Copying isn't allowed here. The summary is selected, so you can copy it yourself."; }
  });
  $("btn-csv").addEventListener("click", () => {
    const res = Audit.compute(state);
    if (!res.rows.length) { $("copied").textContent = "There's nothing to download yet. Add a step with its minutes and how often it happens."; return; }
    const blob = new Blob(["\uFEFF" + Audit.toCSV(res)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob), a = document.createElement("a");
    a.href = url; a.download = "time-audit.csv"; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  });

  $("btn-fresh").addEventListener("click", () => {
    state.process = ""; state.rate = ""; state.days = "250"; state.steps = [withId(blank())];
    touched.clear(); removed = null; $("undo").hidden = true; $("restored").hidden = true;
    renderSteps(); render();
    $("f-process").focus();
  });

  if (restore()) $("restored").hidden = false;
  renderSteps();
  render();
})();
