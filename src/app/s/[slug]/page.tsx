import { createClient } from '@supabase/supabase-js'
import SharePortalClient from './SharePortalClient'

interface Props {
  params: Promise<{ slug: string }>
}

export default async function SharePage({ params }: Props) {
  const { slug } = await params

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { data: link } = await admin
    .from('shared_links')
    .select('id, slug, plans, client_name, is_active, expires_at, view_count')
    .eq('slug', slug)
    .single()

  // Invalid or deactivated link
  if (!link || !link.is_active) {
    return <InvalidLinkPage />
  }

  // Expired link
  if (link.expires_at && new Date(link.expires_at) < new Date()) {
    return <InvalidLinkPage expired />
  }

  return (
    <SharePortalClient
      slug={slug}
      plans={link.plans}
      clientName={link.client_name ?? null}
      expiresAt={link.expires_at ?? null}
    />
  )
}

function InvalidLinkPage({ expired }: { expired?: boolean }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-6">
      <div className="text-center max-w-md">
        <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-6">
          <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          このリンクは無効です
        </h1>
        <p className="text-gray-500 mb-4">
          {expired
            ? 'This link has expired. Please contact your builder for a new link.'
            : 'This link is no longer active. Please contact your builder for a new link.'}
        </p>
        <p className="text-sm text-gray-400">Este enlace no es válido. Comuníquese con su constructor.</p>
      </div>
    </div>
  )
}
