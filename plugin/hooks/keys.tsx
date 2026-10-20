import type { ClientModule } from 'claude-code'

const ARROWS = new Set(['up', 'down', 'left', 'right'])

// The snake's arrow keys: once clicked, this region hears the keys and posts each arrow to the hooks module.
const SnakeKeys: ClientModule = (_props, surface) => {
  surface.onKey(event => { if (ARROWS.has(event.key)) surface.post({ dir: event.key }) })
  const { Text } = surface.elements
  return <Text dimColor>click here for the arrow keys</Text>
}

export default SnakeKeys
