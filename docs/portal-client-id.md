# The client record number

Every client registered through the therapist portal gets a system-generated
number, and that number — never a phone number — is how the portal refers to
them.

```
SG88F0001
││││└──── serial, 4 digits, global, never reused
│││└───── gender letter: M, F or X
││└────── birth year, two digits
└└─────── initials: first letter of the first and last word of the name
```

## The rules

| Input | Rule | Example |
|---|---|---|
| Name | First letter of the first word + first letter of the last word | `Rajwant Singh Suvok` → `RS` |
| Name, one word | Second letter is `X` | `Priya` → `PX` |
| Name, unreadable | `XX` | — |
| Birth date | Two digits of the UTC year | `1988-06-14` → `88` |
| Gender | Only `Male` → `M`, `Female` → `F`; **everything else is `X`** | `Prefer not to say` → `X` |
| Serial | One global counter, zero-padded to 4, grows past 9999 | `0001`, `0002`, … `10000` |

Source of truth: `apps/therapist-portal/src/lib/client-code.ts`. Its tests
(`src/__tests__/client-code.test.ts`) pin the examples above.

## Three decisions worth knowing

**Frozen at creation.** A later correction to a name, birth year or gender does
**not** renumber the record. The number is what a therapist writes on a paper
file, quotes to a client, or cites in supervision; a record number that moves is
worse than one that is slightly wrong. `admin.completeClientProfile` will update
the demographics of an already-numbered client and report that the number is
unchanged.

**Never derived from a placeholder.** If the birth year or gender is missing,
there is no number — not `XX00X0001`. The rule needs real data, so a row without
it shows "No ID yet" in the console and an em dash on the Dashboard until an
operator supplies the missing fields via **Set ID details**.

**Serials are never reused.** The counter is a single row
(`ClientCodeSequence`, id `client_code`) incremented inside the same transaction
as the insert it numbers. A rolled-back registration spends its serial, leaving a
gap; a gap is harmless, a duplicate is not.

## Where it comes from

- `User.client_code` — the column, `TEXT`, `NULL` allowed, `UNIQUE`.
- Migration `20261102140000_client_record_number` adds the column, the counter
  table, and numbers every existing row that has a name, birth date and gender
  (in creation order, so the serials read as a history). Its `DO` block carries
  the same rules in SQL, `[[:alpha:]]` and all, and must be changed together with
  the TypeScript.
- The same migration repairs `TherapistClient.client_label` rows that still hold
  a masked phone number (`•••• ••• 6553`) instead of a name — that is what made
  the first Dashboard show a phone where a client name belongs.

## Where it shows

| Surface | What renders |
|---|---|
| Dashboard → Active clients → Client | Name, with the number underneath in monospace |
| Client detail header, and every sub-page breadcrumb | Name + number |
| Admin console → Clients | Number under the name; "No ID yet" + **Set ID details** when absent |
| Admin console → Clients search | Matches on the number, case-insensitively |
| Add-client wizard receipt | "Client ID: SG88F0001", with a note that it is fixed |
| Privacy page §2 | Listed as derived from name, birth year and gender |

The number is **not** shown to the client in the app, and it is not part of any
agent prompt.

## Why the wizard now requires birth date and gender

Both were optional before. They cannot stay optional while they determine the
number: a client registered without them would be the one client whose file has
no reference, and the therapist would fall back to the phone number — exactly the
problem this removes. Step 2 therefore blocks Continue until both are filled;
the presenting-issues chips on the same step stay optional.

Gender is a fixed dropdown (Male / Female / Other / Prefer not to say) because
free text made the letter unpredictable: "Woman" and "Female" would have been
two different answers to the same question.
