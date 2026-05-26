import { Database } from 'remix/data-table'
import { Session } from 'remix/session'
import { redirect } from 'remix/response/redirect'
import { createController } from 'remix/router'

import { verifyPassword } from '../../data/auth.ts'
import { users } from '../../data/schema.ts'
import { routes } from '../../routes.ts'
import { LoginPage } from '../login-page.tsx'

export default createController(routes.login, {
  actions: {
    index(context) {
      const session = context.get(Session)
      const flash = session.get('login_flash') as string | undefined
      session.unset('login_flash')
      return context.render(<LoginPage flash={flash} />)
    },

    async action(context) {
      const formData = context.get(FormData)
      const username = String(formData.get('username') ?? '').trim()
      const password = String(formData.get('password') ?? '')

      const errors: Record<string, string> = {}
      if (username.length < 3 || username.length > 16) {
        errors.username = 'Username must be 3-16 characters'
      }
      if (password.length < 6 || password.length > 64) {
        errors.password = 'Password must be 6-64 characters'
      }
      if (Object.keys(errors).length > 0) {
        return context.render(<LoginPage errors={errors} values={{ username }} />, { status: 400 })
      }

      const db = context.get(Database)
      const user = await db.findOne(users, { where: { username } })
      if (!user || !(await verifyPassword(password, user.password_hash))) {
        return context.render(
          <LoginPage errors={{ _form: 'Login failed' }} values={{ username }} />,
          { status: 400 },
        )
      }

      const session = context.get(Session)
      session.regenerateId(true)
      session.set('auth', { userId: user.id })
      return redirect(routes.home.href(), 303)
    },
  },
})
