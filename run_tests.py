# Headless tests for demo 4 against the shipped out/index.html. Expected values were worked out by hand.
import csv, io, time, sys, os, subprocess
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
results = []
def check(name, cond, detail=""):
    results.append((name, bool(cond))); print(("PASS " if cond else "FAIL ") + name + ("" if cond else "  :: " + str(detail)[:700]))
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8096", "--bind", "127.0.0.1", "-d", os.path.join(ROOT, "out")], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(0.8)
URL = "http://127.0.0.1:8096/index.html"
EXP = [("Copy hours into the invoice template", "60.0", "$2,100.00"), ("Monthly review meeting", "27.0", "$945.00"),
       ("Chase late payments by phone", "26.0", "$910.00"), ("Answer billing questions in the shared inbox", "25.0", "$875.00"),
       ("Email invoices to customers", "17.6", "$616.00"), ("Export hours from the timesheet app", "3.3", "$115.50")]
errors = []
def ranked(p):
    return p.eval_on_selector_all("#ranked .rank-item", "items => items.map(i => [i.querySelector('h4').textContent, i.querySelector('.rank-figs b').textContent, (i.querySelectorAll('.rank-figs span')[1] || {}).textContent])")
def rcsv(path):
    t = open(path, encoding="utf-8").read(); t = t[1:] if t.startswith("\ufeff") else t
    return list(csv.reader(io.StringIO(t)))
