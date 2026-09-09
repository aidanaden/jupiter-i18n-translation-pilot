# Crowdin one-message delivery preparation

Approved scope: prepare delivery of `pilot.recording.proof` from integrated file26,
revision2. Preserve the other12 accepted Chinese entries exactly. No merge,
deployment, manual sync, AI job, credential change, or branch-protection change.

Implementation fixed point: `4a3b616c43a2f2bd32130cd56550d04affcb111f`.
Accepted target is byte-identical to the target at `9189ff3e87692ba0054618dee61ef6c10aa4349b`.

## Contract

- Pin the exact English source and accepted Chinese catalog hashes.
- Require all13 native sources to match the current English catalog.
- Require project927431, integrated file26 revision2, the integration branch,
  and the `src/i18n/locales/en` directory chain. Reject file14 evidence.
- Read native records twice through the read-only API. Reject changes between
  reads, incomplete pagination, redirects, oversized responses, and stale reads.
- Only accept the recorded corrected text from reviewer17853021 with a current
  approval for the same translation and source. The correction and approval
  must follow the new source event. Do not claim atomic reads, human review,
  or proof of the content at the historical approval instant.
- Require `Automated test reviewer. No human language review.` in each receipt.
- Use the pinned accepted target as the output template. Replace one exact PO
  entry only. Keep all other entries and metadata byte-for-byte. Validate ICU,
  placeholders, context, and catalog IDs through the existing catalog validator.
- Candidate verification permits only that target PO blob to differ from the
  trusted base tree. Reject source edits, mode changes, unrelated edits, missing
  paths, duplicate paths, wrong base, or wrong repository/branch context.
- Preparation and verification do not publish GitHub status or permit delivery.
  Existing full-catalog/file14 checks remain unchanged.

## Trust and activation boundary

The pure checker accepts data from the trusted collector, not from a PR artifact.
The CLI runs the collector itself using `CROWDIN_PERSONAL_TOKEN`. It reads only
Crowdin API resources and local Git objects, and writes a new private output
directory. It never runs candidate code. Candidate refs must be full commit IDs.

The output is a prepared PO and a bounded verification receipt, not permission
to merge. Do not wire this into the protected status until its code is reviewed,
published through the approved process, and a live read confirms the API shape
and current IDs. The browser observations are not fabricated API fixtures.

No live API call, merge, push, deploy, or final recording is implied by unit tests.
The old PR30 export must not be merged: it contains English fallback for12 entries.

The continued recording authorizes one isolated read-only evidence job on
`aidan/crowdin-incremental-delivery-20260910`. It checks out the exact push SHA,
uses the existing project-limited secret, and only prepares evidence. The CLI
rejects other workflow contexts and verify mode in a workflow. No existing
workflow, protected delivery status, main, or deployment is changed by this job.

## Reuse decision

`validateCatalogs` fits the ID/context/ICU safety contract and is reused.
The native project, translation, and approval selectors are reused unchanged.
The old collector and review validator pin file14/revision1 and all13 approvals;
they cannot authorize file26. The Lingo serializer rewrites the catalog, so it
does not meet the byte-preservation requirement. A bounded replacement of the
single entry in a hash-pinned target is used instead. No dependency is added.
