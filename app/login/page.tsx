'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type Mode = 'login' | 'signup' | 'forgot'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<Mode>('login')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [isError, setIsError] = useState(false)
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

  function switchMode(next: Mode) {
    setMode(next)
    setMessage(null)
    setIsError(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setMessage(null)
    setIsError(false)

    if (mode === 'forgot') {
      const redirectTo = `${window.location.origin}/login/reset`
      const { error: authError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo,
      })
      setLoading(false)
      if (authError) {
        setIsError(true)
        setMessage(authError.message)
        return
      }
      setMessage('パスワード再設定用のメールを送信しました。メール内のリンクから新しいパスワードを設定してください。')
      return
    }

    if (mode === 'signup') {
      const { data, error: authError } = await supabase.auth.signUp({ email, password })
      setLoading(false)
      if (authError) {
        setIsError(true)
        setMessage(authError.message)
        return
      }
      // 既存ユーザー再登録時は identities が空になる（メール列挙防止）
      if (data.user && (data.user.identities?.length ?? 0) === 0) {
        setIsError(true)
        setMessage('このメールアドレスはすでに登録済みです。ログインするか、パスワードを忘れた場合は再設定してください。')
        return
      }
      setMessage('確認メールを送信しました。メール内のリンクから登録を完了してください。')
      return
    }

    const { error: authError } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)

    if (authError) {
      setIsError(true)
      setMessage(authError.message)
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

  const submitLabel =
    mode === 'signup' ? 'アカウント作成'
      : mode === 'forgot' ? '再設定メールを送る'
        : 'ログイン'

  return (
    <div className="min-h-screen bg-stone-950 text-stone-100 flex flex-col justify-center px-6">
      <div className="max-w-sm mx-auto w-full">
        <header className="mb-10 text-center">
          <h1 className="text-4xl font-bold tracking-tight mb-2">
            <span className="text-amber-400">メシ</span>ため
          </h1>
          <p className="text-stone-500 text-sm">
            {mode === 'forgot'
              ? '登録メールアドレスに再設定リンクを送ります'
              : '食べたいものだけ食べる。そのために逆算して動く。'}
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

          {mode !== 'forgot' && (
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
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                className="w-full bg-stone-900 border border-stone-800 rounded-2xl px-4 py-3 text-sm text-stone-100 placeholder:text-stone-600 focus:outline-none focus:border-amber-400/50"
                placeholder="6文字以上"
              />
            </div>
          )}

          {message && (
            <p className={`text-sm px-1 ${isError ? 'text-rose-400' : 'text-amber-400'}`}>
              {message}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-amber-400 text-stone-950 font-bold py-3.5 rounded-2xl text-sm disabled:opacity-50"
          >
            {loading ? '処理中...' : submitLabel}
          </button>
        </form>

        <div className="mt-6 space-y-3 text-center">
          {mode === 'login' && (
            <>
              <button
                type="button"
                onClick={() => switchMode('forgot')}
                className="w-full text-stone-500 text-sm"
              >
                パスワードを忘れた方
              </button>
              <button
                type="button"
                onClick={() => switchMode('signup')}
                className="w-full text-stone-500 text-sm"
              >
                初めての方はアカウント作成
              </button>
            </>
          )}
          {mode === 'signup' && (
            <button
              type="button"
              onClick={() => switchMode('login')}
              className="w-full text-stone-500 text-sm"
            >
              すでにアカウントをお持ちの方はログイン
            </button>
          )}
          {mode === 'forgot' && (
            <button
              type="button"
              onClick={() => switchMode('login')}
              className="w-full text-stone-500 text-sm"
            >
              ログインに戻る
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
