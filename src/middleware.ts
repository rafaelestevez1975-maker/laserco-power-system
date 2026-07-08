import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const PUBLIC_PATHS = ['/login', '/manifest.json', '/sw.js']

function isPublic(pathname: string) {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'))
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: Array<{ name: string; value: string; options?: CookieOptions }>) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          )
        },
      },
    },
  )

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    if (isPublic(pathname)) return supabaseResponse
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = '/login'
    loginUrl.searchParams.set('redirect', pathname)
    return NextResponse.redirect(loginUrl)
  }

  // Já logado tentando ir ao /login → manda pra home.
  if (pathname === '/login') {
    const home = request.nextUrl.clone()
    home.pathname = '/'
    home.search = ''
    return NextResponse.redirect(home)
  }

  // PRIMEIRO ACESSO: contas provisionadas em massa nascem com app_metadata.must_change=true
  // (login temporário @laserco.app + senha padrão). Enquanto a flag existir, prendemos o usuário
  // na tela /primeiro-acesso (troca e-mail + senha) — nenhuma outra rota abre. Lido do próprio
  // token do auth (getUser), sem round-trip ao banco no middleware.
  // IMPORTANTE: a flag fica em app_metadata (só a Admin API grava), NÃO em user_metadata, que o
  // próprio usuário poderia reescrever via auth.updateUser({data:...}) e furar o gate.
  const mustChange = user.app_metadata?.must_change === true
  if (mustChange && pathname !== '/primeiro-acesso') {
    const pa = request.nextUrl.clone()
    pa.pathname = '/primeiro-acesso'
    pa.search = ''
    return NextResponse.redirect(pa)
  }
  // Já concluiu (ou nunca precisou) mas caiu em /primeiro-acesso → manda pra home.
  if (!mustChange && pathname === '/primeiro-acesso') {
    const home = request.nextUrl.clone()
    home.pathname = '/'
    home.search = ''
    return NextResponse.redirect(home)
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    // Pula assets estáticos e a rota de webhook (que valida via secret próprio),
    // senão POSTs sem cookie eram redirecionados (200 HTML) e o UAZAPI falhava.
    '/((?!_next/static|_next/image|favicon.ico|icon-.*|apple-touch-.*|api/webhooks|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
