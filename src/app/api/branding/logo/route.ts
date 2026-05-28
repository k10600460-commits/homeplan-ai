import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdmin } from '@supabase/supabase-js';
import { getUserPlan } from '@/lib/usage';

const MAX_SIZE = 512 * 1024;
const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];
const SIGNED_URL_TTL = 3600;

function admin() {
  return createAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const plan = await getUserPlan(user.id);
  if (plan === 'free') return NextResponse.json({ error: 'Logo upload requires Pro or Team plan' }, { status: 403 });

  const formData = await req.formData();
  const file = formData.get('logo') as File | null;
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: 'Invalid file type. Allowed: PNG, JPEG, WebP, SVG' }, { status: 400 });
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: 'File too large. Max 512 KB' }, { status: 400 });
  }

  const ext = file.type === 'image/svg+xml' ? 'svg' : file.type.split('/')[1];
  const path = `${user.id}/logo.${ext}`;
  const db = admin();

  // Remove any existing logo for this user
  const { data: existing } = await db.storage.from('branding').list(user.id);
  if (existing && existing.length > 0) {
    const toDelete = existing
      .filter(f => f.name.startsWith('logo.'))
      .map(f => `${user.id}/${f.name}`);
    if (toDelete.length > 0) await db.storage.from('branding').remove(toDelete);
  }

  const buffer = await file.arrayBuffer();
  const { error: uploadError } = await db.storage.from('branding').upload(path, buffer, {
    contentType: file.type,
    upsert: true,
  });
  if (uploadError) return NextResponse.json({ error: 'Upload failed' }, { status: 500 });

  await db.from('team_profiles').upsert(
    { owner_user_id: user.id, logo_url: path, updated_at: new Date().toISOString() },
    { onConflict: 'owner_user_id' },
  );

  const { data: signed } = await db.storage.from('branding').createSignedUrl(path, SIGNED_URL_TTL);
  return NextResponse.json({ path, signedUrl: signed?.signedUrl ?? null });
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = admin();
  const { data: profile } = await db
    .from('team_profiles')
    .select('logo_url')
    .eq('owner_user_id', user.id)
    .maybeSingle();

  if (!profile?.logo_url) return NextResponse.json({ signedUrl: null });

  const { data: signed } = await db.storage.from('branding').createSignedUrl(profile.logo_url, SIGNED_URL_TTL);
  return NextResponse.json({ signedUrl: signed?.signedUrl ?? null, path: profile.logo_url });
}

export async function DELETE() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = admin();
  const { data: profile } = await db
    .from('team_profiles')
    .select('logo_url')
    .eq('owner_user_id', user.id)
    .maybeSingle();

  if (profile?.logo_url) {
    await db.storage.from('branding').remove([profile.logo_url]);
    await db.from('team_profiles').update({ logo_url: null }).eq('owner_user_id', user.id);
  }

  return NextResponse.json({ success: true });
}
