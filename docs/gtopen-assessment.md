# GTOpen assessment (9 October 2026)

Candidate: https://github.com/MatthewPDingle/GTOpen. Integrated locally at pinned revision `b69ea07c79884fc598757dc45c712e73976db810`. CPU build and 46 upstream library tests passed (one manual stress test ignored). All 56 upstream preflop integration tests passed after fetching the missing upstream dataset fixture. Our bridge separately verifies canonical public snapshots, exact action paths, actor/pot/contributions/live seats, class ordering and legal sizes. Real local tests cover heads-up unopened, limped and raised pots, a three-player limp pot, cache persistence and explicit oversized-tree rejection. This is integration validation, not independent validation of the strategic continuation model.

The README describes 2–9-player preflop games, configurable blinds and sizing, player models and action-line browsing. The technical reference documents `/api/preflop/spot`, `/solve`, `/status`, `/node` with action-index paths, and save/load. These could address missing limp/raise chart contexts through locally computed, context-matched results rather than pretending an unopened chart applies.

Important qualification: the preflop continuation does not solve a full postflop tree. The technical reference describes deterministic latent-strength samples for multiway pot shares, approximate opponent card removal, potentially large errors with overlapping premium ranges, and no future betting at multiway leaves. A small best-response gap measures consistency in that modeled game, not proof of full-poker optimality. The contextual preflop predictor has narrower format coverage (3–6 players, no ante, half/full blind) than the engine's 2–9-seat capability; unsupported contexts use fallbacks. Large multiway trees can need substantial memory and CPU time. Do not promise instant solves on this Mac.

Outstanding for broader coverage: resolve upstream redistribution licensing (no explicit license file or Cargo license declaration was found); run upstream tests; verify legal-action mapping, chip-to-BB conversion, no rake, seat rotation, exact public action history and excluded hidden cards; compare known chip-conservation/equity fixtures; measure runtime/memory on the local machine; distinguish equilibrium solving from fixed-opponent best response; report continuation model, approximation coverage and convergence for every cached result. No live hand should wait for a solve, and a missing/unverified solve must not become a fabricated recommendation.

The beginner UI should lead with the spot and the reason for considering each action. Solver/model data can support that explanation behind optional controls; raw frequencies do not themselves teach a decision process.

Sources:
- https://github.com/MatthewPDingle/GTOpen/blob/master/README.md
- https://github.com/MatthewPDingle/GTOpen/blob/master/docs/technical_reference.md
- https://github.com/MatthewPDingle/GTOpen/blob/master/docs/contextual_preflop.md
