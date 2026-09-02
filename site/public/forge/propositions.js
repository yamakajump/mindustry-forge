/**
 * Weighing a marking somebody offered for a schematic they did not publish.
 *
 * `Contribution::weigh` was written, routed and reachable only with `curl`. So a marking
 * could be offered and never seen by anybody: the queue only grew, the schematic kept
 * showing a ceiling, and the contributor had no way of knowing their proposal had arrived
 * anywhere. Half a feature is not a feature.
 *
 * Two buttons and nothing else. The endpoint answers with the state and deliberately says
 * nothing about how close the threshold is, because telling a voter how much weight is left
 * tells anybody who cares to ask how many accounts they would need; this file has no
 * business inventing that either, so it reports what came back and stops.
 */

const csrf = () => decodeURIComponent(
  (document.cookie.match(/XSRF-TOKEN=([^;]+)/) || [])[1] || "");

/** What each state is called on screen, so a row says what became of itself. */
const DIT = {
  applied: "En ligne : la page annonce ce branchement.",
  rejected: "Écarté.",
  pending: "Compté. En attente d'autres avis.",
};

async function peser(row, agree) {
  const boutons = row.querySelectorAll("button");
  for (const bouton of boutons) bouton.disabled = true;
  const note = row.querySelector(".proposition-note");

  try {
    const answer = await fetch(`/api/contributions/${row.dataset.proposition}/vote`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-XSRF-TOKEN": csrf(),
      },
      body: JSON.stringify({ accord: agree }),
    });

    if (!answer.ok) throw new Error(String(answer.status));
    const data = await answer.json();
    note.textContent = DIT[data.etat] ?? DIT.pending;
    /* Applied means the page behind this one now says something different, and a row
       claiming otherwise on a page nobody reloaded is the worst of the three states. */
    if (data.etat === "applied") setTimeout(() => location.reload(), 1200);
  } catch (error) {
    note.textContent = `pas compté : ${error.message}`;
    for (const bouton of boutons) bouton.disabled = false;
  }
}

document.addEventListener("click", (event) => {
  const bouton = event.target.closest("[data-accord]");
  if (!bouton) return;
  const row = bouton.closest("[data-proposition]");
  if (row) peser(row, bouton.dataset.accord === "oui");
});
