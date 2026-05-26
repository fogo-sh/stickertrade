import { css, type Handle } from 'remix/ui'

import { colors } from './theme.ts'

export interface TextFieldProps {
  name: string
  label: string
  type?: 'text' | 'password' | 'email'
  value?: string
  error?: string
}

export function TextField(handle: Handle<TextFieldProps>) {
  return () => {
    const { name, label, type = 'text', value = '', error } = handle.props
    return (
      <label mix={fieldStyle}>
        <span mix={css({ display: 'block', marginBottom: '0.25rem' })}>{label}</span>
        {type === 'password' ? (
          <input name={name} type="password" defaultValue={value} mix={inputStyle} />
        ) : type === 'email' ? (
          <input name={name} type="email" defaultValue={value} mix={inputStyle} />
        ) : (
          <input name={name} type="text" defaultValue={value} mix={inputStyle} />
        )}
        {error ? <p mix={errorStyle}>{error}</p> : null}
      </label>
    )
  }
}

export interface FileFieldProps {
  name: string
  label: string
  accept?: string
  error?: string
}

export function FileField(handle: Handle<FileFieldProps>) {
  return () => {
    const { name, label, accept = '.png, .jpg, .jpeg', error } = handle.props
    return (
      <label mix={fieldStyle}>
        <span mix={css({ display: 'block', marginBottom: '0.25rem' })}>{label}</span>
        <input name={name} type="file" accept={accept} />
        {error ? <p mix={errorStyle}>{error}</p> : null}
      </label>
    )
  }
}

export interface SubmitButtonProps {
  label: string
}

export function SubmitButton(handle: Handle<SubmitButtonProps>) {
  return () => (
    <button type="submit" mix={submitBtnStyle}>
      {handle.props.label}
    </button>
  )
}

export const fieldStyle = css({ display: 'block', marginBottom: '0.75rem' })

export const inputStyle = css({
  width: '100%',
  padding: '0.5rem 0.75rem',
  background: '#0e0709',
  color: colors.light[500],
  border: `1px solid ${colors.light[500]}55`,
  font: 'inherit',
  '&:focus': { outline: `2px solid ${colors.primary[500]}`, outlineOffset: '-2px' },
})

export const submitBtnStyle = css({
  marginTop: '0.75rem',
  padding: '0.5rem 1rem',
  background: colors.light[500],
  color: colors.dark[500],
  border: 'none',
  cursor: 'pointer',
  font: 'inherit',
  fontWeight: 600,
  '&:hover': { background: colors.light[600] },
})

export const errorStyle = css({
  marginTop: '0.25rem',
  color: colors.primary[500],
  fontSize: '0.85rem',
})

export const flashStyle = css({
  marginBottom: '0.75rem',
  padding: '0.5rem 0.75rem',
  background: '#0e0709',
  border: `1px solid ${colors.primary[500]}`,
  color: colors.primary[500],
})
