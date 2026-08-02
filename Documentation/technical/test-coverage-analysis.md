# Test Coverage Analysis

An assessment of where the Git test suite is strong, where it is blind, and
which gaps are worth closing first. All figures were measured against the tree
at the time of writing (2.55 cycle, merge `7760f83b`).

## 1. What we have today

| Layer | Size |
| --- | --- |
| Shell integration tests (`t/tNNNN-*.sh`) | 1,042 scripts, ~294k lines |
| Clar unit tests (`t/unit-tests/u-*.c`) | 27 files, ~19 modules |
| Test helpers (`t/helper/test-*.c`) | 79 helpers |
| Performance tests (`t/perf/p*.sh`) | 61 scripts |
| Fuzz targets (`oss-fuzz/fuzz-*.c`) | 8 targets |
| Rust unit tests (`#[test]`) | 16 functions |
| Source under test | 129 builtins, 242 top-level `.c` files |

The integration suite is the project's real safety net, and it is genuinely
good: broad, portable, and run across a wide CI matrix (Linux gcc/clang, musl,
32-bit, macOS, Windows/MinGW, Visual Studio, almalinux-8, debian-11, meson and
make builds, SHA-1 and SHA-256, files and reftable backends).

Two things deserve explicit credit, because they are better than most projects
of this age:

* **Leak checking is default-on.** The old `TEST_PASSES_SANITIZE_LEAK` opt-in
  markers are gone — zero of the 1,042 scripts carry one — and `linux-leaks`
  plus `linux-reftable-leaks` run the whole suite under LSan. `linux-asan-ubsan`
  covers ASan/UBSan.
* **The clar migration is finished.** No legacy `t-*.c` unit tests remain; all
  are `u-*.c` under the clar runner.

The gaps below are therefore not "the suite is bad" — they are specific blind
spots in an otherwise strong suite.

## 2. Priority findings

### 2.1 Rust unit tests exist but CI never runs them

`ci/run-rust-checks.sh` runs `cargo fmt --check`, `cargo clippy`, and
`cargo msrv verify`. It does **not** run `cargo test`. Neither does any Makefile
or meson target — `grep -rn cargo Makefile meson.build ci/ .github/` finds no
test invocation anywhere.

Meanwhile `src/` already contains 16 `#[test]` functions:

| File | LOC | Tests |
| --- | --- | --- |
| `src/loose.rs` | 913 | 6 |
| `src/hash.rs` | 466 | 5 |
| `src/varint.rs` | 107 | 2 |
| `src/csum_file.rs` | 81 | **0** |
| `contrib/libgit-rs/src/config.rs` | 106 | 1 |
| `contrib/libgit-sys/src/lib.rs` | 79 | 1 |

So we have tests that can never fail. A contributor can break loose-object
parsing in Rust and every CI job stays green.

**Proposal:** add `cargo test --all-features` to `ci/run-rust-checks.sh` (a
three-line change), wire an equivalent target into meson so `meson test` covers
it, and add unit tests for `src/csum_file.rs`. This is the highest
return-per-line-of-diff item in this document.

### 2.2 No coverage measurement anywhere in CI

The Makefile has a full, working coverage apparatus — `coverage`,
`coverage-test`, `coverage-report`, `coverage-untested-functions`, gcov-based
`COVERAGE_CFLAGS`, and even a `cover_db_html` target (Makefile:3948-4000).

Nothing in `.github/workflows/`, `.gitlab-ci.yml`, `.cirrus.yml`, or `ci/`
references it. `grep -rn coverage` across all of those returns nothing.

The result is that every judgement about coverage — including this document —
is made by proxy metrics rather than measurement. We cannot answer "did this
patch series add a code path nobody executes?"

**Proposal:** add a periodic (weekly, not per-PR — gcov instrumentation is slow)
CI job that runs `make coverage-report` and publishes
`coverage-untested-functions` as an artifact. Even without a coverage gate,
having the untested-function list regenerated automatically turns section 2.3
below from guesswork into a work queue.

### 2.3 Unit testing reaches ~19 modules out of 242

Unit tests cover: `ctype`, `dir`, `decorate`, `hash`, `hashmap`,
`list-objects-filter-options`, `mem-pool`, `oid-array`, `oidmap`, `oidtree`,
`prio-queue`, `strbuf`, `string-list`, `strvec`, `trailer`, `urlmatch`, `utf8`,
string-compare helpers, and the `reftable` subsystem (9 files — by far the
best-covered part of the codebase, and a good model for the rest).

`Documentation/technical/unit-tests.adoc` states the project's own rationale:

> we spend a significant amount of effort crafting end-to-end tests for error
> conditions that could easily be captured by unit tests (or we simply forgo
> some hard-to-setup and rare error conditions)

That work is still mostly ahead of us. These modules are pure or near-pure
functions with no unit tests at all — ideal candidates, ordered by
value/difficulty:

