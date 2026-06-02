import { createClient } from '@supabase/supabase-js'
import SharePortalClient from './SharePortalClient'

interface Props {
  params: Promise<{ slug: string }>
}

export interface PortalBranding {
  plan: 'free' | 'pro' | 'team';
  companyName: string;
  logoDataUrl: string | null;
  phone: string;
  website: string;
  licenseNumber: string;
  tagline: string;
}

export default async function SharePage({ params }: Props) {
  const { slug } = await params

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { data: link } = await admin
    .from('shared_links')
    .select('id, slug, plans, client_name, is_active, expires_at, view_count, user_id')
    .eq('slug', slug)
    .single()

  if (!link || !link.is_active) {
    return <InvalidLinkPage />
  }

  if (link.expires_at && new Date(link.expires_at) < new Date()) {
    return <InvalidLinkPage expired />
  }

  // Fetch builder's branding if they have a paid plan
  const branding = await fetchBranding(admin, link.user_id)

  return (
    <SharePortalClient
      slug={slug}
      plans={link.plans}
      clientName={link.client_name ?? null}
      expiresAt={link.expires_at ?? null}
      branding={branding}
    />
  )
}

async function fetchBranding(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  userId: string | null,
): Promise<PortalBranding> {
  const defaultBranding: PortalBranding = { plan: 'free', companyName: '', logoDataUrl: null, phone: '', website: '', licenseNumber: '', tagline: '' };
  if (!userId) return defaultBranding;

  const [subResult, profileResult] = await Promise.all([
    admin.from('subscriptions').select('plan, status').eq('user_id', userId).maybeSingle(),
    admin.from('team_profiles').select('company_name, logo_url, phone, website, license_number, tagline').eq('owner_user_id', userId).maybeSingle(),
  ]);

  const sub = subResult.data;
  if (!sub || (sub.status !== 'active' && sub.status !== 'trialing')) return defaultBranding;

  const plan: 'free' | 'pro' | 'team' = sub.plan === 'team' ? 'team' : sub.plan === 'pro' ? 'pro' : 'free';
  if (plan === 'free') return defaultBranding;

  const companyName: string = profileResult.data?.company_name ?? '';
  const logoUrl: string | null = profileResult.data?.logo_url ?? null;

  let logoDataUrl: string | null = null;
  if (logoUrl) {
    try {
      const { data: signed } = await admin.storage.from('branding').createSignedUrl(logoUrl, 3600);
      if (signed?.signedUrl) {
        const res = await fetch(signed.signedUrl);
        if (res.ok) {
          const buf = await res.arrayBuffer();
          const mime = res.headers.get('content-type') ?? 'image/png';
          logoDataUrl = `data:${mime};base64,${Buffer.from(buf).toString('base64')}`;
        }
      }
    } catch { /* branding optional — continue without logo */ }
  }

  return {
    plan,
    companyName,
    logoDataUrl,
    phone: profileResult.data?.phone ?? '',
    website: profileResult.data?.website ?? '',
    licenseNumber: profileResult.data?.license_number ?? '',
    tagline: profileResult.data?.tagline ?? '',
  };
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
