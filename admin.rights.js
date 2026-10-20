// One evidence-review component shared by the existing podcast and episode pages.
export function mountRightsReview({ review, episodes = [], superAdmin, api, html, when, badge, intelligenceOptions, notify, onSaved }) {
  if (!review) return;
  const { feedUrl, episodeId, record } = review, assessment = record.approvalAssessment;
  const mandatory = record.suspendedAt || record.deletedAt || record.rightsReserved || record.classification === "DISPUTED" ||
    ["PUBLISHER_RESTRICTION", "LEGAL_PROHIBITION", "RIGHTS_RESERVED"].includes(record.blockerCode);
  const heading = !record.id ? "No assessment completed"
    : record.suspendedAt || record.deletedAt ? "Takedown or suspension"
    : record.classification === "DISPUTED" ? "Rights dispute"
    : record.blockerCode === "PUBLISHER_RESTRICTION" ? "Explicit publisher restriction"
    : record.rightsReserved ? "Recorded rights reservation"
    : assessment?.revokedAt ? "Approval revoked"
    : record.blockerCode === "LEGAL_BASIS_NOT_ESTABLISHED" ? "No established legal basis"
    : record.classification === "LICENSED" ? "Documented authorisation"
    : record.classification === "TDM_ELIGIBLE" ? "Documented exception assessment" : "Internal assessment";
  const labels = { brief: "AI Episode Brief", chapters: "Smart Chapters", topics: "Topics", moments: "Find a Moment", search: "Conversational Search", advertisements: "Advert detection", transcription: "Paid internal transcription" };
  const evidence = (record.assessmentEvidence || []).map((item) => `<tr><td>${html(item.type)}</td><td>${html(item.source)}</td><td>${html(item.scope)}</td><td class="evidence-reference">${html(item.value)}${item.url ? `<br>${html(item.url)}` : ""}</td></tr>`).join("");
  const editor = !superAdmin ? `<p class="muted">Super Admin access is required to record or revoke an assessment.</p>`
    : mandatory ? `<p class="notice">This scope has a mandatory restriction. Ordinary approvals and operational policy changes cannot remove it. Inspect the rights-holder evidence through Technical controls.</p>`
    : `<details class="assessment-editor"><summary>Review or correct this assessment</summary><form id="assessment-form">
      <div class="assessment-grid">
        <label>Processing basis<select name="basisType" aria-label="Processing basis" required><option value="">Choose the evidenced basis</option><option value="OWNED">Owned content</option><option value="PUBLISHER_LICENCE">Publisher licence</option><option value="CREATOR_AUTHORISATION">Creator authorisation</option><option value="APPLICABLE_EXCEPTION">Documented applicable exception</option><option value="INDEPENDENT_REVIEW">Other independently reviewed basis</option></select></label>
        <label>Intelligence level after approval<select name="tier">${intelligenceOptions(review.policy.tier === "HIGH" ? "LOW" : review.policy.tier)}</select></label>
        <label>Evidence reference<input name="evidenceReference" required minlength="8" maxlength="2000" placeholder="Licence URL or reviewed document reference"></label>
        <label>Rights-holder / independent reviewer<input name="evidenceIssuer" required minlength="3" maxlength="300"></label>
        <label>Review date (optional)<input type="date" name="reviewAt"></label>
        <label>Expiry date (optional)<input type="date" name="expiresAt"></label>
        <label>Territories<input name="territories" required value="WORLDWIDE" placeholder="WORLDWIDE or GB, PT"></label>
        <label>Maximum new jobs now<select name="maxEpisodes"><option value="1">1 eligible episode</option><option value="2">2 eligible episodes</option><option value="3">3 eligible episodes</option></select></label>
      </div>
      <p class="small muted">Territory-limited approvals are recorded but held until their limits can be enforced. Internal analysis and retention are included; select each output below.</p>
      <fieldset><legend>Authorised capabilities</legend><div class="assessment-features">${Object.entries(labels).map(([value, name]) => `<label class="check"><input type="checkbox" name="features" value="${value}" ${["brief", "chapters", "topics", "moments", "search"].includes(value) ? "checked" : ""}> ${html(name)}</label>`).join("")}</div></fieldset>
      ${!episodeId ? `<label>Covered existing episodes<select name="selectedEpisodes" multiple size="4"><option value="" selected>All episodes currently present in this feed (up to 200)</option>${episodes.map((episode) => `<option value="${html(episode.id)}">${html(episode.title)}</option>`).join("")}</select></label><label class="check"><input type="checkbox" name="applyToFuture"> Evidence also covers future eligible episodes</label>` : ""}
      <label>Approved basis and its limits<textarea name="legalBasis" required maxlength="1000" placeholder="What the evidence permits; relevant conditions and exclusions"></textarea></label>
      <label>Reason for this decision<textarea name="reason" required maxlength="1000"></textarea></label>
      <label class="check"><input type="checkbox" name="authorityConfirmed" required> I have reviewed evidence covering these capabilities and this scope, including rights the issuer actually controls.</label>
      <button class="secondary">Preview approval &amp; processing</button>
    </form><div id="assessment-preview" aria-live="polite"></div></details>`;
  const section = document.createElement("section");
  const rollbackVersions = review.policy.source === (episodeId ? "episode" : "podcast") ? (review.policy.history || []).filter((entry) => entry.tier && entry.version) : [];
  section.id = "rights-workspace"; section.className = "panel";
  section.innerHTML = `<div class="panel-head"><div><span class="eyebrow">Intelligence &amp; Rights</span><h3>${html(heading)}</h3><p>${html(record.assessmentReason || record.restrictions || "No affirmative processing basis has been recorded. This is not a publisher-issued denial.")}</p></div>${badge(record.assessmentStatus || "UNASSESSED")}</div>
    <dl class="processing-facts"><div><dt>Scope</dt><dd>${episodeId ? "Selected episode" : "Podcast channel"}</dd></div><div><dt>Source</dt><dd>${html(record.assessmentSource || "Not recorded")}</dd></div><div><dt>Reviewer</dt><dd>${html(assessment?.reviewedBy || record.updatedBy || "Not recorded")}</dd></div><div><dt>Assessed</dt><dd>${when(assessment?.decidedAt || record.assessmentDate)}</dd></div><div><dt>Review due</dt><dd>${when(assessment?.reviewAt)}</dd></div><div><dt>Expires</dt><dd>${when(assessment?.expiresAt)}</dd></div></dl>
    <p class="small muted evidence-reference">RSS: ${html(feedUrl)}</p>
    ${assessment ? `<p>Covered capabilities: ${html(assessment.selectedFeatures.map((key) => labels[key] || key).join(", "))}. ${html(assessment.coverage.episodeIds.length)} recorded episode(s); future episodes ${assessment.coverage.futureEpisodes ? "covered" : "not covered"}.</p>` : ""}
    ${evidence ? `<div class="table-wrap"><table><thead><tr><th>Evidence type</th><th>Issued by / source</th><th>Scope</th><th>Reference</th></tr></thead><tbody>${evidence}</tbody></table></div>` : `<p class="muted">Supporting evidence is not recorded. Do not infer a publisher denial or permission.</p>`}
    ${editor}
    ${superAdmin && rollbackVersions.length ? `<details><summary>Restore an earlier operational level</summary><form id="rollback-policy"><p>Restores this scope’s prior level and future-episode setting. Does not grant rights, reverse takedowns or start jobs. Automatic preparation is paused until explicitly re-approved.</p><label>Earlier policy version<select name="version">${rollbackVersions.map((entry) => `<option value="${html(entry.version)}">Version ${html(entry.version)} · ${html(entry.tier)} · ${when(entry.at)}</option>`).join("")}</select></label><label>Reason<textarea name="reason" required></textarea></label><label>Confirmation<input name="confirmation" placeholder="ROLLBACK POLICY" required></label><button class="secondary">Restore operational settings</button></form></details>` : ""}
    ${superAdmin && assessment && !assessment.revokedAt ? `<details><summary>Revoke this approval</summary><form id="revoke-assessment"><p>Stops new processing and hides derived outputs covered by this approval. Historical records and mandatory holds remain intact.</p><label>Reason<textarea name="reason" required></textarea></label><label>Confirmation<input name="confirmation" required placeholder="REVOKE APPROVAL"></label><button class="secondary danger">Revoke approval</button></form></details>` : ""}
    <details><summary>Assessment history (${review.history.length})</summary>${review.history.length ? `<ol class="timeline">${review.history.map((entry) => `<li><span>${when(entry.at)}</span><strong>${html(entry.actor)}</strong><p>${html(entry.reason)} · rights v${html(entry.next.version)}${entry.next.approvalAssessment?.revokedAt ? " · revoked" : ""}</p></li>`).join("")}</ol>` : `<p>No structured review history exists. Earlier records remain in the audit log.</p>`}</details>`;
  document.querySelector(".unified-policy")?.insertAdjacentElement("afterend", section);
  const form = section.querySelector("#assessment-form");
  if (form) form.onsubmit = async (event) => {
    event.preventDefault();
    const data = new FormData(form), selectedEpisodes = data.getAll("selectedEpisodes").filter(Boolean);
    const input = {
      ...Object.fromEntries(data), scope: episodeId ? "episode" : "podcast", feedUrl, episodeId: episodeId || undefined,
      classification: data.get("basisType") === "APPLICABLE_EXCEPTION" ? "TDM_ELIGIBLE" : "LICENSED",
      expectedAssessmentRevision: review.revision, selectedFeatures: data.getAll("features"),
      authorityConfirmed: data.get("authorityConfirmed") === "on", applyToFuture: data.get("applyToFuture") === "on",
      territories: String(data.get("territories")).split(",").map((value) => value.trim().toUpperCase()),
      ...(selectedEpisodes.length ? { selectedEpisodeIds: selectedEpisodes } : {}),
    };
    const button = form.querySelector("button"); button.disabled = true;
    try {
      const preview = await api("/api/admin/rights/approval-preview", { method: "POST", body: JSON.stringify(input) });
      const area = section.querySelector("#assessment-preview");
      area.innerHTML = `<div class="policy-impact"><h4>Approval outcome</h4><p>${html(preview.summary.affected)} covered · ${html(preview.summary.previouslyEligible)} previously eligible · ${html(preview.summary.newlyEligible)} newly eligible · ${html(preview.summary.stillRestricted)} still unavailable · up to ${html(preview.summary.expectedNewJobs)} new jobs.</p><p>Audio estimate $${html(preview.cost.audioEstimateUsd.toFixed(4))}. Daily remaining $${html(preview.budget.dailyRemainingUsd.toFixed(4))}; monthly $${html(preview.budget.monthlyRemainingUsd.toFixed(4))}.</p><p class="small muted">${html(preview.cost.note)}</p><div class="table-wrap"><table><thead><tr><th>Episode</th><th>Expected route</th><th>Decision</th></tr></thead><tbody>${preview.impacts.map((item) => `<tr><td>${html(item.title)}</td><td>${html(item.route.replaceAll("_", " "))}</td><td>${html(item.code || (item.cached ? "Cached" : item.active ? "Already preparing" : "Eligible"))}${item.reason ? `<br>${html(item.reason)}` : ""}</td></tr>`).join("")}</tbody></table></div><p>Future episodes ${preview.futureEpisodes ? "covered" : "not covered"}. Captions, dubbing and voice permissions remain independently gated.</p><form id="confirm-assessment"><label>Confirmation<input name="confirmation" required placeholder="APPROVE & PROCESS"></label><button class="primary">Approve &amp; Process</button></form></div>`;
      area.querySelector("form").onsubmit = async (confirmationEvent) => {
        confirmationEvent.preventDefault(); const submit = confirmationEvent.currentTarget.querySelector("button"); submit.disabled = true;
        try {
          const result = await api("/api/admin/rights/approve-process", { method: "POST", body: JSON.stringify({ previewId: preview.previewId, confirmation: new FormData(confirmationEvent.currentTarget).get("confirmation") }) });
          notify(`Assessment saved. ${result.jobs.map((job) => `${job.state}${job.jobId ? ` · ${job.jobId}` : ""}`).join("; ") || "No new jobs were required or eligible."}`);
          await onSaved();
        } catch (error) { submit.disabled = false; notify(error.message); }
      };
      form.oninput = () => { area.innerHTML = `<p class="notice">The assessment changed. Preview again before approving.</p>`; };
    } catch (error) { notify(error.message); }
    finally { button.disabled = false; }
  };
  const revoke = section.querySelector("#revoke-assessment");
  const rollback = section.querySelector("#rollback-policy");
  if (rollback) rollback.onsubmit = async (event) => {
    event.preventDefault();
    try { await api("/api/admin/intelligence/policies/rollback", { method: "POST", body: JSON.stringify({ ...Object.fromEntries(new FormData(rollback)), feedUrl, episodeId: episodeId || undefined, expectedVersion: review.policy.version }) }); notify("Operational settings restored. Rights and takedowns are unchanged."); await onSaved(); }
    catch (error) { notify(error.message); }
  };
  if (revoke) revoke.onsubmit = async (event) => {
    event.preventDefault();
    try { await api("/api/admin/rights/revoke-approval", { method: "POST", body: JSON.stringify({ ...Object.fromEntries(new FormData(revoke)), feedUrl, episodeId: episodeId || undefined, expectedAssessmentRevision: review.revision }) }); notify("Approval revoked. Covered intelligence is no longer available."); await onSaved(); }
    catch (error) { notify(error.message); }
  };
}