| Module | LOC | Current testing |
| --- | --- | --- |
| `versioncmp.c` | 202 | indirect only, via 5 shell scripts exercising `versionsort` |
| `url.c` | 134 | none direct |
| `base85.c` | 132 | none direct |
| `varint.c` | 30 | none direct (C side; the Rust port has tests) |
| `csum-file.c` | 256 | none direct |
| `diffcore-delta.c` | 236 | none direct |
| `quote.c` | 586 | none direct |
| `credential.c` | 710 | none direct |
| `pathspec.c` | 895 | none direct |
| `color.c` | 500 | none direct |
| `attr.c` | 1,367 | shell only (a fuzzer covers line parsing) |
| `wildmatch.c` | 290 | shell + `test-wildmatch` helper |
| `date.c` | 1,420 | shell + `test-date` helper |
| `parse-options.c` | 1,560 | shell + `test-parse-options` helper |

The last four are a distinct, easier category: they already have a
`t/helper/test-*.c` that drives the library directly, and the shell script
around it exists only to compare strings. Those convert to clar tests almost
mechanically, and each conversion removes a process spawn per assertion.
`t/helper/test-string-list.c`, `test-hashmap.c`, and `test-hash.c` show the
pattern — they already coexist with `u-string-list.c`, `u-hashmap.c`, and
`u-hash.c`.

Also untouched by unit tests: `xdiff/` (11 files, the entire diff algorithm
core) and `ewah/` (4 files, bitmap encoding). Both are self-contained
algorithmic code with well-defined inputs and outputs — exactly what unit tests
are for — and both are currently validated only by observing `git diff` and
bitmap-enabled clone output.

### 2.4 Roughly 74 `GIT_TEST_*` knobs, ~17 exercised in CI

The suite has a rich set of environment knobs that force alternative code paths.
CI sets 17 of them (concentrated in the `linux-TEST-vars` job). The remainder
are never set by any CI job, which means the code paths behind them are exercised
only when a developer remembers to do it locally.

Excluding ~12 that are internal test-lib machinery (`GIT_TEST_TEE_*`,
`GIT_TEST_STRESS_*`, `GIT_TEST_VERSION_A/B`, etc.), the notable unexercised
behavior knobs include:

* `GIT_TEST_GIT_DAEMON` — **an entire transport is unexercised.** Without it,
  `t5570-git-daemon.sh` and `t5811-proto-disable-git.sh` skip completely, and
  the `git://` halves of `t5700-protocol-v1.sh` and `t5702-protocol-v2.sh` skip
  too. `GIT_TEST_HTTPD` *is* set in CI, so this is an inconsistency rather than
  a deliberate policy.
* `GIT_TEST_PROTOCOL_VERSION` — CI only ever tests the default (v2). The v0 and
  v1 negotiation paths in `protocol.c` and the fetch/push machinery are
  untested by CI.
* `GIT_TEST_SPARSE_INDEX` — sparse-index is a large, performance-critical code
  path with a knob used by exactly one test script and never set in CI.
* `GIT_TEST_FSMONITOR` / `GIT_TEST_FSMONITOR_TOKEN` — the fsmonitor daemon
  integration is never forced on.
* `GIT_TEST_INDEX_VERSION`, `GIT_TEST_PRELOAD_INDEX`, `GIT_TEST_INDEX_THREADS`,
  `GIT_TEST_CHECK_CACHE_TREE`, `GIT_TEST_VALIDATE_INDEX_CACHE_ENTRIES` — index
  format variants and self-checks.
* `GIT_TEST_MIDX_WRITE_REV`, `GIT_TEST_MIDX_READ_RIDX`, `GIT_TEST_MIDX_READ_BTMP`,
  `GIT_TEST_MULTI_PACK_INDEX_WRITE_BITMAP`, `GIT_TEST_USE_PSEUDO_MERGES`,
  `GIT_TEST_UPGRADE_BLOOM_FILTERS`, `GIT_TEST_PACK_SPARSE`,
  `GIT_TEST_PACK_PATH_WALK` — packfile/midx/bitmap variants.
* `GIT_TEST_REFTABLE_AUTOCOMPACTION` — reftable compaction behavior.
* `GIT_TEST_SVNSERVE` — 69 `t91xx-*` scripts exist for git-svn; the
  svnserve-backed subset never runs.

**Proposal:** the fix is not "turn everything on" — that multiplies CI cost.
Add one or two additional `linux-TEST-vars`-style jobs that rotate through
distinct knob groups (one "protocol" job setting `GIT_TEST_GIT_DAEMON` and
`GIT_TEST_PROTOCOL_VERSION=0`, one "index/pack variants" job), and run them
nightly rather than per-PR. Start with `GIT_TEST_GIT_DAEMON`, which is close to
free and currently costs us coverage of a whole protocol.

### 2.5 Fuzzing does not reach the highest-risk parsers

Eight fuzz targets exist: `commit-graph`, `config`,
`credential-from-url-gently`, `date`, `pack-headers`, `pack-idx`,
`parse-attr-line`, `url-decode-mem`.

