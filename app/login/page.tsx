'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isSignUp, setIsSignUp] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [checkingSession, setCheckingSession] = useState(true)

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { setCheckingSession(false); return }
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('id')
        .eq('id', user.id)
        .single()
      router.replace(profile ? '/' : '/settings/profile')
    })
  }, [router])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { error: authError } = isSignUp
      ? await supabase.auth.signUp({ email, password })
      : await supabase.auth.signInWithPassword({ email, password })

    setLoading(false)

    if (authError) {
      setError(authError.message)
      return
    }

    if (isSignUp) {
      setError('確認メールを送信しました。メール内のリンクから登録を完了してください。')
      return
    }

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.replace('/login'); return }
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('id')
      .eq('id', user.id)
      .single()
    router.replace(profile ? '/' : '/settings/profile')
  }

  if (checkingSession) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-stone-950">
        <div className="text-amber-400 text-lg">読み込み中...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-stone-950 text-stone-100 flex flex-col justify-center px-6">
      <div className="max-w-sm mx-auto w-full">
        <header className="mb-10 text-center">
          <h1 className="text-4xl font-bold tracking-tight mb-2">
            <span className="text-amber-400">メシ</span>ため
          </h1>
          <p className="text-stone-500 text-sm">
            食べたいものだけ食べる。そのために逆算して動く。
          </p>
        </header>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="text-stone-500 text-xs mb-1.5 block">
              メールアドレス
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="w-full bg-stone-900 border border-stone-800 rounded-2xl px-4 py-3 text-sm text-stone-100 placeholder:text-stone-600 focus:outline-none focus:border-amber-400/50"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label htmlFor="password" className="text-stone-500 text-xs mb-1.5 block">
              パスワード
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              autoComplete={isSignUp ? 'new-password' : 'current-password'}
              className="w-full bg-stone-900 border border-stone-800 rounded-2xl px-4 py-3 text-sm text-stone-100 placeholder:text-stone-600 focus:outline-none focus:border-amber-400/50"
              placeholder="6文字以上"
            />
          </div>

          {error && (
            <p className={`text-sm px-1 ${error.includes('確認メール') ? 'text-amber-400' : 'text-rose-400'}`}>
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-amber-400 text-stone-950 font-bold py-3.5 rounded-2xl text-sm disabled:opacity-50"
          >
            {loading ? '処理中...' : isSignUp ? 'アカウント作成' : 'ログイン'}
          </button>
        </form>

        <button
          type="button"
          onClick={() => {
            setIsSignUp(!isSignUp)
            setError(null)
          }}
          className="w-full mt-6 text-stone-500 text-sm text-center"
        >
          {isSignUp ? 'すでにアカウントをお持ちの方はログイン' : '初めての方はアカウント作成'}
        </button>
      </div>
    </div>
  )
}
