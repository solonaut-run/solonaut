# Adopting an existing project

A checklist for bringing a project you already work on into the
[project workflow](project-workflow.md). It removes the folder-bound workarounds that the
workflow replaces, without losing anything they held. The reasons are in
[ADR 0003](../adr/0003-project-level-on-top-of-claude-code.md).

Work through the steps in order. Steps that depend on the stage 2 kernel say what to do by hand
today, in the same layout the kernel will read.

## 0. Decide the level

- [ ] **Pick the smallest level that fits.** Most projects are **level 1: one repo**, where the
  repo is the project and nothing needs registering.
- [ ] Choose **level 2** only if one piece of work really spans several repos or folders.
- [ ] Ignore **level 3** (grouping projects) for now; it is display only and can come later.
- [ ] If you only want to see sessions and answer prompts, **level 0** needs none of the steps
  below.

## 1. Make each repo self-sufficient (the vanilla floor)

For every repo in the project:

- [ ] Open it with plain Claude Code, no solonaut, no extra plugins, and ask it to build, test
  and describe the repo's rules. Whatever it gets wrong or cannot find is missing from the
  repo's own files.
- [ ] Make sure `CLAUDE.md` (and `AGENTS.md`, if you use it, imported from `CLAUDE.md`) covers
  how to build, test and run, the conventions, what never to commit, and the gates.
- [ ] Remove anything about the **project's progress** from the repo's files: current state,
  next steps, decision logs, notes for the next session. That moves to the project files in
  step 5.
- [ ] Remove anything that only makes sense with a parent folder or another repo around it, or
  move it to the project (step 2).

## 2. Move folder-scoped workarounds to their proper scope

Look for instructions and skills that live in a folder above the repos (a parent or
organisation folder), or that only apply because of where a session starts. Move each one:

- [ ] **About working in one repo's code** → that repo's `CLAUDE.md` or `.claude/skills`.
- [ ] **About the project, or across repos** → the project's rules (`rules.md`) or its skill
  pack (`<data dir>/projects/<project>/pack/`).
- [ ] **About how you personally like to work, everywhere** → your own plugin marketplace,
  installed user-wide.
- [ ] Anything private (names, hosts, clients, credentials) goes **only** into solonaut's data
  dir or your personal setup, never into a repo.

## 3. Delete what the workflow replaces

Only after step 2 has moved their content:

- [ ] Delete `CLAUDE.md` files in parent or organisation folders.
- [ ] Delete folder-scoped `.claude/skills` in parent folders.
- [ ] Delete handoff files and "read this first" notes that sessions were supposed to load.
- [ ] Search the repos' history for project state that was committed by mistake, and decide
  with the repo's owner whether it needs cleaning.

## 4. Register the project (level 2 only)

- [ ] **Coming:** `solonaut project add <name> <folder>...`
  ([#34](https://github.com/solonaut-run/solonaut/issues/34)).
- [ ] **Today:** create `<data dir>/projects/<project>/` and list the project's repos at the
  top of its `rules.md`.
- [ ] Level 1 needs nothing here: the repo is the project. For a manual setup, create
  `<data dir>/projects/<repo name>/`; the kernel adopts the folder as-is.

`<data dir>` is explained in the [workflow guide](project-workflow.md#where-the-projects-knowledge-lives).

## 5. Seed rules, state and decisions

From what the project already has (the deleted handoff files, old notes, open issues, recent
pull requests):

- [ ] `rules.md`: the standing rules about how this project is worked on, short. Not the code's
  rules; those stay in the repos.
- [ ] `state.md`: done recently, in flight, next, blocked. One screen at most.
- [ ] `decisions.md`: the decisions still in force, one entry each with the reason. Leave out
  decisions that no longer matter.
- [ ] `pack/` (optional): the cross-repo skills moved in step 2, as a plugin
  (`pack/.claude-plugin/plugin.json` and `pack/skills/<skill>/SKILL.md`).
- [ ] Create an empty `friction.md` for the [friction log](project-workflow.md#the-friction-log).

These files never go into a repo.

## 6. Verify, with and without solonaut

- [ ] **Without solonaut:** in each repo, plain `claude` builds, tests and follows the repo's
  rules from the repo's files alone.
- [ ] **Orchestrator:** start it (`solonaut orchestrate`, coming in
  [#37](https://github.com/solonaut-run/solonaut/issues/37); today the
  [manual launcher](project-workflow.md#session-roles)). Ask where things stand: it answers from
  `state.md` and `decisions.md`, and knows it is the orchestrator.
- [ ] **From another folder:** start a session in a worktree or another clone of the repo. Once
  the kernel lands it resolves the same project
  ([#34](https://github.com/solonaut-run/solonaut/issues/34),
  [#36](https://github.com/solonaut-run/solonaut/issues/36)).
- [ ] **Worker:** a worker started in a repo follows that repo's rules and does not write the
  project's files.
- [ ] **Privacy:** `git status` in every repo shows none of the project files, and the repo's
  safety checks pass.
- [ ] **solonaut down:** stop solonaut and start a session; it behaves as plain Claude Code.

## Done when

- every repo works on its own with plain Claude Code;
- no `CLAUDE.md`, skills or handoff files remain in parent or organisation folders;
- the project's rules, state and decisions exist only in solonaut's data dir;
- an orchestrator started fresh tells you where the project stands from those files alone;
- you have run one real block of work this way and logged any friction.