Attacker-reachable parsers with no fuzz target, by size:

| Parser | LOC | Why it matters |
| --- | --- | --- |
| `apply.c` | 5,289 | parses untrusted patches; historically CVE-prone |
| `ref-filter.c` | 3,774 | user-supplied format strings |
| `convert.c` | 2,062 | filters/CRLF on untrusted blob content |
| `mailinfo.c` | 1,319 | parses untrusted email for `git am` |
| `reftable/record.c` | 1,322 | on-disk record decoding |
| `tree-walk.c` | 1,288 | decodes tree objects from the wire |
| `midx.c` | 1,033 | on-disk index parsing |
| `ident.c` | 736 | parses author/committer lines |
| `bundle.c` | 640 | parses untrusted bundle headers |
| `pack-revindex.c` | 609 | on-disk index parsing |

`apply.c` and `mailinfo.c` are the standouts: both consume wholly untrusted
input by design, both are large, and both are exactly the shape of code fuzzing
is best at. Adding `fuzz-apply.c` and `fuzz-tree-parse.c` would be a good first
pair — the meson build already has `-Dfuzzers=true` wired up, so the
infrastructure cost is zero.

### 2.6 The performance suite never runs

`t/perf/` contains 61 benchmark scripts and is referenced by no CI
configuration at all. We have no automated signal on performance regressions;
they are found when a user complains.

**Proposal:** a nightly or per-release job running a subset of `t/perf` against
the previous tag, reporting deltas. This does not need to gate anything to be
useful — a visible trend line would have caught several historical regressions.

### 2.7 Thin coverage on newer and peripheral builtins

Recently added builtins vary widely in how well they are covered:

| Builtin | LOC | Tests |
| --- | --- | --- |
| `builtin/history.c` | 754 | 41 tests across 3 scripts — good |
| `builtin/replay.c` | 259 | 48 tests — good |
| `builtin/backfill.c` | 157 | 21 tests — good |
| `builtin/last-modified.c` | 564 | 28 tests in 287 lines — thin for the size |
| `builtin/diff-pairs.c` | 207 | **7 tests in 90 lines** — thinnest of the group |

`diff-pairs` and `last-modified` are worth revisiting while they are still new
and the authors' context is fresh.

Separately, a scan for builtins never invoked by name in a test script turns up
seven candidates, but six of them are covered indirectly and are fine:
`checkout--worker` (driven by `t2080-parallel-checkout-basics.sh` via
`lib-parallel-checkout.sh`), `credential-cache--daemon` (`t0301`),
`credential-store` (`t0302`), `merge-ours` (24 scripts using `-s ours`),
`remote-ext` (`t5802`, `t5814` via `ext::` URLs), and `upload-archive`
(`t5000`, `t5003`, `t5702`).

**`remote-fd` is the real gap.** Its only appearance anywhere under `t/` is as a
line in `t/t0450/adoc-help-mismatches` — a documentation checklist, not a test.
No script ever constructs an `fd::` URL. It is a transport helper that accepts
a remote-supplied descriptor pair, and nothing verifies it works or fails
safely.

### 2.8 137 known breakages with no visible tracking

`test_expect_failure` appears 137 times across the suite. Each marks a real,
acknowledged bug. There is no index of them, no owner, and nothing that reports
when one starts passing other than the "TODO passed" line in test output that
nobody aggregates.

**Proposal:** a small script (or an extension to `t/aggregate-results.sh`) that
lists all `test_expect_failure` cases with their script and description, and a
CI step that flags any which have begun to pass. Low effort, and it turns a
scattered set of TODOs into a visible backlog.

## 3. Recommended order of work

1. **Run `cargo test` in CI** (§2.1) — hours of work, immediately stops a class
   of silent breakage.
2. **Add `GIT_TEST_GIT_DAEMON=true` to a CI job** (§2.4) — restores coverage of
   an entire transport for near-zero cost.
3. **Stand up a weekly coverage-report job** (§2.2) — converts the rest of this
   document from estimates into measurements.
4. **Convert the four helper-backed modules to clar unit tests** (§2.3):
   `wildmatch`, `date`, `parse-options`, `pkt-line` — mechanical, and each one
   makes the next easier.
5. **Add `fuzz-apply.c` and a tree-object fuzz target** (§2.5).
6. **Unit-test the pure algorithmic modules** (§2.3), starting with
   `versioncmp.c`, `base85.c`, `url.c`, and `csum-file.c`, then moving into
   `xdiff/`.
7. **Backfill `diff-pairs` and `last-modified` tests, and write a first
   `remote-fd` script** (§2.7).
8. **Nightly perf job and known-breakage report** (§2.6, §2.8).

## 4. Minor cleanup noticed along the way

`t/Makefile:49` still reads:

    UNIT_TEST_SOURCES = $(wildcard unit-tests/t-*.c)

No `unit-tests/t-*.c` files remain after the clar migration, so this wildcard
now expands to nothing and the variable serves no purpose. It can be dropped.
