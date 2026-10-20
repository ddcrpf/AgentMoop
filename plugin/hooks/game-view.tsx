import type { ElementTable, EngineInterface, RenderSurface } from 'claude-code'

import type { Game, ReflexGame, SnakeGame } from '../types'
import type { GameRuntime } from './game'
import { boardTooWide, closeGame, reflexPress, resumeGame, snakeCells, startReflex, startSnake, steer, turnOffGames } from './game'

// What the game view needs of the band: its props, its surface and that surface's elements, and
// whether the arrow-key Client may be drawn (it is left out once it faulted).
export type GameSite = { surface: RenderSurface; table: ElementTable; columns: number; maxRows: number; isWorking: boolean; keys: boolean }

// Snake needs the terminal's Raster; every other surface gets the reflex game. (A table names every
// element at run time, a missing one drawing as a fragment, so the surface decides, not the table.)
export function startGame($: EngineInterface, rt: GameRuntime, site: Pick<GameSite, 'surface' | 'columns' | 'maxRows'>) {
  return site.surface === 'terminal' ? startSnake($, rt, site.columns, site.maxRows) : startReflex($, rt)
}

function closeButton($: EngineInterface, rt: GameRuntime, site: GameSite) {
  const { Button } = site.table
  return <Button key="game-close" label="Close" dimColor onPress={() => closeGame($, rt)} />
}

// Where a game ends or stops: play again (only while Claude works), close, or never offer games again.
function endButtons($: EngineInterface, rt: GameRuntime, site: GameSite, again: () => Promise<void>) {
  const { Button } = site.table
  return [
    site.isWorking ? <Button key="game-again" label="Play again" variant="primary" onPress={again} /> : null,
    closeButton($, rt, site),
    <Button key="game-off" plain dimColor label="Don't offer games" onPress={() => turnOffGames($, rt)} />,
  ]
}

function pausedView($: EngineInterface, rt: GameRuntime, g: Game, site: GameSite) {
  const { Box, Button, Text } = site.table
  const narrow = boardTooWide(g, site.columns)
  const words = narrow ? 'Make the window wider to play.' : g.paused === 'done' ? 'Claude is done.' : 'Game paused.'
  return (
    <Box flexDirection="row" gap={1}>
      <Text>{words}</Text>
      {narrow ? null : <Button key="game-resume" label="Resume" variant="primary" onPress={() => resumeGame($, rt)} />}
      {closeButton($, rt, site)}
      <Button key="game-off" plain dimColor label="Don't offer games" onPress={() => turnOffGames($, rt)} />
    </Box>
  )
}

function steerButtons($: EngineInterface, site: GameSite) {
  const { Box, Button } = site.table
  const Client = site.keys && 'Client' in site.table ? site.table.Client : undefined
  return (
    <Box flexDirection="row" gap={1}>
      <Button key="steer-up" plain hotkey="w" label="↑" onPress={() => steer($, 'up')} />
      <Button key="steer-left" plain hotkey="a" label="←" onPress={() => steer($, 'left')} />
      <Button key="steer-down" plain hotkey="s" label="↓" onPress={() => steer($, 'down')} />
      <Button key="steer-right" plain hotkey="d" label="→" onPress={() => steer($, 'right')} />
      {Client ? <Client key="snake-keys" module="./keys.tsx" /> : null}
    </Box>
  )
}

function snakeView($: EngineInterface, rt: GameRuntime, g: SnakeGame, site: GameSite) {
  const { Box, Text } = site.table
  const Raster = site.surface === 'terminal' && 'Raster' in site.table ? site.table.Raster : undefined
  return (
    <Box flexDirection="column">
      <Box flexDirection="row" gap={1}>
        <Text bold>Snake</Text>
        <Text dimColor>{`Score ${g.score}  Best ${Math.max(g.best, g.score)}`}</Text>
        {g.over ? null : closeButton($, rt, site)}
      </Box>
      {!Raster || boardTooWide(g, site.columns) ? <Text>Make the window wider to play.</Text> : <Raster key="snake-board" columns={g.cols} rows={g.rows} cells={snakeCells(g)} />}
      {g.over ? (
        <Box flexDirection="row" gap={1}>
          <Text>Game over.</Text>
          {endButtons($, rt, site, () => startSnake($, rt, site.columns, site.maxRows))}
        </Box>
      ) : steerButtons($, site)}
    </Box>
  )
}

const REFLEX_WORDS: Record<ReflexGame['phase'], string> = { wait: 'Wait...', now: 'Now!', early: 'Too soon', result: '' }

function reflexView($: EngineInterface, rt: GameRuntime, g: ReflexGame, site: GameSite) {
  const { Box, Button, Text } = site.table
  const playing = g.phase === 'wait' || g.phase === 'now'
  const words = g.phase === 'result' ? `${g.ms} ms` : REFLEX_WORDS[g.phase]
  return (
    <Box flexDirection="column">
      <Box flexDirection="row" gap={1}>
        <Text bold>{words}</Text>
        {g.best !== null ? <Text dimColor>{`Best ${g.best} ms`}</Text> : null}
        {playing ? closeButton($, rt, site) : null}
      </Box>
      {playing ? (
        <Box borderStyle="round" paddingX={2}>
          <Button key="reflex-hit" variant="primary" label={g.phase === 'now' ? '      NOW!      ' : '   press on Now!   '} onPress={() => reflexPress($, rt)} />
        </Box>
      ) : (
        <Box flexDirection="row" gap={1}>{endButtons($, rt, site, () => startReflex($, rt))}</Box>
      )}
    </Box>
  )
}

export function gameView($: EngineInterface, rt: GameRuntime, g: Game, site: GameSite) {
  if (g.paused) return pausedView($, rt, g, site)
  return g.kind === 'snake' ? snakeView($, rt, g, site) : reflexView($, rt, g, site)
}
