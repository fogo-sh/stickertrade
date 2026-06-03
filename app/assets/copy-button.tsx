import { clientEntry, css, on, type Handle } from 'remix/ui'

// Theme colors inlined: app/ui/theme.ts is outside the asset server's allow
// list. The hex values match the `light.500` and `primary.500` tokens.
const LIGHT_500 = '#f1eee4'
const PRIMARY_500 = '#f7a1c4'

/**
 * A button that copies its `value` prop to the clipboard on click and
 * briefly flashes a "copied!" label.
 *
 * First `clientEntry` in this codebase. Server-renders as a plain button
 * with no JS-driven behavior — users without JS still see the URL in the
 * accompanying `<input readOnly>` and can select+copy manually. The
 * button is harmless (no-op) without JS.
 */
export const CopyButton = clientEntry(
  import.meta.url,
  function CopyButton(handle: Handle<{ value: string; label?: string }>) {
    let state: 'idle' | 'copied' | 'error' = 'idle'
    let resetTimer: ReturnType<typeof setTimeout> | undefined

    function setState(next: typeof state) {
      state = next
      handle.update()
    }

    async function handleClick() {
      if (resetTimer) clearTimeout(resetTimer)
      try {
        await navigator.clipboard.writeText(handle.props.value)
        setState('copied')
      } catch {
        setState('error')
      }
      resetTimer = setTimeout(() => setState('idle'), 1500)
    }

    return () => {
      const label = handle.props.label ?? 'copy'
      const display =
        state === 'copied' ? 'copied!' : state === 'error' ? 'copy failed' : label
      return (
        <button
          type="button"
          mix={[buttonStyle, on('click', handleClick)]}
          aria-label={label}
        >
          {display}
        </button>
      )
    }
  },
)

const buttonStyle = css({
  background: 'transparent',
  color: LIGHT_500,
  border: `1px solid ${LIGHT_500}66`,
  borderRadius: '0.25rem',
  cursor: 'pointer',
  font: 'inherit',
  fontSize: '0.875rem',
  padding: '0.25rem 0.5rem',
  whiteSpace: 'nowrap',
  '&:hover': { borderColor: PRIMARY_500 },
})