with sync_playwright() as pw:
    br = pw.chromium.launch(args=["--no-sandbox"])
    def newp(**kw):
        c = br.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, accept_downloads=True, **kw)
        c.route("**/fonts.g*/**", lambda r: r.abort())
        p = c.new_page(); p.set_default_timeout(8000)
        p.on("pageerror", lambda e: errors.append("pageerror: " + str(e)))
        p.on("console", lambda m: errors.append("console: " + m.text) if m.type == "error" and "ERR_FAILED" not in m.text and "example.com/x" not in m.text else None)
        p.goto(URL); p.wait_for_selector("#btn-sample")
        return c, p
    c, p = newp(permissions=["clipboard-read", "clipboard-write"])
    check("empty page asks for a step instead of showing zeros", "Add a step" in p.inner_text("#total"))
    p.click("#btn-sample")
    check("1 tap: sample loaded and focus moved to the results", p.evaluate("document.activeElement.id") == "h-results")
    got = ranked(p)
    check("sample: 6 steps ranked in the planned order with planned hours and costs", got == [list(x) for x in EXP], got)
    tot = p.inner_text("#total")
    check("sample total: 158.9 hours a year, $5,561.50 at $35.00 an hour", "158.9 hours a year" in tot and "$5,561.50" in tot and "$35.00 an hour" in tot, tot)
    how = p.eval_on_selector_all("#ranked .rank-how", "e => e.map(x => x.textContent)")
    check("each step shows its own arithmetic", how[0] == "(6 min × 480 times × 1 person + 480 × 10% × 15 min × 1 person) ÷ 60 = 60.0 hours" and how[1] == "(45 min × 12 times × 3 people) ÷ 60 = 27.0 hours", how[:2])
    f = p.inner_text("#formula")
    check("formula on screen, with a worked example for the top step", "Hours a year = (minutes each time × times a year × people + times a year × share that goes wrong × minutes to fix × people) ÷ 60" in f and "60.0 hours × $35.00 = $2,100.00 a year." in f and "per working day × 250" in f, f)
    check("honest label: time spent, not time saved", "not an estimate of time saved" in p.inner_text("main"))
    # working days and hourly cost
    p.fill("#f-days", "240")
    got = ranked(p)
    check("240 working days: daily step drops to 24.0 hours, total 157.9", ["Answer billing questions in the shared inbox", "24.0", "$840.00"] in got and "157.9 hours" in p.inner_text("#total"), got)
    p.fill("#f-days", "250"); p.fill("#f-rate", "50")
    check("hourly cost $50: total $7,945.00", "$7,945.00" in p.inner_text("#total"), p.inner_text("#total"))
    p.fill("#f-rate", "35")
    # the rules answer never changes the order
    first = p.get_attribute("#steps .step-card:nth-child(2)", "id").replace("card-", "")
    p.check(f'input[name="rules-{first}"][value="no"]')
    check("changing the fixed-rules answer doesn't change the ranking", [r[0] for r in ranked(p)] == [x[0] for x in EXP] and "Needs judgment" in p.inner_text("#ranked .rank-item:first-child"))
    p.check(f'input[name="rules-{first}"][value="yes"]')
    # summary and copy
    s = p.input_value("#summary")
    check("summary: task name, total, ranked steps, the not-time-saved line and the demo link",
          s.startswith("Task: Monthly customer invoicing") and "158.9 hours a year, about $5,561.50 at $35.00 an hour." in s and "1. Copy hours into the invoice template: 60.0 hours ($2,100.00). Follows fixed rules." in s and "not time saved" in s and "casimbahadar.github.io/demo-time-audit/" in s, s)
    check("summary box is tall enough to show all of it", p.evaluate("(() => { const t = document.getElementById('summary'); return t.scrollHeight <= t.clientHeight + 2; })()"))
    p.bring_to_front(); p.click("#btn-copy"); p.wait_for_timeout(600)
    cp = p.inner_text("#copied")
    check("Copy summary puts the exact text on the clipboard", cp == "Copied." and p.evaluate("navigator.clipboard.readText()") == s, (cp, p.evaluate("document.activeElement.id")))
    check("link to the contact page is on the page", p.get_attribute("text=Talk to Casim about the steps at the top of your list", "href") == "https://casimbahadar.github.io/contact.html")
    with p.expect_download() as d: p.click("#btn-csv")
    rows = rcsv(d.value.path())
    check("CSV: 6 ranked rows with hours and costs", len(rows) == 7 and rows[1][1] == "Copy hours into the invoice template" and rows[1][9] == "60.00" and rows[1][10] == "2100.00" and rows[6][9] == "3.30", rows[:2])
    # validation: bad values are named and the step is left out of the totals until fixed
    sid = p.get_attribute("#steps .step-card:nth-child(1)", "id").replace("card-", "")
    for key, val, text in [("minutes", "abc", "Enter a number"), ("minutes", "0", "more than 0"), ("people", "0", "whole number, 1 or more"), ("people", "1.5", "whole number"), ("wrong", "150", "0 to 100")]:
        p.fill(f"#{key}-{sid}", val); p.focus(f"#name-{sid}")
        msg = p.inner_text(f"#e{key}-{sid}")
        check(f"rejects {key} = {val!r}: message shown, step left out of the total", text in msg and "155.6 hours" in p.inner_text("#total") and "Not counted" in p.inner_text("#excluded"), (msg, p.inner_text("#total")))
        p.fill(f"#{key}-{sid}", {"minutes": "15", "people": "1", "wrong": "5"}[key]); p.focus(f"#name-{sid}")
    check("fixing the value brings the step back (158.9 hours)", "158.9 hours" in p.inner_text("#total") and not p.is_visible("#excluded"))
    p.fill(f"#fix-{sid}", ""); p.focus(f"#name-{sid}")
    check("a % that goes wrong with no fix time is flagged, not counted as zero", "how long a fix takes" in p.inner_text("#excluded"), p.inner_text("#excluded"))
    p.fill(f"#fix-{sid}", "30")
    p.fill("#f-rate", "abc"); p.focus("#f-process")
    check("bad hourly cost: message, hours still shown, cost hidden", "Enter a number" in p.inner_text("#e-rate") and "158.9 hours" in p.inner_text("#total") and "$" not in p.inner_text("#total").split("hours a year")[0], p.inner_text("#total"))
    p.fill("#f-rate", "35")
    check("comma decimals are read: '1,5' minutes", p.evaluate("Audit.num('1,5')") == 1.5 and p.evaluate("Audit.num('$35')") == 35)
    # add, remove, undo
    n = p.eval_on_selector_all("#steps .step-card", "e => e.length")
    p.click("#btn-add")
    check("Add a step adds a blank card and focuses its name", p.eval_on_selector_all("#steps .step-card", "e => e.length") == n + 1 and p.evaluate("document.activeElement.id").startswith("name-"))
    p.click('#steps .step-card:nth-child(2) [data-remove]')
    check("remove shows an undo and drops the step's hours", p.is_visible("#undo") and "98.9 hours" in p.inner_text("#total"), p.inner_text("#total"))
    p.click("#btn-undo")
    check("undo puts the step back in its place", "158.9 hours" in p.inner_text("#total") and p.input_value("#steps .step-card:nth-child(2) input[data-key=name]") == "Copy hours into the invoice template")
    # first screen, layout, focus
    p.set_viewport_size({"width": 375, "height": 667}); p.goto(URL); p.wait_for_selector("#btn-sample")
    check("Load sample data is on the first screen at 375 x 667", p.evaluate("document.getElementById('btn-sample').getBoundingClientRect().bottom") <= 667)
    p.click("#btn-sample")
    for w in (320, 390, 1360):
        p.set_viewport_size({"width": w, "height": 800})
        check(f"no sideways page scroll at {w}px", p.evaluate("document.documentElement.scrollWidth - window.innerWidth") <= 0)
    p.focus("#btn-sample"); p.keyboard.press("Tab"); p.keyboard.press("Shift+Tab")
    check("keyboard focus shows a 3px outline", p.evaluate("getComputedStyle(document.activeElement).outlineWidth") == "3px")
    csp = p.get_attribute('meta[http-equiv="Content-Security-Policy"]', "content") or ""
    check("CSP: script hash only, connect-src 'none'", "script-src 'sha256-" in csp and "connect-src 'none'" in csp)
    check("page cannot send data out (fetch blocked)", p.evaluate("fetch('https://example.com/x',{method:'POST',body:'x'}).then(() => 'sent', () => 'blocked')") == "blocked")
    c.close()
    # speed: 5,000 steps through the calculation, 60 through the page
    c, p = newp()
    ms = p.evaluate("""(() => { const s = { process: 'x', rate: '35', days: '250', steps: [] };
      for (let i = 0; i < 5000; i++) s.steps.push({ name: 'Step ' + i, minutes: String(1 + i % 30), count: String(1 + i % 9), per: ['day','week','month','year'][i % 4], people: '1', wrong: '5', fix: '10', rules: 'yes' });
      const t = performance.now(); const r = Audit.compute(s); Audit.summary(s, r, 'u'); Audit.toCSV(r); return [performance.now() - t, r.rows.length]; })()""")
    print(f"      timing: 5,000 steps recalculated in {ms[0]:.0f} ms")
    check("5,000 steps: calculation, summary and CSV under 1 second", ms[0] < 1000 and ms[1] == 5000, ms)
    one = p.evaluate("""(() => { const b = document.getElementById('btn-add'); for (let i = 0; i < 59; i++) b.click();
      const t = performance.now(); b.click(); const add = performance.now() - t;
      const inp = document.querySelector('#steps .step-card:last-child input[data-key=minutes]');
      const t2 = performance.now(); inp.value = '5'; inp.dispatchEvent(new Event('input', { bubbles: true })); return [add, performance.now() - t2, document.querySelectorAll('#steps .step-card').length]; })()""")
    print(f"      timing: with 60 steps, one Add {one[0]:.0f} ms, one keystroke {one[1]:.0f} ms")
    check("60 steps on the page: adding a step and each keystroke under 100 ms", one[0] < 100 and one[1] < 100 and one[2] == 61, one)
    c.close()
    # injection through step names, CSP on and bypassed
    for bypass in (True, False):
        c, p = newp(bypass_csp=bypass)
        p.click("#btn-sample")
        sid = p.get_attribute("#steps .step-card:nth-child(2)", "id").replace("card-", "")
        p.fill(f"#name-{sid}", "=HYPERLINK(\"x\") <img src=x onerror=window.__pwned=1>")
        p.hover("#ranked"); p.wait_for_timeout(300)
        label = "CSP bypassed" if bypass else "CSP on"
        check(f"injected markup in a step name shows as text and never runs ({label})", p.evaluate("window.__pwned") is None and "<img src=x" in p.inner_text("#ranked"))
        if bypass:
            with p.expect_download() as d: p.click("#btn-csv")
            check("CSV: a step name starting with = is exported as text", rcsv(d.value.path())[1][1].startswith("'=HYPERLINK"))
        c.close()
    # a tap must land where it started, even right after typing in a field higher up
    c, p = newp()
    p.click("#btn-sample")
    sid = p.get_attribute("#steps .step-card:nth-child(2)", "id").replace("card-", "")
    p.fill(f"#name-{sid}", "plain name")
    with p.expect_download(timeout=4000) as d: p.click("#btn-csv")
    check("after typing a step name, tapping Download still downloads (no layout jump mid-tap)", d.value.suggested_filename == "time-audit.csv")
    c.close()
    check("no console or page errors", not errors, errors)
    br.close()
srv.terminate()
print(f"\n{sum(1 for r in results if r[1])}/{len(results)} passed")
