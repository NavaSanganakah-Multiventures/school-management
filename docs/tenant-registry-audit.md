# Tenant registry audit — what needs a person

Seven dedicated schools in `schools.json`, all `mode: "dedicated"`. Two things in that
list need a decision. Neither can be settled from the repo, and neither should be changed
by code — both are production data operations.

## 1. `qa-school-266668` — a test tenant in the production registry

```
slug: qa-school-266668   name: "QA Test School 266668"
```

The slug is a registration-test artefact, and the name says so. It is provisioned like a
real customer: it has a dedicated worker, D1, R2 and KV, and it is re-provisioned on every
deploy because `schools.json` is the registry `provision-school.mjs` reads.

It should be deleted. The blocker is that deleting the registry entry alone is not enough
and is not safe:

- `POST /api/admin/schools/provision/deprovision` returns **410 Gone** by design, so the
  supported path does not exist. See `docs/audit-phase0-safety-rails.md` §2.1 for why it
  was disabled and what has to exist before it can be re-enabled.
- The resources therefore have to be removed by hand: worker, D1, R2, KV.
- Verify it is empty **before** deleting anything. The same mistake in this repo's history
  was deleting a tenant on the assumption it was unused — see the `admin` / `da` entry in
  `docs/implementation-plan.md`, where the slug turned out to belong to a different
  service.

Order that avoids losing data:

```bash
# 1. Prove it is empty. Any non-zero count means stop and ask.
npx wrangler d1 execute school-management-qa-school-266668-db --remote \
  --command "SELECT (SELECT COUNT(*) FROM students) s, (SELECT COUNT(*) FROM teachers) t,
                    (SELECT COUNT(*) FROM system_users) u, (SELECT COUNT(*) FROM fee_invoices) f"
npx wrangler d1 execute school-management-qa-school-266668-db --remote \
  --command "SELECT COUNT(*) FROM system_users"
```

If every count is zero, remove in this order — resources first, registry last, so a
half-finished removal cannot leave a live tenant with no registry entry:

1. the Worker, its KV namespace, its R2 bucket and its D1 database
2. the `qa-school-266668` entry in `schools.json`
3. its fingerprint in `per-school-auth-secret-fingerprints.json`
4. any row in the platform's `school_tenants` / `school_subscriptions`

Step 4 is on the platform D1, so it is the one that cannot be undone from here.

## 2. Three slugs that may be the same school

| slug | name | schoolId |
|---|---|---|
| `yagya-pragnya` | yagya ashram | `school-1789785224252` |
| `school188328` | Yagya Ashram | `school-1789878188328` |
| `yagyaashram` | yagya | `school-1790431111612` |

Three registrations eight days apart, near-identical names, three different tenant ids and
therefore three separate dedicated workers, D1 databases and signing keys. The most likely
explanation is the same school registering three times and being given three full
isolated deployments.

That is not free to leave: each one is provisioned, migrated, backed up and consumes a
subscription record. It also means the same school's data exists in three places that do
not talk to each other.

This needs someone who recognises the names. Confirming which is canonical — or whether
they really are three unrelated schools — is a business question, not a code one. Nothing
should be deleted before that answer, because unlike the QA tenant these may hold real
student data.

## What is already handled

`scripts/rotate-per-school-auth-secret.mjs` used to carry a hand-maintained list of worker
slugs. A school added by provisioning would never appear in it, so its worker would never
get a per-school `AUTH_SECRET` — and `deploy-dedicated.mjs` is fail-closed on a missing
one. That script now reads `schools.json`, so the rotation cannot drift from the registry.

Verify with:

```bash
node scripts/rotate-per-school-auth-secret.mjs --dry-run
```

Seven slugs must print. If a school is added to `schools.json`, it appears here
automatically.