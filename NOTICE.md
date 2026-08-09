# Third-party data and assets

## Radical Red route, encounter and boss data

Derived from the [nuzlocke.app](https://github.com/domtronn/nuzlocke.app) project
(`src/lib/data/routes.json`, `league.json`, `patches.json`), used under the
BSD 3-Clause License:

```
BSD 3-Clause License

Copyright (c) 2021, Diego Ballesteros
All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this
   list of conditions and the following disclaimer.

2. Redistributions in binary form must reproduce the above copyright notice,
   this list of conditions and the following disclaimer in the documentation
   and/or other materials provided with the distribution.

3. Neither the name of the copyright holder nor the names of its
   contributors may be used to endorse or promote products derived from
   this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
```

## Boss and Ace Trainer teams

Trainer rosters are parsed from Rudo2204's Pokémon Radical Red 4.1 trainer dumps
([normal mode](https://gist.github.com/Rudo2204/7f9e4a3ceaf077d623d3c37b1f921601),
[hardcore mode](https://gist.github.com/Rudo2204/ed23cfda024998b566128318963ea7a5)),
themselves based on earlier dumps by luckytyphlosion.

The nuzlocke.app dataset above supplies the run order, encounter tables and which
fight happens where; the 4.1 dumps supply the teams, because that dataset's
rosters are a game version behind. Fights that could not be matched to a dump
entry with confidence keep their older roster and are flagged in the app rather
than replaced with a guess.

A PDF export of the documentation's "Default Mode Bosses" sheet is kept at
`scripts/data/rr41-default-mode-bosses.pdf` and parsed by
`scripts/extract-doc-teams.py`. It settles which dump entry belongs to which
fight where the trainer name alone is ambiguous, and 96 of the 124 teams it
yields match the shipped data exactly.

The dumps carry no location per trainer. The order, location and level cap of
each fight come instead from the community documentation spreadsheet, which is
not reachable from the build environment and so is transcribed into
`scripts/data/fight-order.txt`. Fights that appear in neither source are listed
by level rather than placed in the run.

## Species data and sprites

Species names, typings, base stats and evolution families come from
[PokeAPI](https://github.com/PokeAPI/pokeapi) (CSV data, BSD 3-Clause). Box
sprites come from [PokeAPI/sprites](https://github.com/PokeAPI/sprites).

## Pokémon

Pokémon and all related names are trademarks of Nintendo, Creatures Inc. and
GAME FREAK Inc. Radical Red is an unofficial fan-made ROM hack. This tracker is
an unofficial fan project and is not affiliated with, endorsed by, or sponsored
by any of them.
