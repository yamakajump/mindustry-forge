# Security

## Reporting

Please use GitHub's private vulnerability reporting on this repository, under **Security →
Report a vulnerability**, rather than opening a public issue.

If that is not available to you, `corentin@codwingz.com` works.

Expect a first answer within a few days. This is a one-person project with a lot of help,
not a company with a rota, and pretending otherwise would set an expectation nobody can
hold.

## What is worth reporting

The site accepts a string that a stranger pasted and parses it in the browser and on the
server. Anything that comes out of that is interesting:

- a schematic string that makes the parser hang, allocate without bound, or crash the page
- stored figures that let a visitor read a schematic marked private or unlisted
- anything that turns an uploaded schematic into script running on somebody else's page
- a path from the public API to a row the caller should not see

## What is not

The analysis of a schematic is done in the visitor's browser, on data the visitor pasted.
Making your own page compute a wrong number for yourself is not a vulnerability.

Rate limits, scraping of public pages, and issues in Cloudflare or the hosting provider are
out of scope here.

## A note on the imported catalogue

Most of the schematics on the site were collected from other Mindustry catalogues. They
carry their origin and their author, and each one links back. If you are an author and want
yours removed, open an issue or write to the address above: that is a takedown request, not
a security report, and it will be honoured without argument.
