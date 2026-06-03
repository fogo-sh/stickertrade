import { css } from 'remix/ui'

import { Document } from '../ui/document.tsx'
import type { HeaderUser } from '../ui/header.tsx'
import { SurfaceCard, type SurfaceCardSurface } from '../ui/surface-card.tsx'

export function SurfacesPage() {
  return ({ user, surfaces }: { user: HeaderUser | null; surfaces: SurfaceCardSurface[] }) => (
    <Document title="stickertrade - surfaces" user={user}>
      <main mix={mainStyle}>
        <p mix={heading}>surfaces</p>
        {surfaces.length === 0 ? (
          <p mix={emptyStyle}>no surfaces yet.</p>
        ) : (
          <div mix={stack}>
            {surfaces.map((surface) => (
              <SurfaceCard key={surface.id} surface={surface} />
            ))}
          </div>
        )}
      </main>
    </Document>
  )
}

const mainStyle = css({ maxWidth: '40rem', margin: '0 auto' })

const heading = css({
  fontSize: '1.5rem',
  fontWeight: 600,
  margin: '0.5rem 0 2rem',
})

const stack = css({ display: 'block' })

const emptyStyle = css({ opacity: 0.7 })
