# RadRed Nuzlocke Tracker

A Pokémon Radical Red 4.1 tracker built for one screen: an iPhone held in one
hand, mid-run. It walks the game in default order — every route and every boss —
and lets you log the one encounter you get per location, keep your party, box
and graveyard straight, and check what the next fight is about to throw at you.

## What it does

**Run tab** — the whole game in order. Route rows show how many species can
appear there and what you caught; boss rows show the trainer, their first three
Pokémon and the level cap that fight sets. Tick a boss off as you beat it. The
header always shows the next fight and its cap.

**Encounter logging** — tap a route, pick from the species that actually appear
there (or search the full Radical Red dex for fishing, gift and static
encounters), then set nickname, level and outcome: party, box, dead, or missed.
Dupes-clause candidates are flagged before you commit to them.

**Team tab** — party / box / graveyard, level-cap warnings on anything that has
outgrown the next boss, defensive type profiles, and a coverage read on the next
boss's team. Tap a Pokémon to evolve it: the nickname, level, status and the
route it came from carry over, and branching lines (Eevee, Wurmple, Applin) list
every option.

**Fights tab** — the 49 story fights, plus every other trainer in the game:
Ace Trainers, the cap-scaled "tough" trainers Radical Red plants along the way,
and ordinary route trainers. Each opens with full teams — levels, typings,
abilities, held items, all four moves — and a matchup grid crossing your Pokémon
against theirs. Search spans every fight regardless of the active filter, so a
trainer you have just walked into can be looked up by name.

Fights whose levels track your badge cap say so and show each Pokémon's offset;
the handful of rosters that could not be confirmed against 4.1 are labelled
rather than passed off as current. The trainer dumps carry no locations, so
non-story fights are not placed on the map — fixed-level ones are tied to the
stretch of the run their levels fit.

**Rules tab** — normal vs hardcore rosters, clause toggles, and JSON export /
import so a run can move between phones or survive a Safari data wipe.

## Built for iPhone

- Bottom tab bar and sheets sized for thumbs, 44 px minimum targets, no hover.
- Safe-area insets honoured top and bottom, so nothing hides under the notch or
  the home indicator; `100dvh` layout that survives the URL bar collapsing.
- 16 px inputs so iOS never zooms the viewport on focus; no double-tap delay.
- Installable: Add to Home Screen gives a full-screen standalone app with its own
  icon, and a service worker keeps it working with no signal.
- Everything is local — no accounts, no network calls at runtime.

## Development

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check + production build into dist/
npm run preview
```

Deploying to Vercel needs no configuration: it is a static Vite build.

### Regenerating game data

`src/data/game.json`, `src/data/dex.json` and `public/sprites/` are generated and
committed, so builds and deploys never touch the network. To refresh them:

```bash
npm run data       # routes, bosses, dex, sprites
npm run icons      # app icons
```

`scripts/build-data.mjs` pulls Radical Red's route order, encounter tables and
fight list from the open-source nuzlocke.app dataset, replaces the rosters with
their Radical Red 4.1 teams from the trainer dumps (that dataset is a version
behind), adds the Ace Trainer fights, joins everything with PokeAPI species data,
applies Radical Red's own stat/typing patches (including its Seviian forms and
custom megas), resolves cap-relative levels ("Max Level - 2") against the badge
cap in force at that point of the run, and downloads only the sprites the game
actually uses. Sources are cached in `.cache/` between runs.

## Credits

Data and sprites belong to their authors — see [NOTICE.md](NOTICE.md). Radical
Red is a fan-made ROM hack; this tracker is unofficial.
