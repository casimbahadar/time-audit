# Workflow time audit (demo)

A browser tool for finding where the time goes in a task you repeat. You list the steps, and it ranks them by hours a year, worked out only from the numbers you type. It is a demo with made-up sample data.

Live: https://casimbahadar.github.io/demo-time-audit/

## What it does

- For each step you enter the minutes it takes, how often it happens (per working day, week, month or year), how many people each do it, how often it goes wrong and how long a fix takes, and whether it follows fixed rules.
- Ranks the steps by hours a year and shows each step's own arithmetic. With an hourly cost, it also shows what that time costs.
- Shows the formula on the page:
  `Hours a year = (minutes each time × times a year × people + times a year × share that goes wrong × minutes to fix × people) ÷ 60`
  Times a year: per working day × the working days you set (250 to start), per week × 52, per month × 12, per year × 1.
- The "fixed rules" answer never changes the order. It's there to help talk about which steps software could take over.
- Gives a plain summary to copy and a CSV download, and links to the contact page.

These figures are time spent now. They are not an estimate of time saved, and the page says so.

## Privacy

Nothing is saved or sent. Everything is worked out in your browser, the page's Content-Security-Policy blocks outgoing connections, and closing the page clears it. The only outside request is for the Schibsted Grotesk font from Google Fonts.

## Sample data

"Monthly customer invoicing": 6 made-up steps at $35 an hour. It comes to 158.9 hours a year, about $5,561.50. The steps rank as follows: copying hours into the invoice template (60.0 hours), the monthly review meeting (27.0), chasing late payments (26.0), answering billing questions (25.0), emailing invoices (17.6) and exporting hours (3.3). These figures were worked out by hand and are checked to the cent by the tests.

## Files

- `index.html` is the whole tool. The CSS and JavaScript are inline and there is no build step.
- `.nojekyll` tells GitHub Pages to serve the files as they are.

Built by Casim Bahadar, Kitchener-Waterloo, Ontario. https://casimbahadar.github.io/
