import * as s from 'remix/data-schema'
import * as f from 'remix/data-schema/form-data'
import { Database } from 'remix/data-table'
import { Session } from 'remix/session'
import { redirect } from 'remix/response/redirect'
import { createController } from 'remix/router'

import { verifyPassword } from '../../data/auth.ts'
import { users } from '../../data/schema.ts'
import {
  issuesToFieldErrors,
  loginPasswordSchema,
  usernameSchema,
} from '../../data/validators.ts'
import { routes } from '../../routes.ts'
import { LoginPage } from '../login-page.tsx'

const loginSchema = f.object({
  username: f.field(usernameSchema),
  password: f.field(loginPasswordSchema),
})

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
      const parsed = s.parseSafe(loginSchema, formData)
      if (!parsed.success) {
        return context.render(
          <LoginPage
            errors={issuesToFieldErrors(parsed.issues)}
            values={{ username: String(formData.get('username') ?? '') }}
          />,
          { status: 400 },
        )
      }

      const { username, password } = parsed.value
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
